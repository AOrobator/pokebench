# blocked-batch-result-v1: blocked direction batches say they were blocked

From forensics of control run `2026-10-15T23-47-41_qwen36-gpu0_2919` (`runs/reviews/2026-10-16-qualification-forensics/control-2919.md`, bug 5). A pure direction batch into a wall (LEFT×3 from (10,16), lab wall at (9,16)) got the press result `unchanged world position/facing (batch or non-direction input; intermediate effects unknown)` (seqs 2061–2840). The recorded run has nine LEFT batches from (10,16) (eight LEFT×3, one LEFT×2; turns 163–183, the first one turned down->left) and three DOWN×3 batches into the house row (turns 146–151), twelve in all.

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

## M2: review round 1 (diff main..4d211bd7)

- [x] Grok (cursor-grok-4.5-high): BLOCKING. Ledge, edge-wall and counter names leak when ledge-hops-v1 / one-way-tiles-v1 / counter-talk-v1 are off (the map draws them as # or .); numeric elevations are not in the readout; "no connection" uses topology, which the readout shows only with world-destinations-v1; non-~ water behaviors. Non-blocking: stale `Exclude` cast in play-preset; no experiment entry.
- [x] Codex (gpt-5.6-sol): BLOCKING. Objects and warps are not proven blockers (object elevation not read; a warp is not an obstacle); water is passable while surfing (check `running.avatar_flags`); no pending experiment entry; worklog miscounted the repeats.
- [x] Taken: objects and warps head "no movement" and only describe the tile; ledge/edge-wall/counter naming follows the same switches as the map glyphs; elevation never named (falls to "not known"); map edge only with topology shown; water only for the ~ behaviors 0x10–0x15 with ON_FOOT set and SURFING clear in `running.avatar_flags`. Worklog count fixed.
- [x] Not taken: experiment entry. The dispatching instruction for this branch said not to touch experiments; the switch is to join the bundle-v-control bundle arm by the operator. Flagged as required before merge.
- [x] RED for round 1 fixes: 11 failing tests. COMMIT: `test: RED blocked-batch-result-v1 names only what the model's map shows and never claims an object, warp, surf water or height blocked` (865f2158)
- [x] GREEN: `BlockedBatchFacts` gains `ledges`, `edgeWalls`, `counters`, `topology` (threaded by `toolSwitches` from ledge-hops-v1, one-way-tiles-v1, counter-talk-v1, world-destinations-v1); objects/warps head "no movement"; elevation branch removed; water = 0x10–0x15 with ON_FOOT set, SURFING clear. Feature copy and explainer updated; play-preset `Exclude` cast includes the id.
  - Gates: agent 82 files / 1317 tests, viewer 60 / 786, pytest 1960 passed 2 skipped; lint clean except the known mypy `mgba._pylib` worktree failure; build clean; coverage agent 97.63 / 94.27 / 97.89 / 99.04, viewer 95.08 / 90.39 / 93.55 / 97.6, Python lines 97.03 / branches 92.57 / functions 100; `blocked-batch.ts` 100 lines, 96.77 branches; verify-vendor OK.
- [x] GREEN COMMIT: `fix: blocked-batch-result-v1 follows the map switches for ledges, edge walls, counters and connections, and claims only terrain as a blocker` (6c909440)

## M2: review round 2 (delta 4d211bd7..6c909440)

- [x] Grok: BLOCKING. A `~` tile while surfing, biking or with unknown avatar flags fell through to "The readout shows nothing blocking", which contradicts the map. Round 1 fixes confirmed.
- [x] Codex: BLOCKING. With ledge-hops-v1 off, a ledge pressed in its own hop direction fell through to "collision tile … cannot move you", but the game hops it (`ShouldJumpLedge`).
- [x] Taken both. RED: 3 tests (ledge own direction with ledges on and off; water not verified on foot). COMMIT (5862bfbf).
- [x] GREEN: a ledge pressed in its own hop direction is "no movement" (named as a ledge with ledge hops on, "drawn as #" with it off); a ledge against its arrow with ledge hops off falls to the collision wording the # glyph shows; ~ water when not verified on foot says "is water (~ on the local map); what stopped you is not known". Explainer table updated.
  - Gates: agent 82 / 1318, viewer 60 / 786, pytest 1960 passed 2 skipped; lint clean except the known mypy `mgba._pylib`; build clean; coverage agent 97.63 / 94.28 / 97.89 / 99.04, viewer 95.08 / 90.39 / 93.55 / 97.6, Python 97.03 / 92.57 / 100; `blocked-batch.ts` 100 lines, 96.85 branches.
  - GREEN COMMIT: `fix: blocked-batch-result-v1 leaves a hoppable ledge and water it cannot verify as cause not known` (c7ea41c1)

## M2: review round 3 (delta 6c909440..c7ea41c1)

- [x] Codex (gpt-5.6-sol): LGTM. Grok (cursor-grok-4.5-high): LGTM. Codex could not run vitest in its read-only sandbox; tests were run here.
- [x] Explainer checked in a browser (served from the worktree on 127.0.0.1, light theme, figures and table render). Harness Config live click not verified: no viewer was started or restarted from this branch.
- [ ] Before merge (operator): pending `experiments/blocked-batch-result.json` entry and readiness line, or adding the switch to the bundle-v-control bundle arm; `just viewer-main` after merge.

- 2026-10-16 01:25 AM EDT (integrator): registered `experiments/blocked-batch-result.json` as pending (finals incumbent, activation PLAYER_NAME_CONFIRMED, provisional source = branch head) and the readiness line; `just experiments-check` ok (46 experiments).
