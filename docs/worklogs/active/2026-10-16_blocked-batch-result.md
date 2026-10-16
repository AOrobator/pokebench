# blocked-batch-result-v1: blocked direction batches say they were blocked

From forensics of control run `2026-10-15T23-47-41_qwen36-gpu0_2919` (`runs/reviews/2026-10-16-qualification-forensics/control-2919.md`, bug 5). A pure direction batch into a wall (LEFT×3 from (10,16), lab wall at (9,16)) got the press result `unchanged world position/facing (batch or non-direction input; intermediate effects unknown)` (seqs 2061–2840). The model repeated the same blocked LEFT×3 eleven times (T163–T183).

Branch `claude/blocked-batch-result` in `/private/tmp/pokebench-blocked-batch`. Unmerged; the operator decides landing. The switch is meant to join the bundle-v-control bundle arm later; this branch does not edit `experiments/` (no pending entry, per the dispatching instruction not to touch experiments).

## Confirmed against the recorded run

- Seq 2430/2431 (before and after states, turn 164): map 0/9 LITTLEROOT TOWN, (10,16) facing left, field controls free, overworld. `navigation_grid` tile (9,16) has collision 1 (the local map shows `#`). Seq 2432 tool_result: `pressed LEFT, LEFT, LEFT` / `Press result: unchanged world position/facing (batch or non-direction input; intermediate effects unknown)`.
- Source: `basePressResult` in `packages/agent/src/press-result.ts`, branch `buttons.length !== 1 || …`. Every press result path ends there (press tool, dialogue auto-advance, decision probe).

## M1: switch, RED, GREEN, gates

- [x] Switch `blocked-batch-result-v1` (guidance, needs `press-result-v1`, default OFF) appended to `SWITCHABLE_FEATURES`, `FEATURES` and `playHarnessFeatures`; optional in `FeatureSetSchema`, `normalizeFeatures` and `flagFeatures` default false; `DEFAULT_NEXT_RUN` false; `toolSwitches` adds `blockedBatch` and `liveMap` (the press tool, dialogue auto-advance and the decision probe all build switches there). Not a server feature.
- [x] RED tests written (`packages/agent/src/blocked-batch-result.test.ts`, fixture `packages/agent/test-support/blocked-batch-2919.json` = the 12 recorded pure-direction batches that left the player on its tile, before/after states trimmed to the fields the press result reads): OFF reproduces today's text byte-for-byte; ON names direction, count, stayed tile and facing, and the blocker (collision tile, object, ledge, water, edge wall, elevation) only from the state's own grid/objects; unknown blocker says so; mixed/non-direction batches and single presses unchanged; factory-level wiring test. Registry counts, `toolSwitches`, explainer mapping and viewer default tests updated. 33 of 49 new tests fail (switch unknown).
  - RED COMMIT: `test: RED blocked-batch-result-v1 says a blocked direction batch was blocked, by what, from game state` (9799a362)
- [x] GREEN: `packages/agent/src/blocked-batch.ts` (`blockedBatchResult`), called from `basePressResult` at the batch branch and at the turned branch (turned only when field-lock facts are shown). Game tile tables (ledges, edge walls, water, counter, opposite, `GAME_RULE`) moved unchanged from `navigation.ts` to `tile-rules.ts`; navigation tests unchanged and green. Explainer `docs/explainers/blocked-batch-result-v1.html`, README entry, `FEATURE_EXPLAINERS` mapping.
  - Test fix during GREEN: the RED registry test asserted `FEATURES.at(-1)`, which is the last measured feature; it now asserts the last switchable feature. Other suites gained the new id in their explicit OFF lists (features, play-preset, experiment-gate, state-runtime) and the switchboard row count (controls.test 52 -> 53).
- [x] Gates: `just test` agent 82 files / 1315 tests, viewer 60 / 786, pytest 1960 passed 2 skipped. `just lint`: tsc + eslint clean both packages, ruff clean; mypy fails only on `mgba._pylib` (native binding not built in this worktree venv), as expected. `just build` clean. `just coverage`: agent 97.63 stmts / 94.26 branches / 97.89 functions / 99.04 lines; viewer 95.08 / 90.39 / 93.55 / 97.6; Python lines 97.03 / branches 92.57 / functions 100 (floor 90). `blocked-batch.ts` 100 lines, 96.39 branches. `just verify-vendor` OK.
- [x] Wiring removed once (`blockedBatch` dropped from `toolSwitches`): 7 tests red, including both factory press-tool tests' ON arm and the 2919 replays; restored, 49/49 green.

## M2: review and explainer

- [ ] Codex (gpt-5.6-sol) and Grok (cursor-grok-4.5-high) review.
- [ ] Explainer `docs/explainers/blocked-batch-result-v1.html`, README entry, `FEATURE_EXPLAINERS` mapping.
