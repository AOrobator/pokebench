# Worklog: exit-reachability-v1, one walk-reachability check for every exit list and navigation message

Branch `claude/exit-reachability`, worktree `/private/tmp/pokebench-exit-reachability`, base `main` 00b2b317.

## Why

Operator ask (the operator, top-50 run-analysis thread, 2026-10-17 1:43 PM New York): "update the untaken exits and connection edge tiles to account for not listing surf, and we need to have a DRY mechanism for excluding exits that are unavailable." Coordinator default (1:46 PM): a bug fix that ships on in both arms; per the feature-switch skill it still gets a switch whose OFF state is today's behavior.

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

Switch `exit-reachability-v1`, server + agent, default OFF in presets and DEFAULT_NEXT_RUN; OFF is byte-identical to today. The config owner (Dual GPU readiness thread) turns it on in both arms.

## M1: server-side classification and reach rows

- [x] RED: Python tests from the 4caa Route 103 fixture (EAST edge and Altering Cave classified `water`; untaken walkable exits `foot`) and a Route 104 fixture built from 0e05/93eb raw RAM (north edge `none` from the south half); state_json field only with the switch on; OFF readout byte-identical.
  - Fixture `env/tests/env/fixtures/exit-reach-0e05.json.gz` (16 KB): RAM windows of 0e05 tool results 22580 (state 22579, raw 11268, (18,42)) and 25575 (state 25574, raw 12848, (19,42)), recorded by a scratch reader over `rerender` with every server switch on and again with the run's own switches; never ROM or Flash bytes. Its `readout` is the server re-render under the run's switches, checked by the builder to be the recorded tool text from `Screen:` on minus the 7 agent-added lines (untaken exits, people ledger, agent story line). Builder kept in the session scratchpad, not committed.
  - Probe with today's `surf_gate.reachable` on the fixture: 546 foot tiles from both starts, min y 38 (matches the RAM audit), 805 with water. Labels: warps (17,50) (10,38) (11,38) foot; (5,18) (10,30) (11,30) (32,42) (33,42) none (the east woods mouth sits above south-only ledges); NORTH none, SOUTH water, EAST foot. 4caa: (45,6) water, SOUTH foot, EAST water.
  - 2026-10-17 New York: `pytest tests/env/test_exit_reach.py` fails at collection (`No module named 'pokebench_env.exit_reach'`).
  - COMMIT: `test(exit-reachability): RED Python classification from 4caa Route 103 and 0e05 Route 104 RAM` (sha recorded in the next entry)
- [ ] GREEN: classification + reach rows in surf_gate.py (or a sibling module), readout notes, SERVER_FEATURES registration both sides.
- [ ] Gates: just test, just lint, just coverage (>=90).

## M2: agent consumers, registration, explainer

- [ ] RED: TS tests: untaken line, supervisor lists, edge bearings, edgeNote, navigate_to continue text, person refusal (MAY from (14,10) on the 4198 Route 103 state), all through the production factory; OFF byte-identical.
- [ ] GREEN: `exitReach` helper and consumers; registry, presets, defaults, events schema; explainer docs/explainers/exit-reachability-v1.html; experiments/exit-reachability.json pending entry.
- [ ] Gates.
- [ ] Review: Claude, Grok, GPT lanes; 2-round cap.
- [ ] Land: ff-only into local main; SHA to the coordinator for the config owner.
