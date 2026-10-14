# One-way tiles (2026-10-14)

Bug: the chair in the player's bedroom (Littleroot, tile (1,4)) is MB_IMPASSABLE_SOUTH_AND_NORTH
(0xC0) with no collision, so the live map drew it as `.`. The game refuses every move across
its north and south edges, in both directions. Source: `runs/explainers/map-observation-audit.html`
§4 and the "One-way walls drawn as clear" finding in the main checkout.

## Game-source grounding

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881:

- `include/constants/metatile_behaviors.h`: MB_IMPASSABLE_EAST..SOUTHWEST 0x30–0x37,
  MB_SECRET_BASE_BREAKABLE_DOOR 0xBE, MB_IMPASSABLE_SOUTH_AND_NORTH 0xC0, MB_IMPASSABLE_WEST_AND_EAST 0xC1.
- `src/metatile_behavior.c` `MetatileBehavior_Is{East,West,North,South}Blocked`: which sides each
  behavior walls.
- `src/event_object_movement.c` `GetCollisionAtCoords` → `IsMetatileDirectionallyImpassable`:
  moving in direction d is refused when the current tile walls side d
  (`gOppositeDirectionBlockedMetatileFuncs`) or the next tile walls the opposite side
  (`gDirectionBlockedMetatileFuncs`).

## Change (one switch: `one-way-tiles-v1`, guidance, needs `live-map-v1`)

- [x] Map text draws collision-free edge-wall tiles as `+`, a legend entry, and an
      `Edge walls: (x,y) north+south` list of walled sides. Off: `.`, no legend, no list.
- [x] `planNavigation` with `oneWay` admits edge-wall tiles and refuses leaving through a walled
      side of the current tile or entering through a walled side of the next. Off: walls (incumbent).
- [x] Recorded as a switchable server feature; absent from older v2 presets and v1 flag presets
      means OFF.

## Gates

- RED: `test: one-way tiles render with walled sides and navigate_to respects them` (efd1861).
  Fails on the edge-wall cases (Python 6, TS 8). Two RED expectations were corrected in GREEN:
  a Python row index (the player's row is rows[1]) and two equal-length A* tie paths.
- GREEN: `fix: draw one-way tiles with walled sides and keep navigate_to off them`.
  Agent 896/896, viewer 419/419, env 1808/1808; `just coverage` 90% floor passes; `just lint` 0.
