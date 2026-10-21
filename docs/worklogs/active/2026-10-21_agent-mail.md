# Agent mail between Claude and Codex

Operator request 2026-10-21 10:31 AM EDT (the operator, "go ahead and build it"): let Claude and Codex sessions on this Mac talk directly, keep the landing queue somewhere both can see, and add repo skills so each tool knows how to talk to the other. Option C (git reference-transaction lock) was not chosen; this is the lighter "just talk" design.

Scope: dev tooling only. No harness, agent, viewer or experiment behavior changes, so no feature switch.

Design:
- `pokebench_env.agent_mail`, run through `just`. State lives in the main checkout's `runs/agent-mail/` (found from the git common dir, so every worktree shares it).
- Codex to Claude: `just tell-claude` appends the letter to `pending.jsonl` under a lock and pings a named pipe if a listener holds it. `just claude-mailbox` (a Claude thread on the Mac, run in the background) blocks on the pipe with no polling and prints the letters when woken, or drains pending ones at once.
- Claude to Codex: `just tell-codex <thread> <message>` wraps `codex queue`. `just codex-sessions` lists Codex session names.
- Landing board: `just land-board`, `just land-join`, `just land-done`. The first entry is landing. `land-done` tells the next entry it is up (Codex by `codex queue`, Claude by mail).
- Skills: `.claude/skills/talk-to-codex` (Claude side) and `.claude/skills/talk-to-claude` (Codex side, linked from `.agents/skills`). Root `AGENTS.md` points Codex at `CLAUDE.md` and the board rule.
- The coordinator runs in the cloud, so the listener is a Mac Claude thread that relays to it.

M1 RED: tests for mail delivery, pending drain, blocking wake, board order and handoff, Codex session list, CLI.
M2 GREEN: module, just recipes, skills, AGENTS.md, CLAUDE.md rule; gates.
M3 REVIEW/LAND: Claude, Grok and GPT cloud lanes on the frozen packet; land through the board.

## Progress
- RED: env/tests/env/test_agent_mail.py fails at import (module missing), 15 tests.
- GREEN: pokebench_env/agent_mail.py, 20 tests pass, module 100% lines/branches. Live: `just codex-sessions` reads the real index; a half-written last index line (Codex appending) was seen live and is now ignored until its newline lands. `codex queue` against a throwaway session printed "Queued message … for thread …" (codex-cli 0.153.4). Named-pipe wake also proven live in the thread session at 10:26 AM EDT.
- Gates: just build, just lint pass; just coverage pass (Python 3658 passed, lines 97.32 / branches 93.15 / functions 100; agent and viewer above floor); just verify-vendor OK. just test: one agent failure in serial-comparison.test.ts "hung child" (stdout timing), unrelated; that file passed 3/3 reruns and in the coverage run.

## Multi-Model Review Log
- R1 packet d00cded5..6408b4ad, diff SHA-256 0ccb1f43…. Claude CLI BLOCKING, Grok (Cursor) BLOCKING, GPT (Cursor gpt-5.6-sol-xhigh) unavailable: Cursor usage limit until 2026-11-17. Codex CLI gpt-5.6-sol answers under ChatGPT auth (gpt-6.x refused), so it carries the GPT lane from R2.
- R1 accepted (both lanes): land-done printed "told" and exited 0 when `codex queue` failed. FIX: board_done returns Handoff(up, exit_code); land-done exits non-zero and prints the manual tell-codex command. Also accepted: interrupted listener deleted pending letters (drain only on normal return now); rejoin refreshes who/codex_thread; bad timestamps raise the uniform "unreadable" errors; skills say --timeout 540, how a waiting lander handles other letters, "--" before dash messages, and soften "Delivered". Rejected as scope: auto-expiry of a stale holder (operator chose advisory board; skills say ask the operator). Not verified, recorded: a sandboxed Codex writing runs/agent-mail; whether `codex queue` starts a turn in an idle Codex app session.
- Tests after fix: 24 agent-mail tests pass, module 100% lines and branches.
- R2 packet d00cded5..b0e997a1, SHA-256 9c6fd415…: Claude CLI LGTM, Grok LGTM, GPT (Codex CLI gpt-5.6-sol, harness switch from capped Cursor) BLOCKING with 4 items.
  - Accepted B1: mailbox deleted letters before printing them. FIX: drain moves pending into delivering.jsonl; claude-mailbox acknowledges only after printing (test: BrokenPipe mid-print, next mailbox shows both letters).
  - Accepted B2: pending was written before log. FIX: log first (test: unwritable log leaves nothing deliverable).
  - Rebutted B3 (sandboxed Codex cannot write runs/agent-mail): The operator's Codex runs sandbox_mode = "danger-full-access", approval_policy = "never" (~/.codex/config.toml), the same profile that merged dc22bc5d and 5534f285 into main. No sandboxed Codex profile is in use here.
  - Rebutted B4 (no clean full test receipt): gates on b0e997a1 all passed before R2 returned: just build, lint, coverage (Python 3671 passed, 97.33/93.18/100), just test (agent 3292, viewer 1609, Python 3671 passed), verify-vendor; EXIT 0.
  - Also taken from Claude/Grok/GPT hardening notes: paste-safe manual handoff (shlex), board shows date, lander checks the board on each wake, Codex link in execute-worklog, re-review reminder in talk-to-claude.
- Tests after R2 fix: 27 agent-mail tests pass, module 100%.
- 10:59 AM EDT: The operator OK'd updating CLAUDE.md; added the standing Codex-messaging approval to CLAUDE.md and talk-to-codex. R3 lanes stopped before verdicts; R3 re-run on the new head.
- R3 packet d00cded5..9b680593, SHA-256 f9569812…: Claude, Grok and GPT all BLOCKING on the same real bug: one shared delivering file let two listeners get the same letter, and one listener's acknowledge could delete letters the other had not printed. FIX: each listener claims letters in delivering-<pid>.jsonl, acknowledges only its own, and adopts claims of dead pids (tests: two live listeners, dead listener hand-over, liveness). GPT B2 (no clean full gate on the final head): accepted; R4 runs gates sequentially before the reviewers and records the receipt in the boundary.
- Steering finding (the operator 11:01 AM asked for interrupting messages): Codex Desktop threads run in the app's private `codex app-server --listen stdio://` (0.163 alpha), with no control socket, so `turn/steer` is unreachable from outside; openai/codex#48928 confirms script-queued items wait for turn end or a Steer click. Mid-turn delivery via a Codex PostToolUse hook is the follow-up; Codex hooks need operator trust, and the trust-bypass flag is (rightly) refused here, so it ships separately after the operator trusts it.
- R4 packet d00cded5..cbfa498e, SHA-256 ae768306…, gate receipt runs/reviews/agent-mail/r4-gates.log (EXIT 0). Claude LGTM, Grok LGTM, GPT BLOCKING (3). All accepted:
  - Claim copy could tear on a crash. FIX: a claim is rebuilt whole in .claim-<pid>.tmp and swapped in with os.replace before sources are unlinked (test: os.replace fails mid-claim, next mailbox gets the 200 kB letter whole).
  - PID reuse could strand a claim. FIX: a claim older than 60 s is adopted even if its pid is live, since claims live only between drain and acknowledge (test: pid-1 claim aged past the limit).
  - No concurrent proof. FIX: two real mailbox processes, five letters, exact-once union; mutation check: forcing one shared claim file fails both two-listener tests 3/3, restored passes.
  - Grok hardening: corrupt board/session JSON now raise the uniform "unreadable" errors.
- Tests: 34 agent-mail tests, module 100%.
- R5 packet d00cded5..47e20826, SHA-256 2e7f5a43…, gates r5-gates.log EXIT 0. Claude LGTM, Grok LGTM, GPT BLOCKING (1): the R4 60-second stale-claim adoption takes letters from a live but slow listener, so both print them. Accepted; GPT's own disposition: drop time-based adoption, keep dead-pid recovery, and document pid reuse as a rare limitation (letters wait in the claim file; tell the operator). Test: a live listener's aged claim is left alone.
- R6 packet d00cded5..08237472, SHA-256 629bc0ac…, gates r6-gates.log EXIT 0. Claude LGTM, Grok LGTM, GPT BLOCKING (1): a listener closing between the sender's open and write raised BrokenPipeError after the letter was saved. FIX: treated as "no listener" (returns False; letter waits in pending); test with a real FIFO reader and a failing write. Skill line qualified ("without crashes").
- 11:42 AM: stepped claude/agent-mail off the board slot (held since 11:36) so the queue moves; rejoined at #8.
- The operator 11:37 AM asked that every waiting session hear when its place moves: land-done and the new land-move now notify every entry whose position changed (Codex by queue, Claude by mail). land-move added for the coordinator's dependency reorder (11:39), restricted in the skills to the operator's word. Tests: 37, module 100%.
- 11:48 AM, coordinator: several Claude threads listened on the one pipe, so one thread caught another's turn letter. FIX: per-thread mailboxes keyed by branch (runs/agent-mail/to/<quoted branch>/); board notices to a Claude entry go to its own mailbox; `tell-claude --to BRANCH`, `claude-mailbox --for BRANCH`; unaddressed letters stay in the shared relay mailbox. R7 was stopped before verdicts and re-sealed on this head. Tests: 38, module 100%.
- R7 packet d00cded5..005075fb, gates r7-gates.log EXIT 0. Claude LGTM, Grok LGTM, GPT BLOCKING (1): notices were sent after the board lock was released, so an older notice could overtake a newer board change (C told "number 2" after being made number 1). FIX: board_done/board_move notify while holding the board lock (Claude mailboxes have their own locks, so no deadlock). Test: A pauses mid-notify, B leaves, C's last notice must be "your turn"; mutation (notify outside the lock) fails it 3/3, restored passes 3/3. Tests: 39, module 100%.
