# Counter tiles (2026-10-14)

Bug: counter tiles (behavior 0x80, MB_COUNTER) carry collision, so the live map drew them as `#`
and every Pokémon Center nurse looked unreachable. The game lets the player talk across a
counter. Source: `docs/explainers/map-observation-audit.html` in the main checkout.

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
- [x] `counter-talk-v1` switch: off draws `#`, drops the legend and the navigate_to hint;
      absent from older v2 presets and v1 flag presets means OFF; viewer drafts get it ON.

## Evidence

- Live, real ROM, vendored `tests/states/torchic.state`, walked Route 101 -> Oldale Town ->
  Pokémon Center 1F (map 2/2), run dir `runs/counter-proof/torchic` (gitignored). The model
  text shows `=` at (7,3) under the nurse at (7,2); the rest of the counter row stays `#`
  because only that tile is MB_COUNTER (behaviors present include 0x80). `navigate_to` to
  (7,2) or (7,3) pressed nothing and returned the counter hint; from (7,4) facing UP, A opened
  "Hello, and welcome to the POKéMON CENTER." Saved: `runs/counter-proof/oldale-pc-observation.txt`.
- Re-run on head 70202d6 (switch ON via ALL_ON), run dir `runs/counter-proof/torchic-final`:
  `navigate_to` to the nurse (7,2) pressed nothing and returned "target is behind a counter;
  walk to (7,4), face UP toward the counter at (7,3) and press A to talk across it". Following
  it: navigate_to (7,4), UP, A -> nurse dialogue. Saved: `runs/counter-proof/final-observation.txt`.

## Commits

- RED: `test: counters render as their own glyph and navigate_to explains talking across them (RED)` (a1376b2)
- GREEN: tests 891 TS agent + 31 viewer files, 1805 Python; coverage gate 90 passes (Python 95% total); lint clean; vendor OK.

- GREEN: `fix(live-map): draw counters as = and explain talking across them` (3734d45)
- Hint refinement: `fix(navigation): name the tile and direction for talking across a counter` (982773a)
- Merged main (ledge hops landed): conflicts in live_map.py, navigation.ts and both test files resolved by keeping ledges and counters side by side. After merge: 59 agent + 40 viewer test files, 1809 Python tests; coverage gate 90 passes; lint clean.
- RED (switch): `test: counter-talk-v1 switch keeps counters as walls when off (RED)`
- GREEN (switch): `feat(features): put counter talk behind counter-talk-v1`. 59 agent + 40 viewer test files (899 + 474 tests), 1811 Python; coverage gate 90 passes; lint clean; vendor OK.

## Review

Round 1 (head 01b2aad, diff SHA-256 4b02764b…): Claude CLI LGTM, Cursor Grok 4.5 LGTM, Codex
(gpt-5.6-sol; its configured gpt-6.1-sol is rejected for this account; Cursor GPT hit its usage
limit) BLOCKING:
1. stand tile not validated (could be colliding/occupied/absent/unreachable);
2. legend shown for a 0x80 tile with no drawn `=`;
3. live proof lacks a recorded events.jsonl (PB7);
4. switch lacks its explainer.
- [x] RED for 1 and 2 (5734ded): `test: counter hint and legend only describe what is usable and drawn (RED)`
- [x] Fix 1 and 2: stand tile named only if it is a known tile `planNavigation` reaches (else a generic hint); legend only when a `=` is drawn. 900 agent + 474 viewer tests, 1813 Python; gates green.
- [x] Recorded probe for 3: `runs/counter-proof/recorded/2026-10-14T19-41-31_probe_counter_talk` at f87b913 (clean), 414 events; navigate_to (7,2) tool_call 359 -> tool_result 361 with 0 button_press between; then (7,4), UP, A -> nurse greeting. Receipt: `runs/counter-proof/recorded-receipt.txt`.
- [x] Explainer for 4: `docs/explainers/counter-talk-v1.html`, indexed in README; checked at desktop and 390px widths.

- Explainer commit: `docs: counter-talk-v1 explainer with Pokémon Center diagrams` (16e8198)
- Merged main 8911d0e (one-way tiles `one-way-tiles-v1` landed): every conflict was two sibling switches side by side; both kept. Counts now 12 guidance switches, 20 server features, 32 viewer switch rows. 918 agent + 476 viewer tests, 1829 Python; gates green.
