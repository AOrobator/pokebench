# Map-wide triggers

> Markdown twin of [map-wide-triggers-v1.html](../map-wide-triggers-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`map-wide-triggers-v1` · observation, applied by the game server · needs `coordinate-script-conditions-v1` · default OFF · bundle arm only

The game server used to put coordinate-script trigger tiles in the state only when they were within 7 tiles of the player. With this switch on, the state the planner reads lists every coordinate trigger on the current map. The readout text the model reads still lists only the nearby ones, so it does not change.

## What went wrong in Littleroot

`navigate_to_target` NORTH in LITTLEROOT TOWN stopped at (10,10) with "corridor changed or unsafe", and the model then went east and west: `2026-10-21T01-16-23_glm53-mac_e9ee` seq 1985→2017 and 6979→7012, `…_acfa` seq 2981→3014. The RAM re-parse found the cause: a coordinate trigger on row 9 was 8 rows from the player, one row outside the 7-tile list.

![Before and after on LITTLEROOT TOWN (map 0/9), column x=10, from (10,17) north. The two stride ends are what map-wide-triggers.test.ts asserts for planStride: (10,9) with no trigger listed, (10,10) with (10,9) listed. A stride is at most 8 tiles (STRIDE_MAX_TILES).](map-wide-triggers-v1/fig-1.svg)

*Before and after on LITTLEROOT TOWN (map 0/9), column x=10, from (10,17) north. The two stride ends are what `map-wide-triggers.test.ts` asserts for `planStride`: (10,9) with no trigger listed, (10,10) with (10,9) listed. A stride is at most 8 tiles (`STRIDE_MAX_TILES`).*

The same window also made the trigger-avoiding route flip east and west as the player moved and the listed set changed (e9ee seq 7063→7116). With every trigger listed, the set the planner avoids no longer changes with the player's position.

## State changes; readout text does not

| Player at (10,17) | OFF | ON |
|---|---|---|
| `world_context.triggers` in the state JSON (what planStride, the trigger-avoiding planner and other TypeScript readers see) | Triggers within 7 tiles only; no (10,9) | Every coordinate trigger on the map, (10,9) included, with variable, required value, current value and condition |
| Readout text "Nearby script-trigger tiles (a clear terrain tile can still run a script):" | Triggers within 7 tiles | The same: the text filters to 7 tiles of the player's tile (`trigger_origin`, kept out of the JSON) |

The Python tests check this directly: with a trigger 16 rows away, ON lists it in the state and `wide.text() == near.text()`; with a trigger 1 row away, ON and OFF give the same text and the same JSON. Triggers with a bad script pointer stay out either way.

## Where the switch is read

![Wiring. The highlighted box is the one place behavior changes. No TypeScript planner code changed: planStride already treats every listed trigger as unsafe.](map-wide-triggers-v1/fig-2.svg)

*Wiring. The highlighted box is the one place behavior changes. No TypeScript planner code changed: `planStride` already treats every listed trigger as unsafe.*

Other TypeScript readers of `world_context.triggers` also get the far triggers when the switch is on. The blocked-exit fact has its own nearness check.

## Status

- Commit cb757550 (M6 GREEN). Not yet merged into main.
- Default OFF. Not in any bundle yet; that waits for Operator's OK.
- Tests: `env/tests/env/test_map_wide_triggers.py`, `packages/agent/src/map-wide-triggers.test.ts`. Review round 1: Claude, Grok and GPT lanes LGTM.
- Not yet measured in runs. The related ad34 seq 12351 case (navigate_to routing around the running-shoes trigger) was found to be by design and is not changed.
