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
- [ ] COMMIT

## Open
- Explainer page and FEATURE_EXPLAINERS link (feature-explainer skill)
- Multi-model review (Claude, Grok, GPT lanes) before any landing
- Fixed definitions built from `featureRecipe: current` change identity (base features change); launches from a newer pin pick it up, running runs keep their recorded settings
