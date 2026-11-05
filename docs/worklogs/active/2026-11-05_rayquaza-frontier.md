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
- [x] M2: GREEN: classifier, ranking, chart, tiles, legend, stats guards, CLAUDE.md
- [x] M3: focused checks and headless proof
- [ ] M4: cloud review and landing (coordinator)

## Log

- RED: focused suites (frontier, frontier-headline, custom-lane, fixed-analysis, history, frontier-legend): 17 failed, 78 passed, and `frontier-headline.js` missing. The race and harness-version guards pass on purpose: they pin behavior that must not change.
- RED commit: `test(frontier): pin assisted runs on the frontier, kept out of cohorts` (61f8fae8a)
- GREEN: focused viewer suites 18 files, 240 tests passing; `tsc --noEmit` clean; eslint clean on changed files. Full gates not run: they need a heavy-CPU window.
- `rq-milestone-guide-v1` is not on this base (it lives on `claude/rayquaza-lane`), so it is NOT in `KNOWLEDGE_SWITCHES`. Add it there when that branch lands, or Rayquaza runs that only set this switch classify as benchmark runs.
- GREEN commit: `feat(frontier): show custom lanes as heavily assisted beside best unhelped` (e87c104fd)
- Before/after on the real 8790 snapshot (807 runs, read-only GET), main dist `38af867ff` against this branch: `frontierPair` identical (274b, runner-up 5f0f), all 162 harness versions identical, best unhelped still 274b. Shown runs 502 to 504, nothing lost. The two added runs are `think-fast_3393` and `think-fast_1f08` (next-milestone hint, Clock set resumes).
- Headless Chromium on a private viewer, port 18811, empty scratch runs root, snapshot routed in. 1280, 1440 and 375, two scenarios: real data (SAME RUN) and a labelled fixture assisted run leading by 5. No console errors, no horizontal overflow. Clicked marks summary, FULL BASELINE, FRONTIER, overlay filter, mark to drawer; polls left the tiles unchanged.
- Protected trainer cards: guard test OK, playwright 3 of 3 against baselines, no baseline touched.
- Not run: `just test`, `just coverage`, `just lint` (need the heavy-CPU window); cloud review lanes; live 8790 proof.
- Coordinator decisions, 2026-11-05: (1) only a New Game start (boot or the MAIN_MENU save) carries the assisted flag; resumes like think-fast_3393 and 1f08 stay marked in their row and drawer. (2) An assisted run leading on time at the same checkpoint shows the time gap, not "+0 checkpoints".
- RED for both decisions: see the failures in frontier and frontier-headline focused suites.
