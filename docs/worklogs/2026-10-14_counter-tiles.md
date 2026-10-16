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
- RED (switch): `test: counter-talk-v1 switch keeps counters as walls when off (RED)` (5f06ade)
- GREEN (switch): `feat(features): put counter talk behind counter-talk-v1` (70202d6). 59 agent + 40 viewer test files (899 + 474 tests), 1811 Python; coverage gate 90 passes; lint clean; vendor OK.

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
- Merged main 5195c88 (elevation transitions) cleanly. 921 agent + 478 viewer tests, 1829 Python; gates green; vendor OK.
- Recorded probe re-run on head 49d5ef1 (clean): `runs/counter-proof/recorded/2026-10-14T19-51-20_probe_counter_talk`, 648 events; navigate_to (7,2) seq 593->595 and (7,3) seq 597->599 with 0 button presses each; UP seq 627, A seq 636, nurse greeting in tool_result 641/645. Receipt rewritten: `runs/counter-proof/recorded-receipt.txt`.

Round 2 (head 992cfb9, base main 5195c88, diff SHA-256 78b31cfb…): Claude CLI LGTM, Codex
(gpt-5.6-sol, high) LGTM, Cursor Grok 4.5 LGTM. Notes taken: add `counter-talk-v1` to the
viewer's FEATURE_EXPLAINERS allowlist (Claude, Grok) and refresh the explainer status text.
Left as speculation: object elevation is not in navigation_grid (Codex found no mismatch across
181 static counter/object alignments); first-direction rather than nearest stand tile.
- [x] RED: viewer serves /explainers/counter-talk-v1.html (44ad206)
- [x] GREEN: FEATURE_EXPLAINERS lists counter-talk-v1; explainer status refreshed. 921 agent + 478 viewer tests, 1829 Python; gates green. Review-note follow-ups only (allowlist entry, docs); no reviewed logic changed.
- Merged main 353a3d1 (full-map navigation restructured live_map.py into shared `_cells`/`_details`/`_symbol` and navigation.ts into a `Geometry` over local or whole-map grids). Counter handling re-applied on that structure: `=` in `_symbol`, `counters` through `_cells`/`_details` for both LocalMap and FullMap, `counterHint` now reads the same `Geometry` so it works in whole-map mode. New tests: whole-map `=`/off, full-mode navigate_to hint, malformed local geometry stays quiet. Counts: 13 guidance switches, 21 server features, 33 viewer rows. 939 agent + 478 viewer tests, 1847 Python; gates green; vendor OK.
- Merged main 4fec90f (viewer feature search) cleanly; gates green. Recorded probe on 55c78b5 (clean) with whole-map navigation on: `runs/counter-proof/recorded/2026-10-14T20-05-29_probe_counter_talk`, 644 events; whole-map row 3 `....###=##....` with legend; navigate_to (7,2) seq 589->591 and (7,3) 593->595, 0 presses each; UP 623, A 632, nurse greeting 637/641. Explainer status refreshed.

Round 3 (head e66594b, base main 4fec90f, diff SHA-256 6a6011df…): Claude CLI LGTM, Codex
(gpt-5.6-sol, high) LGTM, Cursor Grok 4.5 LGTM. Taken: explainer wiring label now covers the
whole-map text. Noted, not changed: the probe ran at 55c78b5, which differs from the reviewed head
only in docs/worklog; Codex classes the viewer explainer link as scope expansion, but CLAUDE.md and
the feature-explainer skill require it; first-direction stand tile and object elevation remain
speculation; `local_map` recorded text keeps defaults like its siblings (frozen non-goal).

Status: landed on main (cef13fb) with operator approval 2026-10-14. Experiment readiness: BLOCKED (models do not yet reach Oldale); recorded in docs/experiments/readiness.md, and the patch-evaluation skill now gates experiments on readiness.
- Merged main 3e8a13c cleanly (viewer and docs only, no counter files touched); gates green.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-14). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
