# Mailbox: Codex↔Claude and the landing board only

Branch `claude/mailbox-codex-only`, worktree `~/dev/pokebench-mailbox-codex-only`, base `306a6e8d8`.

## Problem Statement

Cloud threads could not reliably hand work to Mac sessions. Letters went to `tell-claude --to <branch>` mailboxes keyed by a branch the sender guessed. No hook surfaces mail, and only the relay box has a listener, so 97 letters sat unread in 46 boxes, 43 of them for branches no worktree had checked out. Approvals carried in letters are also refused by the merge check by design.

Operator approval: The operator tapped "Codex only, archive old letters" on the mailbox card (2026-11-12 01:53Z, relayed by the project coordinator with the scope below).

## Skills Loaded

feature-worklog, talk-to-codex, execute-worklog (scope only; landing waits for Codex review and the operator's own approval in the thread).

## Architecture

- `agent_mail.py`: pure helpers `strict_to`, `worktree_branches`, `unread_address`, `own_address`, `stale_boxes`; thin I/O `checked_out_branches`, `current_branch`, `listening`, `archive_boxes`. `main` takes `environ`, `branches` and `branch` as injected dependencies and checks addresses before opening the mailroom.
- `tell-claude --to B` refuses (exit 2) unless B is checked out in a worktree or is the reserved `codex-coordinator` box. Switch `POKEBENCH_AGENT_MAIL_STRICT_TO` (default on; `0/off/false/no` restores the old behavior).
- `claude-mailbox --for` with no value, or `--mine`, reads the branch checked out in the cwd; detached HEAD refuses.
- `archive-boxes [--dry-run] [--into DATE]` (`just mail-archive`) moves `to/<box>/` whole into `archive/<UTC date>/<box>/`, skipping live branches, reserved boxes, boxes with a waiting listener and existing targets.
- Landing board notices (`notify_moves`, `expire_holder`) still write to the joiner's branch box directly; unchanged.

## Invariants

- INV-1: no letter is sent to a box no session can read while the switch is on. Test: `test_tell_claude_refuses_an_unread_branch_before_touching_the_mailroom`.
- INV-2: switch off is the previous behavior (no branch lookup). Test: `test_tell_claude_with_the_switch_off_does_not_check_branches`.
- INV-3: archive never deletes and never moves a live branch's, reserved or listened box. Tests: `test_stale_boxes_*`; real dry run before real run.
- INV-4: relay (no `--for`) and landing board unchanged. Test: `test_own_address_keeps_the_relay_and_named_boxes`.

## Security Review

Argv-list subprocesses only (`git worktree list --porcelain`, `git branch --show-current`). Box names are url-quoted on disk as before; archive renames within `runs/agent-mail/`. No network.

## Milestones

- [x] M1 code + no-I/O tests (12 pass), ruff + mypy clean on the two files.
- [x] M1 docs: CLAUDE.md Git section, talk-to-codex, talk-to-claude, codex-coordinator, execute-worklog.
- [x] M1 commit. COMMIT: `feat(agent-mail): mailbox is Codex<->Claude and landing board only` (220c60ce7). Tests: 12 passed (test_agent_mail_addressing.py).
- [x] Archive run with this branch's code against the real mailroom (2026-11-11 ~21:05 ET). Before: 91 boxes in `to/`, 89 unread letters. Dry run: would move 86. Real run: moved 86 to `runs/agent-mail/archive/2026-11-12/` (83 unread, 298 logged letters intact). After: 5 boxes in `to/` (claude/ended-run-stream-error 3 unread, claude/twins-fake-host 1, codex/fortree-push-preview-plan 1, claude/readme-features-link 0, codex-coordinator 0); a second run moved 0.
- [ ] Codex review via `just tell-codex`.
- [ ] Full `just test` / `just lint` (needs a CPU window), cloud review lanes, landing on the operator's own approval.

## Closing the Loop

Real CLI against the real mailroom (read-only): `tell-claude --to claude/scrub-sync x` printed the refusal and exited 2; `archive-boxes --dry-run` listed 86 boxes.

## Session Log

- 2026-11-11 20:55 ET: worktree created, code and tests written.

## Surprises

- `agent_mail.py` had no tests left after the no-I/O cleanup (4b6acc660 deleted `test_agent_mail.py`).

## Multi-Model Review Log

Pending: Codex review.

## Boy Scout Log

None.
