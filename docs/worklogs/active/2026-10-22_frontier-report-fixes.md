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
- [x] Pending experiments (experiments/<id>.json, unqueued, source commit ab94f79cd until the landing SHA) and readiness entries
- [x] Explainers (3, themed, pages-check clean, headless desktop/phone screenshots), FEATURE_EXPLAINERS, Reports copies under runs/reports/run-analysis/2026-10-22_<id>/
- [x] Bundle arm on in bundle-v-control, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, bundle-v-control-2h, glm53-flash-4h (frontier-report-fixes-bundle.test.ts); 4 older recipe tests given the three ids
- [x] Gates: lint 0, build 0, coverage 0 — agent 4763 tests (97.3 stmts / 93.32 branches / 97.79 funcs / 99.2 lines), viewer 1787 (95.48 / 91.45 / 94.44 / 97.97), Python 3978 passed, 96% total
- [x] Review: Claude LGTM rounds 1-2, fallback LGTM rounds 1-2, GPT BLOCKING round 2 on experiment metadata (fixed in daa4ca9e5); The operator 4:55 PM New York: "just land ur changes" (no round 3)
- [x] Landed: board slot 4:56 PM, `git merge --ff-only` → main daa4ca9e5; `pnpm -r build` then `just test` on main 0 (agent 4820, viewer 1794, Python 4011); `just viewer-main` → 8790 at daa4ca9e5, PPID 1 (launchd), 1 live gameplay process kept; explainers 200 on 8790 /explainers/, on 8791 and on Tailscale Reports (?open=2026-10-22_<id>)

## Session Log

- 2026-10-22 3:50 PM: registry entries for the three switches added with the RED tests (registry-tail test indexes fixed in GREEN). Fixtures: test-support/window-escape-f3b2.json, test-support/current-map-display-47c3.json.

## Surprises

- Explainer pass found H7's "map 1/3 is two houses" thought predates result 4776 and cites the OBSERVED INSTRUCTION MEMORY block, which printed MAYS HOUSE 2F five times; current-map-display-name-v1 now also renames that block's map column (tests in current-map-display-name.test.ts).
- window-escape-route-v1's description wrongly said out-of-window goals were unchanged; fixed to say only goals with no whole-map route are refused as before.
- Python and TS registry-tail tests shift with each appended server switch (13 Python files, SERVER_FEATURES count 78).

## Multi-Model Review Log

- Round 1 (packet f7a661f5, sha256 25720a2e…): Claude CLI LGTM (non-blocking: navigate_to_target copy); fallback subagent LGTM (same copy note, toContain loosening); GPT (Codex CLI gpt-5.6-sol) BLOCKING: (1) experiment pins at ab94f79 lacked the memory-column behavior, (2) new tests too costly (30 s timeout, whole map table, repeated preset parsing), (3) exact prefix order check loosened. All three fixed: pins to b107f7c05, small Littleroot place graph and no auto-advance in the wiring test (default timeout, split in two), bundle test parses each arm once, `.at(-4)` restored and a `slice(-3)` order check added; copy now says navigate_to_target's own tile choice is unchanged.
- Synced main again (turn-drought-clock-v1, healed gym definition); registry tails re-shifted. Gates on the merged tree: lint 0; agent 4820 (97.31/93.4/97.8/99.2), viewer 1794 (95.47/91.45/94.45/97.97; three pre-existing tests timed out once under concurrent load and passed alone and on rerun), Python 4011 (lines 97.41, branches 93.48, functions 100).
- Round 2 (packet 19730b8c3, sha256 93b9a04a…): Claude LGTM, fallback LGTM, GPT BLOCKING: current-map-display-name-v1's pending experiment said the Current map line was the only difference and activated at PLAYER_HOUSE_EXITED_AFTER_CLOCK, though the memory-column change can apply from the first page in the house. Fixed: activation PLAYER_HOUSE_ENTERED, hypothesis and notes name both surfaces, readiness row updated.
