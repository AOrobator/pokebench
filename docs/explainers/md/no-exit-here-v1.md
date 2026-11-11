Harness switch · guidance · `no-exit-here-v1` · needs `world-destinations-v1` · off by default · bundle arm only

# No exit here

> Markdown twin of [no-exit-here-v1.html](../no-exit-here-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Runs invent exits and then walk into a map edge that leads nowhere: e046 wrote "Oldale's east exit to Petalburg" (s18744) and "Route 103's north exit to Rustboro" (s17437); deb4 read "SOUTH -&gt; ROUTE116" and "EAST -&gt; ROUTE119" for Littleroot (s11619); 9439 pressed DOWN on Littleroot's south edge and was told only "no movement" (s14790, s16266). With this switch on, that press or navigate_to call gets one line: there is no way off this map on that side, and here are the ways off it.

## When the line appears

![Oldale Town edges with and without connections](no-exit-here-v1/fig-1.svg)

*Green: sides with a map connection (never this switch's line, reachable or not). Red: a side with none. The line fires when a press ends with its last button a direction pointing off the map from the tile the player stands on (facing it), or when navigate_to aims at a tile on or past an edge of the current map, and that side has no connection. A corner names each side without one. A side whose edge row or column holds a warp never gets the line: indoor exit mats are south arrow warps on the bottom row (`MB_SOUTH_ARROW_WARP`), and `TryArrowWarp` in `ProcessPlayerFieldInput` (src/field_control_avatar.c) runs before any bump, so DOWN there leaves the map. Without the state's interaction targets the warps are unknown and no line is added.*

| Recorded call | Side | Line |
|---|---|---|
| e046 s18731 navigate_to (19,10), OLDALE TOWN | east, no connection | yes |
| e046 s17480, s17549 navigate_to (10,0), ROUTE103 | north, no connection | yes |
| deb4 s11662 navigate_to (10,19), LITTLEROOT TOWN | south, no connection | yes |
| 9439 s14790, s16266 press DOWN, LITTLEROOT TOWN | south, no connection | yes |
| e046 s17409 press UP, UP onto (11,0), OLDALE TOWN | north, ROUTE103 | no |
| e046 s17421 press UP across to ROUTE103 (11,21) | ends on the south edge, pressed north | no |
| deb4 s11596 navigate_to (10,19), ROUTE101 | south, LITTLEROOT TOWN | no |
| 9439 s4011 navigate_to (2,8), the exit mat of MAYS HOUSE 1F (shown as PROF. BIRCH'S HOUSE 1F) | south, no connection but warps (1,8) and (2,8) on that edge | no |

## The line

Off (today, 9439 s14790)

```
pressed DOWN
Press result: blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input)

Screen: overworld
...
```

On

```
pressed DOWN
Press result: blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input)
There is no way off LITTLEROOT TOWN to the south; the ways off this map are: NORTH edge -> ROUTE101 (map 0/16); (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2); (5,8) -> BREDON's HOUSE 1F (map 1/0); (7,16) -> PROF. BIRCH'S POKéMON LAB (map 1/4)

Screen: overworld
...
```

On e046 s18731 (navigate_to puts the line as its own text part right after the Navigation line):

```
There is no way off OLDALE TOWN to the east; the ways off this map are: NORTH edge -> ROUTE103 (map 0/18); SOUTH edge -> ROUTE101 (map 0/16); WEST edge -> ROUTE102 (map 0/17); (5,7) -> OLDALE TOWN HOUSE1 (map 2/0); (15,16) -> OLDALE TOWN HOUSE2 (map 2/1); (6,16) -> OLDALE TOWN POKEMON CENTER 1F (map 2/2); (14,6) -> OLDALE TOWN MART (map 2/4)
```

On e046 s17480 and s17549, where the east edge and the cave are across water and surf-gated-exits-v1 is on, those ways are marked, not hidden:

```
There is no way off ROUTE103 to the north; the ways off this map are: SOUTH edge -> OLDALE TOWN (map 0/10); EAST edge -> ROUTE110 (map 0/25) (crosses water you cannot cross yet); (45,6) -> ALTERING CAVE (map 24/106) (crosses water you cannot cross yet)
```

Every name comes from the result's own readout: the map from its Location line, connections from its Map connections lines, and each warp from its own "Warp destination at (x,y)" line (which also names a dynamic warp, "PETALBURG CITY (dynamic warp; map 0/0)" in the sh02 truck), else its Warps or Warp to lines (a two-tile door is one entry, "(1,0) or (2,0)"); a map the readout never named is given as its map id. With exit-reachability-v1 on, an exit its foot check leaves out is marked "(cannot be reached on foot from where you stand)". Nothing is clipped. No route or place the readout has not shown is named.

## Game grounding

![What the game does at a map edge with no connection](no-exit-here-v1/fig-2.svg)

*pret/pokeemerald 731ad5bf. The game keeps the map in a padded layout (width + MAP_OFFSET_W, height + MAP_OFFSET_H). `InitMapLayoutData` fills it with `MAPGRID_UNDEFINED`, copies the map in at a 7-cell offset, and only map connections fill the padding on their side. A step off the map where nothing is connected lands on an undefined cell, so `MapGridGetCollisionAt` returns 1 and `GetCollisionAtCoords` (also checking `GetMapBorderIdAt` for `CONNECTION_INVALID`) gives `COLLISION_IMPASSABLE`; `CheckForPlayerAvatarCollision` then leads to `PlayerNotOnBikeCollide`. The game shows nothing, so the harness states only that fact (game-state skill, "Harness messages use the game's own words", rule 2).*

## Wiring

![How the switch reaches the tools](no-exit-here-v1/fig-3.svg)

*The wrapper sits right outside navigation and inside dialogue auto-advance and every other result wrapper, so its line sits right under the Press result or Navigation line. Off: the same tool objects, results unchanged. No new events and no timeline marks.*

## Status

- Tests on the e046, deb4 and 9439 recordings (cited seqs), the production factory (press and a real navigate_to refusal) and the registry and presets. The factory test was watched red with the wiring removed.
- Registered as a pending experiment (`experiments/no-exit-here.json`), bundle arm only; not queued, not measured. Not yet reviewed.
