# compact-map-grid-v1 (lossless short codes for the observed-elements map grid)

Operator decisions, relayed from the project thread:

- The operator 2026-10-28 picked bound 1 (compact grid codes, lossless) with bounds 2, 3, 4 and 6; no grid window (5).
- Each bound is its own default-OFF switch on its own branch off main, in the order 1, 2, 3, 6, 4.
- The operator: "they all need to be on in the bundle". The activation commit puts this switch in current.json `switches` (bundle arm only). Control stays OFF.
- Don't land or activate until the coordinator returns with the operator's OK. Full suites only on a relayed CPU grant.

## Why

Run a702 died at T1303 on a 66,676-token request against a 65,536 window. Its last tool result was 70K chars, 47K of them the "Current map (observed elements v1)" grid for ROUTE 104.

Each cell is padded to the widest token, and tokens like `~/Wa:o/Lv:1` are long. pret's largest layouts are 80×80 (Routes 124/126/127) and 40×140 (Routes 111/119). At today's padding those come to about 160K chars.

## Rule

When the switch is ON, the server renders the same grid with these changes:

- Each distinct multi-character token gets a short code. The codes are letters not used as single-character glyphs: one letter, then two.
- A `Codes: A = token; …` line follows the title. It reads `Codes: none` when no token needs a code.
- Every cell is padded to the longest code, with one space between cells.
- Column numbers are stacked digit lines, read top to bottom.

Gate edges (`|`, `-`), junctions (`*`), the legend and everything after the grid are unchanged. Every tile is still shown, so nothing is lost.

**OFF:** byte-identical to today (server default-off list; `render_observation(compact=False)`).

## M1: renderer + server switch

- [x] RED: `env/tests/env/test_compact_map_grid.py`. A synthetic grid at every distinct pret layout size (layouts.json at pret 731ad5bfd, with fallback sizes if absent) parses back to the same cells, gate edges, junctions and trailing text as the verbose form. The test also checks: off by default, codes skip glyph letters, and the multi-digit header. RED before the implementation: `render_observation` had no `compact` parameter.
- [x] GREEN: `compact_codes()` and `render_observation(compact=…)` in `map_observation.py`. 203 passed; 80×80 goes from 161,825 to 28,222 chars.
- [ ] Server wiring: `compact-map-grid-v1` in readout SERVER_FEATURES and the default-off env list; readout passes `compact=` through. Wiring test.
- [ ] TS registry (features.ts SERVER_FEATURES / SWITCHABLE_FEATURES / FEATURES), play-preset, next-run; registry tests.
- [ ] Explainer + feature-card link.
- [ ] a702 T1300 measurement (chars and tokens).
- [ ] Activation commit: current.json `switches` (bundle ON); recipe sha change noted.
- [ ] Gates on a CPU grant: `just lint`, `just test`.
- [ ] Review: Claude, Grok, GPT/Codex lanes.
