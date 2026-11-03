# Script-trigger boundary, unswitchable

Operator directive (2026-11-02): the `navigate_to` refusal at run `2026-10-24T08-12-35_qwen36-gpu1_0517` turn 73 —
"every route navigate_to sees to (1,8) crosses a script-trigger tile" — is a correctness bug. Fix it and test it;
do not make it switchable. "A feature flag over a wrong route is how a benchmark ends up scoring its own defect."
This deliberately overrides the `feature-switch` veto for this change; recorded here as an operator waiver.
Operator then chose the full id removal over leaving a dead registry key ("finish the removal").

## Reproduction (recorded, not hypothetical)

Turn 73 state = `runs/2026-10-24T08-12-35_qwen36-gpu1_0517/events.jsonl:1318`, already checked in as
`packages/agent/src/fixtures/rival-trigger-1fe0.json.gz` (same map 1/2, player (2,3), warp goal (1,8),
matching triggers at (1,3), (2,4), (3,3), the (2,8) trigger not matching).

| arm | presses | resulting position | status |
| --- | --- | --- | --- |
| `trigger-navigation-boundary-v1` off | 0 | (2,3) | the refusal above |
| on | 1 (DOWN) | (2,4) | `script-trigger step attempted at (2,4); inspect the resulting state` |

Three of the player's four neighbours are matching script tiles, so no script-free route exists and the
guarded planner returns null. Off ⇒ refuse and never move: the tile is a dead end the model cannot leave,
and the tool tells it to target (2,4) instead of the warp it asked for.

## Decision

The boundary is the only correct semantics: prefer a script-free route; when none exists the first matching
script tile is a walkable observation boundary — step into it once, without automatic running, and return the
resulting state. The behaviour becomes unconditional: the switch id, the port, the OFF path and the refusal
text are deleted, so no preset, recipe or viewer toggle can restore the refusal.

Trigger visibility keeps its existing gate (`navigation-truth-v1` && `coordinate-script-conditions-v1`), so
the coordinate-script switch keeps a meaningful OFF arm (plan straight through scripts, as before that switch
landed) and every shipped recipe's prompt, description and readout bytes are unchanged: all of them enable
both switches, and the boundary sentence they already received is now unconditional within the same predicate.

## Milestones

- [x] RED: rewrite the six refusal assertions as boundary walks (agent `trigger-navigation`, `navigation-truth`,
      `first-script-trigger`), add the 0517 regression and a "no feature set restores the refusal" test.
- [x] GREEN: unconditional boundary in `navigation.ts` (fallback plan, single-step press, step stop) and
      `semantic-navigation.ts` (approach choice, fallback); delete `triggerReason`.
- [x] Registry removal: drop `trigger-navigation-boundary-v1` from `SWITCHABLE_FEATURES`, `FEATURES`,
      `playHarnessFeatures`, `play-preset`, viewer `next-run`/explainer map, the fixed definitions,
      `current.json` and the presets; shift the index pins after slot **203** down one.
- [x] Gates: focused vitest, full agent + viewer suites, `tsc`, eslint, build. No Python change, no run launched.

## Session log

- Reproduced turn 73 from the checked-in `rival-trigger-1fe0.json.gz` fixture (identical map/position/triggers to
  `events.jsonl:1318`): switch off → 0 presses + the refusal, switch on → 1 DOWN to (2,4) + boundary status.
- RED `bc342fd26`: six refusal assertions rewritten as boundary walks across `trigger-navigation`,
  `navigation-truth` and `first-script-trigger`; 15 tests fail on that tree (no script-free route ⇒ refusal, 0 presses).
- GREEN: `navigation.ts` drops the `triggerBoundary` port/mapping and the refusal branch, computes
  `matchingTriggers` as the boundary directly; `semantic-navigation.ts` gates the approach/before-state options on
  `navigation-truth-v1 && coordinate-script-conditions-v1` instead of the retired id. Focused suites 73/73.
- Registry math: the list held 328 switches and the boundary sat at **index 203** (an earlier note said 202 — that
  was a filtered-regex miscount). Every id after it moves down one, so literal index pins, `.at(N)`/`slice(a,b)`
  bounds, `FEATURES.filter(switchable)` windows and `playHarnessFeatures` hand-written lists all shift by exactly
  one; tail-relative `.at(-K)` bounds shrink by one. 44 pins across 40 files were recomputed, then each mutant was
  re-derived from the list itself rather than from arithmetic (`__offsets`/`__h` probes, deleted afterwards).
- Retired-id fallout, fixed at the loader instead of rewriting evidence:
  `test-support/recorded-features.ts` projects a recorded `run_start` feature map onto the current registry, so
  `a702-dewford` and the two suites that replay it keep their recordings byte-identical; the three archived fixed
  definitions (`whole-map-cook-1h`, `whole-map-pair-2h`, `bundle-cook-1h`) had the dead key removed because
  `readFixedDefinition` validates ids.
- The explainer (`docs/explainers/trigger-navigation-boundary-v1.html`) is rewritten to the unconditional policy and
  stays served: `panels.ts` gains `STANDING_EXPLAINERS` for behaviour that no longer has an arm, and the viewer
  serves an allow-listed file from either list (`server.test.ts` byte-for-byte test restored to green).
- Gates at GREEN (`bc342fd26` + working tree): agent vitest **5390/5390 in 381 files**, viewer vitest **2397 passed,
  21 skipped, 183 files**, `pnpm -r build` Done (viewer stamp records the tree as dirty pre-commit). `tsc` reports
  only the two errors that already fail on `main` (`cut-off-reply.test.ts:75`, `semantic-refusal-reasons.test.ts:75`;
  viewer `trace.test.ts:41` likewise); eslint has no error that `main` does not already have.
