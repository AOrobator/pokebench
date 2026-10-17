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

pret/pokeemerald 731ad5bf. Outside the map's own grid with no connected map there, `GetMapGridBlockAt` (src/fieldmap.c) returns the border block with `MAPGRID_IMPASSABLE`, so `MapGridGetCollisionAt` reports a collision. `PlayerNotOnBikeCollide` (src/field_player_avatar.c) plays the bump sound and walks in place. No script or text runs: the game shows nothing. So the harness line states only the fact (skill rule 2): there is no way off this map on that side, and the ways off it the readout already lists.

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
- [ ] GREEN: module, registry, presets, DEFAULT_NEXT_RUN, factory wiring, registry counts.
- [ ] Wiring test broken once and watched red.
- [ ] Explainer `docs/explainers/no-exit-here-v1.html`, FEATURE_EXPLAINERS, pending `experiments/no-exit-here.json`, readiness row.
- [ ] Gates: just test, just lint, just build, just coverage.

## Multi-Model Review Log

Not started (this session stops before the review loop).
