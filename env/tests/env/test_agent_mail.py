"""Mail between Claude and Codex sessions on this Mac, and the shared landing board."""

import json
import os
import subprocess
import sys
import threading
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

import pytest

from pokebench_env import agent_mail as am

T = datetime(2026, 10, 21, 14, 27, tzinfo=UTC)


class Runs:
    def __init__(self, code: int = 0) -> None:
        self.calls: list[list[str]] = []
        self.code = code

    def __call__(self, argv: Sequence[str]) -> int:
        self.calls.append(list(argv))
        return self.code


def room(tmp_path: Path) -> am.Mailroom:
    return am.Mailroom(tmp_path / "mail")


def test_letter_without_a_listener_waits_in_pending_and_is_logged(tmp_path: Path) -> None:
    r = room(tmp_path)
    assert am.tell_claude(r, sender="codex", text="landing gym-door-label", now=T) is False
    assert am.collect(r) == [am.Letter(T, "codex", "landing gym-door-label")]
    assert am.collect(r) == []
    logged = [json.loads(line) for line in r.log.read_text().splitlines()]
    assert logged == [
        {"sent_at": T.isoformat(), "sender": "codex", "text": "landing gym-door-label"}
    ]


def test_long_letters_arrive_whole(tmp_path: Path) -> None:
    r = room(tmp_path)
    text = "x" * 200_000 + "\nsecond line"
    am.tell_claude(r, sender="codex", text=text, now=T)
    assert am.collect(r)[0].text == text


def test_listener_is_woken_by_a_letter(tmp_path: Path) -> None:
    r = room(tmp_path)
    ready = threading.Event()
    got: list[list[am.Letter]] = []
    listener = threading.Thread(target=lambda: got.append(am.wait_for_mail(r, ready=ready.set)))
    listener.start()
    assert ready.wait(5)
    assert am.tell_claude(r, sender="codex", text="your turn", now=T) is True
    listener.join(5)
    assert not listener.is_alive()
    assert got == [[am.Letter(T, "codex", "your turn")]]
    assert am.tell_claude(r, sender="codex", text="later", now=T) is False


def test_listener_returns_pending_mail_at_once(tmp_path: Path) -> None:
    r = room(tmp_path)
    am.tell_claude(r, sender="codex", text="while you were away", now=T)
    assert am.wait_for_mail(r) == [am.Letter(T, "codex", "while you were away")]


def test_listener_times_out_empty_and_reuses_its_pipe(tmp_path: Path) -> None:
    r = room(tmp_path)
    assert am.wait_for_mail(r, timeout=0.05) == []
    assert am.wait_for_mail(r, timeout=0.05) == []


def test_bad_pending_line_is_refused(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.root.mkdir(parents=True)
    r.pending.write_text('{"sent_at": "2026-10-21T14:27:00+00:00", "sender": 3, "text": "x"}\n')
    with pytest.raises(ValueError, match="letter"):
        am.collect(r)
    r.claim(os.getpid()).unlink()
    r.pending.write_text("not json\n")
    with pytest.raises(ValueError, match="letter"):
        am.collect(r)
    r.claim(os.getpid()).unlink()
    r.pending.write_text("[1]\n")
    with pytest.raises(ValueError, match="letter"):
        am.collect(r)


def test_letters_print_in_new_york_time() -> None:
    assert am.format_letter(am.Letter(T, "codex", "hi")) == "[10:27 AM] codex: hi"


def test_tell_codex_queues_into_the_named_session() -> None:
    runs = Runs(code=7)
    assert am.tell_codex("Restore gym door label", "main moved", run=runs) == 7
    assert runs.calls == [
        ["codex", "queue", "--thread", "Restore gym door label", "--message", "main moved"]
    ]


def test_codex_sessions_newest_first_one_row_per_session(tmp_path: Path) -> None:
    index = tmp_path / "session_index.jsonl"
    rows = [
        {"id": "a", "thread_name": "Old name", "updated_at": "2026-10-21T13:00:00Z"},
        {"id": "b", "thread_name": "Fix gates", "updated_at": "2026-10-21T14:06:03.214932Z"},
        {"id": "a", "thread_name": "Restore gym door label", "updated_at": "2026-10-21T13:28:01Z"},
    ]
    index.write_text("".join(json.dumps(row) + "\n" for row in rows) + "\n")
    sessions = am.codex_sessions(index, limit=5)
    assert [(s.name, s.id) for s in sessions] == [
        ("Fix gates", "b"),
        ("Restore gym door label", "a"),
    ]
    assert am.codex_sessions(index, limit=1)[0].id == "b"
    assert am.format_session(sessions[0]) == "10:06 AM  Fix gates  (b)"
    assert am.codex_sessions(tmp_path / "missing.jsonl", limit=5) == []
    index.write_text('{"id": "a"}\n')
    with pytest.raises(ValueError, match="session"):
        am.codex_sessions(index, limit=5)


def test_board_order_and_rejoin(tmp_path: Path) -> None:
    r = room(tmp_path)
    assert am.read_board(r) == []
    assert am.render_board([]) == "Nobody is landing."
    assert (
        am.board_join(r, who="codex", branch="codex/gym-door-label", codex_thread="Gym door", now=T)
        == 1
    )
    assert (
        am.board_join(r, who="claude thread mart", branch="claude/mart", codex_thread=None, now=T)
        == 2
    )
    assert (
        am.board_join(r, who="codex", branch="codex/gym-door-label", codex_thread="Gym door", now=T)
        == 1
    )
    assert am.render_board(am.read_board(r)) == (
        "1. LANDING  codex/gym-door-label  codex (Codex session: Gym door)  since Oct 21 10:27 AM\n"
        "2. waiting  claude/mart  claude thread mart  since Oct 21 10:27 AM"
    )


def test_done_hands_the_slot_to_a_waiting_claude_by_mail(tmp_path: Path) -> None:
    r = room(tmp_path)
    runs = Runs()
    am.board_join(r, who="codex", branch="codex/a", codex_thread="A", now=T)
    am.board_join(r, who="claude thread b", branch="claude/b", codex_thread=None, now=T)
    nxt = am.board_done(r, branch="codex/a", now=T, run=runs)
    assert nxt == am.Handoff(am.read_board(r)[0], 0) and nxt.up.branch == "claude/b"
    assert runs.calls == []
    assert am.collect(r) == [
        am.Letter(T, "land-board", "claude thread b: your turn to land claude/b")
    ]
    assert am.board_done(r, branch="claude/b", now=T, run=runs) is None


def test_done_hands_the_slot_to_a_waiting_codex_by_queue(tmp_path: Path) -> None:
    r = room(tmp_path)
    runs = Runs()
    am.board_join(r, who="claude thread b", branch="claude/b", codex_thread=None, now=T)
    am.board_join(r, who="codex", branch="codex/a", codex_thread="A", now=T)
    am.board_join(r, who="codex 2", branch="codex/c", codex_thread="C", now=T)
    assert am.board_done(r, branch="codex/c", now=T, run=runs) is None
    assert runs.calls == []
    nxt = am.board_done(r, branch="claude/b", now=T, run=runs)
    assert nxt is not None and nxt.up.who == "codex" and nxt.exit_code == 0
    assert runs.calls == [
        ["codex", "queue", "--thread", "A", "--message", "codex: your turn to land codex/a"]
    ]
    with pytest.raises(ValueError, match="not on the landing board"):
        am.board_done(r, branch="nope", now=T, run=runs)


def test_bad_board_is_refused(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.root.mkdir(parents=True)
    r.board.write_text('[{"who": "x"}]')
    with pytest.raises(ValueError, match="board"):
        am.read_board(r)
    r.board.write_text('{"who": "x"}')
    with pytest.raises(ValueError, match="board"):
        am.read_board(r)


def test_mailroom_lives_in_the_main_checkout_runs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = tmp_path / "repo"
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    monkeypatch.delenv("POKEBENCH_AGENT_MAIL_DIR", raising=False)
    found = am.Mailroom.for_repo(repo).root
    assert found == (repo / "runs" / "agent-mail").resolve()
    monkeypatch.setenv("POKEBENCH_AGENT_MAIL_DIR", str(tmp_path / "elsewhere"))
    assert am.Mailroom.for_repo(repo).root == tmp_path / "elsewhere"


def test_cli(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("POKEBENCH_AGENT_MAIL_DIR", str(tmp_path / "mail"))
    runs = Runs()

    def out() -> str:
        return capsys.readouterr().out

    assert am.main(["tell-claude", "main", "moved"], run=runs) == 0
    assert "saved" in out()
    assert am.main(["claude-mailbox"], run=runs) == 0
    assert out().endswith("codex: main moved\n")
    assert am.main(["claude-mailbox", "--timeout", "0.01"], run=runs) == 3
    assert out() == "No mail.\n"
    assert am.main(["tell-claude", "--from", "codex gym", "hi"], run=runs) == 0
    out()
    assert am.main(["claude-mailbox"], run=runs) == 0
    assert "codex gym: hi" in out()

    assert am.main(["tell-codex", "Gym door", "main", "moved"], run=runs) == 0
    assert runs.calls[-1] == ["codex", "queue", "--thread", "Gym door", "--message", "main moved"]

    index = tmp_path / "index.jsonl"
    index.write_text(
        '{"id": "b", "thread_name": "Fix gates", "updated_at": "2026-10-21T14:06:03Z"}\n'
    )
    monkeypatch.setenv("CODEX_SESSION_INDEX", str(index))
    assert am.main(["codex-sessions"], run=runs) == 0
    assert "Fix gates  (b)" in out()

    assert (
        am.main(
            ["land-join", "--who", "codex", "--branch", "codex/a", "--codex-thread", "A"], run=runs
        )
        == 0
    )
    assert "You are landing now" in out()
    assert am.main(["land-join", "--who", "claude", "--branch", "claude/b"], run=runs) == 0
    assert "number 2" in out()
    assert am.main(["land-board"], run=runs) == 0
    assert "1. LANDING  codex/a" in out()
    assert am.main(["land-done", "--branch", "codex/a"], run=runs) == 0
    assert "claude/b is up" in out()
    assert am.main(["land-done", "--branch", "claude/b"], run=runs) == 0
    assert "Nobody is landing." in out()


def test_run_command_returns_the_exit_code() -> None:
    assert am.run_command(["true"]) == 0
    assert am.run_command(["false"]) == 1


def test_unexpected_pipe_errors_surface(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.pipe.mkdir(parents=True)
    with pytest.raises(OSError):
        am.tell_claude(r, sender="codex", text="hi", now=T)


def test_a_full_pipe_still_counts_as_delivered(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    r = room(tmp_path)
    ready = threading.Event()
    got: list[list[am.Letter]] = []
    listener = threading.Thread(target=lambda: got.append(am.wait_for_mail(r, ready=ready.set)))
    listener.start()
    assert ready.wait(5)
    real_write = os.write

    def full(fd: int, data: bytes) -> int:
        raise BlockingIOError

    monkeypatch.setattr(os, "write", full)
    assert am.tell_claude(r, sender="codex", text="hi", now=T) is True
    monkeypatch.setattr(os, "write", real_write)
    am.tell_claude(r, sender="codex", text="again", now=T)
    listener.join(5)
    assert [letter.text for letter in got[0]] == ["hi", "again"]


def test_older_session_rows_do_not_replace_newer_ones(tmp_path: Path) -> None:
    index = tmp_path / "session_index.jsonl"
    rows = [
        {"id": "a", "thread_name": "New", "updated_at": "2026-10-21T14:00:00Z"},
        {"id": "a", "thread_name": "Old", "updated_at": "2026-10-21T13:00:00Z"},
    ]
    index.write_text("".join(json.dumps(row) + "\n" for row in rows))
    assert [s.name for s in am.codex_sessions(index, limit=5)] == ["New"]
    with index.open("a") as handle:
        handle.write('{"id": "c", "thread_name": "half writt')
    assert [s.name for s in am.codex_sessions(index, limit=5)] == ["New"]
    index.write_text("[1]\n")
    with pytest.raises(ValueError, match="session"):
        am.codex_sessions(index, limit=5)


def test_board_items_must_be_objects(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.root.mkdir(parents=True)
    r.board.write_text("[1]")
    with pytest.raises(ValueError, match="board"):
        am.read_board(r)


def test_a_failed_codex_handoff_is_loud(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("POKEBENCH_AGENT_MAIL_DIR", str(tmp_path / "mail"))
    runs = Runs(code=1)
    am.main(["land-join", "--who", "claude", "--branch", "claude/a"], run=runs)
    am.main(["land-join", "--who", "codex", "--branch", "codex/b", "--codex-thread", "B"], run=runs)
    capsys.readouterr()
    assert am.main(["land-done", "--branch", "claude/a"], run=runs) == 1
    printed = capsys.readouterr().out
    assert "telling codex failed (codex queue exit 1)" in printed
    assert "just tell-codex B 'codex: your turn to land codex/b'" in printed
    assert "told" not in printed.replace("telling", "")
    assert "1. LANDING  codex/b" in printed


def test_rejoining_refreshes_who_and_the_codex_session(tmp_path: Path) -> None:
    r = room(tmp_path)
    am.board_join(r, who="codex", branch="codex/a", codex_thread=None, now=T)
    assert am.board_join(r, who="codex: A", branch="codex/a", codex_thread="A", now=T) == 1
    assert am.read_board(r) == [am.BoardEntry("codex: A", "codex/a", "A", T)]


def test_an_interrupted_listener_leaves_letters_pending(tmp_path: Path) -> None:
    r = room(tmp_path)

    def interrupted() -> None:
        am.tell_claude(r, sender="codex", text="keep me", now=T)
        raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        am.wait_for_mail(r, ready=interrupted)
    assert am.collect(r) == [am.Letter(T, "codex", "keep me")]


def test_bad_timestamps_are_reported_like_other_bad_rows(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.root.mkdir(parents=True)
    r.pending.write_text('{"sent_at": "yesterday", "sender": "codex", "text": "x"}\n')
    with pytest.raises(ValueError, match="unreadable letter"):
        am.collect(r)
    r.board.write_text('[{"who": "a", "branch": "b", "codex_thread": null, "queued_at": "x"}]')
    with pytest.raises(ValueError, match="unreadable landing board"):
        am.read_board(r)


def test_letters_survive_a_listener_that_dies_while_printing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("POKEBENCH_AGENT_MAIL_DIR", str(tmp_path / "mail"))
    r = am.Mailroom(tmp_path / "mail")
    am.tell_claude(r, sender="codex", text="first", now=T)
    real = am.format_letter

    def broken(letter: am.Letter) -> str:
        raise BrokenPipeError

    monkeypatch.setattr(am, "format_letter", broken)
    with pytest.raises(BrokenPipeError):
        am.main(["claude-mailbox"])
    monkeypatch.setattr(am, "format_letter", real)
    am.tell_claude(r, sender="codex", text="second", now=T)
    capsys.readouterr()
    assert am.main(["claude-mailbox"]) == 0
    assert capsys.readouterr().out.splitlines() == [
        "[10:27 AM] codex: first",
        "[10:27 AM] codex: second",
    ]
    assert am.collect(r) == []


def test_no_letter_is_deliverable_without_its_log_record(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.log.mkdir(parents=True)
    with pytest.raises(OSError):
        am.tell_claude(r, sender="codex", text="unlogged", now=T)
    assert not r.pending.exists()


def test_the_manual_handoff_command_is_safe_to_paste(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("POKEBENCH_AGENT_MAIL_DIR", str(tmp_path / "mail"))
    runs = Runs(code=2)
    am.main(["land-join", "--who", "claude", "--branch", "claude/a"], run=runs)
    am.main(
        ["land-join", "--who", "x", "--branch", "codex/b", "--codex-thread", 'a "$(rm)"'], run=runs
    )
    capsys.readouterr()
    assert am.main(["land-done", "--branch", "claude/a"], run=runs) == 2
    assert "just tell-codex 'a \"$(rm)\"' 'x: your turn to land codex/b'" in capsys.readouterr().out


def test_two_listeners_never_share_or_drop_a_letter(tmp_path: Path) -> None:
    # Owner 1 (launchd) stands in for another live listener.
    r = room(tmp_path)
    am.tell_claude(r, sender="codex", text="for whoever wakes first", now=T)
    first = am.wait_for_mail(r, owner=1)
    assert [x.text for x in first] == ["for whoever wakes first"]
    am.tell_claude(r, sender="codex", text="second letter", now=T)
    assert am.wait_for_mail(r, owner=os.getpid()) == [am.Letter(T, "codex", "second letter")]
    am.acknowledge(r, os.getpid())
    assert r.claim(1).exists()


def test_a_dead_listeners_letters_go_to_the_next_listener(tmp_path: Path) -> None:
    r = room(tmp_path)
    child = subprocess.Popen(["true"])
    child.wait()
    am.tell_claude(r, sender="codex", text="orphaned", now=T)
    assert [x.text for x in am.wait_for_mail(r, owner=child.pid)] == ["orphaned"]
    assert am.collect(r) == [am.Letter(T, "codex", "orphaned")]
    assert not r.claim(child.pid).exists()


def test_liveness_treats_unsignalable_processes_as_alive() -> None:
    assert am.alive(1) is True
    assert am.alive(os.getpid()) is True


def test_a_crash_while_claiming_leaves_every_letter_whole(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    r = room(tmp_path)
    big = "y" * 200_000
    am.tell_claude(r, sender="codex", text=big, now=T)
    real_replace = os.replace

    def crash(src: object, dst: object) -> None:
        raise OSError("killed mid-claim")

    monkeypatch.setattr(os, "replace", crash)
    with pytest.raises(OSError, match="killed mid-claim"):
        am.collect(r, owner=4242)
    monkeypatch.setattr(os, "replace", real_replace)
    assert am.collect(r) == [am.Letter(T, "codex", big)]


def test_a_stale_claim_is_adopted_even_if_its_pid_was_reused(tmp_path: Path) -> None:
    r = room(tmp_path)
    am.tell_claude(r, sender="codex", text="stranded", now=T)
    assert [x.text for x in am.wait_for_mail(r, owner=1)] == ["stranded"]
    old = time.time() - am.STALE_CLAIM_SECONDS - 5
    os.utime(r.claim(1), (old, old))
    assert am.collect(r) == [am.Letter(T, "codex", "stranded")]
    assert not r.claim(1).exists()


def test_two_listener_processes_split_letters_exactly_once(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.root.mkdir(parents=True)
    env = {**os.environ, "POKEBENCH_AGENT_MAIL_DIR": str(r.root)}
    argv = [sys.executable, "-m", "pokebench_env.agent_mail", "claude-mailbox", "--timeout", "4"]
    listeners = [
        subprocess.Popen(argv, env=env, stdout=subprocess.PIPE, text=True) for _ in range(2)
    ]
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            os.close(os.open(r.pipe, os.O_WRONLY | os.O_NONBLOCK))
            break
        except OSError:
            time.sleep(0.01)
    sent = [f"letter {n}" for n in range(5)]
    for text in sent:
        am.tell_claude(r, sender="codex", text=text, now=T)
    printed: list[str] = []
    for listener in listeners:
        out, _ = listener.communicate(timeout=20)
        printed += [line.split("codex: ", 1)[1] for line in out.splitlines() if "codex: " in line]
    printed += [letter.text for letter in am.collect(r)]
    assert sorted(printed) == sent


def test_corrupt_board_and_session_files_are_reported_as_unreadable(tmp_path: Path) -> None:
    r = room(tmp_path)
    r.root.mkdir(parents=True)
    r.board.write_text("{not json")
    with pytest.raises(ValueError, match="unreadable landing board"):
        am.read_board(r)
    index = tmp_path / "index.jsonl"
    index.write_text("{not json\n")
    with pytest.raises(ValueError, match="unreadable Codex session"):
        am.codex_sessions(index, limit=5)
