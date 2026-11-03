# Script-trigger boundary, unswitchable

Operator directive (2026-11-02): the `navigate_to` refusal at run `2026-10-24T08-12-35_qwen36-gpu1_0517` turn 73 —
"every route navigate_to sees to (1,8) crosses a script-trigger tile" — is a correctness bug. Fix it and test it;
do not make it switchable. "A feature flag over a wrong route is how a benchmark ends up scoring its own defect."
This deliberately overrides the `feature-switch` veto for this change; recorded here as an operator waiver.

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

- [ ] RED: rewrite the six refusal assertions as boundary walks (agent `trigger-navigation`, `navigation-truth`,
      `first-script-trigger`), add the 0517 regression and a "no feature set restores the refusal" test.
- [ ] GREEN: unconditional boundary in `navigation.ts` (fallback plan, single-step press, step stop) and
      `semantic-navigation.ts` (approach choice, fallback); delete `triggerReason`.
- [ ] Registry removal: drop `trigger-navigation-boundary-v1` from `SWITCHABLE_FEATURES`, `FEATURES`,
      `playHarnessFeatures`, `play-preset`, viewer `next-run`/explainer map, the fixed definitions,
      `current.json` and the presets; shift the index pins after slot 202 down one.
- [ ] Gates: focused vitest, full agent + viewer suites, `tsc`, eslint, build. No Python change, no run launched.

## Session log
- Reproduced turn 73 from the checked-in `rival-trigger-1fe0.json.gz` fixture (identical map/position/triggers to
  `events.jsonl:1318`): switch off → 0 presses + the refusal, switch on → 1 DOWN to (2,4) + boundary status.
- RED: six refusal assertions rewritten as boundary walks across `trigger-navigation`, `navigation-truth` and
  `first-script-trigger`; 15 tests fail on the current tree (no script-free route ⇒ refusal, 0 presses).
