# Brief B: Rayquaza guide, Heat Badge to the Master Ball

**Goal:** write the milestone-by-milestone guide for the Rayquaza lane from just after the Heat Badge to the Master Ball, in keepingiticy's speedrun order. A short note at the right moment is how Qwen3.8-27B gets through the game. See `docs/curriculum/lesson-just-in-time-knowledge.md` for why.

**Start:** the row after `HEAT_BADGE`. **Stop:** at the Aqua Hideout B1F Master Ball item room. Do not go further; Rayquaza and the later badges are the next stretch.

**Format:** `docs/curriculum/guide-format.md`, exactly. Read `docs/curriculum/rayquaza-guide-badges-1-3.md` for tone and level of detail.

**Sources, in order of trust:**
1. ROM and pokeemerald map data: `runs/keepingiticy-video/pokeemerald`, `runs/keepingiticy-video/mapdb`.
2. keepingiticy: `docs/curriculum/keepingiticy-video/` (findings, splits, items, curriculum additions, master-ball.md with the tile-exact chain), and step paths `runs/keepingiticy-video/paths/segment_4.csv` onward. If `segment_N_rooms.md` tables are not on this machine, build the room order from the CSVs.
3. Private notes walkthrough: `(private notes)`, parts 02, 06, 07, 08, 09.
4. Recorded traces under `runs/` for real mistakes on these stretches; `~/.claude/projects/-Users-user-dev-pokebench/memory/golden-run-before-guessing.md` and `fortree-gym-gates.md` describe the Fortree work.

**Must cover:** Slateport and Brawly detour by Briney's boat, Petalburg and Norman, Surf, Route 119 and the Weather Institute, Fortree and its rotating gates, Mt. Pyre, Lilycove, Magma Hideout, Aqua Hideout with the Master Ball detour. Include his shop lists, move teaches and battle plans where they decide a step, adjusted for no RNG. Note in "Needs" that no Master Ball milestone exists: use `BAG:MASTER BALL`.

**Output:** `docs/curriculum/rayquaza-guide-heat-to-master-ball.md` only. No harness or viewer code.

**Rules:** own git worktree and branch from local `main`. Local only: no push, no pull request, no remote. Cite every line. Mark `CHECK` on anything not confirmed. Never quote long passages from the walkthrough; paraphrase. No test may do I/O. Use the landing board (`just land-join`, `just land-done`); prose-only changes need `git diff --check`, link checks and an independent review. Do not touch live runs, the GPU box or the viewer process. Never take desktop focus.

**Done when:** every step of the route has a row, every row has a source, and the file ends with a "Needs" list and a count of `CHECK` lines.
