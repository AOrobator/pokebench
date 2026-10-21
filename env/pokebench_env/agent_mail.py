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
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")
NO_MAIL = 3

Run = Callable[[Sequence[str]], int]


def run_command(argv: Sequence[str]) -> int:
    return subprocess.run(list(argv), check=False).returncode


@dataclass(frozen=True)
class Letter:
    sent_at: datetime
    sender: str
    text: str


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
class Handoff:
    up: BoardEntry
    exit_code: int


@dataclass(frozen=True)
class Mailroom:
    root: Path

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
    return json.dumps(
        {"sent_at": letter.sent_at.isoformat(), "sender": letter.sender, "text": letter.text}
    )


def parse_letter(line: str) -> Letter:
    try:
        raw: object = json.loads(line)
    except json.JSONDecodeError as error:
        raise ValueError(f"unreadable letter: {line!r}") from error
    if not isinstance(raw, dict):
        raise ValueError(f"unreadable letter: {line!r}")
    sent_at, sender, text = raw.get("sent_at"), raw.get("sender"), raw.get("text")
    if not (isinstance(sent_at, str) and isinstance(sender, str) and isinstance(text, str)):
        raise ValueError(f"unreadable letter: {line!r}")
    return Letter(parse_time(sent_at, f"unreadable letter: {line!r}"), sender, text)


def format_letter(letter: Letter) -> str:
    return f"[{clock(letter.sent_at)}] {letter.sender}: {letter.text}"


def tell_claude(room: Mailroom, *, sender: str, text: str, now: datetime) -> bool:
    """Leave a letter for Claude. True when a listening Claude was woken right away."""
    line = letter_json(Letter(now, sender, text)) + "\n"
    with room.locked():
        # The log goes first, so no letter can be delivered without its record.
        for path in (room.log, room.pending):
            with open(path, "a", encoding="utf-8") as handle:
                handle.write(line)
        try:
            ping = os.open(room.pipe, os.O_WRONLY | os.O_NONBLOCK)
        except OSError as error:
            if error.errno in (errno.ENXIO, errno.ENOENT):
                return False
            raise
        try:
            os.write(ping, b"\n")
        except BlockingIOError:
            pass  # The pipe is full of earlier pings: the listener is already being woken.
        finally:
            os.close(ping)
        return True


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
    """
    mine = room.claim(owner)
    for other in sorted(room.root.glob("delivering-*.jsonl")):
        pid = int(other.stem.removeprefix("delivering-"))
        if pid != owner and not alive(pid):
            with open(mine, "a", encoding="utf-8") as handle:
                handle.write(other.read_text(encoding="utf-8"))
            other.unlink()
    if room.pending.exists():
        with open(mine, "a", encoding="utf-8") as handle:
            handle.write(room.pending.read_text(encoding="utf-8"))
        room.pending.unlink()
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


def tell_codex(thread: str, text: str, *, run: Run) -> int:
    return run(["codex", "queue", "--thread", thread, "--message", text])


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
        raw: object = json.loads(line)
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
    raw: object = json.loads(room.board.read_text(encoding="utf-8"))
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


def board_done(room: Mailroom, *, branch: str, now: datetime, run: Run) -> Handoff | None:
    """Leave the board. When the lander leaves, tell the next entry it is up.

    The exit code is `codex queue`'s for a Codex entry; mail to Claude always lands in pending.
    """
    with room.locked():
        entries = read_entries(room)
        place = next((i for i, e in enumerate(entries) if e.branch == branch), None)
        if place is None:
            raise ValueError(f"{branch} is not on the landing board")
        del entries[place]
        write_entries(room, entries)
    if place != 0 or not entries:
        return None
    up = entries[0]
    text = text_for(up)
    if up.codex_thread is not None:
        return Handoff(up, tell_codex(up.codex_thread, text, run=run))
    tell_claude(room, sender="land-board", text=text, now=now)
    return Handoff(up, 0)


def main(argv: Sequence[str] | None = None, *, run: Run = run_command) -> int:
    parser = argparse.ArgumentParser(prog="agent-mail", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    tell = commands.add_parser("tell-claude", help="leave a letter for the listening Claude")
    tell.add_argument("--from", dest="sender", default="codex")
    tell.add_argument("words", nargs="+")
    box = commands.add_parser("claude-mailbox", help="wait for letters (run in the background)")
    box.add_argument("--timeout", type=float, default=None)
    codex = commands.add_parser("tell-codex", help="queue a message into a Codex session")
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
    args = parser.parse_args(argv)

    room = Mailroom.for_repo(Path.cwd())
    now = datetime.now(UTC)
    if args.command == "tell-claude":
        live = tell_claude(room, sender=args.sender, text=" ".join(args.words), now=now)
        print(
            "Delivered: a listening Claude was woken."
            if live
            else "No Claude is listening; saved for the next mailbox."
        )
        return 0
    if args.command == "claude-mailbox":
        letters = wait_for_mail(room, timeout=args.timeout)
        if not letters:
            print("No mail.")
            return NO_MAIL
        for letter in letters:
            print(format_letter(letter), flush=True)
        acknowledge(room, os.getpid())
        return 0
    if args.command == "tell-codex":
        return tell_codex(args.thread, " ".join(args.words), run=run)
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
    handoff = board_done(room, branch=args.branch, now=now, run=run)
    code = 0
    if handoff is None:
        print("Done.")
    elif handoff.exit_code == 0:
        print(f"Done. {handoff.up.branch} is up; told {handoff.up.who}.")
    else:
        code = handoff.exit_code
        print(
            f"Done, but telling {handoff.up.who} failed (codex queue exit {code}). "
            "Tell them by hand: just tell-codex "
            + shlex.join([handoff.up.codex_thread or "", text_for(handoff.up)])
        )
    print(render_board(read_board(room)))
    return code


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
