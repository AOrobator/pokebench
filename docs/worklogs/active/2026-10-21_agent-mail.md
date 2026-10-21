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
