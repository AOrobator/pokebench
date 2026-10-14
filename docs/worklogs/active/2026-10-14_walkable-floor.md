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

