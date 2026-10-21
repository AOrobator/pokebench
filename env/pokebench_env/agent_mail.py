"""Mail between Claude and Codex sessions on this Mac, and the shared landing board.

Letters to Claude always go to pending.jsonl under a lock. A listening Claude holds the read end
of a named pipe; a sender writes one byte to it, which wakes the listener without polling. The
payload never travels through the pipe, so letters of any size arrive whole and none is lost when
no one is listening. Claude reaches a Codex thread through the Codex coordinator thread when it is
listening on its mailbox (it forwards mid-turn with Codex's send_message_to_thread), else through
`codex queue`, which the thread reads when its current turn ends.
"""

import argparse
import errno
import fcntl
import json
import os
import select
import shlex
import subprocess
import sys
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")
NO_MAIL = 3
# The mailbox a Codex coordinator thread listens on; it forwards each letter to its Codex thread
# with Codex's own send_message_to_thread, which reaches a busy thread mid-turn.
CODEX_COORDINATOR = "codex-coordinator"
WAKE_TEXT = (
    "Codex coordinator: Claude mail is waiting. Run `just codex-mailbox --timeout 1`, forward each "
    "letter, run `just codex-mailbox-done --claim N`, repeat until it prints No mail, then end "
    "your turn."
)
# A wake the coordinator has not acted on for this long is sent again on the next letter.
STALE_WAKE_SECONDS = 600.0
# The landing slot expires when its holder shows no commit or land-touch for this long.
SLOT_TIMEOUT_MINUTES = 45.0
# How long land-keeper sleeps when no slot can expire (empty board or a lone holder).
KEEPER_IDLE_SECONDS = 300.0

Run = Callable[[Sequence[str]], int]


# `codex queue` returns in about a second; a hung one must not hold the board lock for long.
COMMAND_TIMEOUT_SECONDS = 30.0
TIMED_OUT = 124


def run_command(argv: Sequence[str], timeout: float = COMMAND_TIMEOUT_SECONDS) -> int:
    try:
        return subprocess.run(list(argv), check=False, timeout=timeout).returncode
    except subprocess.TimeoutExpired:
        return TIMED_OUT


@dataclass(frozen=True)
class Letter:
    sent_at: datetime
    sender: str
    text: str
    to_thread: str | None = None


@dataclass(frozen=True)
class CodexSession:
    id: str
    name: str
    updated_at: datetime


@dataclass(frozen=True)
class BoardEntry:
    who: str
    branch: str
    codex_thread: str | None
    queued_at: datetime
    top_since: datetime | None = None


@dataclass(frozen=True)
class Notice:
    entry: BoardEntry
    position: int
    text: str
    exit_code: int


def repo_root(cwd: Path) -> Path:
    """The main checkout: the parent of the git common dir, the same from every worktree."""
    common = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    return Path(common).resolve().parent


@dataclass(frozen=True)
class Mailroom:
    root: Path

    def addressed(self, address: str) -> "Mailroom":
        """The private mailbox of one Claude thread, keyed by its branch."""
        return Mailroom(self.root / "to" / quote(address, safe=""))

    @classmethod
    def for_repo(cls, cwd: Path) -> "Mailroom":
        override = os.environ.get("POKEBENCH_AGENT_MAIL_DIR")
        if override:
            return cls(Path(override))
        return cls(repo_root(cwd) / "runs" / "agent-mail")

    @property
    def pipe(self) -> Path:
        return self.root / "claude.pipe"

    @property
    def pending(self) -> Path:
        return self.root / "pending.jsonl"

    def claim(self, owner: int) -> Path:
        return self.root / f"delivering-{owner}.jsonl"

    @property
    def wake_marker(self) -> Path:
        return self.root / "wake-sent"

    @property
    def log(self) -> Path:
        return self.root / "log.jsonl"

    @property
    def board(self) -> Path:
        return self.root / "landing-board.json"

    @contextmanager
    def locked(self) -> Iterator[None]:
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.root / "lock", "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)


def clock(when: datetime) -> str:
    return when.astimezone(NEW_YORK).strftime("%I:%M %p").lstrip("0")


def day_and_clock(when: datetime) -> str:
    local = when.astimezone(NEW_YORK)
    return f"{local:%b} {local.day} {clock(when)}"


def letter_json(letter: Letter) -> str:
    body = {"sent_at": letter.sent_at.isoformat(), "sender": letter.sender, "text": letter.text}
    if letter.to_thread is not None:
        body["to_thread"] = letter.to_thread
    return json.dumps(body)


def parse_letter(line: str) -> Letter:
    try:
        raw: object = json.loads(line)
    except json.JSONDecodeError as error:
        raise ValueError(f"unreadable letter: {line!r}") from error
    if not isinstance(raw, dict):
        raise ValueError(f"unreadable letter: {line!r}")
    sent_at, sender, text = raw.get("sent_at"), raw.get("sender"), raw.get("text")
    to_thread = raw.get("to_thread")
    if not (
        isinstance(sent_at, str)
        and isinstance(sender, str)
        and isinstance(text, str)
        and (to_thread is None or isinstance(to_thread, str))
    ):
        raise ValueError(f"unreadable letter: {line!r}")
    return Letter(parse_time(sent_at, f"unreadable letter: {line!r}"), sender, text, to_thread)


def format_letter(letter: Letter) -> str:
    to = "" if letter.to_thread is None else f" → thread {letter.to_thread}"
    return f"[{clock(letter.sent_at)}] {letter.sender}{to}: {letter.text}"


def deliver(room: Mailroom, letter: Letter, *, only_if_listening: bool) -> bool:
    """Leave a letter and wake the listener. True when a listener was woken right away.

    With only_if_listening, nothing is saved unless a listener holds the pipe, so the caller
    can fall back to another route without the letter arriving twice.
    """
    line = letter_json(letter) + "\n"
    with room.locked():
        try:
            ping: int | None = os.open(room.pipe, os.O_WRONLY | os.O_NONBLOCK)
        except OSError as error:
            if error.errno not in (errno.ENXIO, errno.ENOENT):
                raise
            ping = None
        if ping is None and only_if_listening:
            return False
        try:
            # The log goes first, so no letter can be delivered without its record.
            for path in (room.log, room.pending):
                with open(path, "a", encoding="utf-8") as handle:
                    handle.write(line)
            if ping is None:
                return False
            try:
                os.write(ping, b"\n")
            except BlockingIOError:
                pass  # The pipe is full of earlier pings: the listener is already being woken.
            except BrokenPipeError:
                # The listener left after open; the letter waits in pending for the next one.
                # A caller that asked for a listener must not also send it another way.
                return only_if_listening
            return True
        finally:
            if ping is not None:
                os.close(ping)


def tell_claude(room: Mailroom, *, sender: str, text: str, now: datetime) -> bool:
    """Leave a letter for Claude. True when a listening Claude was woken right away."""
    return deliver(room, Letter(now, sender, text), only_if_listening=False)


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def drain(room: Mailroom, owner: int) -> list[Letter]:
    """Claim pending letters for this listener and return everything it has not acknowledged.

    Each listener keeps its own claim file until `acknowledge`, so two listeners never share a
    letter, and a listener that dies before showing its letters leaves them for the next one.
    A claim is rewritten whole and swapped in by rename before its sources are removed, so a
    crash part-way leaves either the old files or the new claim, never a torn letter.
    """
    mine = room.claim(owner)
    sources = [
        other
        for other in sorted(room.root.glob("delivering-*.jsonl"))
        if other != mine and not alive(int(other.stem.removeprefix("delivering-")))
    ]
    if room.pending.exists():
        sources.append(room.pending)
    if sources:
        body = mine.read_text(encoding="utf-8") if mine.exists() else ""
        body += "".join(source.read_text(encoding="utf-8") for source in sources)
        staging = room.root / f".claim-{owner}.tmp"
        staging.write_text(body, encoding="utf-8")
        os.replace(staging, mine)
        for source in sources:
            source.unlink()
    if not mine.exists():
        return []
    lines = mine.read_text(encoding="utf-8").splitlines()
    return [parse_letter(line) for line in lines if line.strip()]


def acknowledge(room: Mailroom, owner: int) -> None:
    with room.locked():
        room.claim(owner).unlink(missing_ok=True)


def collect(room: Mailroom, owner: int | None = None) -> list[Letter]:
    who = os.getpid() if owner is None else owner
    with room.locked():
        letters = drain(room, who)
    acknowledge(room, who)
    return letters


def wait_for_mail(
    room: Mailroom,
    *,
    timeout: float | None = None,
    ready: Callable[[], None] | None = None,
    owner: int | None = None,
) -> list[Letter]:
    """Return this listener's letters, or block on the pipe until a sender wakes it.

    The letters stay claimed by `owner` (default: this process) until `acknowledge`.
    """
    who = os.getpid() if owner is None else owner
    with room.locked():
        letters = drain(room, who)
        if letters:
            return letters
        if not room.pipe.exists():
            os.mkfifo(room.pipe)
        reader = os.open(room.pipe, os.O_RDONLY | os.O_NONBLOCK)
        # Our own write end keeps the pipe from reading as closed before any sender arrives.
        keepalive = os.open(room.pipe, os.O_WRONLY)
    try:
        if ready is not None:
            ready()
        select.select([reader], [], [], timeout)
    finally:
        # Close only: an interrupted listener must leave its letters pending for the next one.
        os.close(keepalive)
        os.close(reader)
    with room.locked():
        return drain(room, who)


def has_mail(room: Mailroom) -> bool:
    """Letters waiting, or held by a forwarder that has not acknowledged them yet."""
    if room.pending.exists() and room.pending.read_text(encoding="utf-8").strip():
        return True
    return any(room.root.glob("delivering-*.jsonl"))


def wake_if_mail(room: Mailroom, *, thread: str, run: Run) -> str:
    """Queue one wake into the idle coordinator thread when mail waits and no wake is pending.

    Returns "woke", "skipped" (no mail, or a recent wake not acted on yet) or "failed". The
    marker is written only after the queue succeeds, so a crash can cause a repeat wake but
    never suppress one.
    """
    with room.locked():
        if not has_mail(room):
            return "skipped"
        marker = room.wake_marker
        if marker.exists() and time.time() - marker.stat().st_mtime < STALE_WAKE_SECONDS:
            return "skipped"
        if run(["codex", "queue", "--thread", thread, "--message", WAKE_TEXT]) != 0:
            return "failed"
        marker.write_text(str(time.time()), encoding="utf-8")
        return "woke"


def hand_over(room: Mailroom, *, run: Run) -> tuple[int, int]:
    """Send every waiting letter for a Codex thread by `codex queue`; keep the rest waiting.

    Used when the coordinator cannot be woken. Returns (sent, kept).
    """
    me = os.getpid()
    with room.locked():
        letters = drain(room, me)
        kept = []
        for letter in letters:
            if letter.to_thread is None or (
                run(["codex", "queue", "--thread", letter.to_thread, "--message", letter.text]) != 0
            ):
                kept.append(letter)
        room.claim(me).unlink(missing_ok=True)
        if kept:
            with open(room.pending, "a", encoding="utf-8") as handle:
                handle.write("".join(letter_json(letter) + "\n" for letter in kept))
    return len(letters) - len(kept), len(kept)


def drain_pings(reader: int) -> None:
    while True:
        try:
            if not os.read(reader, 4096):
                return
        except BlockingIOError:
            return


def watch(
    room: Mailroom,
    *,
    thread: str,
    run: Run,
    ready: Callable[[], None] | None = None,
    rounds: int | None = None,
) -> tuple[int, int] | None:
    """Hold the mailbox pipe and wake the idle coordinator thread when letters arrive.

    No model runs here and nothing polls: the process sleeps in select until a sender pings.
    Holding the pipe tells senders the coordinator is reachable, so letters wait here. If a
    wake fails, the pipe is released first (new letters then go by `codex queue`), waiting
    letters are handed to `codex queue`, and the counts from hand_over are returned.
    """
    with room.locked():
        if not room.pipe.exists():
            os.mkfifo(room.pipe)
        reader = os.open(room.pipe, os.O_RDONLY | os.O_NONBLOCK)
        keepalive = os.open(room.pipe, os.O_WRONLY)
    failed = False
    try:
        if ready is not None:
            ready()
        failed = wake_if_mail(room, thread=thread, run=run) == "failed"
        done = 0
        while not failed and (rounds is None or done < rounds):
            select.select([reader], [], [])
            drain_pings(reader)
            failed = wake_if_mail(room, thread=thread, run=run) == "failed"
            done += 1
    finally:
        os.close(keepalive)
        os.close(reader)
    return hand_over(room, run=run) if failed else None


def session_index() -> Path:
    default = Path.home() / ".codex" / "session_index.jsonl"
    return Path(os.environ.get("CODEX_SESSION_INDEX", default))


def known_sessions() -> list[CodexSession]:
    """Every Codex session in the index, newest first; none if the index cannot be read.

    Codex owns and appends to that file. If it cannot be read, letters go by `codex queue`,
    which takes names as well as ids, so nothing is lost.
    """
    try:
        return codex_sessions(session_index(), limit=sys.maxsize)
    except ValueError:
        return []


def thread_id(thread: str, sessions: list[CodexSession]) -> str | None:
    """The Codex thread id for an id or an exact session name; the newest session wins."""
    for session in sessions:
        if session.id == thread:
            return session.id
    for session in sessions:
        if session.name == thread:
            return session.id
    return None


def reach_codex(
    room: Mailroom,
    thread: str,
    text: str,
    *,
    sender: str,
    now: datetime,
    run: Run,
    sessions: list[CodexSession] | None = None,
) -> tuple[int, bool]:
    """Reach a Codex thread: through a listening Codex coordinator, else `codex queue`.

    The coordinator forwards by thread id, so a session name is resolved first; a name with no
    known id goes straight to `codex queue`, which accepts names. Returns the exit code and
    whether the coordinator took it. Pass `sessions` to reuse one read of the index.
    """
    target = thread_id(thread, known_sessions() if sessions is None else sessions)
    if target is not None:
        letter = Letter(now, sender, text, to_thread=target)
        if deliver(room.addressed(CODEX_COORDINATOR), letter, only_if_listening=True):
            return 0, True
    return run(["codex", "queue", "--thread", thread, "--message", text]), False


def tell_codex(
    room: Mailroom, thread: str, text: str, *, sender: str, now: datetime, run: Run
) -> int:
    return reach_codex(room, thread, text, sender=sender, now=now, run=run)[0]


def parse_time(value: str, problem: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(problem) from error


def codex_sessions(index: Path, *, limit: int) -> list[CodexSession]:
    if not index.exists():
        return []
    lines = index.read_text(encoding="utf-8").split("\n")
    # Codex appends while we read; the last line is complete only once its newline lands.
    lines.pop()
    latest: dict[str, CodexSession] = {}
    for line in lines:
        if not line.strip():
            continue
        try:
            raw: object = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"unreadable Codex session: {line!r}") from error
        if not isinstance(raw, dict):
            raise ValueError(f"unreadable Codex session: {line!r}")
        sid, name, updated = raw.get("id"), raw.get("thread_name"), raw.get("updated_at")
        if not (isinstance(sid, str) and isinstance(name, str) and isinstance(updated, str)):
            raise ValueError(f"unreadable Codex session: {line!r}")
        session = CodexSession(
            sid, name, parse_time(updated, f"unreadable Codex session: {line!r}")
        )
        if sid not in latest or latest[sid].updated_at <= session.updated_at:
            latest[sid] = session
    newest = sorted(latest.values(), key=lambda s: s.updated_at, reverse=True)
    return newest[:limit]


def format_session(session: CodexSession) -> str:
    return f"{clock(session.updated_at)}  {session.name}  ({session.id})"


def read_entries(room: Mailroom) -> list[BoardEntry]:
    if not room.board.exists():
        return []
    try:
        raw: object = json.loads(room.board.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("unreadable landing board") from error
    if not isinstance(raw, list):
        raise ValueError("unreadable landing board")
    entries = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("unreadable landing board")
        who, branch = item.get("who"), item.get("branch")
        thread, queued = item.get("codex_thread"), item.get("queued_at")
        if not (
            isinstance(who, str)
            and isinstance(branch, str)
            and (thread is None or isinstance(thread, str))
            and isinstance(queued, str)
        ):
            raise ValueError("unreadable landing board")
        when = parse_time(queued, "unreadable landing board")
        top = item.get("top_since")
        if not (top is None or isinstance(top, str)):
            raise ValueError("unreadable landing board")
        top_since = None if top is None else parse_time(top, "unreadable landing board")
        entries.append(BoardEntry(who, branch, thread, when, top_since))
    return entries


def write_entries(room: Mailroom, entries: list[BoardEntry]) -> None:
    body = [
        {
            "who": e.who,
            "branch": e.branch,
            "codex_thread": e.codex_thread,
            "queued_at": e.queued_at.isoformat(),
            "top_since": None if e.top_since is None else e.top_since.isoformat(),
        }
        for e in entries
    ]
    staging = room.board.with_suffix(".tmp")
    staging.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    staging.replace(room.board)


def read_board(room: Mailroom) -> list[BoardEntry]:
    with room.locked():
        return read_entries(room)


def render_board(entries: list[BoardEntry]) -> str:
    if not entries:
        return "Nobody is landing."
    rows = []
    for number, entry in enumerate(entries, start=1):
        state = "LANDING" if number == 1 else "waiting"
        who = entry.who
        if entry.codex_thread is not None:
            who += f" (Codex session: {entry.codex_thread})"
        rows.append(
            f"{number}. {state}  {entry.branch}  {who}  since {day_and_clock(entry.queued_at)}"
        )
    return "\n".join(rows)


def settle(entries: list[BoardEntry], now: datetime) -> list[BoardEntry]:
    """Stamp when the first entry reached the top; nobody else holds a stamp."""
    return [
        replace(e, top_since=(e.top_since or now) if i == 0 else None)
        for i, e in enumerate(entries)
    ]


def text_for(up: BoardEntry) -> str:
    return f"{up.who}: your turn to land {up.branch}"


def board_join(
    room: Mailroom, *, who: str, branch: str, codex_thread: str | None, now: datetime
) -> int:
    """Join the landing board and return the 1-based position; 1 means it is your turn."""
    with room.locked():
        entries = read_entries(room)
        for number, entry in enumerate(entries, start=1):
            if entry.branch == branch:
                entries[number - 1] = replace(entry, who=who, codex_thread=codex_thread)
                write_entries(room, settle(entries, now))
                return number
        entries.append(BoardEntry(who, branch, codex_thread, now))
        write_entries(room, settle(entries, now))
        return len(entries)


def notice_text(entry: BoardEntry, position: int, total: int) -> str:
    if position == 1:
        return text_for(entry)
    return (
        f"{entry.who}: you are now number {position} of {total} on the landing board "
        f"for {entry.branch}"
    )


def notify_moves(
    room: Mailroom, before: list[BoardEntry], after: list[BoardEntry], *, now: datetime, run: Run
) -> list[Notice]:
    """Tell every entry whose place changed its new place: Codex via reach_codex, Claude by mail."""
    old = {entry.branch: number for number, entry in enumerate(before, start=1)}
    notices = []
    sessions: list[CodexSession] | None = None
    for number, entry in enumerate(after, start=1):
        if old.get(entry.branch) == number:
            continue
        text = notice_text(entry, number, len(after))
        if entry.codex_thread is not None:
            if sessions is None:
                sessions = known_sessions()  # One read of the index per board change.
            code, _ = reach_codex(
                room,
                entry.codex_thread,
                text,
                sender="land-board",
                now=now,
                run=run,
                sessions=sessions,
            )
        else:
            tell_claude(room.addressed(entry.branch), sender="land-board", text=text, now=now)
            code = 0
        notices.append(Notice(entry, number, text, code))
    return notices


def board_done(room: Mailroom, *, branch: str, now: datetime, run: Run) -> list[Notice]:
    """Leave the board and tell everyone behind you their new place; number 1 is told to land.

    A Codex notice's exit code is 0 when the Codex coordinator took it, else `codex queue`'s;
    mail to Claude always lands.
    Notices go out while the board lock is held, so no later board change can be overtaken by
    an older notice. Claude mailboxes have their own locks, so this cannot deadlock.
    """
    with room.locked():
        before = read_entries(room)
        after = settle([e for e in before if e.branch != branch], now)
        if len(after) == len(before):
            raise ValueError(f"{branch} is not on the landing board")
        write_entries(room, after)
        return notify_moves(room, before, after, now=now, run=run)


def board_move(
    room: Mailroom, *, branch: str, before_branch: str, now: datetime, run: Run
) -> list[Notice]:
    """Move one entry to just above another and tell every entry whose place changed."""
    with room.locked():
        before = read_entries(room)
        mover = next((e for e in before if e.branch == branch), None)
        if mover is None:
            raise ValueError(f"{branch} is not on the landing board")
        rest = [e for e in before if e.branch != branch]
        target = next((i for i, e in enumerate(rest) if e.branch == before_branch), None)
        if target is None:
            raise ValueError(f"{before_branch} is not on the landing board")
        after = settle(rest[:target] + [mover] + rest[target:], now)
        write_entries(room, after)
        return notify_moves(room, before, after, now=now, run=run)


LastCommit = Callable[[str], datetime | None]


def slot_timeout() -> timedelta:
    minutes = float(os.environ.get("POKEBENCH_SLOT_TIMEOUT_MINUTES", SLOT_TIMEOUT_MINUTES))
    return timedelta(minutes=minutes)


def git_commit_times(repo: Path) -> LastCommit:
    """Read a branch's last commit time from git; None when the branch does not exist."""

    def last_commit(branch: str) -> datetime | None:
        result = subprocess.run(
            ["git", "-C", str(repo), "log", "-1", "--format=%ct", f"refs/heads/{branch}", "--"],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None
        return datetime.fromtimestamp(int(result.stdout.strip()), tz=UTC)

    return last_commit


def last_activity(entry: BoardEntry, last_commit: LastCommit) -> datetime:
    marks = [entry.top_since or entry.queued_at]
    commit = last_commit(entry.branch)
    if commit is not None:
        marks.append(commit)
    return max(marks)


def next_deadline(room: Mailroom, *, last_commit: LastCommit) -> datetime | None:
    """When the current holder's slot expires; None if no one waits behind it."""
    entries = read_board(room)
    if len(entries) < 2:
        return None
    return last_activity(entries[0], last_commit) + slot_timeout()


def expire_idle_holder(
    room: Mailroom, *, now: datetime, run: Run, last_commit: LastCommit
) -> list[Notice]:
    """Move an idle number 1 to the back when others wait, and tell everyone whose place changed."""
    with room.locked():
        before = read_entries(room)
        if len(before) < 2:
            return []
        holder = before[0]
        idle = now - last_activity(holder, last_commit)
        if idle < slot_timeout():
            return []
        after = settle([*before[1:], replace(holder, top_since=None)], now)
        write_entries(room, after)
        notices = notify_moves(room, before, after, now=now, run=run)
        why = (
            f"{holder.who}: your landing slot for {holder.branch} expired after "
            f"{int(idle.total_seconds() // 60)} minutes with no commit or land-touch while others "
            f"waited. You are now number {len(after)}. Run just land-touch --branch "
            f"{holder.branch} while you hold the slot to keep it."
        )
        if holder.codex_thread is not None:
            reach_codex(room, holder.codex_thread, why, sender="land-board", now=now, run=run)
        else:
            tell_claude(room.addressed(holder.branch), sender="land-board", text=why, now=now)
        return notices


def land_touch(room: Mailroom, *, branch: str, now: datetime) -> bool:
    """Restart the idle clock for the number 1 holder; False if the branch is not number 1."""
    with room.locked():
        entries = read_entries(room)
        place = next((i for i, e in enumerate(entries) if e.branch == branch), None)
        if place is None:
            raise ValueError(f"{branch} is not on the landing board")
        if place != 0:
            return False
        entries[0] = replace(entries[0], top_since=now)
        write_entries(room, entries)
        return True


def keep(
    room: Mailroom,
    *,
    run: Run,
    last_commit: LastCommit,
    now: Callable[[], datetime],
    sleep: Callable[[float], None],
    rounds: int | None = None,
) -> None:
    """Sleep until the holder's deadline, then expire it if still idle. No model runs here."""
    done = 0
    while rounds is None or done < rounds:
        deadline = next_deadline(room, last_commit=last_commit)
        if deadline is None:
            sleep(KEEPER_IDLE_SECONDS)
        else:
            wait = (deadline - now()).total_seconds()
            if wait > 0:
                sleep(wait)
            expire_idle_holder(room, now=now(), run=run, last_commit=last_commit)
        done += 1


def report(notices: list[Notice]) -> int:
    code = 0
    for notice in notices:
        if notice.exit_code == 0:
            print(f"Told {notice.entry.who}: number {notice.position}.")
        else:
            code = notice.exit_code
            print(
                f"Telling {notice.entry.who} failed (codex queue exit {notice.exit_code}). "
                "Tell them by hand: just tell-codex "
                + shlex.join([notice.entry.codex_thread or "", notice.text])
            )
    return code


def main(argv: Sequence[str] | None = None, *, run: Run = run_command) -> int:
    parser = argparse.ArgumentParser(prog="agent-mail", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    tell = commands.add_parser("tell-claude", help="leave a letter for the listening Claude")
    tell.add_argument("--from", dest="sender", default="codex")
    tell.add_argument("--to", default=None, help="a Claude thread's branch; omit for the relay")
    tell.add_argument(
        "--stdin", action="store_true", help="read the letter from standard input, verbatim"
    )
    tell.add_argument("--file", type=Path, default=None, help="read the letter from a file")
    tell.add_argument("words", nargs="*")
    box = commands.add_parser("claude-mailbox", help="wait for letters (run in the background)")
    box.add_argument("--timeout", type=float, default=None)
    box.add_argument("--for", dest="address", default=None, help="your branch's own mailbox")
    box.add_argument(
        "--hold",
        action="store_true",
        help="print JSON letters and keep them claimed until mailbox-done (for forwarders)",
    )
    watcher = commands.add_parser(
        "mailbox-watch", help="wake an idle Codex thread when its mailbox gets letters (no model)"
    )
    watcher.add_argument("--for", dest="address", required=True)
    watcher.add_argument("--wake-codex", dest="thread", required=True)
    watcher.add_argument("--rounds", type=int, default=None, help=argparse.SUPPRESS)
    held = commands.add_parser("mailbox-done", help="acknowledge letters printed with --hold")
    held.add_argument("--for", dest="address", default=None)
    held.add_argument("--claim", type=int, required=True)
    codex = commands.add_parser(
        "tell-codex", help="reach a Codex thread: the Codex coordinator if listening, else queue"
    )
    codex.add_argument("--from", dest="sender", default="claude")
    codex.add_argument("thread")
    codex.add_argument("words", nargs="+")
    sessions = commands.add_parser("codex-sessions", help="list recent Codex sessions")
    sessions.add_argument("--limit", type=int, default=10)
    commands.add_parser("land-board", help="show who is landing and who is waiting")
    touch = commands.add_parser("land-touch", help="number 1: say you are still landing")
    touch.add_argument("--branch", required=True)
    keeper = commands.add_parser(
        "land-keeper", help="expire an idle number 1 at its deadline (no model; run detached)"
    )
    keeper.add_argument("--rounds", type=int, default=None, help=argparse.SUPPRESS)
    join = commands.add_parser("land-join", help="join the landing board")
    join.add_argument("--who", required=True)
    join.add_argument("--branch", required=True)
    join.add_argument("--codex-thread", default=None)
    done = commands.add_parser("land-done", help="leave the board and hand the slot on")
    done.add_argument("--branch", required=True)
    move = commands.add_parser(
        "land-move", help="move an entry above another (only when the operator says so)"
    )
    move.add_argument("--branch", required=True)
    move.add_argument("--before", required=True)
    args = parser.parse_args(argv)

    room = Mailroom.for_repo(Path.cwd())
    now = datetime.now(UTC)
    if args.command == "tell-claude":
        if [args.stdin, args.file is not None, bool(args.words)].count(True) != 1:
            parser.error("give the letter as words, with --stdin or with --file: exactly one")
        if args.file is not None:
            text = args.file.read_text(encoding="utf-8")
        elif args.stdin:
            text = sys.stdin.read()
        else:
            text = " ".join(args.words)
        box_room = room if args.to is None else room.addressed(args.to)
        live = tell_claude(box_room, sender=args.sender, text=text, now=now)
        print(
            "Delivered: a listening Claude was woken."
            if live
            else "No Claude is listening; saved for the next mailbox."
        )
        return 0
    if args.command == "claude-mailbox":
        box_room = room if args.address is None else room.addressed(args.address)
        if args.hold:
            box_room.wake_marker.unlink(missing_ok=True)  # The forwarder is acting on its wake.
        letters = wait_for_mail(box_room, timeout=args.timeout)
        if not letters:
            print("No mail.")
            return NO_MAIL
        if args.hold:
            # Kept claimed: a forwarder that dies before mailbox-done gets them again next run.
            for letter in letters:
                print(json.dumps({"claim": os.getpid(), **json.loads(letter_json(letter))}))
            return 0
        for letter in letters:
            print(format_letter(letter), flush=True)
        acknowledge(box_room, os.getpid())
        return 0
    if args.command == "mailbox-watch":
        handed = watch(
            room.addressed(args.address), thread=args.thread, run=run, rounds=args.rounds
        )
        if handed is None:
            return 0
        sent, kept = handed
        print(
            f"Could not wake {args.thread}; watcher stopped. {sent} letters sent by codex queue, "
            f"{kept} still waiting in the mailbox."
        )
        return 1
    if args.command == "mailbox-done":
        box_room = room if args.address is None else room.addressed(args.address)
        acknowledge(box_room, args.claim)
        print("Acknowledged.")
        return 0
    if args.command == "tell-codex":
        code, via_coordinator = reach_codex(
            room, args.thread, " ".join(args.words), sender=args.sender, now=now, run=run
        )
        print(
            "Delivered to the Codex coordinator, which forwards it mid-turn."
            if via_coordinator
            else "No Codex coordinator is listening; sent with codex queue (read at turn end)."
        )
        return code
    if args.command == "codex-sessions":
        for session in codex_sessions(session_index(), limit=args.limit):
            print(format_session(session))
        return 0
    board_commands = {"land-board", "land-join", "land-done", "land-move", "land-touch"}
    commits = git_commit_times(repo_root(Path.cwd()))
    expired = 0
    if args.command in board_commands:
        expired = report(expire_idle_holder(room, now=now, run=run, last_commit=commits))
    if args.command == "land-keeper":
        keep(
            room,
            run=run,
            last_commit=commits,
            now=lambda: datetime.now(UTC),
            sleep=time.sleep,
            rounds=args.rounds,
        )
        return 0
    if args.command == "land-touch":
        if land_touch(room, branch=args.branch, now=now):
            print("You are still landing; the slot's idle clock restarted.")
        else:
            print("You are not number 1, so there is no slot to keep.")
        return expired
    if args.command == "land-board":
        print(render_board(read_board(room)))
        return expired
    if args.command == "land-join":
        position = board_join(
            room, who=args.who, branch=args.branch, codex_thread=args.codex_thread, now=now
        )
        if position == 1:
            print(f"You are landing now. Run just land-done --branch {args.branch} when finished.")
        else:
            print(f"You are number {position}. You will be told when it is your turn.")
        print(render_board(read_board(room)))
        return 0
    if args.command == "land-move":
        notices = board_move(room, branch=args.branch, before_branch=args.before, now=now, run=run)
    else:
        notices = board_done(room, branch=args.branch, now=now, run=run)
        print("Done.")
    code = report(notices)
    print(render_board(read_board(room)))
    return code


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
