# Worklog: heal-before-trainers-v1 (heal before an unbeaten trainer on the map)

Branch `claude/heal-before-trainers`, base main 558f2e76. Local only: no push, no PR, no remote.

## Problem Statement

The operator (2026-10-17): "I like the guidance to heal before trainer fights … I want to see what a simple V1 option would look like." Evidence: run `2026-10-17T13-15-36_qwen36-gpu1_e046`, seq 16360-16848: on ROUTE104 the model talked to the LASS at (31,24) (Lass Haley) with TORCHIC at 14/38 HP, Scratch ran out of PP mid-battle (0 PP from seq 16609), TORCHIC fainted (seq 16795) and the run whited out to OLDALE TOWN (seq 16828). The readout's generic battle-triage line ("Your TORCHIC has 14/38 HP (below half). Talking to the nurse at a POKéMON CENTER heals …") was there and was ignored; nothing said a trainer was right there or where the nearest heal was.

Coordinator brief: new bundle-only switch `heal-before-trainers-v1`, default off, pending experiment (not queued). On the free field, when an unbeaten trainer is on the current map (trainer flag clear, object loaded) and the party is weak, the tool result says so and names the nearest place that heals: a POKéMON CENTER the player has already entered, or MOM at home, in the game's own words and from game data. Weak = any party Pokémon fainted, the lead below half HP, or the lead's damaging moves out of PP. Status and items out of scope. Generalize low-hp-trainer-warning-v2's code rather than add a second path; v2 OFF byte-identical. Do not edit `experiments/fixed/bundle-v-control.json`. LANDING HOLD until exit-reachability-v1 lands (touches features.ts, play-preset.ts, events.ts/schemas, readout.py).

## Skills Loaded

feature-switch, feature-explainer, agent-observability, pokebench-game-state (plus the game-wording rule from `claude/game-text-rule`), execute-worklog, close-the-loop, experiment-queue.

## Game sources (pret/pokeemerald 731ad5bf at ~/dev/pokeemerald)

- Trainer objects: `SaveBlock1.objectEventTemplates` (+0xC70, 64 × 24 bytes; `struct ObjectEventTemplate`, script pointer at +0x10). A trainer's script starts with `trainerbattle` (SCR_OP_TRAINERBATTLE 0x5C, type byte, trainer id u16 at +2); `GetTrainerFlagFromScriptPointer` (src/battle_setup.c) reads that id and checks `TRAINER_FLAGS_START (0x500) + id`. Loaded objects: gObjectEvents (offscreen_objects._loaded).
- Move power: gBattleMoves (0x0831C898, 12 bytes per move, power at +1); damaging = power > 0.
- Healing places: every `*_PokemonCenter_1F` map runs `setrespawn HEAL_LOCATION_<TOWN>` on transition; its nurse says gText_WouldYouLikeToRestYourPkmn "We restore your tired POKéMON to full health." MOM (PlayersHouse_1F_EventScript_Mom, data/scripts/players_house.inc) heals via PlayersHouse_1F_EventScript_MomHealsParty ("I think you should rest a bit.") once FLAG_RESCUED_BIRCH is set, unless FLAG_HAS_MATCH_CALL is set and she registers first or gives the AMULET COIN, or VAR_LITTLEROOT_HOUSES_STATE_* is 4.
- `SaveBlock1.lastHealLocation` (+0x1C, WarpData): the town of the last POKéMON CENTER entered (SetLastHealLocationWarp).
- Battle words: sText_NoRunningFromTrainers "No! There's no running from a TRAINER battle!", sText_NoPPLeft "There's no PP left for this move!" (src/battle_message.c).

## Architecture

- Server (`heal-before-trainers-v1` in SERVER_FEATURES, default off): new state field `heal_before_trainers` (present only with the switch, so OFF state bytes are unchanged): loaded trainer objects on this map with trainer id and defeated flag, the power of each party move, `last_heal` map, the player's home 1F map and whether MOM heals now. The readout text is unchanged.
- Agent: `low-hp-trainer-warning.ts` becomes one rule list on one wrapper: v1 (rival below half) or v2 (story battles below full), plus the trainers rule when this switch is on. The trainers rule keeps run memory of POKéMON CENTERs entered (map names ending "POKEMON CENTER 1F", plus the save's last heal town) and finds the nearest healing place by fewest map changes over the game's map table (GET /pokebench/places). New event `heal_before_trainers_warning` (Activity History, SUPERVISOR; no timeline mark).

## Invariants

- INV-1 Switch OFF = today's v1/v2 byte-identical (paragraphs, events, tools, state JSON, readout).
- INV-2 Fires only from the tool result's own game state, on the free field.
- INV-3 Every sentence true when shown; names only places the player has been to; no trainer names before battle.
- INV-4 No truncation of model-facing text.
- INV-5 No timeline additions.

## Milestones

**M1 — RED**
- [x] Python `env/tests/env/test_heal_trainers.py`: trainer objects from templates/script/flags (e046's LASS, object 3, TRAINER_HALEY_1 604), field trainerbattle types only, loaded+visible only, move power, last heal, home by gender, MOM heals per her script, unreadable -> None, default-off server feature, state JSON key only with the switch and readout bytes unchanged.
- [x] TS `packages/agent/src/heal-before-trainers.test.ts` with fixture `test-support/heal-before-trainers-e046.json` (10 recorded tool-result states of e046, seq 6851-16828; heal_before_trainers replayed from each state's raw-RAM archive through heal_trainers.py with ROM script heads and move power from pokeemerald source, scratch twin.py): fires at seq 16287 (LASS (31,24), TORCHIC 14/38, OLDALE TOWN's POKéMON CENTER 4 map changes) and seq 16066 (RICH_BOY before Winston, 17/38); not-weak; no-trainer (OLDALE TOWN after whiteout; all beaten); fainted; out-of-PP (and SCRATCH 0 with EMBER 13 is not weak); re-arm; v2 skip of ROXANNE; OFF v1/v2 byte-identical with no map-table read; registry/presets; event schema and tail.
- [x] RED run: pytest collection error (no `pokebench_env.heal_trainers`), vitest 1 file failed (missing exports).
- [x] COMMIT RED

**M2 — GREEN**
- [ ] Implementation, schema, recorder, viewer Activity History, registry; deletion receipt.
- [ ] COMMIT GREEN

**M3 — explainer, pending experiment, measurement, gates, review**
- [ ] Explainer + FEATURE_EXPLAINERS; pending experiment + readiness row.
- [ ] Measurement across recent runs (fires, false positives) by raw-RAM replay.
- [ ] Gates; principles self-review; review (Claude, Grok, GPT), at most 2 rounds; sync main before the final round.
- [ ] Report reviewed head; LANDING HOLD until exit-reachability-v1.

## Multi-Model Review Log

(none yet)
