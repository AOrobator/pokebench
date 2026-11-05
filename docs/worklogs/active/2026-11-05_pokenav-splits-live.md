# PokéNav splits table on live runs

Requested by the operator 2026-11-05, relayed by the coordinator: the PokéNav splits / baseline / frontier section is not updating, and it should use the code path of the working "Splits this run" and "Split time vs frontier" sections.

Single milestone. Viewer-only, so no feature switch. No layout, timeline or trainer-card change.

## Causes

- Live runs paint from `currentView`, which carries no milestones. `splits()` read `view.milestones`, so 5f0f showed "0 reached" at 7:44 of play. The watch-side sections read recorded splits from `/api/cards`.
- `/api/runs/<id>/comparisons` answered 404 for 5f0f after 24 seconds. `baselineOf` retained every raw event, so control24h hit `ERR_WORKER_OUT_OF_MEMORY` in the baseline worker. That plain Error fails the whole `Promise.all`, so no run with that start got a baseline, and the failure was never cached.

## Plan

- `run-splits.ts` holds the one reached-splits source; `runSplits` and `splits()` both use it. Replay stays on folded events so rewinding hides later splits. A null recorded value shows a loading state.
- `RunView.releaseEvents()` after each baseline batch. 274b's baseline is byte-identical before and after, and control24h now completes in the default worker heap.

## M1

- [x] RED: ecedb6d0c, run-splits, panels and model tests fail
- [x] GREEN: focused viewer suites pass; candidate client on live data shows 5f0f at 138 reached
- [x] Gates on main at 1840f28e2: just lint, just test (agent 2458, viewer 869, env 2901, gateway 38), just verify-vendor
- [x] Review: all lanes LGTM on the final delta
- [x] Landed 1840f28e2 fast-forward; `just viewer-main` restarted 8790, parent launchd, 5f0f kept running; headless desktop, phone and replay proof: 5f0f 142 reached vs baseline + frontier 274b, next row timer advancing, no page errors, /comparisons 200

## Multi-Model Review Log

Round 1, packet 3095abed7..73b0a639c sha 08404330. Claude: LGTM. Fallback subagent: LGTM. GPT (gpt-5.6-sol): BLOCKING on one point: a checkpoint-start run with no split yet showed next new game created. Fixed in nextSplit, which now claims no next until such a run reaches one. Grok lane out of Cursor usage until 11/17.

Round 2, delta ..7514818af sha 5e55501c. Claude: BLOCKING, GPT: BLOCKING. Both real: a non-frontier first split on a checkpoint start still said next new game created, and MAIN_MENU saves lost their next split. nextSplit now starts from the save's own position (MAIN_MENU as boot, a known checkpoint as itself, an unknown save claims nothing until a frontier split). GPT's folded-view note is rebutted: present milestones there give a true position, unchanged behavior. Also found while checking: run-splits was missing from BROWSER_MODULES and would have 404ed in the served viewer; fixed with a test. Round 3 runs past the two-round cap because every blocker was a real bug in this diff.

Round 3, delta ..e7fd69cb4 sha 8c3ad999. GPT: LGTM. Claude: BLOCKING on one real bug: the new test imported server.js, which reads disk at import and fails the no-I/O guard. BROWSER_MODULES moved to a pure browser-modules.ts and the test imports that.

Round 4, delta ..1840f28e2. Claude: LGTM. GPT: LGTM. Fallback subagent: LGTM on round 1. Grok lane out of Cursor usage until 11/17.
