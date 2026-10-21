# Story battle heal first line (`story-battle-heal-first-v1`)

Status: M1 in progress. Worktree `~/dev/pokebench-worktrees/heal-first-line-v1`, branch `claude/heal-first-line-v1`, from main 900a5c47. The operator asked for this line in both arms at 10:43 PM ET on 2026-10-20 ("the heal first line needs to be in both control and the bundle"). Background design only: scratch `2026-10-20_heal-respawn-sight.md`.

## Evidence

- Run 97a0 (`2026-10-20T20-26-22_qwen36-gpu1_97a0`), turns 150–160: result 4541 (turn 156) at TORCHIC 5/22 on ROUTE103 with MAY loaded at (10,3); turn 157 navigate_to_target MAY, whiteout at seq 4780. The boy (YOUNGSTER sprite) on ROUTE101 said at turn 147 (dialogue_auto_advance 4095): "There's a POKéMON CENTER in OLDALE TOWN right close by."
- Probe ledger `runs/probe-ledgers/story-battle-heal-first-20261020` (16 per arm, recorded 97a0 features with gym-heal-warning-v1 off): arm `first` inserted, right after the result's first line "Read from game memory, always true:", the line
  `TORCHIC has 5/22 HP. MAY's battle cannot be run from, so heal before talking to her. A boy on ROUTE101 told you: "There's a POKéMON CENTER in OLDALE TOWN right close by." OLDALE TOWN is the SOUTH edge of this map.`
  Walking to MAY 13/16 → 4/16 (p 0.004); heading south 0 → 11 (p<0.001).
- Run b300 (`2026-10-20T13-54-28_qwen36-gpu0_b300`) seq 14882: entering RUSTBORO CITY GYM at TORCHIC 25/33, ROXANNE not loaded (out of view at (5,2)); the latest heal line heard was MOM's "I think you should rest a bit." (turn 315, seq 7837).

## Design

- Switch `story-battle-heal-first-v1`, guard group, no dependency; on in BOTH arms of bundle-v-control, bundle-cook-1h and whole-map-cook-1h (onInBoth, base.features true).
- Module `packages/agent/src/heal-first.ts`, wrapper outermost in `playGameTools`, so the line is the first line of every game-tool result; with harness-trust-v1 on it sits right under the header "Read from game memory, always true:" (the probed position).
- Fires on a result whose own state is the free field (started, overworld, not in battle, field controls unlocked, player's party), every party Pokémon (not an egg) readable, one below max HP, and an unbeaten story battle on the current map:
  - Route 103 rival (FLAG_DEFEATED_RIVAL_ROUTE103 clear) whose object is loaded or whom the readout's own Story characters line places here (the map's object list, FLAG_HIDE_ROUTE_103_RIVAL respected).
  - ROXANNE in RUSTBORO CITY GYM (her trainer flag clear; her map object has no hide flag, so map and flag stand alone).
  - The Petalburg Woods TEAM AQUA grunt (flag clear; map and flag, as low-hp-trainer-warning-v2).
- Words, one line: each hurt Pokémon "X has a/b HP."; "<OPPONENT>'s battle cannot be run from, so heal before talking to <him/her>." (grunt: "heal before he stops you on the forest path"); the latest delivered field page naming a POKéMON CENTER, or MOM's heal line, quoted with speaker and map; the exit of this map (map table connection or warp) that leads to that place.
- Pronouns from game data: the rival is whichever rival graphics the game chose by checkplayergender (Common_EventScript_SetupRivalGfxId), its trainer gender from src/data/trainers.h (TRAINER_MAY_ROUTE_103_* F_TRAINER_FEMALE, TRAINER_BRENDAN_ROUTE_103_* male); TRAINER_ROXANNE_1 F_TRAINER_FEMALE; TRAINER_GRUNT_PETALBURG_WOODS male. One shared table used by this line and by the gate's pronoun.
- Fallback when no heal line was heard: lines 1 and 2 only.
- Gate (story-battle-heal-gate-v1): its refusal passes through the same outermost wrapper, so it leads with the same line; gate words otherwise unchanged.
- Event `heal_first_line` per line delivered (Activity History, raw inspector); no timeline mark.
- Off: no wrapper; byte for byte today's.

## Milestones

- [x] M1 RED: line at 97a0 result 4541, b300 result 14882, fallback, conditions, gate refusal leads, event, OFF identity, config (26 tests in heal-first.test.ts; fail without the module).
- [x] M1 GREEN: module, wiring, event, viewer, registry, configs (onInBoth).
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage` (90).
- [x] Explainer, FEATURE_EXPLAINERS, pending experiment, readiness row.
- [ ] Sync with main, Claude + Grok review (2 rounds max).

## Session Log

- 2026-10-20: worklog created.
- RED: heal-first.test.ts (26 tests) + test-support/heal-first-dialogue.json (97a0 4095/4098, b300 7837/7839). COMMIT: `test: story-battle-heal-first-v1 leads 97a0 result 4541 ... (RED)` (2e6467be).
- GREEN: heal-first.ts, heal_first_line event + schema, recorder, tail, viewer Activity History, registry/presets/defaults, gate pronoun from the shared table, onInBoth in bundle-v-control, bundle-cook-1h, whole-map-cook-1h (base.features true; control base file and sha256 unchanged, onInBoth is outside its comparison), pending experiments/story-battle-heal-first-v1.json, explainer, readiness row. Index/filter updates in existing registry tests (one more switch at the end).
- Tests: agent 3109 passed (204 files), viewer 1518 passed (103 files), python 3470 passed. Coverage: agent stmts 97.21 / branches 93.05 / funcs 97.68 / lines 99.18; viewer 95.26 / 91.07 / 94.24 / 97.83; python lines 97.21, branches 92.86, functions 100 (floor 90). heal-first.ts 98.92 / 96.49 / 100 / 100. Lint, build, schema fresh; fixed-run check passes for all three definitions from this worktree.
- Replay (scratch replay.mjs over the real events): 97a0 result 4541 gives the probed line exactly (first fires at result 4275, turn 149); b300 result 14882 gives the ROXANNE line; b300 15222 (turn 500) gives it at 11/35.
- Explainer checked in a real browser (desktop and phone width); map figure widened so its notes are not clipped.

