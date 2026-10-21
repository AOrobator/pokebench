# Story battle heal gate (`story-battle-heal-gate-v1`)

Status: M1 in progress. Worktree `~/dev/pokebench-worktrees/story-battle-heal-gate-v1`, branch `claude/story-battle-heal-gate-v1`, from main 5ab3f577. The operator approved the gate at 8:53 PM ET 2026-10-20 ("yes i also want the gate built", then "the gate could also be useful for the gym"). Background design: scratch `2026-10-20_heal-respawn-sight.md` (heal-respawn-sight, approved 3:41 PM ET).

## Ask

Run 97a0 (`2026-10-20T20-26-22_qwen36-gpu1_97a0`, read-only):

| Seq | Turn | What happened |
|---|---|---|
| 4539 | 156 | story_battle_warning added to the navigate_to result: "SUPERVISOR: A story battle is on this map: your rival MAY, at (10,3). … Your party is not at full HP: TORCHIC 5/22. … Heal to full before this battle: …" (delivered in result 4541, state 4540) |
| 4549 | 157 | navigate_to_target {"kind":"object","local_id":2} (MAY) |
| 4671 | 157 | RIVAL_BATTLE_STARTED |
| 4685 | 157 | result: "PKMN TRAINER MAY would like to battle!", TORCHIC 5/22 vs MUDKIP 20/20 |
| 4761 | 159 | battle_outcome lost |
| 4780 | 159 | blackout activity at 8:44:21 PM ET; ₽3000 → ₽1500 |

Run b300 turn 501 (seq 15231): navigate_to (5,2) on map 11/3 (ROXANNE's tile) from (5,15) at TORCHIC 11/35, route through TOMMY's and MARC's sight.

Build a gate: while any party Pokémon (not an egg) is below max HP, refuse an action that would start an unbeaten trainer battle that cannot be run from: talking to the Route 103 rival or a gym trainer/leader (navigate_to_target, navigate_to onto the approach tile facing them, A while facing them), and in gyms a navigate_to route crossing an unbeaten gym trainer's sight (reusing trainer-sight-check-v1's server sight). confirm: true proceeds. Never block a battle the game forces. Record each decision; no timeline mark. Off byte for byte.

## Design

- Module `packages/agent/src/story-battle-heal-gate.ts`.
- Engaged when the state is the free field (started, overworld, not in battle, field controls unlocked, player's party), every party Pokémon (not an egg) reads its HP, one is below max, and the map has a covered unbeaten opponent: the Route 103 rival (FLAG_DEFEATED_RIVAL_ROUTE103 clear, rival object loaded) or, on a map whose game name contains GYM, every trainer the server lists in heal_before_trainers (trainerbattle script, flag clear; the Gym Leader named when it is ROXANNE).
- navigate_to_target: an object target that is a covered opponent. press: the first A, after leading directions that only turn toward an adjacent opponent, faces a loaded opponent. navigate_to (the model's own call, at its first planned route): the route reaches an opponent's tile (stops next to it facing it) or ends next to one with its last step toward it; on a GYM map, an unbeaten trainer can see a route tile (one POST /pokebench/trainer-sight).
- With trainer-sight-check-v1 on, one server call serves both. When the gate refuses, it is the only refusal (its text lists every sighting trainer-sight would); confirm: true then also confirms the sightings it listed. When the gate does not trigger, trainer-sight acts as today.
- Heal places: heal-before-trainers-v2's list (centers entered, the last heal location's center, centers a delivered result listed as an exit, home while MOM heals), all of them nearest first; shared with that switch's arm.
- Event `story_battle_heal_gate` per checked call while engaged (Activity History, raw-event inspector); no timeline mark.

## Milestones

- [x] M1 RED: gate tests (97a0 turn 157, b300 turn 501, press, navigate_to approach, forced-battle exclusions, confirm, sight interaction, OFF identity, factory wiring, event).
- [ ] M1 GREEN: module, wiring, event, viewer, registry/presets/defaults, bundle arms.
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage` (90).
- [ ] Explainer, FEATURE_EXPLAINERS, pending experiment, readiness row.
- [ ] Sync with main, Claude + Grok review (2 rounds max).

## Session Log

- 2026-10-20 ~9 PM ET: read the brief, design doc, CLAUDE.md files, skills; read 97a0 turns 150–160 and b300 fixtures. mgba binding copied from the main checkout's venv.

- RED: `packages/agent/src/story-battle-heal-gate.test.ts` (35 tests: 97a0 turn 157 exact text and event, confirm, other targets, descriptions/schema, press facing/turning/not-facing/no-A, 11 forced-battle and full-HP exclusions, egg and BRENDAN, navigate_to onto (9,3)/(10,4)/(11,3), semantic walks unchecked, b300 turn 501 with trainer-sight off and on, full-HP trainer-sight unchanged, gym sight-only/unavailable/clear, ROXANNE naming, GYM by location, OFF identity, factory wiring with a real RunRecorder, recorder/arm errors, registry, event schema) on a stub module: 35 failed / 0 passed. Fixture `packages/agent/test-support/story-battle-heal-gate-97a0.json.gz` (results 4191 and 4541 with states 4190 and 4540).

## Surprises
## Multi-Model Review Log
