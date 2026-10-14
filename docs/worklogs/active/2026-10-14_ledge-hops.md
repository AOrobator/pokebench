# Ledge hops (2026-10-14)

Bug: ledge tiles (behaviors 0x38–0x3B, MB_JUMP_EAST/WEST/NORTH/SOUTH) carry collision, so the
live map drew them as `#` and `navigate_to` treated them as walls. Route 101 has 12 south
ledges. Source: `runs/explainers/navigation-followups.md` §4 in the main checkout.

## Game-source grounding

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881:

- `include/constants/metatile_behaviors.h`: MB_JUMP_EAST 0x38, WEST 0x39, NORTH 0x3A, SOUTH 0x3B.
- `src/field_player_avatar.c` `CheckForObjectEventCollision`: `ShouldJumpLedge` runs whatever the
  collision bit says; `GetLedgeJumpDirection` (`src/event_object_movement.c`) matches the
  behavior of the tile being moved into against the move direction. `PlayerJumpLedge` moves
  the player two tiles with one press.

## Change (one switch: `ledge-hops-v1`, guidance, needs `live-map-v1`)

- [x] Map text draws ledges as `v ^ < >` with a legend line: one-way hop in the arrow's
      direction, landing 2 tiles on, impassable from other sides. Off: `#` and no legend.
- [x] `planNavigation` hops a ledge only in its direction, one press, landing on a known,
      clear, unoccupied, non-warp, non-door tile at a compatible elevation. Off: walls.
- [x] `navigate_to` expects a 2-tile move after a hop press; anything else stops as
      unexpected movement. Tool description and system prompt say it hops ledges.
- [x] Recorded as a switchable server feature. Absent from older v2 presets and v1 flag presets
      means OFF, so frozen incumbents keep ledges as walls. Viewer drafts (ALL_ON) get it ON.

## Evidence

- Live, real ROM, vendored `tests/states/torchic.state` (Route 101, (9,15)), run dir
  `runs/ledge-proof/torchic` (gitignored): the model text shows `v v v v` at y=13; the real
  `navigate_to` (dist build, ledges on) walked to (9,12) in 7 presses, then (9,14) in
  1 press: "arrived at requested coordinate; 1 ordinary button attempts".

## Gates

