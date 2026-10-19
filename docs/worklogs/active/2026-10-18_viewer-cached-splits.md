# Viewer cached splits

## Problem Statement

Opening or switching to a recorded run clears the selected run view and folds `events.jsonl` from event zero. The sidebar therefore paints already-recorded milestones one by one while the stream catches up. The operator expects the latest recorded split snapshot to render immediately, without weakening the event log as the source of truth.

## Skills Loaded

- `pokebench-story-milestones`: preserve recorded milestone semantics and provenance.
- `viewer-e2e`: prove the selected-run viewer behavior in the real browser.
- `close-the-loop`: require RED/GREEN tests, real-browser widths, and read-only real-data checks.

## Architecture

- Continue streaming and folding the complete event log for replay, state, trace, and final authoritative UI.
- While the stream is catching up, render the selected run's compact split snapshot from `/api/workbench`.
- Never merge partial replay milestones into the cached projection. Switch atomically from the cached projection to the fully caught-up `RunView`.
- If the snapshot is unavailable, hold a stable loading state rather than rediscovering splits one by one.

## Invariants

- **INV-1:** `events.jsonl` remains the record of truth. The cache is display-only during stream catch-up. Test: after `caught_up`, the sidebar uses the folded `RunView` and reflects its milestones.
- **INV-2:** Already-recorded splits never appear sequentially during bootstrap. Test: partial stream delivery cannot replace the cached complete split list.
- **INV-3:** The cached projection is scoped to the selected run. Test: switching runs cannot show the previous run's splits.
- **INV-4:** Cache failure is recoverable. Test: the stream still becomes authoritative after `caught_up` when `/api/workbench` is unavailable.

## Security Review

No new write, network origin, control, or file-system boundary. `/api/workbench` is already same-origin, parsed by the existing strict validator, and contains recorded read-only projections. Run identity must match before using a snapshot.

## Milestones

**M1 — Atomic cached split bootstrap**

- [x] Write tests for cached complete splits, partial stream stability, run scoping, and cache-failure recovery.
- [ ] COMMIT: `test(viewer): require atomic cached split bootstrap` (RED)
- [ ] Implement the display-only cached projection.
- [ ] Gates: targeted tests, `just test`, `just lint`, `just build`, `just coverage` (>=90).
- [ ] COMMIT: `fix(viewer): show cached splits during replay catch-up` (GREEN)
- [ ] Real-browser proof at desktop and phone widths, including run switching and two polling cycles.
- [ ] Read-only before/after check against real run data.
- [ ] Multi-model review loop until clean.

## Closing the Loop

- Pending.

## Session Log

- 2026-10-18: Operator reported sequential milestone flashing and asked to render the recorded current state from cache. Traced the behavior to `App.select` resetting `RunView` and the SSE endpoint replaying from byte zero in 2,000-line chunks. Confirmed milestone events and the workbench split snapshot already exist.
- 2026-10-18: RED targeted run: app tests failed because cached splits were ignored and partial streamed milestones painted during loading. The controls suite also requires the agent package build in this fresh worktree; this setup gap is separate from the two expected behavioral failures.

## Surprises

- The compact workbench snapshot already contains every split needed for this sidebar; the selected-run view currently ignores it during bootstrap.

## Multi-Model Review Log

- Pending.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER: approve archival after landing and live proof.
