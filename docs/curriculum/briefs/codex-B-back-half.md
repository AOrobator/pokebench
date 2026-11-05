# Brief B: Rayquaza guide, Heat Badge to the Champion

**Goal:** write the milestone-by-milestone guide for the Rayquaza lane from just after the Heat Badge through catching Rayquaza and beating the Elite Four and Champion, in keepingiticy's speedrun order. The lane is maximum assistance, and frontier models will be tested on it too. A short note at the right moment is how Qwen3.8-27B gets through the game. See `docs/curriculum/lesson-just-in-time-knowledge.md` for why.

**Start:** the row after `HEAT_BADGE`. **Stop:** at the Hall of Fame. Post-game and the Battle Frontier stay out.

**Format:** `docs/curriculum/guide-format.md`, exactly. Read `docs/curriculum/rayquaza-guide-badges-1-3.md` for tone and level of detail.

**Sources, in order of trust:**
1. ROM and pokeemerald map data: `runs/keepingiticy-video/pokeemerald`, `runs/keepingiticy-video/mapdb`.
2. keepingiticy: `docs/curriculum/keepingiticy-video/` (findings, splits, items, curriculum additions, master-ball.md with the tile-exact chain), and step paths `runs/keepingiticy-video/paths/segment_4.csv` onward. If `segment_N_rooms.md` tables are not on this machine, build the room order from the CSVs.
3. Private notes walkthrough: `(private notes)`, parts 02, 06 to 13.
4. Recorded traces under `runs/` for real mistakes on these stretches; `~/.claude/projects/-Users-user-dev-pokebench/memory/golden-run-before-guessing.md` and `fortree-gym-gates.md` describe the Fortree work.

**Must cover:** Slateport and Brawly detour by Briney's boat, Petalburg and Norman, Surf, Route 119 and the Weather Institute, Fortree and its rotating gates, Mt. Pyre, Lilycove, Magma Hideout, Aqua Hideout with the Master Ball detour, Mossdeep, Seafloor Cavern, Sky Pillar and the Master Ball catch of Rayquaza, Sootopolis, Victory Road, the Elite Four and the Champion. Include his shop lists, move teaches and battle plans where they decide a step, adjusted for no RNG. Claude is adding a milestone for acquiring the Master Ball, `MASTER_BALL_OBTAINED`; use that id. keepingiticy catches Rayquaza with one Poké Ball through RNG; our lane has no RNG, so give a sound catch plan with the Master Ball as the route. Include Wallace, Victory Road, the Elite Four, the Champion and the Hall of Fame. Keep every note model-agnostic: frontier models will use this lane too. You may split the guide into two files if that is cleaner.

**Output:** `docs/curriculum/rayquaza-guide-heat-to-champion.md` only. No harness or viewer code.

**Rules:** own git worktree and branch from local `main`. Local only: no push, no pull request, no remote. Cite every line. Mark `CHECK` on anything not confirmed. Never quote long passages from the walkthrough; paraphrase. No test may do I/O. Use the landing board (`just land-join`, `just land-done`); prose-only changes need `git diff --check`, link checks and an independent review. Do not touch live runs, the GPU box or the viewer process. Never take desktop focus.

**Done when:** every step of the route has a row, every row has a source, and the file ends with a "Needs" list and a count of `CHECK` lines.
