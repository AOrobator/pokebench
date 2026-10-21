# Landing slot expiry

Operator 2026-10-21 4:42 PM EDT (the operator): "cursor is out of tokens, either land his work or boot him. the slot should expire. shit or get off the pot". The Cursor entry held #1 for over an hour while idle; it was booted by hand. This adds expiry so an idle #1 holder is moved back automatically.

Scope: dev tooling (`pokebench_env.agent_mail` board, just recipes, skills). Stacked on claude/codex-coordinator.

Design:
- The board stamps `top_since` on whoever becomes #1.
- A holder is active if its branch got a commit, it ran `just land-touch`, or it just became #1. Idle time is measured from the latest of those.
- Past the timeout (default 45 min, POKEBENCH_SLOT_TIMEOUT_MINUTES), the holder moves to the back. Every entry whose place changed gets the usual notice; the moved one is also told why.
- Checked by every board command, and by an LLM-free `just land-keeper` that sleeps until the current holder's deadline.

## Progress
- RED: 10 new board-expiry tests fail (no top_since, expire_idle_holder, land_touch, next_deadline, keep, git_commit_times); 61 existing pass.
- GREEN: BoardEntry.top_since (stamped by settle on every board write); last_activity = latest of top_since/queued_at and the branch's last commit (git, from the main checkout); expire_idle_holder moves an idle #1 to the back when others wait, notifies everyone whose place changed and tells the holder why; land_touch; next_deadline; keep (sleeps until the deadline, KEEPER_IDLE_SECONDS when nothing can expire). Board CLI commands expire first. Recipes land-touch, land-keeper; skills say how to keep the slot. 75 agent-mail tests, module 100%.
