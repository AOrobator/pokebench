# Visibility V2 and the dark-area FLASH reminder off in both arms

## Decision

The operator, 2026-11-02: "i want to turn off viz 2 and the flash reminder". `player-map-visibility-v2` and `dark-area-flash-reminder-v1` move from `onInBoth` to `offInBoth`, shared base false, in `experiments/feature-configs/current.json` and `experiments/presets/current-control-24h-8k.json`. No implementation change: both switches keep their code and their registered default OFF.

This reverses the 2026-11-01 "play Emerald fairly" promotion. The alternative remedy — coach the agent to teach HM05 and use FLASH — was landed the same day as `dark-area-flash-reminder-v1`; it stays off from here.

## What both arms read now

With V2 off, observations are the unrestricted baseline, byte for byte: the whole current map's terrain, static elements and gates, warps with their destination labels, loaded people and objects (not only those on screen), coordinate triggers, hidden berry trees and planted berries, overlap cover, exit labels and sections, the connection edges, respawn centres, and the real place name and terrain section (the masked path prints the bare map id instead). No darkness paragraph is appended by the reminder, and `map_visibility` is absent, so the readout labels revert from "Discovered warps"/"Live objects currently visible" to the unrestricted wording.

The game still renders dark: frames stay black in a dark map, only the map text is complete. That mismatch is the accepted cost of the change, not a bug.

## Receipt (replayed recorded snapshot)

Snapshot `raw-ram/00014980.json.gz` from `2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8` (frame 426162, DEWFORD TOWN GYM, layout 65, `flash_level 7`, player at X=5, Y=26), replayed through `read_state`/`render` with the run's own feature set, twice: once with V2 on, once with `player-map-visibility-v2` added to the off set.

| | V2 on | V2 off |
|---|---|---|
| `map_visibility` | visible 5 / known 5 | absent |
| blank (`ffff`) cells | 499 / 504 | 0 / 504 |
| `?` in the rendered text | 500 | 0 |
| objects / warps in the state | 0 / 1 | 2 / 2 |

Same frame, same code, same off set apart from the one switch: the agent goes from a five-tile disc to the whole 18x28 gym.

## Evidence

- `2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8`: 431 turns, 174 state events at `flash_level 7`, 167 of them in `DEWFORD TOWN GYM` (18x28 map; the sampled state carried 504 cells with 4 visible).
- `2026-11-01T09-10-00_deepseek-v4.1-flash_control24h`: 2,564 dark-map state events among 30,650, spanning turns 460-1325; 1,289 at `GRANITE CAVE B1F` (24,8) at level 7, 480 at B2F, 427 in Dewford Gym at level 5.
- `player_map_visibility.illumination()` gives a 24 px radius at level 7, i.e. a 5-tile disc on a 504-tile map, and `navigate_to` plans over the same masked grid (`map_grid`), so darkness costs route knowledge as well as sight.

## Epoch

Runs launched from this pin are not comparable with the 2026-11-01/02 control runs on either map disclosure or the FLASH paragraph. Split analysis by harness version; do not pool.

## Definitions that follow `featureRecipe: current`

`bundle-v-control`, `bundle-v-control-2h`, `glm53-flash-4h`, `hyperqwen-control-3h` and `glm53-24h-visibility-v2` resolve the maintained recipe, so their next launch carries both switches off; the pins in `player-map-visibility-both-arms.test.ts`, `dark-area-flash-both.test.ts` and the `fixed-runner.test.ts` GLM rehearsal were updated with the recipe rather than left asserting the old arms. Materialized definitions (`whole-map-pair-1h-v8` and the frozen `control-bases`) keep their recorded settings and still carry V2 on.

## Gates

- `pnpm -r build` — pass (agent + viewer).
- Pinned suites — pass: viewer `feature-config-registry`, `dark-area-flash-both`, `player-map-visibility-both-arms`, `fixed-definition` (30), viewer `fixed-runner` + `fixed-cli` (122), agent `control-preset-8k` + `dark-area-flash` + `player-map-visibility-v2` (25).
- `just lint` — **red on main before this branch**: `src/cut-off-reply.test.ts:75` (TS2322) and `src/semantic-refusal-reasons.test.ts:75` (TS18048) fail `tsc --noEmit`, and `src/control-preset-8k.test.ts:7` trips `@typescript-eslint/no-unnecessary-type-parameters`; all three reproduce in the main worktree at `74f24dd55` and none of those files is touched here. ESLint on the files this branch does touch is clean.
- `just test` — **pass** on the fourth run, host idle, nothing else of mine running: agent `381 passed (381)` with 96.39% statements / 92.37% branch / 97.43% functions / 99.02% lines, viewer `186 passed (186)` with 94.57 / 90.79 / 94.83 / 98.22, python `TOTAL 96%`, gateway `98%`, `3 passed` trainer-card design tests, exit 0.
- Earlier attempts were load flakes, recorded so nobody re-diagnoses them: three runs of the identical tree produced 13, then 8, then 1 failures, every one of them `Test timed out in 5000ms` under coverage (the 1-failure run: `whole-game-instructions` "cap ON, whole-game false, dedup true" at 5150 ms against a 5000 ms limit; it passes in ~1.4 s alone). The failing set moves between runs with no code change, so it is host load, not this diff: the four files that failed under coverage (`battle-text-auto-advance`, `people-id-cards-delivery`, `same-plan`, `whole-game-instructions`) pass 4/4 under coverage on this branch and on main when the host is idle. Quietest full run: `Test Files 1 failed | 380 passed`, `Tests 1 failed | 5391 passed`.

## Landing

Branch `claude/viz-off-both-arms` from `74f24dd55`, ff-only onto main after the green `just test` above.
