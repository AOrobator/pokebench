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

- [ ] Map text draws collision-free edge-wall tiles as `+`, a legend entry, and an
      `Edge walls: (x,y) north+south` list of walled sides. Off: `.`, no legend, no list.
- [ ] `planNavigation` with `oneWay` admits edge-wall tiles and refuses leaving through a walled
      side of the current tile or entering through a walled side of the next. Off: walls (incumbent).
- [ ] Recorded as a switchable server feature; absent from older v2 presets and v1 flag presets
      means OFF.

## Gates
