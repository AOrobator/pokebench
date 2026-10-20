# Heal before trainers v2 and gym heal warning (`heal-before-trainers-v2`, `gym-heal-warning-v1`)

Status: M1 RED. Part of `heal-respawn-sight` (milestones M3 and M4), approved by the operator at 3:41 PM ET on 2026-10-20.

Worktree `~/dev/pokebench-worktrees/heal-before-trainers-v2`, branch `claude/heal-before-trainers-v2`, from main 6c88d424.

## Evidence (b300, read-only)

Run `2026-10-20T13-54-28_qwen36-gpu0_b300` (bundle arm of whole-map-pair-1h; low-hp-trainer-warning-v1/v2 and heal-before-trainers-v1 on, bag-healing-items-v1 off).

- Result 14717 (state 14716, read before the model's reply at seq 14724): RUSTBORO CITY, TORCHIC 25/33. Its exits line lists `(16,38) -> RUSTBORO CITY POKEMON CENTER 1F (map 11/5)` and `(27,19) -> RUSTBORO CITY GYM (map 11/3)`. No warning fired (no trainer on the city map).
- Result 14882 (state 14880, milestone 14881): enters RUSTBORO CITY GYM. No warning.
- Warning 15195: heal-before-trainers-v1 named only TOMMY (object 3), because HIKER MARC and ROXANNE were not loaded, and the house in LITTLEROOT TOWN, 8 map changes away, because it counts only centers entered.
- low-hp-trainer-warning-v2 never fired: it needs ROXANNE's object loaded.

## Design

### M1 heal-before-trainers-v2 (guard, needs heal-before-trainers-v1, server + agent)

- Server: with the switch, `heal_before_trainers.trainers` comes from every object template of the map (SaveBlock1.objectEventTemplates, the same reading offscreen-objects-v1 uses): a template hidden by its set flag is left out, a loaded object gives its tile now, an unloaded one its template tile, and each trainer gains `loaded`. Trainer test unchanged (trainerbattle script, field battle type, flag 0x500 + id).
- Agent heal places: centers entered, the center of the save's last heal location, every POKéMON CENTER 1F that a delivered non-error game-tool result showed as an exit or warp destination this run (a warp of that result's map leads to it and the result text names its `map G/N`), and home while MOM heals. Nearest by fewest map changes.
- Thresholds: a story-battle opponent (STORY_BATTLES: rival, ROXANNE) is named while any party Pokémon is below max HP; others while the party is weak (v1). With low-hp-trainer-warning-v2 on, a story opponent whose object is loaded stays with that warning.
- Off: v1 exactly (same state JSON, same text, same events).

### M2 gym-heal-warning-v1 (guard, needs heal-before-trainers-v2, agent only)

- One SUPERVISOR paragraph on a game-tool result on the free field while any party Pokémon is below max HP, when the current map's name contains GYM or one of its warps leads to a map whose name contains GYM.
- Content: each hurt Pokémon's HP; the whiteout in the game's words (sText_PlayerWhiteout, sText_PlayerWhiteout2), the money lost (DoWhiteOut keeps floor(money/2)) and where you wake up (SaveBlock1.lastHealLocation, as the game's map table names it); the nearest heal place from v2's list.
- Once per map entry; re-arms on another map or a state with the whole party at full HP. Event `gym_heal_warning` for Activity History; no timeline mark.

## Milestones

- [x] M1 RED (742c6071), GREEN, gates, explainer, pending experiment
- [ ] M1 Claude + Grok review
- [ ] M2 gym-heal-warning-v1: RED, GREEN, gates, explainer, pending experiment, Claude + Grok review
- [ ] Sync with main, final gates, report b300 texts

## Session log

- Spawned 2026-10-20. Read brief, design, b300 seqs 14716/14717, 14880/14882, 15193/15195.
- Worktree setup: `git submodule update --init` (vendor at pin, `just verify-vendor` OK), gitignored `.env` copied from main, `just build-mgba` (source copied from main's `.cache/mgba/src`).
- M1 RED: pytest v2 cases plus b300 real RAM (fixture `env/tests/env/fixtures/heal-trainers-b300.json`, RAM windows only, states 14716/14880/15196); vitest `heal-before-trainers-v2.test.ts` (b300 replay over results 14698-15600, fixture `test-support/heal-before-trainers-b300.json.gz`) and `heal-before-trainers-v2-wire.test.ts` (playGameTools). Against HEAD's implementation: pytest collection error (no SWITCH_V2), vitest 2 files fail (state schema refuses `loaded`, missing exports).

  COMMIT: `test: heal-before-trainers-v2 RED on b300 RAM and recorded results` (742c6071)
- M1 GREEN: server `read_map_trainers(whole_map=True)` behind SERVER switch `heal-before-trainers-v2` (default off, `loaded` in JSON only with v2); agent `HealBeforeTrainers` v2 (shown centers from delivered results, story threshold, partial re-arm), `healBeforeTrainersV2Text`; event gains optional `loaded`/`story`/`hurt`/`shown`, `weak` may be empty (v1's `weak: []` rejection test now rejects `trainers: []`); auto-talk keeps loaded trainers only; registry/presets/defaults/legacy; explainer `docs/explainers/heal-before-trainers-v2.html` mapped in FEATURE_EXPLAINERS; pending `experiments/heal-before-trainers-v2.json` (source.commit zeros, filled at landing); readiness row. Registry suffix indexes and server-off strings advanced in ~45 older tests (mechanical).
- b300 replay OFF reproduces the recorded v1 paragraph at 15195 byte for byte; ON fires at 14882 (ROXANNE) and 15198 (ROXANNE, TOMMY, MARC), both naming the RUSTBORO CITY POKéMON CENTER (2 map changes) shown at (16,38) in result 14717.
- Wiring mutation: `const v2=false` in withLowHpTrainerWarning turns the playGameTools test red (1 failed); restored (sha1 7d6eaa5d), green.
- Gates: `just lint` OK, `just build` OK, `just coverage`: agent 2917/2917 (97.21 st / 92.92 br / 97.7 fn / 99.17 ln), viewer 1425/1425 (95.09 / 91.04 / 93.85 / 97.7), python 2915 passed, gate lines 96.97 branches 92.50 functions 100.00. heal_trainers.py 100%.

## Surprises

- The worktree had no vendor submodule checkout and no mGBA binding; 210 Python failures and the mypy import error were environment, fixed by `git submodule update --init` and `just build-mgba`.

## Multi-Model Review Log

## Boy Scout Log
