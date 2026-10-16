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
- [x] COMMIT RED: `test(cross-map-goal): RED for a false 'map changed' on a goal on another map (run 4caa seq 12549)` (30fee571)
- [x] GREEN: switch registry, presets, defaults, wiring, explainer, Harness Config link, pending experiment, readiness note. Agent vitest 124 files / 1891 tests pass; viewer controls/next-run/panels/server 163 pass. Registry position assertions in other switch tests bumped by one (new last switch); guidance count 35→36.
- [x] COMMIT GREEN: `feat(navigation): cross-map-goal-v1 says a navigate_to goal on another map is on another map (default off, bundle arm)` (5b692de9)
- [x] Wiring deletion check: removing `crossMapGoal:features["cross-map-goal-v1"]` from withNavigation turns `withNavigation reads the switch from the FeatureSet` red (1 failed | 10 passed); restored, 11 pass.
- [x] Gates (on 5b692de9, main 4070e250 already an ancestor): `just test` agent 1891 / viewer 974 / pytest 2465 passed, 0 skipped; `just coverage` agent lines 99.14 branches 94.72 functions 98.4, viewer 97.67 / 91.17 / 93.79, Python 97.52 / 93.55 / 100; `just lint` ok; `just verify-vendor` ok (submodule initialised in the worktree first); `just pages-check docs/explainers/cross-map-goal-v1.html` prints nothing.
- [x] Principles self-review PB1–PB13: 0 FAIL (PB2, PB6, PB11 N/A).
- [x] Merge main (no-op: main 4070e250 is the base), gates above, freeze packet base 4070e250 → this commit
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet

## Multi-Model Review Log
- Round 1, packet `git diff --binary 4070e250 3ab4c88e` (SHA-256 `ad352fa3…b3627`), artifacts `/tmp/review-cross-map-goal-r1{,b}`:
  - Claude: `~/.claude-review` login expired ("OAuth session expired"); default-login `claude -p --permission-mode plan` → `VERDICT: LGTM`.
  - Grok (Cursor `cursor-grok-4.5-high`) → `VERDICT: LGTM`.
  - GPT: Cursor `gpt-5.6-sol-xhigh` hit its usage limit; isolated `codex exec` gpt-5.6-sol xhigh → `VERDICT: BLOCKING`: (1) no exact-head `just build` receipt; (2) no real-browser READ EXPLAINER click in a candidate viewer. Hardening: trailing blank line in this worklog.
  - Synthesis: both accepted. `just build` on 3ab4c88e exit 0, tree unchanged. Candidate viewer (worktree dist, `--port 8796 --runs <scratchpad probe root>` holding one probe run whose run_start is 4caa's with `cross-map-goal-v1` added): Harness Config shows CROSS-MAP GOAL REFUSAL ON; clicking READ EXPLAINER opened `http://127.0.0.1:8796/explainers/cross-map-goal-v1.html` (heading "A goal on another map is not a map change"), no console errors; at 375 px no page-level horizontal scroll, but the evidence table was cramped, so it now scrolls inside its card (min-width 620 px), and two diagram labels moved off their arrows. Claude's count note: 7 of 4caa's 8 zero-press cases are on ROUTE101 (seq 2136 is map 1/3), so the hypothesis text stands.
- Round-1 fixes committed a6208fc6; main (e349269c) merged in 34ecc852. Gates on 34ecc852: `just build` 0, `just verify-vendor` 0, `just lint` 0, `just test` agent 1894 / viewer 1002 / pytest 2465 passed (0 skipped), `just coverage` 0 (agent lines 99.14 / branches 94.71 / functions 98.4; viewer 97.75 / 91.32 / 93.91; Python 97.52 / 93.55 / 100). One earlier pre-merge `just coverage` run timed out in the unrelated `server-stream.test.ts` long-stream test (5 s under coverage load); it passed on rerun.
- Browser proof on the merged build (candidate viewer `node packages/viewer/dist/cli.js --port 8796 --runs <scratchpad>/cmg-viewer-runs`, probe run `2026-10-16T15-30-00_crossmap-probe_c0de`): Harness Config search "cross-map" → 1 matching feature, CROSS-MAP GOAL REFUSAL ON; real click on READ EXPLAINER → `http://127.0.0.1:8796/explainers/cross-map-goal-v1.html`, heading "A goal on another map is not a map change", no console errors. At 375×812 the page has no horizontal scroll (scrollWidth 375); the evidence table and diagram scroll inside their cards (diagram min-width 640 px added; one label moved off its arrow). Viewer stopped after the check. The 8790 viewer was not touched.
- main (986cb496, viewer frontier legend) merged in e8fb6453. Gates on e8fb6453: build 0, verify-vendor 0, lint 0, test 0 (agent 1894 / viewer 1003 / pytest 2465, 0 skipped), coverage 0 (agent 99.14 / 94.72 / 98.4; viewer 97.75 / 91.33 / 93.97; Python 97.52 / 93.55 / 100). Round 2 packet: `git diff --binary <main> <this commit>`.
