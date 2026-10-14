# Viewer comparison caching

## Problem and authorization

Operator: “lets implement caching”, after a measured 20.124s comparison request on the open viewer at 8793. Completed comparison logs are reread on every page refresh. Feature history shares the same baseline reader and also starts during refresh. User authorization covers this bounded implementation and checking the running viewer.

## Architecture and frozen scope

One server-owned, bounded in-memory baseline reader shared by comparisons, feature history and the existing milestones endpoint. Reuse `baselineOf` validation exactly; cache successful splits and expected invalid-log failures. Fingerprint the resolved event path and filesystem device/inode/size/nanosecond modification/change times. Revalidate changed files, including equal-size edits and replacements. Compare fingerprints before/after validation; never retain a result for a file changed during the read. LRU limit 256; tests inject a limit of two. Existing eligibility, pause-adjusted splits, live inputs and recordings stay owned by their current functions.

Production paths: `runs.ts` (cache owner and comparison injection), `history.ts` (shared reader), `server.ts` (instance ownership and wiring). Tests in existing viewer test files. Prior D-pad fix may be carried into the served build under the earlier authorized request.

Non-goals: persistent disk cache, worker threads, new log format, input/game/model behavior, benchmark comparisons or lifecycle redesign. A fresh server still incurs one cold validation pass; repeat page loads reuse unchanged validated results. Do not claim first-ever cold scanning is eliminated.

## Invariants and validation

- Cached and uncached responses agree exactly; malformed log interiors stay rejected.
- Unchanged logs are fully validated once per viewer instance, shared across consumers.
- Appends, same-size edits, replacement, deletion/recreation and newly completed logs invalidate or refresh naturally; selected-run eligibility remains evaluated each request.
- Bounded cache, isolated roots/server lifetimes and caller mutation cannot contaminate another response.
- RED tests observe read/validation work through the real filesystem/HTTP seam with small fixtures. Delete the cache hit and fingerprint checks separately to prove the relevant regressions fail, then restore.
- Viewer tests, lint/build and per-metric ≥90% coverage; repo-wide required gates, selected review roster and live cold/warm timings before closeout.

## State

RED: seven filesystem/comparison cache tests fail before implementation because `createBaselineReader` does not exist. Test fixtures contain only the existing 14-event short run, at most three candidates; the LRU test injects two entries. No active gameplay process will be restarted; viewer server replacement only after gates and review. Open viewer currently serves the clean detached navigation-experiments checkout; build from an isolated snapshot with that run's harness modules if necessary to preserve its queue owner.
