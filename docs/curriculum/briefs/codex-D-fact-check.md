# Brief D: fact check the Rayquaza guides

**Goal:** independently check every line of the Rayquaza guides, so a false note never reaches Qwen. A wrong hint is worse than no hint: the curriculum exists because the model confidently believes wrong facts.

**Inputs:** `docs/curriculum/rayquaza-guide-badges-1-3.md` first, then `docs/curriculum/rayquaza-guide-heat-to-master-ball.md` when it lands. Format: `docs/curriculum/guide-format.md`.

**For each row, verify:**
1. The milestone id exists in `packages/agent/src/milestones.ts`, and its trigger really happens before the note is useful.
2. The map name exists in the map data, and the row's order matches `docs/curriculum/keepingiticy-video/splits.csv`.
3. Each claim: places, directions, who to talk to, item and move names, type effects, and shop stock. Check against `runs/keepingiticy-video/pokeemerald`, `runs/keepingiticy-video/mapdb`, `runs/keepingiticy-video/paths/`, `docs/curriculum/keepingiticy-video/`, the private notes walkthrough at `(private notes)`, and the gold run in `runs/gold-run/` plus the scripts on branch `claude/gold-run`.
4. Player-specific wording: the player is May in keepingiticy's run; check house directions and rival names for the save the lane uses, `runs/launch-receipts/fast-text/MAIN_MENU.state` context, and recorded starts.
5. Length: at most 300 characters; a source is cited; no per-run values.

**Do not rewrite the guide.** Report only. Treat a claim as confirmed only with a citation to data, not from memory.

**Output:** `docs/curriculum/rayquaza-guide-fact-check.md`, one row per guide line: file, After, verdict (CONFIRMED, WRONG, UNCONFIRMED), evidence path and line or `run:turn`, and the corrected text for WRONG rows. End with counts per verdict.

**Rules:** own git worktree and branch from local `main`. Local only: no push, no pull request, no remote. Read-only on everything else. No test may do I/O. Use the landing board for the report; prose-only changes need `git diff --check` and an independent review. Keep CPU light and do not touch live runs, the GPU box or the viewer process. Never take desktop focus.

**Done when:** every row has a verdict. The front-half check comes first, because the first Qwen run waits on it.
