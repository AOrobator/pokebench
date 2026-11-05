# Splits race: honest opponents for assisted and save runs

Branch `claude/splits-race-honest`, worktree `/private/tmp/pb-splits-race-honest`, based on main 61da9af6c.
Viewer-only correctness fix, so no feature switch (the feature-switch skill excludes viewer-only changes); it is always on.

## Scope

- [x] Assisted runs race the New Game frontier, flagged HEAVILY ASSISTED; they still never rank on it.
- [x] Save runs race the fastest earlier unassisted run from the same save (start_state sha1), each on its own clock.
- [x] No qualifying earlier run: the page says why and never falls back to the New Game frontier.
- [x] Race graph draws the opponent as unhelped when an assisted run races it.
- [ ] Heavy gates: wait for START from the coordinator.
- [ ] Browser proof on real runs 0952, ee2a, 9f4c.
- [ ] Multi-model review, then land only on the operator's go.

## Decisions

- "Fastest" uses the frontier's own order: furthest checkpoint, then the time to reach it.
- Rivals exclude assisted, excluded, problem, probe and milestone-free runs. Aborted runs count.
- A named checkpoint resume (for example ROUTE_101.state) now also races its save frontier; it used to race nothing.
- The save frontier list is in memory only. After a viewer restart a save run shows loading until the first ranking.

## Log

COMMIT: `test(viewer): assisted runs and save runs get an honest race` (2c2467279). RED.
GREEN: focused files only (splits-race-honest, splits-race, frontier-cache, frontier-fail-open, custom-lane), 74 passed. Full gates not run.
COMMIT: `fix(viewer): race assisted runs and save runs honestly` (3da30766f). GREEN.
Typecheck found the test fixture missing the event envelope; fixed in the next commit. Build and `pnpm -r lint` pass.
