# Map-cycle recovery instead of a stop (map-cycle-recovery-v1)

Operator request: The operator, 2026-10-22 4:11 PM New York: "yes recovery over stopping the run". Single milestone; no review or landing in this thread (the coordinator runs review and landing).

## Problem Statement

Gym-loop run `2026-10-22T15-43-35_qwen36-gpu1_7c9f` (qwen36, gym-rustboro-torchic bundle arm) lost to ROXANNE at turn 22, whited out to PETALBURG CITY and then walked between PETALBURG CITY and its houses, Pokémon Center, mart and gym. stall-briefing-v1 saw two round trips PETALBURG CITY <-> PETALBURG CITY POKEMON CENTER 1F, so navigation-recovery-v1 opened a map-cycle episode (loop_guard warning #2840, turn 56, 3:56:16 PM New York). Every walkable exit of PETALBURG CITY led to a map already visited since the last story progress, so verified recovery needed two map changes; the model spent its 12 budgeted calls on PETALBURG CITY and the episode stopped the run (loop_guard stop #3415, turn 68, 3:59:18 PM; run_end reason stuck).

## Skills Loaded

feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue, pokebench-game-state (game wording), close-the-loop.

## Architecture

- `loop/navigation-recovery.ts`: with `mapCycleRecovery` on, a map-cycle episode that reaches `NAVIGATION_RECOVERY_CALLS` without verified recovery, for the first time since the last native story progress, closes with a recovery briefing instead of a stop: loop_guard kind map_cycle, phase supervisor, message = the exact briefing. The briefing is shown at the next model call until a call completes. It states the current map and position, every map visited since the last story progress with its visit count, and the walkable exits of this map not taken since the last story progress (map ids; names only for maps already visited). No destination, walkthrough or unseen place name.
- The cycle window resets: the coordinator's `mapCycleWindow()` generation advances, and stall-briefing-v1 (with the switch on) clears its map-pair counts, so a second cycle needs two fresh round trips. A second cycle opens the ordinary navigation-recovery-v1 episode, whose budget ends in today's stop. Native story progress re-arms the briefing.
- Switch `map-cycle-recovery-v1`, needs `navigation-recovery-v1`, default OFF. OFF: the episode stops at its budget exactly as before.

## Invariants

- INV-1 OFF parity: the recorded 7c9f window stops at the same call with the same stop notice.
- INV-2 One briefing per story-progress window; a second cycle stops as today.
- INV-3 Briefing text uses map names only for maps the run has been on; no destination is chosen; no input is sent.
- INV-4 Recorded event message is byte-identical to what the model receives; Activity History shows it; no timeline additions.

## Milestones

**M1 — Map-cycle recovery switch**
- [x] Tests (7c9f recorded window ON/OFF, direct unit tests, second-cycle stop, story-progress re-arm, stall-briefing window reset, pinned-pi delivery, registry/preset/experiment/bundle): `packages/agent/src/map-cycle-recovery.test.ts` (fixture `test-support/map-cycle-recovery-7c9f.json.gz`) and one pinned-pi test in `harness.test.ts`. RED run: 14 failing / 3 passing (the passing ones are OFF parity on the recorded window, the wording guard and the stall refusal, which hold before and after).
- [x] COMMIT RED
- [ ] Implement + registry/presets/defaults/wiring + registry-tail test updates
- [ ] Wiring deletion goes red, restored
- [ ] Explainer + FEATURE_EXPLAINERS + pending experiment + readiness row + bundle recipes
- [ ] Gates: just lint, just build, just coverage
- [ ] COMMIT GREEN

## Session Log

## Surprises
