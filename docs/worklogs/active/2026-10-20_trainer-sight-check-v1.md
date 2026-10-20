# Trainer sight check (`trainer-sight-check-v1`)

Status: M1 GREEN, gates pass; review next. Milestone 5 of `heal-respawn-sight` (scratch plan approved by the operator 3:41 PM ET 2026-10-20). Worktree `~/dev/pokebench-worktrees/trainer-sight-check-v1`, branch `claude/trainer-sight-check-v1`, from main 6c88d424.

## Ask

b300 (`2026-10-20T13-54-28_qwen36-gpu0_b300`, whole-map-pair-1h bundle arm) at seq 15214, the model's stated belief: "There is a YOUNGSTER at (3, 9) that I can battle, but I am low on health. I will just go to ROXANNE directly." Its navigate_to at turn 501 (seq 15231, to (5,2) on map 11/3 from (5,15)) walked up column x=1 into YOUNGSTER TOMMY's sight at (1,9). Seven seqs after TOMMY was beaten, HIKER MARC spotted it from the same tile (seq 15586), and it blacked out. The operator asked for something deterministic: before navigate_to walks, detect that the route enters an unbeaten trainer's line of sight and have the model confirm. Its own switch.

## Game grounding (pret/pokeemerald 731ad5bf, ROM sha1 f3ae0881)

- `CheckForTrainersWantingBattle` (src/trainer_see.c) runs from `ProcessPlayerFieldInput` on every frame field input is processed, for each active object whose `trainerType` is `TRAINER_TYPE_NORMAL` (1) or `TRAINER_TYPE_BURIED` (3). `TRAINER_TYPE_SEE_ALL_DIRECTIONS` (2) is not checked there.
- `CheckTrainer`: skips a trainer whose flag is set (`GetTrainerFlagFromScriptPointer`: `TRAINER_FLAGS_START` 0x500 + the id in the `trainerbattle` script head). A double-battle script (types 4, 6, 7) needs two party Pokémon that can battle (`GetMonsStateToDoubles_2`: not an egg, HP above 0).
- `GetTrainerApproachDistance`: NORMAL looks only along `facingDirection`; BURIED tries all four. The player must be on the trainer's row/column, 1..`trainerRange_berryTreeId` tiles away.
- `CheckPathBetweenTrainerAndPlayer`: every tile strictly between must have no collision flag other than "outside movement range" (`GetCollisionFlagsAtCoords`: map collision bits, a tile outside the map, a directionally impassable side checked against the trainer's own tile behavior and the next tile's, an elevation mismatch with the trainer's elevation, any other active object at its current or previous tile with a compatible elevation). On the player's tile, with the movement range zeroed, `GetCollisionAtCoords` must reach `COLLISION_OBJECT_EVENT` (the player): it fails on impassable or elevation mismatch first.
- Positions: `SaveBlock1.objectEventTemplates` (+0xC70, 64 x 24 bytes: x,y s16 at +4/+6, elevation +8, movementType +9, movement range +0x0A, trainerType +0x0C, sight +0x0E, script +0x10, hide flag +0x14). Loaded objects: `gObjectEvents` 0x02037350, 16 x 0x24 (trainerType +7, localId +8, map +9/+0x0A, currentElevation +0x0B low nibble, initial/current/previous coords +0x0C/+0x10/+0x14 with MAP_OFFSET 7, facing +0x18 low nibble, range +0x19, sight +0x1D).
- Facing of an object that is not loaded: `gInitialMovementTypeFacingDirections`, plus every direction its movement type turns to (LOOK_AROUND, ROTATE_*, FACE_X_AND_Y, the wander and walk types). A moving type can stand anywhere in its template's movement range.
- The game text a trainer battle shows when the player picks RUN: `sText_NoRunningFromTrainers` (src/battle_message.c) "No! There's no running\nfrom a TRAINER battle!".

## Design

- Server: `env/pokebench_env/trainer_sight.py` and `POST /pokebench/trainer-sight` (installed beside `/pokebench/places`, under the memory lock). The agent posts the planned route's tiles; the server reads the map's templates, the loaded objects, the trainer flags and the live map grid and returns every unbeaten trainer that can see a route tile, with its object id, sprite, tile, facing, sight range, whether it is loaded, and the first route tile it sees. Not a server feature: the endpoint changes nothing the model sees and is only called with the switch on.
- Agent: before the first press of a model's own navigate_to call (not navigate_to_target or other `executeChecked` callers), the planned path's tiles are checked. A sighting refuses the walk with the trainer, the tile, the game's "No! There's no running from a TRAINER battle!" and the party HP, then the usual observation. `confirm_trainer_sight: true` walks normally. If the check cannot be made (server error, not the same map), the walk runs and the event says unavailable.
- Each check is one `trainer_sight_check` event (Activity History and the raw-event inspector; no timeline mark).
- Tool description sentence, argument and system-prompt sentence only with the switch on.

### Press is not checked (decision)

A press is not checked. (1) A direction press moves at most one tile per button, toward a tile the model chose with the trainer in its own Field objects list and local map; b300's walk into both sight lines was one navigate_to call over 22 planned steps, which is where the model could not see the consequence. (2) Refusing a press needs a confirm argument on the most-used tool, which changes every press schema and makes deliberate approaches (walking up to a trainer to battle it) cost a second call. (3) Re-planning for presses would duplicate the planner's view of automatic running and multi-button batches. The brief marks press optional; navigate_to is required.

## Invariants

- OFF: navigate_to schema, description, system prompt, results and events byte for byte today's; the endpoint is never called.
- The sight rule is the game's (`CheckTrainer`), tested on b300 raw RAM: the turn-501 route is flagged at (1,9) for TOMMY and MARC.
- Text in the game's words; no story goal, no route advice, no trainer name the game has not shown (sprite kind and object id only). Never clipped.

## Milestones

- [x] M1 RED: Python reader/sight tests (synthetic + b300 raw-RAM fixture) and agent tests (refusal text, confirm, OFF identity, event, factory wiring), failing.
- [x] M1 GREEN: server module and endpoint, agent check, events, recorder, viewer activity text, registry/presets/defaults.
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage` (90).
- [x] Explainer `docs/explainers/trainer-sight-check-v1.html`, FEATURE_EXPLAINERS, pending `experiments/trainer-sight-check-v1.json`, readiness note.
- [ ] Sync with main, Claude + Grok review (2 rounds max).

## Session Log

- Spawned 2026-10-20 afternoon ET. Read trainer_see.c, event_object_movement.c collision helpers, b300 events 15200-15600 and raw RAM 6600 (seq 15233): TOMMY is loaded (object 3, (3,9), facing WEST, sight 3); MARC (object 5, template (1,6), FACE_DOWN, sight 3, range 1x1) is not loaded; JOSH (object 2) is beaten.

- RED: `env/tests/env/test_trainer_sight.py` (22: synthetic sight rule, endpoint, b300 raw RAM with the operator's ROM) and `packages/agent/src/trainer-sight.test.ts` (17: b300 turn 501 refusal text, TOMMY-beaten-from-(1,9), confirm, clear/unavailable/double, OFF schema/description/prompt, withNavigation and playGameTools wiring, client, registry, event) on stub modules: Python 21 failed / 1 passed (the switch id), agent file fails to load (stub parse throws). Fixtures: `env/tests/env/fixtures/trainer-sight-b300.json` (RAM windows only, from raw-ram 6600), `packages/agent/test-support/trainer-sight-b300.json` (state 15233 and the server replies).

- COMMIT: `test: trainer-sight-check-v1 sight rule, endpoint and navigate_to refusal from b300 turn 501 (RED)` (e07a6e93)
- GREEN: `env/pokebench_env/trainer_sight.py` + `POST /pokebench/trainer-sight` (observation.py), agent `trainer-sight.ts`, navigate_to check (`checkSight`, `routeTiles`, confirm argument and description sentence only with the port), `StateWatcher.trainerSight`, playGameTools ports, `trainer_sight_check` event/recorder/tail, viewer Activity History text, model, trace category, registry/presets/defaults, system-prompt section, schema regenerated. Registry suffix indexes in older tests advance by one; LEGACY_ALL_ON keeps the switch OFF; experiment-vector filters exclude it.
- Wiring mutation: dropping `trainerSight:sight` from withNavigation fails 8 of 19 trainer-sight tests (refusals, confirm, clear/unavailable/double, withNavigation, playGameTools); restored (sha1 67584e35 identical) and 19/19.
- Gates: `just lint` 0, `just build` 0, `just coverage` 0: agent 2916 tests (statements 97.17, branches 92.91, functions 97.56, lines 99.15), viewer 1427 (95.08 / 91.04 / 93.85 / 97.70), Python 2930 (lines 97.02, branches 92.59, functions 100); trainer_sight.py and trainer-sight.ts 100%. `src/serial-comparison.test.ts` "real hung child" (100 ms watchdog) failed once under machine load 13-18 and passed alone and on the rerun; unrelated to this switch.
- Env setup in this worktree: vendor submodule initialised from the main checkout's clone (`--reference`, pinned bbab97ad), mgba binding copied from the main checkout's venv (same as `just build-mgba` output), `.env` copied (gitignored).
- Explainer `docs/explainers/trainer-sight-check-v1.html` (`just pages-check` clean), FEATURE_EXPLAINERS, README entry, card and server tests. Pending `experiments/trainer-sight-check-v1.json` (activation ROUTE_102, no queuePosition, source pinned to e07a6e93 until landing), readiness row.

## Surprises

- The planner routes through MARC's template tile (1,6): MARC is not loaded at seq 15233, so the map grid shows no object there. Out of scope here; the sight check flags (1,9) before that.
- b300's state at seq 15569 (after TOMMY) already has MARC loaded at (1,8), walking up: the game spotted the player on the first frame field input resumed, so no tool call could have come between the battles. The "from (1,9)" text is therefore a what-if on seq 15233's RAM with TOMMY's flag set.

## Multi-Model Review Log

## Boy Scout Log

## Multi-Model Review Log (round 1)

- Packet: base ee95b866 (main), head e2febce2 (merge of main), diff sha256 3c29f644..., frozen boundary and principles adherence under runs/reviews/trainer-sight-check-v1/.
- Claude lane: `claude -p` failed ("OAuth session expired"); Cursor claude-opus-5-thinking-high and claude-sonnet-5-thinking-high failed (Cursor usage limit). Standing fallback: a fresh read-only Claude (Opus) subagent on the same packet.
- Grok lane (cursor-grok-4.5-high): BLOCKING, two findings, both accepted as real (each under-warns):
  1. Templates that are not loaded were treated as line-of-sight blockers; DoesObjectCollideWithObjectAt walks only active gObjectEvents. Fixed: only loaded objects block.
  2. Moving types spawn with range 0 raised to 1 (sMovementTypeHasRange); unloaded wanderers used the raw nibble. Fixed in `_area`.
  Tests: template-blocker test flipped, range-bump test added; test_trainer_sight 25/25, trainer_sight.py 100%. b300 texts unchanged.
- Claude lane (fallback Opus subagent) on the round-1 packet: VERDICT: LGTM. Accepted low finding: an empty error message made `reason` "" (schema needs minLength 1) and `record` is outside the try, so navigate_to would throw; now a fallback reason, with a test. Others: template blockers (already fixed in 5cfbf73b); player-tile object-elevation check missing (errs toward refusing), refusals count as navigation-failure evidence, whole planned route checked: informational, no change.

## Multi-Model Review Log (round 2)

- Gates on f99cdc48: lint 0, build 0, coverage 0 (agent 2916, viewer 1427, Python 2931; Python lines 97.02 / branches 92.59 / functions 100).
- Grok (cursor-grok-4.5-high) on the fix delta e2febce2..f99cdc48: VERDICT: LGTM (both findings fixed, empty-reason fallback sound, no new bug).
- Claude lane: VERDICT: LGTM on the round-1 packet; its one accepted fix is in the delta Grok re-checked.
- Status: ready for the coordinator's landing slot (sync with main again, repin experiments source.commit to the merge SHA, bundle wiring in M6).
