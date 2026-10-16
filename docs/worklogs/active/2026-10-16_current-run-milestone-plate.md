# Current run milestone plates (stats page, variant 36)

Branch: `worktree-agent-a0f796e82f29d42d3` · viewer only, no harness behavior (no feature switch).

## Problem

The Runs & Comparisons "CURRENT RUN" card shows clocks, turn and target per live run, but not how far
each run has got in the story, which lane/GPU it runs on, or which experiment arm it is. With two
lanes running bundle vs control at once, the operator cannot tell the runs apart or see a new
milestone land.

## Decision

The operator picked mockup variant 36 ("Gold plate, MILESTONE inline",
`runs/mockups/current-run-milestone/variant-36.html`): one party card holding a name plate per live
run with lane · GPU, Lv = 1-based position of the furthest FRONTIER_MILESTONES entry reached,
TYPE/ arm badge (control / bundle / none; any other arm gets a stable hashed colour, long ids wrap),
MILESTONE bar `N/ 39`, the bold milestone name with time and turn reached, a TIME bar (elapsed vs
wall cap), the whole plate is the watch link, and the plate turns solid gold with a NEW MILESTONE!
chip while the latest milestone is under 30 s old (live elapsed − split.elapsedMs).

Operator change during implementation: the NEW MILESTONE! chip blinks at a third of the mockup's
speed: `mk-blink 3.6s steps(2) infinite` (mockup 1.2s), still off under prefers-reduced-motion.

Lane, GPU and arm come from `/api/experiments` `fixedRuns[].lanes[]` joined on `run`; the stats page
already polls it for the queue, so QueuePanel hands each parsed snapshot to the workbench.

## Checklist

- [x] M1 RED: failing tests for plates, lane join, NEW window, in-place clock patch, CSS contract
  - viewer: 14 failing (workbench-view 8, workbench 2, queue-view 1, mobile-layout 3), 56 files pass; baseline was 797/797.
  - COMMIT: `test(viewer): current-run name plates, variant 36 (RED)` (see log)
  - RED commit: d971c0ec
- [x] M1 GREEN: implementation, viewer tests + coverage ≥ 90 + lint
  - `workbench-view.ts`: `runLanes`, `armColor`, `furthestMilestone`, `clockText`, `NEW_MILESTONE_MS`, plate markup;
    `workbench.ts`: `lanes()` setter, field-wise in-place patch (innerHTML, style, plate class) so focus and the
    chip's blink phase survive ticks; `queue-view.ts`: optional `loaded(snapshot)` hook wired in `bootWorkbench`;
    `style.css`: `.wb-party/.wb-plate…` rules, old `.wb-current` card rules removed.
  - Denominator is `FRONTIER_MILESTONES.length` = 40 on main (bedroom-exit split landed after the mockup's 39);
    tests pin `N/ 40`.
  - viewer tests 806/806; coverage all files 95.13 stmts / 90.47 branches / 93.58 funcs / 97.62 lines
    (workbench-view 96.96/92.7/91.3/100); lint (tsc --noEmit + eslint) clean.
  - GREEN commit: 207cc3f0
- [x] M2 RED: `/api/experiments` lanes are validated (id, gpu strings; arm, run string|null) before the plates read them
  - queue-view: 1 failing ("puts fixed-run status cards above the queue and validates them"), 12 pass. RED commit: af7af947
- [x] M2 GREEN: `laneOk` in `queueSnapshotOf`
  - viewer tests 806/806; coverage 95.14 / 90.48 / 93.59 / 97.62 (stmts/branches/funcs/lines); lint clean.
  - GREEN commit: 47240333
- [x] Browser check (built dist + static served by a scratch fixture server on 127.0.0.1:8831; 4 live/paused
  runs, 3 lanes incl. a 51-char arm, one hand run). Desktop 1200 px and phone 375 px: plates render, gold plate
  with chip (computed `3.6s steps(2) infinite wb-new-blink`), gold → cream after the 30 s window on the same
  focused element, scrollWidth = clientWidth (0 elements past the edge), plates stack in one column at 375 px,
  long arm wraps. Real click on the lane A plate lands on `/#run=<id>`.
  Screenshots: `runs/mockups/current-run-milestone/impl-check/{desktop-1200,mobile-375}.jpg` (main checkout).
  Not checked: the real viewer server on 8790 (off limits) or a real running cohort.
- [ ] Multi-model review loop (not run in this session)

## Log
