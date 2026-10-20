# Splits panel: comparable runs behind big logs

## Operator report

2026-10-20, the operator via coordinator: the splits panel says there is no comparable run for the cook runs, live and replay, although many runs start from the same MAIN_MENU save.

## Cause

`comparisonsOf` (packages/viewer/src/runs.ts) validates every candidate with `baselineOf`, which read each `events.jsonl` into one string (`readFrom`). The `bundle-cook-6h-v2` logs are 1.2 GB and 558 MB, so Node throws "Cannot create a string longer than 0x1fffffe8 characters". That is not a `BaselineError`, so the whole `/comparisons` request throws, the server answers 404, and every run sharing that start shows "no comparable best run yet".

Coordination: the big-run-logs branch fixes the runner and the workbench/frontier readers; it does not touch runs.ts.

## M1

- [x] RED: `baselineOf` reads in bounded chunks (`baselineOf(root, id, chunkBytes)`); RED is the type error, the old reader ignores the bound.
- [ ] GREEN: stream `baselineOf` through `LogReader`
- [ ] Gates: test, coverage, lint
- [ ] Proof: comparisons for a cook run on the real runs dir; real browser at desktop and phone widths
- [ ] Review: Claude, Grok (GPT waived by operator for this thread)
- [ ] Land ff-only, restart viewer keeping live runs
