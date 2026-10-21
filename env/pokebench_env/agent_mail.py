"""Mail between Claude and Codex sessions on this Mac, and the shared landing board.

Letters to Claude always go to pending.jsonl under a lock. A listening Claude holds the read end
of a named pipe; a sender writes one byte to it, which wakes the listener without polling. The
payload never travels through the pipe, so letters of any size arrive whole and none is lost when
no one is listening. Claude talks to Codex through `codex queue`.
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
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")
NO_MAIL = 3
# The mailbox a Codex coordinator thread listens on; it forwards each letter to its Codex thread
# with Codex's own send_message_to_thread, which reaches a busy thread mid-turn.
CODEX_COORDINATOR = "codex-coordinator"
# Between two mailbox runs the coordinator is busy forwarding, not listening; it still counts
# as present this long after its last run's timeout, so letters wait for it instead of queueing.
PRESENCE_GRACE_SECONDS = 120.0
# A forwarder running without --timeout is assumed present this long.
DEFAULT_HOLD_WAIT_SECONDS = 600.0

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


@dataclass(frozen=True)
class Notice:
    entry: BoardEntry
    position: int
    text: str
    exit_code: int


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
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        return cls(Path(common).resolve().parent / "runs" / "agent-mail")

    @property
    def pipe(self) -> Path:
        return self.root / "claude.pipe"

    @property
    def pending(self) -> Path:
        return self.root / "pending.jsonl"

    def claim(self, owner: int) -> Path:
        return self.root / f"delivering-{owner}.jsonl"

    @property
    def presence(self) -> Path:
        return self.root / "present-until"

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


def mark_present(room: Mailroom, until: datetime) -> None:
    room.root.mkdir(parents=True, exist_ok=True)
    room.presence.write_text(until.isoformat(), encoding="utf-8")


def present(room: Mailroom, now: datetime) -> bool:
    """Whether a forwarder (the Codex coordinator) has said it is running until after now."""
    if not room.presence.exists():
        return False
    until = parse_time(room.presence.read_text(encoding="utf-8").strip(), "unreadable presence")
    return until > now


def reach_codex(
    room: Mailroom, thread: str, text: str, *, sender: str, now: datetime, run: Run
) -> tuple[int, bool]:
    """Reach a Codex thread: through a listening Codex coordinator, else `codex queue`.

    Returns the exit code and whether the coordinator took it.
    """
    letter = Letter(now, sender, text, to_thread=thread)
    box = room.addressed(CODEX_COORDINATOR)
    if present(box, now):
        # Listening or between runs: either way it picks the letter up on its next run.
        deliver(box, letter, only_if_listening=False)
        return 0, True
    if deliver(box, letter, only_if_listening=True):
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
        entries.append(BoardEntry(who, branch, thread, when))
    return entries


def write_entries(room: Mailroom, entries: list[BoardEntry]) -> None:
    body = [
        {
            "who": e.who,
            "branch": e.branch,
            "codex_thread": e.codex_thread,
            "queued_at": e.queued_at.isoformat(),
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
                entries[number - 1] = BoardEntry(who, branch, codex_thread, entry.queued_at)
                write_entries(room, entries)
                return number
        entries.append(BoardEntry(who, branch, codex_thread, now))
        write_entries(room, entries)
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
    """Tell every entry whose place changed its new place: Codex by queue, Claude by mail."""
    old = {entry.branch: number for number, entry in enumerate(before, start=1)}
    notices = []
    for number, entry in enumerate(after, start=1):
        if old.get(entry.branch) == number:
            continue
        text = notice_text(entry, number, len(after))
        if entry.codex_thread is not None:
            code = tell_codex(room, entry.codex_thread, text, sender="land-board", now=now, run=run)
        else:
            tell_claude(room.addressed(entry.branch), sender="land-board", text=text, now=now)
            code = 0
        notices.append(Notice(entry, number, text, code))
    return notices


def board_done(room: Mailroom, *, branch: str, now: datetime, run: Run) -> list[Notice]:
    """Leave the board and tell everyone behind you their new place; number 1 is told to land.

    A notice's exit code is `codex queue`'s for a Codex entry; mail to Claude always lands.
    Notices go out while the board lock is held, so no later board change can be overtaken by
    an older notice. Claude mailboxes have their own locks, so this cannot deadlock.
    """
    with room.locked():
        before = read_entries(room)
        after = [e for e in before if e.branch != branch]
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
        after = rest[:target] + [mover] + rest[target:]
        write_entries(room, after)
        return notify_moves(room, before, after, now=now, run=run)


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
    tell.add_argument("words", nargs="*")
    box = commands.add_parser("claude-mailbox", help="wait for letters (run in the background)")
    box.add_argument("--timeout", type=float, default=None)
    box.add_argument("--for", dest="address", default=None, help="your branch's own mailbox")
    box.add_argument(
        "--hold",
        action="store_true",
        help="print JSON letters and keep them claimed until mailbox-done (for forwarders)",
    )
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
        if args.stdin == bool(args.words):
            parser.error("give the letter as words or with --stdin, not both or neither")
        text = sys.stdin.read() if args.stdin else " ".join(args.words)
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
            wait = DEFAULT_HOLD_WAIT_SECONDS if args.timeout is None else args.timeout
            mark_present(box_room, now + timedelta(seconds=wait + PRESENCE_GRACE_SECONDS))
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
        default_index = Path.home() / ".codex" / "session_index.jsonl"
        index = Path(os.environ.get("CODEX_SESSION_INDEX", default_index))
        for session in codex_sessions(index, limit=args.limit):
            print(format_session(session))
        return 0
    if args.command == "land-board":
        print(render_board(read_board(room)))
        return 0
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
