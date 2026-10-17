# Worklog: no-exit-here-v1

Branch `claude/no-exit-here`, worktree `/private/tmp/pokebench-no-exit-here`, base `main` 3d9581c6.

## Problem Statement

The model invents exits that do not exist and keeps walking into a map edge that leads nowhere:

- 2026-10-17T13-15-36_qwen36-gpu1_e046 s18744: "Oldale's east exit to Petalburg" after navigate_to (19,10), Oldale's east edge (result s18731). OLDALE TOWN has NORTH, SOUTH and WEST connections only.
- e046 s17437: "Route 103's north exit to Rustboro", then navigate_to (10,0) three times (results s17480, s17528, s17541, s17549). ROUTE103 has SOUTH and EAST connections only.
- 2026-10-16T17-47-29_qwen36-gpu0_deb4 s11619: "SOUTH -> ROUTE116" and "EAST -> ROUTE119" for LITTLEROOT TOWN, then navigate_to (10,19) (result s11662). LITTLEROOT TOWN has a NORTH connection only.
- 2026-10-16T21-49-19_qwen36-gpu0_9439 T628 "SOUTH -> ROUTE116"; before it, press DOWN on (10,19) (s14790, "blocked or unavailable") and later press DOWN on (7,19) (s16266, "turned left -> down; no net movement").

Today a press into such an edge only reports no movement and the model keeps trying.

Operator decision (the operator, 2026-10-17 4:49 PM New York): switch `no-exit-here-v1`, bundle arm only, default OFF.

## Game grounding

pret/pokeemerald 731ad5bf (corrected in review round 2). The game keeps the map in a padded layout (width + MAP_OFFSET_W); `InitMapLayoutData` (src/fieldmap.c) fills it with `MAPGRID_UNDEFINED` and only map connections overwrite the padding. A step off the map where nothing is connected lands on an undefined cell: `MapGridGetCollisionAt` returns 1, `GetCollisionAtCoords` (src/event_object_movement.c) gives `COLLISION_IMPASSABLE`, and `PlayerNotOnBikeCollide` (src/field_player_avatar.c) plays the bump sound and walks in place. No script or text runs: the game shows nothing. So the harness line states only the fact (skill rule 2): there is no way off this map on that side, and the ways off it the readout already lists.

## Design

`packages/agent/src/no-exit-here.ts`, wrapping press and navigate_to right outside `withNavigation` (so navigate_to's own presses are not wrapped twice):

- Press: the press's last direction button points off the map from the tile the result's own state stands on (x=0 and LEFT, x=width-1 and RIGHT, y=0 and UP, y=height-1 and DOWN, width and height from `topology`), the player faces that way, and `topology.connections` has no connection in that direction.
- navigate_to: the goal's map is the result's map, and the goal is on or past the map edge (x<=0, x>=width-1, y<=0, y>=height-1) on a side with no connection. A corner names each side that has none.
- A side with a connection, reachable or not, is never this switch's line (exit-reachability-v1 and connection edge tiles own those).
- Line: `There is no way off <MAP NAME> to the <side>; the ways off this map are: <list>`. The map name is the readout's own Location line. The list: map connections (`NORTH edge -> ROUTE103 (map 0/18)`) and warps grouped into doorways like untaken-exits (`(15,16) -> OLDALE TOWN HOUSE2 (map 2/1)`, names from the readout's own lines via `readoutNames`), each one exitReach (surf-gated-exits-v1, exit-reachability-v1) leaves out marked `(crosses water you cannot cross yet)` or `(cannot be reached on foot from where you stand)`.
- Press: the line goes right after the `Press result:` line (after `pressed ...` when press-result is off). navigate_to: its own text part right after the `Navigation:` part.
- Needs world-destinations-v1 (the readout's map connections; without them there is no list to give).

## Invariants

- INV-1: OFF returns the same tool objects; results byte-identical.
- INV-2: the line names only maps the readout itself names (Location line, connections' destination names, warp names from the readout); no place the game has not shown.
- INV-3: no line for a side with a connection, a map change, a goal on another map, or a press whose last direction does not point off the map.
- INV-4: no new timeline marks, no new events (nothing recorded beyond the tool result itself).

## Milestones

**M1 — no-exit-here-v1 (single milestone; STOP before the review loop)**

- [x] RED: `no-exit-here.test.ts` from recorded states (fixture `no-exit-here-states.json.gz`: e046 s17409/17421/17480/17549/18731, deb4 s11596/11662, 9439 s14790/14845/16266, streamed by seq) plus playGameTools wiring, registry, presets; viewer DEFAULT_NEXT_RUN, Harness Config card link and served explainer.
  - 5:00 PM New York: agent suite fails at load (no `no-exit-here.js`); viewer 3 failed / 166 passed.
  - COMMIT: `test(no-exit-here): RED line on map edges with no connection, from e046, deb4 and 9439 recordings` (c2302476)
- [x] GREEN: `no-exit-here.ts` (pressSides, goalSides, noExitLine, withNoExitHere), registry (appended after cited-destination-v1; `needs: world-destinations-v1`), presets/flagFeatures/DEFAULT_NEXT_RUN default OFF, `playGameTools` wiring right outside `withNavigation`.
  - Registry-position tests shifted by one (`.at(-N)`, slices), guidance count 42 -> 43, legacy off lists, and the ALL_ON fixtures with world-destinations-v1 OFF (`experiments.test.ts`, `experiment-gate.test.ts`, viewer `test-support/experiments.ts` QUEUE_FEATURES, `next-run.test.ts`) set no-exit-here-v1 OFF so their presets stay valid. heal-before-trainers' pending-entry test now checks the switches registered when that entry was written (through cited-destination-v1) instead of every switch, so the pinned entry is not edited.
- [x] Wiring test broken once and watched red: 5:04 PM New York, `withNoExitHere` removed from `playGameTools`; both factory tests (9439 s14790 press, e046 s17549 navigate_to) failed, 2 failed / 20 passed; restored, 22/22.
- [x] Explainer `docs/explainers/no-exit-here-v1.html` (README entry; `just pages-check` prints nothing), FEATURE_EXPLAINERS mapping with the panels and server tests, pending `experiments/no-exit-here.json` (cited-destination's incumbent with world-destinations-v1 ON; provisional source.commit), readiness row; `just experiments-check`: ok, 94 experiments.
- [x] Gates (5:15 PM New York): `just build` ok; `just test` agent 2232/2232, viewer 1117/1117, pytest 2445 passed / 117 skipped; `just lint` clean (tsc, eslint, ruff, mypy); `just coverage` agent lines 98.06 / branches 94.31 / functions 98.18 (no-exit-here.ts 100 / 90.99 / 100), viewer 95.36 / 91.38 / 93.79, Python lines 97.55 / branches 93.60 / functions 99.43, floor 90.
  - COMMIT: `feat(no-exit-here): no-exit-here-v1 says there is no way off the map on a side with no connection, with the ways off it; explainer and pending experiment` (4698ee75)
  - Pending entry's provisional source.commit set to 4698ee75 (repin to the merge SHA when it lands); `just experiments-check` ok.
- [ ] STOP: review loop (principles self-review, Claude, Grok, GPT/Codex) not started in this session.

## Multi-Model Review Log

- Round 1 (frozen head ae68900b's predecessor packet, base main a04de386 after merge): Grok LGTM, GPT LGTM, Claude BLOCKING on one real bug: the line fired on indoor exit mats (south arrow warps on the bottom row; TryArrowWarp runs before any bump). Fixed in ce972222 (RED) / ec06e744 (GREEN): no line on a side whose edge holds a warp, nor without the warp list. PB4/PB9 re-scored with the fix (rebutted as process otherwise).
- Round 2 (packet base a04de386, head ae68900b): Claude LGTM, Grok LGTM, GPT BLOCKING on two items, both fixed in ac8e28b5 (RED) / f6e310ac (GREEN): (1) warp names now come from the readout's own "Warp destination at (x,y)" lines (world targets off; the truck's dynamic warp); (2) the game grounding now cites the real path (padded layout cell MAPGRID_UNDEFINED from InitMapLayoutData, MapGridGetCollisionAt returns 1, GetCollisionAtCoords gives COLLISION_IMPASSABLE, PlayerNotOnBikeCollide). GPT's non-blocking notes (submitted vs requested buttons under dialogue-safe batches; facing null; mixed per-tile reach in one doorway) are follow-ups, not in this branch.
- Landing: approved under the operator's two-round rule (fix small real issues after round 2 and land without another round), relayed by the coordinator. The coordinator lands it; this session does not merge into main.

## Review round 1 (coordinator relay)

Grok and GPT LGTM. Claude BLOCKING on one real bug: the line fires on indoor exit mats. They are south arrow warps on the map's bottom row (metatile behavior 0x65 `MB_SOUTH_ARROW_WARP`). `TryArrowWarp` in `ProcessPlayerFieldInput` (src/field_control_avatar.c) runs before any bump, so DOWN there leaves the map. Triage:
- Fix: drop a side whose edge row or column holds any warp from the state's warp list (covers the end tile and the goal tile being a warp, exit mats and door warps on an edge); say nothing when the state has no interaction targets, since the warps are then unknown.
- Rebut (process): PB9 / PB4 rows are re-scored with the fix; no further proof asked beyond the RED test.
- Follow-up: none.

- [x] RED: fixture gains 9439 s4011 (navigate_to (2,8) on MAYS HOUSE 1F, shown as PROF. BIRCH'S HOUSE 1F, warps (1,8)/(2,8) -> map 0/9); 3 tests fail (25 total, 22 pass).
  - COMMIT: `test(no-exit-here): RED no line on an edge that holds a warp (MAYS HOUSE 1F exit mat, 9439 s4011)` (ce972222)
- [x] GREEN: `open()` in no-exit-here.ts drops a side whose edge holds a warp and claims nothing without interaction targets; registry copy and explainer say so (new table row for 9439 s4011, grounding in the caption). no-exit-here suite 25/25.
  - COMMIT: `fix(no-exit-here): no line on a side whose edge holds a warp (indoor exit mats leave the map), nor without the warp list (review round 1)` (ec06e744)
- [x] Merged main a04de386 (readout-truth-fixes 8cdf6cd1, harness-trust-v2, battle-move-tool-v1). Registry tails: no-exit-here-v1 appended after surf-gated-exits-v2 in SWITCHABLE_FEATURES, FEATURES, playHarnessFeatures, presets, DEFAULT_NEXT_RUN, FEATURE_EXPLAINERS, README and readiness. Wiring: withBattleAction(withNoExitHere(withNavigation(...))). Count tests on main's versions shifted by one; heal-before-trainers' entry check now runs through surf-gated-exits-v2.
  - Gates on the merge: `just build` ok; `just test` agent 2306/2306, viewer 1131/1131, pytest passed; `just lint` clean; `just coverage` agent 98.00 / 94.10 / 98.22 (no-exit-here.ts 100 / 91.22 / 100), viewer 95.36 / 91.38 / 93.79, Python 97.48 / 93.42 / 99.43; `just experiments-check` ok, 100 experiments.

## Review round 2 (coordinator relay)

Claude and Grok LGTM; GPT BLOCKING on two items, both fixed (operator rule: fix small real issues and land without another round):
1. Warp names: the line dropped names the readout gives in its "Warp destination at (x,y): NAME" lines (world targets off; the truck's dynamic warp). Fix: name each doorway from those lines first (minus the readout's own reach notes; "unknown map g/n" is no name), then the map-id names, then the map id.
2. Grounding: the step off the grid lands inside the padded backup layout (width + MAP_OFFSET_W), which InitMapLayoutData fills with MAPGRID_UNDEFINED and only connections overwrite; MapGridGetCollisionAt returns 1 for it, so GetCollisionAtCoords (src/event_object_movement.c, also GetMapBorderIdAt == CONNECTION_INVALID) gives COLLISION_IMPASSABLE and CheckForPlayerAvatarCollision leads to PlayerNotOnBikeCollide. Not the border block. Explainer, comments and worklog corrected.
Follow-ups (not in this branch): classify the submitted buttons rather than requested ones under dialogue-safe batches; facing null; mixed per-tile reach in one doorway.

- [x] RED: three name tests (Oldale with only Warp destination lines, sh02 s761 truck dynamic warp, reach note and unknown map) and the explainer grounding quotes in panels.test.ts; 3 agent tests and 1 viewer test fail.
- [x] GREEN: `destinationLines` names each doorway from its Warp destination line first; grounding corrected in the module and test comments, registry copy, explainer figure and caption, and this worklog. no-exit-here suite 28/28.
  - COMMIT (RED): `test(no-exit-here): RED warp names from the readout's Warp destination lines; grounding names the undefined padded cell (review round 2)` (ac8e28b5)
  - COMMIT (GREEN): `fix(no-exit-here): keep the readout's warp destination names; grounding cites the undefined padded cell and GetCollisionAtCoords (review round 2)` (f6e310ac)
- [x] Merged main 9b4dcc15 (instruction-ledger-v2). no-exit-here-v1 appended after instruction-ledger-v2 in every registry list, presets, DEFAULT_NEXT_RUN, FEATURE_EXPLAINERS, README and readiness; wiring unchanged (withBattleAction(withNoExitHere(withNavigation(...)))). Count tests shifted by one on main's versions; heal-before-trainers' entry check runs through instruction-ledger-v2; one more no-exit-here test covers malformed call arguments.
  - Gates on the merge: `just build` ok; `just test` agent 2338/2338, viewer 1133/1133, pytest 2478 passed / 229 skipped; `just lint` clean; `just coverage` agent 98.04 / 94.17 / 98.26 (no-exit-here.ts 100 / 92.18 / 100), viewer 95.36 / 91.38 / 93.79, Python 97.48 / 93.42 / 99.43 (one viewer server-stream timeout on the first coverage run, green on rerun); `just experiments-check` ok, 101 experiments; `just verify-vendor` ok.
- [x] Archive: experiments/no-exit-here.json source.commit set to the pre-archive head 804d2bc1; worklog moved to docs/worklogs/2026-10-17_no-exit-here.md; WORKLOG.md pointer removed. Not merged into main by this session.
