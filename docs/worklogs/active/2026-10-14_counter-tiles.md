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

## Change (one switch: `counter-talk-v1`, guidance, needs `live-map-v1`)

First landed as an unswitched correction; switched to match `ledge-hops-v1` (PB4/PB5) so
frozen presets keep counters as `#` and comparisons stay comparable.

- [x] Map draws collision counters as `=`, legend says not walkable but talk across with A.
- [x] `navigate_to` targeting a counter, or an object directly behind one, stops without
      pressing and names the tile to stand on and the direction to face, then press A.
- [x] `live-map-v1` feature description lists `=`.
- [ ] `counter-talk-v1` switch: off draws `#`, drops the legend and the navigate_to hint;
      absent from older v2 presets and v1 flag presets means OFF; viewer drafts get it ON.

## Evidence

- Live, real ROM, vendored `tests/states/torchic.state`, walked Route 101 -> Oldale Town ->
  Pokémon Center 1F (map 2/2), run dir `runs/counter-proof/torchic` (gitignored). The model
  text shows `=` at (7,3) under the nurse at (7,2); the rest of the counter row stays `#`
  because only that tile is MB_COUNTER (behaviors present include 0x80). `navigate_to` to
  (7,2) or (7,3) pressed nothing and returned the counter hint; from (7,4) facing UP, A opened
  "Hello, and welcome to the POKéMON CENTER." Saved: `runs/counter-proof/oldale-pc-observation.txt`.

## Commits

- RED: `test: counters render as their own glyph and navigate_to explains talking across them (RED)` (a1376b2)
- GREEN: tests 891 TS agent + 31 viewer files, 1805 Python; coverage gate 90 passes (Python 95% total); lint clean; vendor OK.

- GREEN: `fix(live-map): draw counters as = and explain talking across them` (3734d45)
- Hint refinement: `fix(navigation): name the tile and direction for talking across a counter` (982773a)
- Merged main (ledge hops landed): conflicts in live_map.py, navigation.ts and both test files resolved by keeping ledges and counters side by side. After merge: 59 agent + 40 viewer test files, 1809 Python tests; coverage gate 90 passes; lint clean.
- RED (switch): `test: counter-talk-v1 switch keeps counters as walls when off (RED)`

## Review
