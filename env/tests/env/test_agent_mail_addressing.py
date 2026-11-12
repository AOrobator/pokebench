import pytest

from pokebench_env import agent_mail
from pokebench_env.agent_mail import (
    CODEX_COORDINATOR,
    MINE,
    main,
    own_address,
    stale_boxes,
    strict_to,
    unread_address,
    worktree_branches,
)

PORCELAIN = """worktree /Users/user/dev/pokebench
HEAD 306a6e8d8
branch refs/heads/main

worktree /tmp/pb-stream-err
HEAD 1111111
branch refs/heads/claude/ended-run-stream-error

worktree /tmp/pb-pin
HEAD 2222222
detached
"""
LIVE = frozenset({"main", "claude/ended-run-stream-error"})


def test_worktree_branches_reads_checked_out_branches_only() -> None:
    assert worktree_branches(PORCELAIN) == LIVE


def test_strict_to_is_on_unless_switched_off() -> None:
    assert strict_to({})
    assert strict_to({"POKEBENCH_AGENT_MAIL_STRICT_TO": "1"})
    for off in ("0", "off", "FALSE", " no "):
        assert not strict_to({"POKEBENCH_AGENT_MAIL_STRICT_TO": off})


def test_unread_address_accepts_checked_out_branches_and_the_coordinator() -> None:
    assert unread_address("claude/ended-run-stream-error", LIVE) is None
    assert unread_address(CODEX_COORDINATOR, LIVE) is None


def test_unread_address_explains_where_to_send_instead() -> None:
    problem = unread_address("claude/scrub-sync", LIVE)
    assert problem is not None
    assert "'claude/scrub-sync'" in problem
    assert "Remote Control session" in problem
    assert "SendMessage" in problem


def test_own_address_keeps_the_relay_and_named_boxes() -> None:
    def never() -> str:
        raise AssertionError("branch looked up")

    assert own_address(None, never) is None
    assert own_address("claude/x", never) == "claude/x"


def test_own_address_bare_for_reads_the_current_branch() -> None:
    assert own_address(MINE, lambda: "claude/mine") == "claude/mine"
    with pytest.raises(ValueError, match="detached"):
        own_address(MINE, lambda: "")


def test_stale_boxes_skips_live_branches_and_reserved_boxes() -> None:
    boxes = ["claude/ended-run-stream-error", "claude/scrub-sync", CODEX_COORDINATOR, "master"]
    assert stale_boxes(boxes, LIVE) == ["claude/scrub-sync", "master"]


def test_tell_claude_refuses_an_unread_branch_before_touching_the_mailroom(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def no_mailroom(cwd: object) -> None:
        raise AssertionError("mailroom opened")

    monkeypatch.setattr(
        agent_mail.Mailroom, "for_repo", classmethod(lambda cls, cwd: no_mailroom(cwd))
    )
    code = main(
        ["tell-claude", "--to", "claude/gone", "hello"],
        environ={},
        branches=lambda: LIVE,
        branch=lambda: "main",
    )
    assert code == 2
    assert "'claude/gone'" in capsys.readouterr().err


def test_tell_claude_with_the_switch_off_does_not_check_branches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Opened(Exception):
        pass

    def opened(cls: object, cwd: object) -> None:
        raise Opened

    monkeypatch.setattr(agent_mail.Mailroom, "for_repo", classmethod(opened))

    def no_lookup() -> frozenset[str]:
        raise AssertionError("branches looked up")

    with pytest.raises(Opened):
        main(
            ["tell-claude", "--to", "claude/gone", "hello"],
            environ={"POKEBENCH_AGENT_MAIL_STRICT_TO": "0"},
            branches=no_lookup,
            branch=lambda: "main",
        )


@pytest.mark.parametrize("flag", [["--for"], ["--mine"]])
def test_bare_for_on_a_detached_head_refuses(
    flag: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    code = main(
        ["claude-mailbox", *flag, "--timeout", "1"],
        environ={},
        branches=lambda: LIVE,
        branch=lambda: "",
    )
    assert code == 2
    assert "detached" in capsys.readouterr().err


def test_bare_for_resolves_before_the_mailroom_opens(monkeypatch: pytest.MonkeyPatch) -> None:
    class Opened(Exception):
        pass

    def opened(cls: object, cwd: object) -> None:
        raise Opened

    monkeypatch.setattr(agent_mail.Mailroom, "for_repo", classmethod(opened))
    asked: list[str] = []

    def mine() -> str:
        asked.append("asked")
        return "claude/mine"

    with pytest.raises(Opened):
        main(
            ["claude-mailbox", "--for", "--timeout", "1"],
            environ={},
            branches=lambda: LIVE,
            branch=mine,
        )
    assert asked == ["asked"]
