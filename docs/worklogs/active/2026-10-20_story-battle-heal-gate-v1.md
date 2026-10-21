# Story battle heal gate (`story-battle-heal-gate-v1`)

Status: M1 GREEN, gates pass; review next. Worktree `~/dev/pokebench-worktrees/story-battle-heal-gate-v1`, branch `claude/story-battle-heal-gate-v1`, from main 5ab3f577. The operator approved the gate at 8:53 PM ET 2026-10-20 ("yes i also want the gate built", then "the gate could also be useful for the gym"). Background design: scratch `2026-10-20_heal-respawn-sight.md` (heal-respawn-sight, approved 3:41 PM ET).

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
- [x] M1 GREEN: module, wiring, event, viewer, registry/presets/defaults, bundle arms.
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage` (90).
- [x] Explainer, FEATURE_EXPLAINERS, pending experiment, readiness row.
- [ ] Sync with main, Claude + Grok review (2 rounds max).

## Session Log

- 2026-10-20 ~9 PM ET: read the brief, design doc, CLAUDE.md files, skills; read 97a0 turns 150–160 and b300 fixtures. mgba binding copied from the main checkout's venv.

- RED: `packages/agent/src/story-battle-heal-gate.test.ts` (35 tests: 97a0 turn 157 exact text and event, confirm, other targets, descriptions/schema, press facing/turning/not-facing/no-A, 11 forced-battle and full-HP exclusions, egg and BRENDAN, navigate_to onto (9,3)/(10,4)/(11,3), semantic walks unchecked, b300 turn 501 with trainer-sight off and on, full-HP trainer-sight unchanged, gym sight-only/unavailable/clear, ROXANNE naming, GYM by location, OFF identity, factory wiring with a real RunRecorder, recorder/arm errors, registry, event schema) on a stub module: 35 failed / 0 passed. Fixture `packages/agent/test-support/story-battle-heal-gate-97a0.json.gz` (results 4191 and 4541 with states 4190 and 4540).

- COMMIT: `test: story-battle-heal-gate-v1 refuses 97a0 turn 157 and b300 turn 501 while the party is hurt (RED)` (29cb5919)

- GREEN: `story-battle-heal-gate.ts` (engagedAt, pressReaches, routeReaches, gateText, StoryBattleHealGate, askSight, withStoryBattleHealGate); navigation.ts `checkRoute` (gate first, one sight request, trainer-sight alone otherwise; `checkSight` takes the prefetched answer and the gate's confirm); low-hp-trainer-warning.ts `healArm` shared arm, `healPlaces` (nearestHeal = first), `healPlaceDescription` (healPlaceSentence unchanged), `HealBeforeTrainers.known`, `onGymMap`, exports; trainer-sight.ts exports `trainerLine`; play-wiring builds the arm and the gate; `story_battle_heal_gate` event, recorder, tail; viewer Activity History text, trace SUP, model; registry (guard, needs heal-before-trainers-v2), presets, LEGACY_ALL_ON off, DEFAULT_NEXT_RUN off; schema regenerated. 49 older registry tests advance their suffix index by one; experiment-vector filters exclude the switch. Bundle arms of bundle-v-control and bundle-cook-1h gain the switch (base false); open-goal-prompt test's bundle-only exclusion list gains it.
- Wiring receipts (scratchpad gate/mutation-*.txt): passing `undefined` instead of the gate to withStoryBattleHealGate fails the factory test (1 of 35); dropping `healGate` from withNavigation fails 5 of 35 (navigate_to refusals, b300 both modes, gym sight, factory). Restored, 35/35.
- Gates: `just lint` 0, `just build` 0, `just coverage` 0: agent 3065 tests (statements 97.27, branches 93.07, functions 97.58, lines 99.18), viewer 1446 (95.09 / 91.08 / 93.86 / 97.70), Python 3015 (lines 97.11, branches 92.67, functions 100). story-battle-heal-gate.ts 98.85 / 93.59 / 100 / 99.21. viewer experiment-cli "pins the agent and env sources" failed once under load in a full run and passed alone and in the coverage run.
- Explainer `docs/explainers/story-battle-heal-gate-v1.html` (`just pages-check` clean; 8791 copy at runs/mockups/story-battle-heal-gate-v1/ returns 200; 1280 and 375 checked: no page overflow, figures scroll in their boxes). Pending `experiments/story-battle-heal-gate-v1.json` (incumbent = bundle-v-control bundle arm with the switch off, activation STARTER_CHOSEN, no queuePosition, source = branch base 5ab3f577), readiness row.

- COMMIT: `feat: story-battle-heal-gate-v1 does not start a trainer battle that cannot be run from while the party is hurt (default off, bundle arm)` (460f5813)
- Sync: `git merge main` (24648e12: yes-no-answer-readout-v1, lane leases, probes viewer). 25 conflicts, all registry collateral: took main's side, re-appended this switch after yes-no-answer-readout-v1 (registry, presets, defaults, FEATURE_EXPLAINERS, Activity History text, bundle arms, readiness, README) and advanced the older suffix indexes once more. Schema regenerated (no diff). Gates on the merged tip: `just lint` 0, `just build` 0, `just coverage` 0: agent 3066 (97.27 / 93.06 / 97.58 / 99.18), viewer 1501 (95.23 / 91.08 / 94.15 / 97.80), Python 3166 (lines 97.11, branches 92.69, functions 100). `just test` first run: 2 viewer failures from the lost Activity History case (restored), then green in the coverage run.

- COMMIT: `merge: main (yes-no-answer-readout-v1, lane leases, probes viewer) into story-battle-heal-gate-v1; registry collateral` (2bf0037e)
- Self-check before review: the confirm-argument wrapper kept press's open schema open (only confirm added); test added. 35/35.

- COMMIT: `fix: story-battle-heal-gate-v1 leaves auto-talk's own calls ungated; pending experiment matches the current bundle arm (review round 1)`
- Sync 2: `git merge main` (912a6954: field-move-gates-v1, frontier recordings). navigation.ts conflict resolved by keeping main's withNavigation options and adding the healGate spread; registry collateral as before; experiment incumbent rebuilt from the current bundle arm. Gates on the merged tip: lint 0, build 0, coverage 0: agent 3083 (97.18 / 93.00 / 97.60 / 99.17), viewer 1510 (95.25 / 91.09 / 94.19 / 97.81), Python 3470 (lines 97.21, branches 92.86, functions 100); gate module 98.88 / 93.71 / 100 / 99.23. Schema unchanged by regeneration.

## Surprises
- b300's turn-501 route runs into HIKER MARC's template tile (1,6) (he is not loaded at seq 15233), so the gate also says the walk would end next to him at (1,7). True by the planner's route; the sight at (1,9), step 12, comes first.
- In the refusal's observation the existing warnings (story battle, heal before trainers) still fire by their own arms; in 97a0 they had already fired at 4539/4509, so a live run would not repeat them.
## Multi-Model Review Log

### Round 1 (packet 24648e12..e24448b4, diff SHA-256 c157e041…a9e7)
- Claude lane: Claude CLI default and ~/.claude-review logins both expired ("OAuth session expired and could not be refreshed"); Cursor Claude Opus 5.5 and Sonnet 5 at their usage limit (until 11/17). Per the operator's standing word (memory claude-review-lane, 2026-10-16) the lane ran as a read-only Claude subagent (Plan agent): VERDICT: BLOCKING. B1 (Fix): auto-talk (bundle arm) calls the wrapped press/navigate_to, so the gate refused auto-talk's own A and its walk, contradicting the declared non-goal and making auto-talk report "pressed A"/"talked". Also: principles rows PB8/PB11 mislabeled (fixed); dialogue-safe-batches note (hardening, switch off in both bundles; follow-up).
- Grok lane (cursor-grok-4.5-high): VERDICT: LGTM. Non-blocking: pending experiment incumbent lacked yes-no-answer-readout-v1 after the merge (Fix: incumbent rebuilt from the current bundle arm, test added); target with position null fails open (rebut: a free-field state carries a position under live-player-position-v1; hardening follow-up).
- Fix batch: auto-talk calls (AUTO_TALK_ID_PREFIX, exported from auto-talk.ts) pass through the wrapper and checkRoute; tests for auto-talk press/target/walk; bundle/experiment consistency test. 37/37.

