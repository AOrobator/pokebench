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
