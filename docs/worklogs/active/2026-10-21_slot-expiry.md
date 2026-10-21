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
- R1 (base 02ec3ce5, head 820dced0, gates EXIT 0 first try): Claude LGTM; Grok unavailable (Cursor out of usage; The operator 4:35 PM "yes dont wait for grok": Claude + GPT + a fallback reviewer count); GPT BLOCKING (2), both accepted:
  - A board written before this change has no top_since, so the first command would measure idle time from queued_at and expire a holder that only just reached #1. FIX: an unstamped #1 is stamped at the first check instead of expired; next_deadline returns "now" for it so the keeper stamps it (test: a 3-hour-old legacy board keeps its holder and starts the clock).
  - The holder's expiry reason and keeper notices could fail silently. FIX: the reason is returned as a Notice with its exit code, and keep() prints report() for every expiry, with the hand-send command (test: codex queue exit 7 is reported by both).
  - 77 tests, module 100%.
