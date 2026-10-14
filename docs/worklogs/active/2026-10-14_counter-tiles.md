# Counter tiles (2026-10-14)

Bug: counter tiles (behavior 0x80, MB_COUNTER) carry collision, so the live map drew them as `#`
and every Pokémon Center nurse looked unreachable. The game lets the player talk across a
counter. Source: `runs/explainers/map-observation-audit.html` in the main checkout.

## Game-source grounding

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881:

- `include/constants/metatile_behaviors.h`: MB_COUNTER is enum value 0x80.
- `src/field_control_avatar.c` `GetInteractedObjectEventScript`: when no object stands on the
  faced tile and that tile's behavior is a counter, the object one further tile in the facing
  direction is the one talked to.

## Change (no new switch; a correction inside `live-map-v1`)

- [ ] Map draws collision counters as `=`, legend says not walkable but talk across with A.
- [ ] `navigate_to` targeting a counter, or an object directly behind one, stops without
      pressing and says to stand facing the counter and press A.
- [ ] `live-map-v1` feature description lists `=`.

## Evidence

## Commits

## Review
