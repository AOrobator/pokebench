# Agent mail: stale wake pings

Status: landed on main 2026-10-27 4:20 PM New York (098c80c04, evidence dc745789a). Archived 4:33 PM on the operator's approval.

## Problem

After a burst of letters at 4:04 PM on 10/27, `just claude-mailbox` printed "No mail." at once. Three
wake bytes were left in `runs/agent-mail/claude.pipe`. `wait_for_mail` selected on the pipe but never
read the pings, so leftover bytes woke every new listener immediately. Letters were in pending.jsonl;
nothing was lost. `just codex-mailbox` uses the same function and had the same bug. `watch()`
(`just codex-mailbox-watch`) already drained pings and was not affected.

## Fix

`wait_for_mail` drains pings left by already-read letters at start (under the mailbox lock), drains
pings after each wake, and keeps waiting out the remaining timeout when a wake brings no letter.
Delivery is decided only by pending letters. The pipe is closed and the `--hold` wake marker cleared
(only on an empty final return) under the lock. No feature switch: mailbox infra, not harness behavior.

- [x] RED: 5 new tests in `env/tests/env/test_agent_mail.py` fail on the old code (5 failed, 83 deselected).
- [x] GREEN: COMMIT: `fix(agent-mail): stale wake pings no longer end a mailbox wait early` (c7c4aeca2); mailbox suite 88 passed, `agent_mail.py` 100% lines and branches.
- [x] Synced with main: merge commit 098c80c04 (base 7e5933213).
- [x] Gates in the worktree (with `.env` linked, submodule, pnpm install, build, `POKEBENCH_CARD_ART` per the trainer-card README): agent 4540/4540, viewer 2060/2060, Python 4431 passed, coverage lines 97.47% / branches 93.58% / functions 100%, trainer cards 3/3, ruff + format + mypy clean.

## Multi-Model Review Log

Packet: `git diff --binary 7e5933213 098c80c04`, SHA-256 `09cd91c34736ca41dccaf27d6259d34830b502fa1976b85be9be130055d20381`. Principles self-review PB1–PB13, zero FAIL. Reviewers were asked to check drain/deliver races under the lock, `timeout=None` forever-wait and `--hold` marker semantics.

| Lane | Harness / model | Verdict |
|---|---|---|
| Claude | Claude CLI, `~/.claude-review`, plan mode | LGTM |
| GPT | isolated Codex CLI (`--ephemeral --sandbox read-only`), gpt-5.6-sol | LGTM |
| Grok | unavailable | fallback below; reduced diversity |
| Fallback 1 | read-only subagent, Sonnet | LGTM |
| Fallback 2 | read-only subagent, Haiku | LGTM |

Follow-ups raised (not bugs, not in this branch): a direct test of `timeout=None` with a letterless wake inside the loop; bound the burst test's collection loop and make background listener threads daemon so a regression fails instead of hanging; join or cancel the `threading.Timer` in the marker test; pipe fds can leak if setup raises before the `try` (pre-existing for the `os.open` calls).

## Landing

- Landing board: `just land-join` gave slot 1 at 4:25 PM; main had not moved since the packet.
- `git merge --ff-only 098c80c04`: main = 098c80c04; `git diff --binary 7e5933213 HEAD` matches the packet SHA.
- `just test` on main: Python 4431 passed (coverage lines 97.47% / branches 93.58% / functions 100%), trainer cards 3/3. The agent suite had 1 failure, `citation-evidence.test.ts` ("hyperqwen-control-3h.json: expected true to be false"), caused by the untracked `experiments/fixed/hyperqwen-control-3h.json` in the main checkout (someone else's uncommitted work, created 3:15 PM); the same committed tree passed 4540/4540 in the worktree.
- Listeners running at landing still use the old code until restarted: `claude-mailbox --timeout 3000` (pid 96160, started 4:14 PM). `mailbox-watch --for codex-coordinator` (pid 69360) is unaffected by this bug.
