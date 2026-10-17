# Worklog: exit-reachability-v1, one walk-reachability check for every exit list and navigation message

Branch `claude/exit-reachability`, worktree `/private/tmp/pokebench-exit-reachability`, base `main` 00b2b317.

## Why

Operator ask (the operator, top-50 run-analysis thread, 2026-10-17 1:43 PM New York): "update the untaken exits and connection edge tiles to account for not listing surf, and we need to have a DRY mechanism for excluding exits that are unavailable." Coordinator default (1:46 PM): a bug fix that ships on in both arms; per the feature-switch skill it still gets a switch whose OFF state is today's behavior. Operator decision (the operator, 2:02 PM, via the coordinator): exit-reachability-v1 goes in the bundle arm only, not both arms. Code is unchanged by this (default OFF in presets either way); the explainer and experiments/exit-reachability.json say bundle arm.

Evidence (runs/reviews/2026-10-17-run-analysis-top50/):
- untaken-exits-v1 and connection-edge-tiles-v1 list the Surf-only EAST -> ROUTE110 edge and Altering Cave on Route 103 as ordinary exits in control (f551 s6605 -> s6610; 846 "press RIGHT" readouts). surf-gated-exits-v1 only filters them when it is on (bundle only), and `connection-edges.ts` `edgeNote` never consults it.
- RAM audit: Route 104 (map 0/19) north edge is unreachable on foot from the south half (flood fill reaches 546 tiles, none at y=0; 0e05 s22580, 93eb s19774). navigate_to still says "call navigate_to again to continue to (12,0)" (`navigation.ts:490`). Frontier wall for both arms.
- navigation-refusal-reasons-v1 person case: "none of its free neighbouring tiles can be reached from here" is computed in the 15x15 window but stated as absolute. 11 false cases for MAY on Route 103 (4198 s23326, s23581, s23705: the model gave up on her).

## Design

One server-side predicate, generalised from `env/pokebench_env/surf_gate.py` (`reachable`, `water_only`): every warp and map connection on the current map is classified `foot`, `water` (reachable only across water) or `none` (not reachable either way), and the set of tiles reachable on foot from the player is shipped compactly (one bit-row string per map row) in the state JSON under a new field, only when the switch is on. The flood over-approximates walking (ignores elevation, one-way tiles and objects), so an `unreachable` verdict is safe; unknown or unread values keep everything listed.

Agent side, one helper (`exitReach(features, state)`, extending `surf-gate.ts` `surfBlock`) is read by every consumer:
- `untaken-exits.ts` untaken line;
- `loop-supervisor.ts` reachable targets, unentered exits and edge bearings;
- `connection-edges.ts` `edgeNote`;
- `navigation.ts`: the "call navigate_to again to continue" text only when the goal is on-foot reachable, else a true unreachable message; the person/object refusal says a route exists outside the local map (with the v2-style edge waypoint) when a neighbour is in the reachable set.

Readout side: connection lines and warp notes for `none` say "not reachable on foot from where you stand" instead of the walk-off instructions.

Switch `exit-reachability-v1`, server + agent, default OFF in presets and DEFAULT_NEXT_RUN; OFF is byte-identical to today. The config owner (Dual GPU readiness thread) turns it on in the bundle arm (operator decision 2:02 PM).

Scope note (coordinator, during M1): full-map-navigation-v1 is in the bundle on main, so the navigate_to messages must be right in both modes. In full mode there is no 15x15 window: the continue text and the person refusal rest on the whole-map plan plus the foot set and never mention the local window. One test per mode.

## M1: server-side classification and reach rows

- [x] RED: Python tests from the 4caa Route 103 fixture (EAST edge and Altering Cave classified `water`; untaken walkable exits `foot`) and a Route 104 fixture built from 0e05/93eb raw RAM (north edge `none` from the south half); state_json field only with the switch on; OFF readout byte-identical.
  - Fixture `env/tests/env/fixtures/exit-reach-0e05.json.gz` (16 KB): RAM windows of 0e05 tool results 22580 (state 22579, raw 11268, (18,42)) and 25575 (state 25574, raw 12848, (19,42)), recorded by a scratch reader over `rerender` with every server switch on and again with the run's own switches; never ROM or Flash bytes. Its `readout` is the server re-render under the run's switches, checked by the builder to be the recorded tool text from `Screen:` on minus the 7 agent-added lines (untaken exits, people ledger, agent story line). Builder kept in the session scratchpad, not committed.
  - Probe with today's `surf_gate.reachable` on the fixture: 546 foot tiles from both starts, min y 38 (matches the RAM audit), 805 with water. Labels: warps (17,50) (10,38) (11,38) foot; (5,18) (10,30) (11,30) (32,42) (33,42) none (the east woods mouth sits above south-only ledges); NORTH none, SOUTH water, EAST foot. 4caa: (45,6) water, SOUTH foot, EAST water.
  - 2026-10-17 New York: `pytest tests/env/test_exit_reach.py` fails at collection (`No module named 'pokebench_env.exit_reach'`).
  - COMMIT: `test(exit-reachability): RED Python classification from 4caa Route 103 and 0e05 Route 104 RAM` (00e45799)
- [x] GREEN: classification + reach rows in surf_gate.py (or a sibling module), readout notes, SERVER_FEATURES registration both sides.
  - `surf_gate.py`: `classify` labels every warp/connection foot/water/none from one flood pair; `water_only` is now its water filter (same output); `read_flood_inputs` + `surf_gate_from` split `read_surf_gate` (kept as the wrapper). `exit_reach.py`: `ExitReach` (labels, foot set, hex rows, notes), `build_exit_reach` (None when the player's tile is not on the map read). `game_state.py` reads the flood once for either switch. `readout.py`: notes for `none` on connection, warp-candidate and Warp destination lines (gate note wins for water; the two labels are disjoint); `exit_reach` in state_json only with the switch. Registered in SERVER_FEATURES and the default-off list (Python) and in the TS registry (SWITCHABLE_FEATURES, FEATURES copy, SERVER_FEATURES, playHarnessFeatures, presets, flagFeatures, DEFAULT_NEXT_RUN), events.ts `exit_reach` schema, `schemas/events.v1.json` regenerated. Registry-position tests bumped by one (mechanical).
  - Worktree setup: `.env` copied from the main checkout (gitignored), submodule initialised (`just verify-vendor` OK), the mGBA binding copied from the main checkout's venv into this venv (mypy needs `mgba._pylib`).
- [x] Gates: just test (vitest agent 2105, viewer 1101; pytest 2543), just lint clean, just build OK, just coverage: Python lines 97.63 / branches 93.75 / functions 100 (exit_reach.py and surf_gate.py 100%); agent lines 99.23 / branches 94.42 / functions 98.27; viewer lines 97.62 / branches 91.39 / functions 93.78.
  - COMMIT: `feat(exit-reachability): server labels every exit foot, water or none and ships the foot area (default off)` (045c792d)

## M2: agent consumers, registration, explainer

- [x] RED: TS tests: untaken line, supervisor lists, edge bearings, edgeNote, navigate_to continue text, person refusal (MAY from (14,10) on the 4198 Route 103 state), all through the production factory; OFF byte-identical.
  - `packages/agent/src/exit-reachability.test.ts`, fixture `packages/agent/src/fixtures/exit-reach-states.json.gz` (47 KB): recorded state bodies (envelope stripped) of 0e05 seq 22539-22579 (the eight-press navigate_to (12,0) call ending in tool result 22580) and 4198 seq 23325 (MAY at (10,3), player (16,7); tool result 23326), each with exit_reach and the whole-map grid the M1 server code reads from that state's own raw-RAM archive; the two recorded result lines; each run's harness_features. Builder in the session scratchpad.
  - navigate_to runs through `withNavigation` over fake ordinary tools (replayed recorded states, or a synthetic one-tile-per-press walk). OFF already equals both recorded result lines (9 tests pass: OFF replays, whole-map refusal of (12,0), both 'call again' cases local and whole map, schema, registry, presets).
  - Whole-map mode (coordinator scope note): 4198 with map_grid, the whole-map plan reaches MAY, ON = OFF talk offer; a synthetic 6x3 map where a person blocks the only gap tests the whole-map refusal wording (no 15x15 mention); a 40x31 serpentine keeps 'call again' at the 512-press bound ON and OFF.
  - 2026-10-17 New York: 10 fail (no `exitReach` export; ON texts unchanged; untaken/supervisor/edgeNote unfiltered).
  - COMMIT: `test(exit-reachability): RED agent consumers from 0e05 Route 104 and 4198 Route 103 states` (cc746340)
- [x] GREEN: `exitReach` helper and consumers; registry, presets, defaults, events schema; explainer docs/explainers/exit-reachability-v1.html; experiments/exit-reachability.json pending entry.
  - `surf-gate.ts`: `exitBlock(switches, state)` / `exitReach(features, state)`: `warp`/`connection` (water while Surf cannot be used with surf-gated-exits-v1, none with this switch), `warpCut`/`connectionCut`, `foot`, `footNear`; with this switch off it is exactly `surfBlock`. Consumers: `untaken-exits.ts` (and the why-none text), `loop-supervisor.ts` (untried, unentered exits and edges, ways-off), `connection-edges.ts` `edgeNote(topology, tile, blocked?)`, `navigation.ts` (`NavigationPorts.exitReach`/`surfGate` from `withNavigation`; command-limit text uses `footNear(goal)`; `personCut` for the person/object refusal: none on foot, leaves the local window with the v2 edge waypoint (`windowEdges`, factored out of `windowReason` unchanged), or plan-failed wording in the window or on the whole map). FEATURES copy rewritten to match.
  - Wiring break: `exitReach:false` in `withNavigation` turned 4 factory tests red (command-limit text, local MAY, whole-map refusal, none-on-foot); restored, 21/21 green.
  - Explainer `docs/explainers/exit-reachability-v1.html` (maps drawn from the committed fixtures with the production flood), README entry, FEATURE_EXPLAINERS mapping, panels and server route tests; `just pages-check` prints nothing. Not opened in a browser: the Browser pane refuses page tools on file:// and the 8791 server was not touched; the operator-facing link needs `just pages` on main after landing.
  - `experiments/exit-reachability.json`: pending (no queuePosition), story-destinations' finals incumbent with only this switch flipped (`parseExperiment` + `experimentArms`: diff `[exit-reachability-v1]`), activation ROUTE_103, primary PETALBURG_WOODS, bundle arm only, provisional source.commit cc746340 (repin at merge). Readiness row added as PENDING: `just experiments` reads the main checkout and this worktree has no runs.
- [x] Gates: just test (vitest agent 2127, viewer 1103; pytest 2543), just lint clean, just build OK, just coverage: Python lines 97.63 / branches 93.75 / functions 100; agent lines 99.24 / branches 94.38 / functions 98.30 (navigation.ts 100/93/98.4, surf-gate.ts 100/94.9/100); viewer lines 97.62 / branches 91.39 / functions 93.78; just experiments-check ok; just verify-vendor OK.
  - COMMIT: `feat(exit-reachability): one exitReach check for exit lists, edge notes and navigate_to messages; explainer and pending experiment` (2fe24397)
- [ ] Review (caller runs it): Claude, Grok, GPT lanes; 2-round cap. Stopped here per the coordinator brief.
- [ ] Review: Claude, Grok, GPT lanes; 2-round cap.
- [ ] Land: ff-only into local main; SHA to the coordinator for the config owner.

## Multi-Model Review Log

- Round 1 (2026-10-17 ~2:45 PM New York), frozen base 558f2e76, head 6c1cf408, diff SHA-256 f2a60453c6e9eb400b3b09d073cad80a3902359e456ee383134b721fdf7e2023. Claude LGTM, Grok (cursor-grok-4.5-high) LGTM, GPT (gpt-5.6-sol-xhigh via Cursor) BLOCKING.
  - Fix: (1) same-direction connections overwrite each other (Route 111, Route 124); (2) malformed foot masks read as unreachable instead of unknown.
  - Rebut: (3) whole-map serpentine test runtime (process/operation-count demand); (4) ROM-gated real-RAM tests follow the existing operator_rom pattern (env/tests/env/test_surf_gate.py:78-81, unchanged by this diff); (5) the pending experiment entry is what the feature-switch skill requires at merge, design comes before queueing; (6) explainer click and 8791 check are post-landing close-the-loop steps; (7) the changed messages are text inside already-recorded tool results and supervisor events, no new event kinds.

## Round 1 fixes

- [x] RED (Python): `test_two_same_direction_connections_are_labelled_and_noted_separately` (two WEST connections, one walkable, one cut off: labelled and noted separately; notes keyed per connection) and the connection JSON/labels keyed by direction, destination and offset in the 4caa/0e05 tests. Fails at collection (no `readout.connection_notes`).
  - COMMIT: `test(exit-reachability): RED same-direction connections labelled separately (Python)` (sha in the next entry)
