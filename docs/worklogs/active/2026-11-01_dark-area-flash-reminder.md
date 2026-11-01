# Dark-area FLASH reminder

**Started:** 2026-11-01
**Status:** In progress (committed on branch; not reviewed, not landed)
**Branch:** `claude/dark-area-flash-reminder`

The operator 2026-11-01 (DeepSeek control run `2026-11-01T09-10-00_deepseek-v4.1-flash_control24h` never used FLASH in GRANITE CAVE): remind the player on entering a dark area what the badge, HM05 and party say about FLASH; then "when it doesn't have a badge it should say so, if it doesn't have a pokemon that can learn flash it should say so" and "it should be on in both arms". Switch `dark-area-flash-reminder-v1`, registry default OFF, `onInBoth` in `current.json`. No measured benefit claim. No runs launched or touched.

## Skills Loaded
- feature-switch, pokebench-game-state (pret 731ad5b: requires_flash maps, tmhm_learnsets FLASH, gText_CantUseUntilNewBadge, KNUCKLE BADGE text)

## Milestones

**M1 — Switch, reminder, tests**
- [x] `packages/agent/src/dark-area-flash.ts`; registry, presets, next-run default, event `dark_area_flash_reminder` (schema regenerated), recorder, tail, viewer Activity History; wired in `playGameTools`
- [x] Fixture: five recorded results from the DeepSeek run (Granite Cave 1F/B1F with badge)
- [x] Wiring test red with the hookup removed, green restored
- COMMIT: `feat(agent): dark-area-flash-reminder-v1 names FLASH on entering a dark map` (9536cadb1)

**M2 — Speak without badge / learner; on in both arms**
- [x] No KNUCKLE BADGE: says so with the game's refusal, then the FLASH facts; badge but nobody can learn FLASH, or no HM05 and no user: says so. Silent only on lit or non-requires_flash maps. Event gains `badge`, kind `none`. Fixture gains the real pre-badge B1F result (turn 613)
- [x] `current.json` onInBoth + base true; README note; viewer recipe test `dark-area-flash-both` (4 current recipes, both arms, every phase)
- [x] Tests: `dark-area-flash.test.ts` 21/21 (module 100% lines/functions, 98% branches); focused agent files 19/384 GREEN; viewer 9 files 645 GREEN (panels needs `--max-old-space-size=8192` in a fresh worktree); tsc and eslint clean on changed files
- COMMIT: `feat(agent): dark-area FLASH reminder speaks without the badge or a learner; on in both arms` (1d404cf17)

**M3 — Explainer page and card link**
- [x] `docs/explainers/dark-area-flash-reminder-v1.html` (Emerald theme, `pages-check` silent, no network requests); README index line; `FEATURE_EXPLAINERS` link in `panels.ts`; card-link test in `panels.test.ts`, byte-for-byte serve test in `server.test.ts` (412 GREEN across those two files)
- [x] Verified render: no horizontal overflow at 1280/1440 (`scrollWidth == clientWidth`); phone geometry measured at a true 375 px viewport with CDP emulation (earlier 375 shots were a 500 px headless minimum, not page overflow). Figures keep their 700 px width and scroll inside `.diagram` below 760 px, so labels stay readable on a phone instead of shrinking to a sliver
- [x] Independent grounding: `env/tests/env/fixtures/field-moves-audit.json` confirms 24/8 and 24/9 require FLASH; `docs/findings/whole-game-story-checkpoints.md` places 24/42 CaveOfOrigin_B1F and 24/43 VictoryRoad_1F, consistent with 24/39-41 and 24/44-45; recorded party moves confirm the Gen-3 id space behind FLASH 148 and HM05 343; run log confirms HM05 from turn 444 and the KNUCKLE BADGE at turn 882
- [x] `scripts/pages.sh` needs a 3.11+ `python3`: `/usr/bin/python3` is 3.9 and fails on `X | None`. Run it with the repo env's interpreter on PATH
- COMMIT: `docs(explainers): dark-area FLASH reminder page and Harness Config link`

## Open
- Landing: operator waived multi-model review 2026-11-01 ("land it reviews are waived"). No reviewer verdict exists for this change; record that plainly in the landing note
- Fixed definitions built from `featureRecipe: current` change identity (base features change); launches from a newer pin pick it up, running runs keep their recorded settings

**M4 — Post-landing red in shared-recipe index pins**
- main `91b6f9957` already failed `just test` before this branch merged: `current.json`'s `switches` list lost two entries ahead of these groups when compact-map-grid-v1 and player-map-visibility-v2 became onInBoth, and four bundle tests still pinned the old positions. Proof: the `switches` array is byte-identical between `91b6f9957` and `8c2fa0614` (turn-drought-clock-v1 at 36 both ways) while the tests asserted 38; the archived recipe `current-d5b1522eb28d` puts the same features at 38/48
- [x] Renumbered only the live `featureRecipe: current` recipes (bundle-v-control, bundle-v-control-2h, glm53-flash-4h): 37→35, 38→36, 39→37, 48→46. Overlap/order guards unchanged; cook, whole-map-pair and gym-rustboro recipes carry inline switch lists and keep their positions
- [x] Four failing files plus `dark-area-flash-both.test.ts` GREEN (16/16 in 761 ms) before the full gate rerun
- [x] Hardened the one load-sensitive agent test the gate then caught: `instruction-memory-junk.test.ts` shells `build-instruction-memory-junk.py --check` (0.50 s alone) with a 15 s cap, which the full parallel suite plus the live emulator trial can starve. Raised to 60 s with a why-comment; passes standalone in 1.05 s and in a clean full-package rerun
- COMMIT: `test(viewer): renumber shared-recipe switch pins after the onInBoth promotions`
- COMMIT: `test(agent): give the pret regeneration sweep a load-tolerant timeout`
