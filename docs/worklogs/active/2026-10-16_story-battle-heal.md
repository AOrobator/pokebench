# Low-HP warning v2: heal to full before any story battle

## Problem Statement

`low-hp-trainer-warning-v1` (landed 60f66178) warns only on Route 103, only for the rival, and only below half HP. Operator (the operator, 2026-10-16 2:43 PM EDT): "the low HP trainer warning should not be route specific. This is general game guidance" and "we need to do the heal before story trainer battles at any HP below max. And I want it to generalize ... that fix needs to go into the bundle." Coordinator brief: cover any unbeaten story or rival trainer on the map, new switch version, tests and the three reviews, ask for the merge slot.

## Skills Loaded

feature-switch, feature-explainer, execute-worklog, agent-observability, close-the-loop, pokebench-game-state.

## Architecture

New switch `low-hp-trainer-warning-v2` (guard, agent side, default OFF, needs `low-hp-trainer-warning-v1`). With it ON the v1 wrapper uses the v2 condition and records a `story_battle_warning` event instead of `low_hp_trainer_warning`. OFF: v1 exactly.

Story battles the game state can see today (pret/pokeemerald 731ad5bf):

| Battle | Map | Won flag (story field) | Present when | Starts by |
|---|---|---|---|---|
| Rival MAY/BRENDAN | ROUTE103 [0,18] | FLAG_DEFEATED_RIVAL_ROUTE103 0x82 (`rival_battle_won`) | rival object loaded (OBJ_EVENT_GFX_RIVAL_MAY_NORMAL 105 / RIVAL_BRENDAN_NORMAL 100) | talking (Route103_EventScript_Rival, trainerbattle_no_intro) |
| Gym Leader ROXANNE | RUSTBORO CITY GYM [11,3] | TRAINER_ROXANNE_1 flag 0x609 (`roxanne_defeated`) | Roxanne object loaded (OBJ_EVENT_GFX_ROXANNE 125) | talking (RustboroCity_Gym_EventScript_Roxanne, trainerbattle_single) |
| TEAM AQUA grunt | PETALBURG WOODS [24,11] | TRAINER_GRUNT_PETALBURG_WOODS flag 0x50A (`petalburg_woods_aqua_grunt_defeated`) | on the map (his object stays hidden by FLAG_HIDE_PETALBURG_WOODS_AQUA_GRUNT until the scene) | walking into the Devon researcher scene (coord events PetalburgWoods_EventScript_DevonResearcherLeft/Right, trainerbattle_no_intro) |

Condition: free field (overworld, not in battle, field controls unlocked), player party, one of the rows above unbeaten (flag explicitly false), and any party Pokémon (not an egg) below its max HP. Re-arm: whole party at full HP, another map, or that battle won.

## Invariants

- INV-1 v2 OFF = v1 byte-identical (paragraph, events, tools).
- INV-2 Fires only from the tool result's own game state.
- INV-3 Every sentence true when shown; numbers from the state.
- INV-4 No truncation; every hurt party member listed.
- INV-5 No timeline additions.

## Milestones

**M1 — low-hp-trainer-warning-v2**
- [x] RED: registry/presets/defaults/needs; condition per row (fires, not when won/unknown/locked/full HP/other map/not loaded); party list; text per row; re-arm; v2 OFF = v1; event schema; viewer Activity History + tail; factory path; pi delivery
- [x] COMMIT RED: `test(RED): low-hp-trainer-warning-v2 ...` (13 tests fail: unknown feature)
- [ ] GREEN + schema + legacy positional updates
- [ ] COMMIT GREEN; deletion receipts

**M2 — explainer, pending experiment, gates, review, land**
- [ ] Explainer + FEATURE_EXPLAINERS + README; pending experiment + readiness
- [ ] Gates; live viewer proof (isolated viewer)
- [ ] Claude, Grok, GPT LGTM on one frozen packet; merge slot; ff-only merge; report SHA

## Multi-Model Review Log

(none yet)
