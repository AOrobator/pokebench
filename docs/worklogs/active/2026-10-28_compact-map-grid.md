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
- [x] GREEN: `compact_codes()` and `render_observation(compact=…)` in `map_observation.py`. 200 passed (197 distinct sizes + 3); 80×80 goes from 161,825 to 28,222 chars.
- [x] Server wiring: `compact-map-grid-v1` in readout SERVER_FEATURES and the default-off env list; readout passes `compact=` through. Wiring test `test_server_switch_is_default_off_and_only_recodes_the_grid`: RED against the unwired readout (1 failed), GREEN after; the text before the grid and from `Base glyph` on is byte-identical. 201 passed; neighbours test_map_observation_wiring + test_adjacent_tiles 139 passed.
- [x] TS registry (features.ts SWITCHABLE_FEATURES index 294 / FEATURES / SERVER_FEATURES / serverFeatureEnv, needs map-observability-v1), play-preset (schema, legacy filter, union, normalize and flag defaults false), next-run default false. `compact-map-grid.test.ts` 2/2 with features.test.ts (30 passed); agent and viewer `tsc --noEmit` clean. Written after the registration, so no separate RED.
- [x] Explainer `docs/explainers/compact-map-grid-v1.html` (pages-theme, pages-check clean), README entry, `FEATURE_EXPLAINERS` mapping; panels/server link tests 2/2. Live READ EXPLAINER click waits for landing (8790 runs main).
- [x] a702 T1300 measurement: raw-ram/00032220.json.gz re-rendered through `rerender.main` with a702's switches. The OFF grid is 46,558 chars, matching the recording. Qwen3.6 /tokenize on 88ea (4 calls): grid 46,558 chars / 12,180 tokens → 7,283 / 3,871; whole observe result 62,809 / 17,601 → 23,534 / 9,292.
- [x] Activation commit (on this branch only; not landed): `compact-map-grid-v1` appended to current.json `switches` (bundle ON) and `features` false (control OFF), the same shape as instruction-memory-dedup-v1. Recipe sha256 f8fbd8ed… → f20e8136…; launch definitions that use featureRecipe "current" (bundle-v-control-2h, bundle-v-control, glm53-flash-4h, hyperqwen-control-3h) need `just fixed-run approve` again. Focused tests that read current.json: viewer 50 passed, agent 63 passed.
- [x] Changed-file lint: ruff check + format over env (whole tree, cheap), mypy (packages) clean, eslint on changed TS files clean.
- [x] Merged main 780154405 (the cap landed). Registry conflicts were resolved by keeping main's entries and adding this switch after instruction-memory-cap-v1, so its index moved 294 → 296. current.json: neutral-yes-no-readout-v1 and this switch are in `switches`, and cap stays true in `features`. The launch approval was removed on main, so no approve step. Focused: agent 57 passed; env 264 passed.
- [ ] Gates on a CPU grant: `just lint`, `just test`.
- [ ] Review: Claude, Grok, GPT/Codex lanes.

## Review round 1 (head 35de0524f, base main 90b351b55)

Full gate on 35de0524f passed, under the CPU grant relayed 12:01 PM NY:
- lint and build: clean
- agent: 4,780 tests
- viewer: 2,216 tests
- env: 4,802 tests
- claude-gateway: 116 tests
- trainer cards: 3/3

Lanes:
- Claude CLI: OAuth expired.
- Cursor: out of usage.
- Codex: its default model is refused, so the GPT lane runs `-m gpt-5.6-sol`.

So the roster is Codex gpt-5.6-sol, a Claude opus subagent and a sonnet fallback subagent (the operator's standing lane rule).

The fallback lane returned BLOCKING. When the origin is negative (a local view within 7 tiles of the west edge, from `read_local_map`), the stacked header sized its digit lines from the last column only, so "-5".."-1" all printed as "-".

- [x] RED: `test_compact_header_numbers_every_column_including_negative_origins`. Origins -5, -12 and -7 fail; 95 and 0 pass.
- [ ] GREEN: digits = the longest column number.
