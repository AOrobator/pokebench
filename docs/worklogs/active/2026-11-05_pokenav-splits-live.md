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
- [ ] Gates (focused: tsc, eslint on changed files, 5 suites 222 passed)
- [ ] Review
- [ ] Land, `just viewer-main`, headless proof

## Multi-Model Review Log
