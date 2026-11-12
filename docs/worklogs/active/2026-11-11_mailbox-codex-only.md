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
- `archive-boxes [--dry-run] [--into DATE]` (`just mail-archive`) moves the files of `to/<box>/` (all but its lock file) into `archive/<UTC date>/<box>/`, skipping live branches, reserved boxes, boxes with a waiting listener and existing targets.
- Landing board notices (`notify_moves`, `expire_holder`) still write to the joiner's branch box directly; unchanged.

## Invariants

- INV-1: no letter is sent to a box no session can read while the switch is on. Test: `test_preflight_refuses_tell_claude_to_an_unread_branch`.
- INV-2: switch off is the previous behavior (no branch lookup). Test: `test_preflight_with_the_switch_off_does_not_check_branches`.
- INV-3: archive never deletes and never moves a live branch's, reserved or listened box. Tests: `test_stale_boxes_*`; real dry run before real run.
- INV-4: relay (no `--for`) and landing board unchanged. Test: `test_own_address_keeps_the_relay_and_named_boxes`.

## Security Review

Argv-list subprocesses only (`git worktree list --porcelain`, `git branch --show-current`). Box names are url-quoted on disk as before; archive renames within `runs/agent-mail/`. No network.

## Milestones

- [x] M1 code + no-I/O tests (12 pass), ruff + mypy clean on the two files.
- [x] M1 docs: CLAUDE.md Git section, talk-to-codex, talk-to-claude, codex-coordinator, execute-worklog.
- [x] M1 commit. COMMIT: `feat(agent-mail): mailbox is Codex<->Claude and landing board only` (220c60ce7). Tests: 12 passed (test_agent_mail_addressing.py).
- [x] Archive run with this branch's code against the real mailroom (2026-11-11 ~21:05 ET). Before: 91 boxes in `to/`, 89 unread letters. Dry run: would move 86. Real run: moved 86 to `runs/agent-mail/archive/2026-11-12/` (83 unread, 298 logged letters intact). After: 5 boxes in `to/` (claude/ended-run-stream-error 3 unread, claude/twins-fake-host 1, codex/fortree-push-preview-plan 1, claude/readme-features-link 0, codex-coordinator 0); a second run moved 0.
- [x] Codex review r1 (job review-claude-mailbox-codex-only-r1, head f75ef4eb4): VERDICT: CHANGES. P2 archive rename strands a sender waiting on the box lock (FileNotFoundError); P2 the five main() tests trip the no-I/O guard via argparse gettext os.stat (5 fail, 7 pass under uv's CPython 3.11.16; my earlier 12-pass run used the main checkout's venv and did not reproduce it).
- [x] r1 fixes: archive moves a box's files but leaves the folder and its lock file, so a waiting caller still finds the folder; the address checks moved into pure `preflight()`, tested without building a parser. 14 passed via `uv run --project env python -m pytest -q -p no:cacheprovider env/tests/env/test_agent_mail_addressing.py` and from env/. Scratchpad race rehearsal (temp dir, not a test): a sender queued behind the archive lock returned normally and its letter landed in the emptied box.
- [x] Codex review r2 (job review-claude-mailbox-codex-only-r2, frozen base 306a6e8d8, head dd13d0687): VERDICT: LGTM. Codex reran both uv commands (14 passed) and a temp-mailroom rehearsal.
- [x] Claude review lane (fresh subagent on 306a6e8d8..1108da7ac, diff + worklog only): VERDICT: LGTM, no P1/P2. P3 fixes in the next commit: worklog test names, archive skips a box whose `delivering-<pid>.jsonl` belongs to a live forwarder (`held_claims`), a git failure in the strict check refuses with a message instead of a traceback. P3 untested I/O helpers noted; env floor still holds. 15 focused tests pass from the branch env.
- [-] Grok lane skipped: Grok is out until 2026-11-17 (project coordinator note, 2026-11-12 02:04Z).
- [~] CPU START granted 9:05 PM ET. `just test` and `just lint` stop at the node legs: the worktree has no node_modules (`tsc: command not found`; `pnpm install` not run, no installs allowed). Python legs at the fix head: env pytest 3461 passed, coverage lines 84.28 / branches 78.26 / functions 79.55 (floor 69); claude-gateway 39 passed, gate 46.25/42.86/23.60 (floor 22); explainer-twins-check up to date; env ruff check, ruff format --check, mypy clean. `just no-io-proof` fails only on its vitest half for the same missing node_modules. Node legs (pnpm build/coverage/lint, vitest no-io-proof) still to run; the branch changes no TypeScript.
- [x] Codex review r3 (job review-claude-mailbox-codex-only-r3, dd13d0687..b2a1c1adf): VERDICT: LGTM; 15 passed and scratchpad rehearsals of the live-claim skip and the git-failure refusal.
- [x] Gate evidence, Python-only (option 2 from the relay, chosen by the project coordinator 2026-11-12 02:08Z; The operator already told the TypeScript checks did not run).
  - Ran, in the 9:05 PM ET CPU window, at b2a1c1adf (later commits are worklog-only):
    - `just test` env leg: `cd env && uv run pytest -q --cov --cov-branch`: 3461 passed; `coverage_gate --min 69`: lines 84.28, branches 78.26, functions 79.55, PASS.
    - `just test` gateway leg: claude-gateway pytest under the no-I/O guard: 39 passed; `coverage_gate --min 22`: 46.25 / 42.86 / 23.60, PASS.
    - `just lint` Python legs: `just explainer-twins-check` up to date; env `ruff check .`, `ruff format --check .`, `mypy`: clean.
    - `just no-io-proof`: pytest half ran; vitest half failed with "vitest: [] of 0", because vitest is not installed.
    - Focused: `env/tests/env/test_agent_mail_addressing.py` 15 passed (and by Codex independently).
  - Did not run: `just build` (pnpm -r build / tsc), `pnpm -r coverage` (agent + viewer vitest with coverage floors), `pnpm -r lint` (tsc --noEmit, eslint), the vitest half of `just no-io-proof`, the claude-gateway ruff/mypy lint legs.
  - Why: the worktree has no node_modules (`tsc: command not found`); installing needs `pnpm install`, which was not authorized ("no installs"). The branch changes no TypeScript, JavaScript or packages/ file (`git diff --stat 306a6e8d8..HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs' packages/` is empty), and none of the skipped legs read `env/pokebench_env/agent_mail.py`, the justfile recipe added, or the skill/CLAUDE.md prose. If the operator asks for the full TypeScript gate, ask about the install first.
- [ ] Landing on the operator's own approval in the project thread.

## Closing the Loop

Real CLI against the real mailroom (read-only): `tell-claude --to claude/scrub-sync x` printed the refusal and exited 2; `archive-boxes --dry-run` listed 86 boxes.

## Session Log

- 2026-11-11 20:55 ET: worktree created, code and tests written.

## Surprises

- `agent_mail.py` had no tests left after the no-I/O cleanup (4b6acc660 deleted `test_agent_mail.py`).

## Multi-Model Review Log

- r1 Codex/GPT: CHANGES (2×P2), fixed in the next commit. - r2 Codex/GPT: LGTM on 306a6e8d8..dd13d0687.

## Boy Scout Log

None.
