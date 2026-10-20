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

- [ ] M1 heal-before-trainers-v2: RED, GREEN, gates, explainer, pending experiment, Claude + Grok review
- [ ] M2 gym-heal-warning-v1: RED, GREEN, gates, explainer, pending experiment, Claude + Grok review
- [ ] Sync with main, final gates, report b300 texts

## Session log

- Spawned 2026-10-20. Read brief, design, b300 seqs 14716/14717, 14880/14882, 15193/15195.
- Worktree setup: `git submodule update --init` (vendor at pin, `just verify-vendor` OK), gitignored `.env` copied from main, `just build-mgba` (source copied from main's `.cache/mgba/src`).
- M1 RED: pytest v2 cases plus b300 real RAM (fixture `env/tests/env/fixtures/heal-trainers-b300.json`, RAM windows only, states 14716/14880/15196); vitest `heal-before-trainers-v2.test.ts` (b300 replay over results 14698-15600, fixture `test-support/heal-before-trainers-b300.json.gz`) and `heal-before-trainers-v2-wire.test.ts` (playGameTools). Against HEAD's implementation: pytest collection error (no SWITCH_V2), vitest 2 files fail (state schema refuses `loaded`, missing exports).

## Surprises

## Multi-Model Review Log

## Boy Scout Log
