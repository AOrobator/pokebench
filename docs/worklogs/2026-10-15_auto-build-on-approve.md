# Auto-build on experiment approval

Operator request (2026-10-15): approving an experiment in the viewer queue must never ask for `just build`.

## M1: the queue runner rebuilds the agent itself

- [x] RED: production host rebuilds a missing or stale `packages/agent/dist/live.js`, never under a live run, and reports compiler errors.
  COMMIT: `test(viewer): RED the experiment queue rebuilds a missing or stale agent build itself` (d471721)
- [x] GREEN: `productionHost.verifySource` runs the agent package's own tsc (`buildAgent`) when the dist is missing or older than the approved commit; a live run makes it wait (`is still running`, which the viewer shows as Waiting).
  COMMIT: `feat(viewer): the experiment queue rebuilds a missing or stale agent build itself` (bd373ef)
  Tests: viewer 583 passed. Coverage: viewer all files 94.95 lines / 90.63 branches / 93.75 functions (gate 90).
- [x] Review round 1 (Claude CLI, Cursor Grok 4.5 high): both not LGTM.
  - HIGH: tsc emits on type errors, so a failed build bumps live.js mtime and the retry runs it. Fix: `--noEmitOnError` and a `dist/.build-commit` stamp written only after a successful build.
  - HIGH: build ran before the gameplay lease, so a cohort, NEXT RUN or a second queue could load a half-written dist or run tsc concurrently. Fix: runNext takes the lease before verifySource.
  - MEDIUM: commit-time vs mtime misses a fast-forward to an older commit. Fix: the stamp names the commit.
  - MEDIUM: stderr-only failures lost. Fix: include stderr.
  - Deferred: cancelling an in-flight tsc on stop (bounded by a 10 min timeout; the build is short).
- [x] RED round 2: `test(viewer): RED the rebuild runs under the gameplay lease and trusts only a stamped, error-free build` (a05bfc2)
- [x] GREEN round 2: stamp + `--noEmitOnError` + stderr; runNext checks live runs, takes the lease, then verifies/builds and discovers inside it.
  Tests: viewer 583 passed; coverage all files 94.95 / 90.63 / 93.75; lint clean.
- [x] Review round 2 (Claude CLI, Cursor Grok): round-1 fixes confirmed; not LGTM.
  - MEDIUM (both): the stamp names only the commit, so a later `just build` of another tree (or a deleted live.js) still reads as fresh. Fix: the stamp is `<commit> <live.js mtime>`; any other build rewrites live.js and voids it.
  - LOW-MEDIUM: untracked files in packages/agent/src would enter the stamped build. Fix: refuse to build while any exist.
  - LOW: human play takes `.human-gameplay.lock`, not the gameplay lease. Fix: wait while it is held.
  - Deferred: lockfile/node_modules drift (a dependency bump fails the build visibly); cancelling an in-flight tsc on stop.
- [x] RED round 3: `test(viewer): RED the build stamp follows live.js; untracked sources and human play block a rebuild` (0db0b86)
- [x] GREEN round 3. Tests: viewer 583 passed; coverage all files 94.96 / 90.65 / 93.76; lint clean.
- [x] GREEN round 3: `fix(viewer): the build stamp follows live.js; untracked sources and human play block a rebuild` (dc725b6)
- [x] Review round 3 (Claude CLI, Cursor Grok): round-2 fixes confirmed. Remaining: branch was behind main (approvals-survive-merge landed: `host.head()`, `buildCommit`, new head-mismatch wording); human play could start mid-build because its lock was only checked.
- [x] Replayed onto main (pre-rebase history kept on `claude/auto-build-on-approve-pre-rebase`): `buildCommit` stays before the lease, verify/build and discover run inside it; main's head-mismatch wording kept. The build now holds `.human-gameplay.lock` for its duration and releases it even if the build throws.
- [x] COMMIT: `feat(viewer): the experiment queue rebuilds the agent itself instead of asking for just build` (f39a93e). Tests: viewer 585 passed; coverage all files 94.97 / 90.65 / 93.77; lint clean.
- [x] Review round 4 (Claude CLI, Cursor Grok 4.5 high): both LGTM. Noted, no change: hand-started `just run` does not take the gameplay lease (pre-existing); a human restart during a build reads as "still draining".
- [ ] Operator approves the local merge; restart the 8790 viewer on main.

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (781b77c7 Merge branch 'claude/auto-build-on-approve'). Unchecked boxes left above are bookkeeping from before that landing.
