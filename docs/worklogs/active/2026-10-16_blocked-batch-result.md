# blocked-batch-result-v1: blocked direction batches say they were blocked

From forensics of control run `2026-10-15T23-47-41_qwen36-gpu0_2919` (`runs/reviews/2026-10-16-qualification-forensics/control-2919.md`, bug 5). A pure direction batch into a wall (LEFT×3 from (10,16), lab wall at (9,16)) got the press result `unchanged world position/facing (batch or non-direction input; intermediate effects unknown)` (seqs 2061–2840). The model repeated the same blocked LEFT×3 eleven times (T163–T183).

Branch `claude/blocked-batch-result` in `/private/tmp/pokebench-blocked-batch`. Unmerged; the operator decides landing. The switch is meant to join the bundle-v-control bundle arm later; this branch does not edit `experiments/` (no pending entry, per the dispatching instruction not to touch experiments).

## Confirmed against the recorded run

- Seq 2430/2431 (before and after states, turn 164): map 0/9 LITTLEROOT TOWN, (10,16) facing left, field controls free, overworld. `navigation_grid` tile (9,16) has collision 1 (the local map shows `#`). Seq 2432 tool_result: `pressed LEFT, LEFT, LEFT` / `Press result: unchanged world position/facing (batch or non-direction input; intermediate effects unknown)`.
- Source: `basePressResult` in `packages/agent/src/press-result.ts`, branch `buttons.length !== 1 || …`. Every press result path ends there (press tool, dialogue auto-advance, decision probe).

## M1: switch, RED, GREEN, gates

- [ ] Switch `blocked-batch-result-v1` (guidance, needs `press-result-v1`, default OFF) registered; presets, defaults, wiring through `toolSwitches`.
- [x] RED tests written (`packages/agent/src/blocked-batch-result.test.ts`, fixture `packages/agent/test-support/blocked-batch-2919.json` = the 12 recorded pure-direction batches that left the player on its tile, before/after states trimmed to the fields the press result reads): OFF reproduces today's text byte-for-byte; ON names direction, count, stayed tile and facing, and the blocker (collision tile, object, ledge, water, edge wall, elevation) only from the state's own grid/objects; unknown blocker says so; mixed/non-direction batches and single presses unchanged; factory-level wiring test. Registry counts, `toolSwitches`, explainer mapping and viewer default tests updated. 33 of 49 new tests fail (switch unknown).
  - RED COMMIT: `test: RED blocked-batch-result-v1 says a blocked direction batch was blocked, by what, from game state` (pending SHA)
- [ ] GREEN.
- [ ] Gates: just test, just lint, just build, just coverage (≥90 per metric), just verify-vendor.
- [ ] Wiring removed once and the factory test goes red; restored.

## M2: review and explainer

- [ ] Codex (gpt-5.6-sol) and Grok (cursor-grok-4.5-high) review.
- [ ] Explainer `docs/explainers/blocked-batch-result-v1.html`, README entry, `FEATURE_EXPLAINERS` mapping.
