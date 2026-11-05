# Rayquaza frontier: assisted runs shown and marked

**Started:** 2026-11-05
**Status:** in progress on branch; not landed. Landing is the coordinator's.
**Branch:** `claude/rayquaza-frontier` (from main `38af867ff`), worktree `~/dev/pokebench-wt-rayquaza-frontier`.
**Approval:** The operator picked mockup A (`runs/mockups/rayquaza-frontier/a.html`) on 2026-11-05: "the runs still need to show up on the benchmark frontier ... indicate that they provided a lot of help".

## Problem statement

Custom lanes (a weight-edited model, a `custom-` experiment, a knowledge switch) are dropped from the frontier ranking and plot. The operator wants them shown and marked as heavily assisted, with best overall beside best unhelped, and never pooled with arm cohorts.

## Design

- `custom-lane.ts` stays the classifier. `customLane` now names the help; `customLaneOfStart` classifies a `run_start`.
- `frontierReferences` keeps `best` on today's Agent frontier rule (best unhelped) and adds `overall`, which may be assisted.
- `frontierPair` is unchanged, so the race, `frontier-cache` and its disk cache keep their behavior.
- `frontierVersions` still leaves assisted runs out, so benchmark harness versions keep their numbers, colors and diffs.
- `frontier-headline.ts`: pure tiles, BEST OVERALL and BEST UNHELPED, with a `+N checkpoints` gap, or SAME RUN.
- Chart: violet line, hollow diamonds, one HEAVILY ASSISTED flag at the furthest assisted head. The best-overall run is drawn whatever the overlay filter says.
- `fixed-analysis` and the next-run switch history leave custom lanes out of their statistics.

## Milestones

- [x] M1: RED tests
- [ ] M2: GREEN: classifier, ranking, chart, tiles, legend, stats guards, CLAUDE.md
- [ ] M3: focused checks and headless proof
- [ ] M4: cloud review and landing (coordinator)

## Log

- RED: focused suites (frontier, frontier-headline, custom-lane, fixed-analysis, history, frontier-legend): 17 failed, 78 passed, and `frontier-headline.js` missing. The race and harness-version guards pass on purpose: they pin behavior that must not change.
