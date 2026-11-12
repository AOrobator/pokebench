import pytest

from pokebench_env.agent_mail import (
    CODEX_COORDINATOR,
    MINE,
    archivable,
    own_address,
    preflight,
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


def never_branches() -> frozenset[str]:
    raise AssertionError("branches looked up")


def never_branch() -> str:
    raise AssertionError("branch looked up")


def test_preflight_refuses_tell_claude_to_an_unread_branch() -> None:
    refusal, address = preflight(
        "tell-claude",
        to="claude/gone",
        address=None,
        environ={},
        branches=lambda: LIVE,
        branch=never_branch,
    )
    assert refusal is not None and "'claude/gone'" in refusal
    assert address is None


def test_preflight_lets_tell_claude_reach_a_live_branch_and_the_relay() -> None:
    for to in ("claude/ended-run-stream-error", None):
        assert preflight(
            "tell-claude",
            to=to,
            address=None,
            environ={},
            branches=lambda: LIVE,
            branch=never_branch,
        ) == (None, None)


def test_preflight_with_the_switch_off_does_not_check_branches() -> None:
    assert preflight(
        "tell-claude",
        to="claude/gone",
        address=None,
        environ={"POKEBENCH_AGENT_MAIL_STRICT_TO": "0"},
        branches=never_branches,
        branch=never_branch,
    ) == (None, None)


def test_preflight_bare_for_reads_the_current_branch() -> None:
    assert preflight(
        "claude-mailbox",
        to=None,
        address=MINE,
        environ={},
        branches=never_branches,
        branch=lambda: "claude/mine",
    ) == (None, "claude/mine")


def test_preflight_bare_for_on_a_detached_head_refuses() -> None:
    refusal, _ = preflight(
        "claude-mailbox",
        to=None,
        address=MINE,
        environ={},
        branches=never_branches,
        branch=lambda: "",
    )
    assert refusal is not None and "detached" in refusal


def test_preflight_leaves_other_commands_alone() -> None:
    assert preflight(
        "mailbox-done",
        to=None,
        address=CODEX_COORDINATOR,
        environ={},
        branches=never_branches,
        branch=never_branch,
    ) == (None, CODEX_COORDINATOR)


def test_archivable_keeps_the_lock_file_in_place() -> None:
    assert archivable(["pending.jsonl", "lock", "claude.pipe", "log.jsonl"]) == [
        "claude.pipe",
        "log.jsonl",
        "pending.jsonl",
    ]
    assert archivable(["lock"]) == []
