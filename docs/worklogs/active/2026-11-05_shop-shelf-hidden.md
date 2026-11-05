# Shop shelves off the interaction list

The operator 2026-11-05: decorative shelves should not be listed as things to interact with; the fix goes on in both arms. Run 2026-11-05T15-37-57_rayquaza-lane-qwen_0952 spent 11 turns activating them in PETALBURG CITY MART, where the readout listed 16 shelf lines. Coordinator addition: hide other scriptless decoration on the same path, never anything with a script or a hidden item; replay recorded Mart turns as proof.

## Plan

- [x] RED tests for the reader, state wiring and registry.
- [x] GREEN: `shop-shelf-hidden-v1`, default off, on in both arms of the current and Rayquaza recipes.
- [x] Explainer linked from the feature card.
- [x] Replay recorded Mart turns from raw RAM.
- [ ] Read-only GPT review of the diff.

Not landing here. Full suites wait for a coordinator CPU window.

## Findings

Source pokeemerald 731ad5b. ROM SHA-1 f3ae088181bf583e55daf962a92bb46f4f1d07b7, scanned read-only over every map header.

- Where targets come from: `read_targets` in `env/pokebench_env/world.py` appends `read_metatile_targets`. The tuple feeds the readout's "Map interaction candidates" lines and the JSON `interaction_targets`, and the agent resolves `navigate_to_target` only against that JSON list. Hiding at the reader covers both. No map, collision or grid code reads this tuple for tiles.
- Behavior 0xE5 (269 tiles, 18 maps) does have a script: `EventScript_ShopShelf` prints the one flavor line `Text_ShopShelf`. It is hidden because the operator named it.
- Every other `METATILE_TARGETS` behavior also returns a script, so none is hidden. Vases, trash cans and bookshelves are the same kind of flavor text and stay listed.
- Background events with no script: two in the whole ROM, `MeteorFalls_1F_1R` and `MeteorFalls_1F_2R`, both at (9,58), outside layouts 42 and 32 tiles tall. Unreachable, so hidden. Objects with no script were already dropped.
- Hidden items (112) and secret bases (75) are never touched.

## Commits

- RED: `test(readout): RED for shop-shelf-hidden-v1` (8b6456041). Python collection error on the missing switch; 4 agent tests failed.
- GREEN: `feat(readout): hide shop shelves and scriptless signs behind shop-shelf-hidden-v1` (0ae000505).
- Explainer and replay: `docs(explainer): shop-shelf-hidden-v1 with the Mart replay` (5d7117735).
- Merge of main a34a356f6: conflicts in the switch lists and recipes against `rq-slim-prompt-v1`; both kept, this switch last. Focused checks repeated: 115 Python, 71 agent, 158 viewer panels; tsc and eslint clean.

## Checks

- Python focused, under the no-I/O guard: 115 passed (shelf, world, named interactions, semantic targets, visibility V2). ruff check and format clean on changed files.
- Agent focused: 73 passed. Viewer `panels.test.ts`: 158 passed, run with a scratch config aliasing the agent package to source, because this worktree has no agent build. `tsc --noEmit` clean in both packages; eslint clean on changed files.
- Wiring mutation: removing `hide_decoration=decoration_hidden_enabled` from `read_game_state` turned `test_production_path_honors_the_switch_in_text_and_json` red; restored, 6 passed.
- Full suites not run; they need a coordinator CPU window.

## Replay

All 71 recorded PETALBURG CITY MART states (turns 153 to 165) of run 2026-11-05T15-37-57_rayquaza-lane-qwen_0952, decoded from raw RAM with the run's server switches, off and on. Read-only; the script stayed in the scratchpad.

- Off: targets match the recorded state by kind and tile, 71 of 71. 1,136 shelf targets, 16 per state.
- On: 0 shelf targets and no shelf text, 71 of 71. MART_EMPLOYEE and the other 3 people unchanged, 71 of 71. Other targets, including the door and questionnaire, unchanged. Only shelf lines left the readout, none added. All other state JSON identical.

The first attempt hung because a stray `org.py` in the shared scratchpad shadowed an `org` import and read stdin. It was a scratch-file problem, not repo code; rerun from a clean folder.

## Open for the operator

- Vases, trash cans and bookshelves are flavor text like shelves but have scripts, so they stay listed under the rule given.
- Astra presets list switches by hand, so the next Astra launch needs `shop-shelf-hidden-v1` added.
