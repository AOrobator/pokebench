# newer-run-start: a newer harness's run_start keeps the run listed with the restart hint

Follow-up from the viewer-event-skew review (docs/worklogs/active/2026-10-16_viewer-event-skew.md): when a newer harness adds a field to `run_start`, the viewer's schema rejects the run's first event, so it never learns the run's build. The run turns `invalid` with an old-style message (`run <id> has no readable run_start`) and no restart hint.

Branch `claude/newer-run-start`, worktree `.claude/worktrees/agent-a3a0bd155e60b0024`. Viewer-only plus a loose reader in the agent's `events.ts`; no harness behavior change, so no feature switch. The 8790 viewer and `runs/` are untouched; the live-ish check runs on a scratch copy.

## Design

- `startIdentity(value)` (agent `events.ts`): reads `run_start`'s identity loosely, without the closed schema: a valid envelope with `type: "run_start"` and `seq: 0`, `harness.commit` matching the Sha1 pattern and boolean `harness.dirty`; best effort `model.id` and `isolation.port`. Null otherwise.
- Workbench `loadRun`: when the strict `run_start` read fails and the viewer knows its build, and the loose identity names this run with a build that is not the viewer's exact clean build, the rest of the log is read tolerantly (order-checked envelopes; run_end and later run_starts never skipped) for status, turn, timing and port. No splits, no measurement, no config: the run cannot be graded. `skew.startless: true`. `settleSkew` then: skewed → keep status, problem `<head>. It cannot read this run's run_start, so the run is not graded; it skipped N events …; first: line 1: …`; viewer newer than the run → invalid with today's message.
- Run list (`listRuns(root, build)`): the same loose fallback sets the problem to the restart hint, with model and start time from the loose read.
- Single-run stream: the run's build comes from the loose identity, so the first rejected line (run_start) is reported once with the restart hint.
- Stays strict: unknown viewer build, same clean build, older run, broken JSON, a loose identity that cannot be read (non-hex commit, missing harness, wrong run).

## M1: RED, GREEN, gates

- [x] RED tests: agent `events.test.ts` `startIdentity` (newer run_start with an extra field, valid run_start, unreadable model/port, nine refusals incl. non-hex commit and missing harness): 12 of 67 fail (function missing). Viewer `src/newer-run-start.test.ts` (stats page live/ended/skip count; same build, viewer newer, unknown build, non-hex commit, missing harness, another run's id stay invalid with today's message; broken JSON, gap, unreadable run_end, second run_start; symlink; loader plain data + persisted store; run list; single-run stream and `/api/runs` via startViewer): 7 of 15 fail, the 8 strict cases already pass.
  - RED COMMIT: `test: RED a run whose run_start is from a newer harness stays listed with the restart-the-viewer problem` (pending SHA)
- [ ] GREEN
- [ ] Gates
- [ ] Scratch-copy check through startViewer
