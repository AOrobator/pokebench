# cross-map-goal: navigate_to says a goal on another map is on another map

Branch `claude/cross-map-goal` in `/private/tmp/pokebench-cross-map-goal`, cut from local main `4070e250`.

## Problem Statement

When `navigate_to` gets a `map_id` that is not the current map, the walk loop's first `sameMap()` check (packages/agent/src/navigation.ts:295 on main) answers `Navigation: map changed; inspect destination; 0 ordinary button attempts.` The player never moved and no map changed. The model reads it as a transition and retries the same call.

Evidence (read-only):
- run 4caa (`runs/2026-10-16T12-42-29_qwen36-gpu0_4caa`): seqs 12480, 12503, 12526, 12549 (on ROUTE101, map 0/16, args `{x:8,y:0,map_id:[0,9]}` and `{x:0,y:6,...}`), 14588, 14597, 14607 (`{x:6,y:4,map_id:[0,10]}`), plus 2136 (map 1/3, goal map 1/2). Two loop_guard "ineffective" warnings follow (12550, 14608).
- run 8b01 (`…13-43-08_qwen36-gpu0_8b01`): 17 zero-press "map changed" results (2796, 4941–4956, 9482, 10201–10560; 12 in a row for `{x:9,y:8,map_id:[0,18]}` while on map 0/10).
- run e460 (`…13-43-08_qwen36-gpu1_e460`): 1 (seq 3893).
Every one has 0 ordinary button attempts. The true "map changed mid-walk" results (e.g. 4caa 981, 1326) all have presses.

Approved by the operator at 5:34 AM New York time ("fix all of these bugs and then put them in the bundle"). Operator decision 2:53 PM New York time: this fix ships behind its own switch in the **bundle arm only** (not ON in both arms), default OFF. The thread owner lands it; this branch does not merge into main.

## Skills Loaded

feature-worklog, execute-worklog (incl. Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, multi-model-review (+ reference/reviewer-invocation.md). Brief: scratchpad `common.md`.

## Architecture

- New switch **`cross-map-goal-v1`** (guidance, needs `bounded-navigation-v1`), default OFF, intended **bundle arm only**.
- `NavigationPorts.crossMapGoal` threaded from the FeatureSet in `withNavigation`.
- In the walk loop, when the goal's map differs from the current map **before any press** (`commands===0`), ON answers a true refusal: `(x,y) on map g/n is on another map; you are on map g/n (LOCATION) and navigate_to only walks within the current map; to walk on this map, pass map_id [g,n]; to reach map g/n, use a listed warp or a map connection`. If the current map is unknown (`map_id` null), ON falls through to the readiness check, which already explains why it cannot walk.
- After at least one press, a map change still reads `map changed; inspect destination` (both checks), ON or OFF.
- OFF: today's bytes.
- No game RAM is read beyond `map_id`, `position` and `location` already in the snapshot (gSaveBlock1Ptr->location mapGroup/mapNum, already grounded by the readout).

## Invariants

- INV-1 OFF reproduces today's status bytes for every case (recorded 4caa case, mid-walk change).
- INV-2 ON never says "map changed" when no press was submitted; never presses on a cross-map goal.
- INV-3 ON still says "map changed; inspect destination" when the map changes after a press, at either check.
- INV-4 The tool description is unchanged by the switch.

## Security Review

Text only. No subprocesses, network, files or new endpoints.

## Milestones

**M1 — cross-map-goal-v1**
- [x] RED: recorded 4caa fixture (OFF equals received; ON true refusal, no press), mid-walk map change ON, unknown map ON, factory wiring, registry/preset tests. vitest cross-map-goal.test.ts: 5 failed | 5 passed (10); the 5 passing are OFF bytes and real mid-walk map changes.
- [x] COMMIT RED
- [ ] GREEN: switch registry, presets, defaults, wiring, explainer, Harness Config link, pending experiment, readiness note
- [ ] COMMIT GREEN
- [ ] Wiring deletion check (factory test goes red)
- [ ] Gates: test, coverage ≥90 both stacks, lint, verify-vendor
- [ ] Principles self-review PB1–PB13
- [ ] Merge main, rerun gates, freeze packet
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
