# Hide replay controls for runs in progress

## Problem Statement

The viewer header always draws the replay play button, speed picker and scrubber. For a run in progress they are only greyed out, so on a phone they take a header row and look usable (the operator, 2026-10-16). They mean nothing until the run is a replay.

## Architecture

Viewer only, no harness behavior change, so no feature switch. `static/index.html` gives the `.replay-controls` group `data-ui="replay-controls"`; `App.render` sets `hidden` whenever there is no replay clock (loading, live, not responding) and clears it once the run is a replay. The global `[hidden] { display: none !important }` rule already beats `.bar .replay-controls { display: inline-flex }`.

## Milestones

**M1 — hide the controls while a run is in progress**
- [x] RED: live run hides the group; it shows once the run ends and replays; a recorded replay shows it
- [x] GREEN, gates: `pnpm -r build`, `pnpm -r lint`, `pnpm -r coverage` pass (viewer 904 tests; 95.32 stmts / 91.1 branches / 93.62 funcs / 97.62 lines; agent 1619 tests). Python untouched.
- [ ] Review: Claude, Codex, Grok on one frozen packet; land ff-only
