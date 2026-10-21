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
- R2 (head 68ace77b): Claude BLOCKING, Grok BLOCKING (cursor-agent back), GPT BLOCKING. Accepted and fixed:
  - Claude B1 / GPT 1: the idle clock ran while the holder was alone, so a holder alone for an hour was evicted as soon as someone joined. FIX: `settle` keeps no stamp on a lone holder and stamps it when the first waiter joins; `land_touch` goes through `settle`, so a touch while alone banks nothing. GPT also asked that a holder idle while alone be expired at once on the first join; rebutted, since the contract is "45 minutes while others wait" (Claude's reading, and the skills' wording).
  - Grok: `%ct` commit dates can be forged or backdated. FIX: the board stores the holder's branch head (`top_head`, from `git rev-parse`); the first sighting is a baseline and a head that changes after it counts as activity at the board's own clock. `git_commit_times`/`last_activity` removed.
  - GPT 2: land-join, land-done and land-move dropped the pre-command expiry exit code. FIX: each returns it (land-done/move return their own failure first). CLI test drives all three with codex queue exit 7.
  - GPT 1 (lateness): the keeper now checks every 60 s (`KEEPER_IDLE_SECONDS`, one `git rev-parse`, no model) or sooner at the deadline, so a new commit is seen within a minute and expiry is at most a minute late.
  - GPT 3 (fixture runtime): rebutted. Each test seeds 1–3 fixed rows; Claude and Grok both audited it as bounded.
  - 82 agent-mail tests, module 100% lines and branches; ruff and mypy clean.
- LANDED 2026-10-21 6:40 PM EDT (the operator "land it", 5:16 PM, no round 3): main fast-forwarded f94e361d5 → e0f7bfeb5. Full gates passed on 8a6974141 (main 384a87f92 merged; try 3 after viewer timing flakes in untouched TS). The final sync with f94e361d5 brought in docs only (execute-worklog, talk-to-claude, a caught-dex worklog); after it, 82 agent-mail tests and verify-vendor pass. 82 tests pass on main. Keeper started detached from main after land-done (`just land-keeper`, log runs/agent-mail/land-keeper.log).
