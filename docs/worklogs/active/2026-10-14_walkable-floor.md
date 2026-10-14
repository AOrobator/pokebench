# Walkable floor in navigate_to (2026-10-14)

Bug: `navigate_to`'s planner (`packages/agent/src/navigation.ts:13`) only admitted behaviors 0, 2, 3
and warp/door tiles. Sand, cave floor, mountain top, puddles, shallow water and bridges were walls
while the map text draws them as `.`. Source: `runs/explainers/map-observation-audit.html` §7 in the
main checkout.

## Game-source grounding

pret/pokeemerald 731ad5b:

- `src/event_object_movement.c` `GetCollisionAtCoords`: a move is refused for the collision bit, map
  border, `IsMetatileDirectionallyImpassable`, camera bounds, `IsElevationMismatchAt` or an object.
  Behavior is not otherwise consulted.
- `src/field_player_avatar.c` `CheckForObjectEventCollision`: ledges, boulders, rotating gates and
  `CheckAcroBikeCollision` (bumpy slope, rails) on top.
- Stepping effects the planner cannot predict as one tile of movement: forced movement
  (`MetatileBehavior_IsForcedMovementTile`, thin/cracked ice), holes and step warps.
- Surfable water (`sTileBitAttributes` TILE_FLAG_SURFABLE) is never walked on foot.

## Change (no switch; bug fix, kept small for sibling threads in navigation.ts)

- [x] `WALKING` becomes "every behavior except UNWALKABLE": surfable, forced movement, ice, holes and
      step warps, directional one-way tiles (0x30–0x37, 0xC0, 0xC1; chair thread owns those), ledges
      (ledge thread owns those), Acro Bike tiles. Collision, elevation, door and warp rules unchanged.
- [x] Scan of every pokeemerald layout (maps.json from the audit): planner rejected 38,662 `.` tiles,
      now 8,030 (surfable water drawn as `.`, ice, directional tiles, holes). 30,647 tiles opened
      (cave 15,997, mountain top 4,110, shallow water 3,116, sand 2,221, indoor encounter 2,043 …).
      Only change in the other direction: water door 0x6C/0x6D (15 surfable tiles) no longer walkable.

## Gates

- RED: `test: navigate_to walks sand, cave and mountain-top floor` (a7a32d3). 3 navigation tests fail
  (walkable floor, Route 104 beach, water door 0x6C/0x6D still admitted).
- GREEN: `fix: navigate_to walks every floor the game lets the player walk`. agent 893/893,
  viewer 419/419; agent coverage 97.1/93.16/97.86 (navigation.ts 91.71 stmts / 91.83 branches /
  100 funcs); `pnpm -r lint` clean. Python untouched.
- Evidence (real RAM grids): replayed the human run `runs/human/2026-10-13T23-50-13_human_1848`
  (3,226 sampled field states with non-legacy floor). Of 12,515 `.` targets, the old rule reached
  5,092 and the new one 7,280: 2,188 newly reachable (Route 104 1,750, Rusturf Tunnel 161,
  Route 116 51, Route 115 71, house rugs 155), 0 newly unreachable.
- Merged main 986b386 (ledge hops landed in navigation.ts). Conflict at the WALKING/LEDGES
  constants resolved by keeping both; ledge landings now accept sand etc. via WALKING (test
  "hops a ledge down onto sand"). agent 900/900, viewer 419/419, lint clean, navigation.ts
  93.71/93.29/100/100.
