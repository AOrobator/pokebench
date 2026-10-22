# Frontier report fixes (three switches)

Operator request: The operator, via the project coordinator (2026-10-22, 3:21 PM New York): start fixes for the items in `runs/reports/run-analysis/2026-10-22_holistic-frontier` and the 10/22 status check that were not started, without holding up the gym loop. Each fix behind its own switch, default off and on in the bundle arm, with a themed explainer in Reports. Reviewers: Claude + GPT + a fallback (no Grok). Land through the board.

## Re-check of main (632089f43)

| Item | State on main | Evidence |
|---|---|---|
| (4) Pokédex page "not ready" | Done: `caught-dex-input-v1` is in the `switches` (bundle-on) list of bundle-v-control-2h, bundle-v-control, bundle-cook-1h, glm53-flash-4h and whole-map-pair-2h | recipe JSON |
| (5) Stale lab Story goal | Done: `stale-story-goal-v2` is on in both arms of the current Qwen recipes; 0 "LAB" Story goal lines after RECEIVED_POKEDEX in the 20 Qwen runs since 10-21 evening. Round 36's f28d had v2 off | scan of tool_result text |
| (1) Gym "walking away" note | Fixed in the bundle by `gym-evidence-v1` (Dad's "POKéMON GYM in RUSTBORO CITY" resolves to the gym). All 6 runs with a gym note were control. The bundle still fires the note inside town buildings: Mom's "Well, this is LITTLEROOT TOWN." inside the player's house (6bc3, 13bf, 4844, e0e6, f3b2, 2e93) | story_goal_away events |
| (2) H7, two names for map 1/3 | Open: navigate_to_target's "Current map:" line prints the map-table name (`LITTLEROOT TOWN MAYS HOUSE 2F`) while everything else prints the displayed name (`PROF. BIRCH'S HOUSE 2F`) | 47c3 s4776; 4b5d, 3df6 |
| (3) H8, GLM Route 101 ledge pocket | Open: GLM recipe has full-map-navigation-v1 off; the bounded planner finds no route inside its 15x15 window from (7,7) and stops, for navigate_to and navigate_to_target alike | f3b2 s3217, s7624 |

## Switches

1. `away-note-buildings-v1` (item 1). harness-trust's walk-away SUPERVISOR note is not counted while the player is in a building of the place the Story goal names: a map with no edge connections whose doors, followed through other maps without edge connections, lead out only to that place. Off: today's note.
2. `current-map-display-name-v1` (H7). navigate_to_target's "Current map:" line uses the name the readout's Location line shows (`location_display`), the same name every other line uses. Off: the map-table name.
3. `window-escape-route-v1` (H8). Server: the state carries the whole current map (`map_grid`) without changing the readout. Agent: when the bounded planner finds no route inside the 15x15 window, navigate_to plans over the whole current map for the rest of that call, still at most 8 ordinary button attempts. Its description gains one sentence. Off: today's state, description and refusal.

Each: default off; on in the bundle arm (`switches`) of the current recipes; pending experiment entry; explainer.

## Invariants

- INV-1 OFF parity for each switch (bytes of results, descriptions and state JSON).
- INV-2 No walkthrough hints; model-facing words are the game's or plain observable facts.
- INV-3 window-escape never changes the readout text; the escape route uses the same planner rules (ledges, one-way, elevation, triggers, people) over the whole map.

## Milestones

**M1 — away-note-buildings-v1** (RED commit 263f1e644)
- [x] RED tests (house 1F/2F with Littleroot goal, gym with Rustboro goal, Mr. Briney's house with a Rustboro goal still fires, OFF parity, wiring): 5 failing, OFF cases passing
- [x] GREEN: `buildingOf` in harness-trust.ts, WalkAway(reachable, buildings), TrustOptions.buildings wired in play-wiring.ts; wiring deletion turned 1 test red, restored

**M2 — current-map-display-name-v1**
- [x] RED tests (display name used; OFF parity against 47c3 result 4776; fallback; registry): 1 failing
- [x] GREEN: semantic-navigation.ts Current map line reads location_display when ON

**M3 — window-escape-route-v1**
- [x] RED tests (server map_grid with readout unchanged; f3b2 pocket state escapes; OFF parity against f3b2 result 3217; description; wiring): agent 4 failing, Python 1 failing
- [x] GREEN: rerender full_map_enabled when either switch is on; navigationTool `windowEscape` port switches the call to whole-map planning when the local plan is null; WINDOW_ESCAPE_SENTENCE in the description; wiring deletion turned 4 tests red, restored. Registry-tail indexes shifted in 72 test files (+3 switchable, +1 server); group counts observation 89, guidance 87
- Tests after GREEN: agent 4749 passed (serial-comparison hung-child timing test flaked once under load, passed alone), viewer 1780 passed, Python new + rerender 15 passed

**M4 — Explainers, recipes, experiments, gates, review, landing**
- [ ] Explainers (3), FEATURE_EXPLAINERS, pending experiments, readiness entries
- [ ] Bundle arm on in current recipes
- [ ] Gates: lint, build, coverage
- [ ] Review: Claude, GPT, fallback
- [ ] Land via board, viewer restart, live check

## Session Log

- 2026-10-22 3:50 PM: registry entries for the three switches added with the RED tests (registry-tail test indexes fixed in GREEN). Fixtures: test-support/window-escape-f3b2.json, test-support/current-map-display-47c3.json.

## Surprises

## Multi-Model Review Log
