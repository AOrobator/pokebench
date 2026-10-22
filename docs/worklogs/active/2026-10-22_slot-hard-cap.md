# Landing slot: 30 minutes from taking it

Operator 2026-10-22 9:54 AM EDT (the operator): "move ahead, the slots should expire we talked about this. it can expire 30minutes after acquiring, we probs need a skill update for this". The 2026-10-21 idle clock let codex/milestone-drought-suppression hold number 1 from 2:17 AM to 9:54 AM: it only started counting when the first waiter joined at 9:37 AM.

Scope: dev tooling (`pokebench_env.agent_mail` board, just recipes, landing skills).

Design:
- `top_since` is stamped when an entry becomes number 1, alone or not.
- When anyone waits and number 1 has held the slot for 30 minutes (`SLOT_TIMEOUT_MINUTES`, env `POKEBENCH_SLOT_TIMEOUT_MINUTES`), it moves to the back. Everyone whose place changed is told, and the holder is told why. Commits do not extend the slot.
- `land-touch`, the branch-head activity tracking (`top_head`, `git_branch_heads`) and the idle wording are removed. Pre-1.0, no shims: an old board's `top_head` key is ignored on read.
- The keeper and board commands work as before: `expire_holder` runs first, and the keeper checks each minute or at the deadline.
- Skills: talk-to-claude, talk-to-codex and execute-worklog say to run gates and reviews before your turn, and to use the slot only for the final sync, merge, main test, evidence commit and land-done.

## Progress
- RED 0221f347: the rewritten expiry tests fail on the idle-clock code. They cover expire_holder, the stamp on taking the slot, a lone holder past the limit expiring once someone waits, the removed land-touch, and an old top_head key being ignored.
- GREEN: expire_holder with the hard cap; land-touch, top_head and git_branch_heads removed; skills and justfile updated. 82 agent-mail tests, module 100% lines and branches; ruff and mypy clean.
- R1 (head 28dbd25f): Claude LGTM (non-blocking: the in-slot list should mention the gate rerun; mark the old worklog superseded; a one-time free slot on old boards; fractional-limit wording; a mid-merge move is inherent to the cap). GPT BLOCKING (2), both accepted. The fallback lane did not run: its prompt had stray quotes that broke the codex argv; fixed for R2.
  - land-join checked expiry before adding the first waiter, so an overdue lone holder stayed number 1. FIX: land-join expires again after joining and reports the joiner's real position (test drives main).
  - The numbered steps in both skills still said to join first. FIX: new step 0 (sync, gates, reviews before joining); at your turn, gates rerun only if main moved; a changed diff means land-done, review, rejoin. execute-worklog says the same. The old slot-expiry worklog is marked superseded.
  - 83 agent-mail tests, module 100%.
- R2 (head 9fcfcb6b, synced with main d14390a4; gates EXIT 0 first try): Claude LGTM, fallback (gpt-5.6-terra, standing in for Grok) LGTM, GPT BLOCKING (3).
  - Accepted: the talk-to-codex and execute-worklog "land-done" instructions lacked `--branch`. FIX: both say `just land-done --branch <branch>`.
  - Accepted: the review artifacts were stale. The boundary's file list omitted the superseded 2026-10-21 worklog, and PB10 said 82 tests; both are corrected.
  - Rebutted: fixture runtime. board_of seeds 1–3 fixed rows per test (Claude and the fallback both audited it as bounded; the same point was rebutted on 2026-10-21).
- LANDED 2026-10-22 11:11 AM EDT (the operator "land now", 10:37 AM, after round 2): main fast-forwarded 60edf6150 → 6b2507e87. Branch diff byte-identical to the a4cd24c6d tree after syncing (SHA-256 9a5afada…). Gates EXIT 0 first try on 6b2507e87. Main `just test`: 4445 agent, 1677 viewer, 3960 Python pass. Keeper restarted from main on the new code (pid 59295).
