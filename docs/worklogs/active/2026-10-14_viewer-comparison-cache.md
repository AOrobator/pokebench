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

RED commit: `8d571e8`. GREEN implementation: shared baseline reader and metadata invalidation, bounded LRU and defensive returned copies. Ten new tests; 337 viewer and 799 agent tests, plus 561 Python tests pass. Repository lint/build/coverage/vendor gates pass. Viewer coverage: lines 98.51%, branches 91.20%, functions 96.00%; agent: 98.82/93.27/97.68%; Python: 99.18/96.35/100.00%. A final viewer coverage/lint pass covers the added server-lifetime assertion.

Serving variant: isolated managed worktree `/Users/user/.codex/worktrees/viewer-comparison-cache-live/pokebench` from the navigation checkout's HEAD. Transplanted only identical cache implementation/wiring, the two new test files, and the previously reviewed right-D-pad vertex. No active navigation checkout modifications. Its 247 viewer tests, lint/build and coverage pass: lines 98.44%, branches 91.83%, functions 96.98%. Existing agent/navigation modules and queue contract retained.

Performed mutation receipts: removed cache-hit comparison (unchanged reads and HTTP sharing fail), removed ctime operand with mtime held exactly fixed (stale 3100 instead of 4100), removed post-validation equality while preserving fingerprint call (raced result becomes stale 3100 instead of 4100), removed defensive clone (caller mutation removes cached splits). Restored each operand and reran GREEN. Initial retention mutation removed the fingerprint call too and did not test its intended seam; corrected to preserve the call. Initial timestamp mock spread stripped stat prototype getters; replaced with mutation of the returned stat object. These were test-development failures, not ignored tests.

## Principles adherence before review

| ID | Result | Evidence |
| --- | --- | --- |
| PB1 | PASS | `baselineOf` remains the sole validator and split fold; exact cached/uncached comparisons and malformed interior rejection tested. |
| PB2 | PASS | Existing DNF, abort and partial-split eligibility unchanged and existing tests pass. |
| PB3 | N/A | No benchmark superiority claim; endpoint timings are viewer performance evidence only. |
| PB4 | PASS | No gameplay assistance, vendor changes or recording changes. |
| PB5 | PASS | One variable: reuse validated splits; all eligibility recomputed per request. |
| PB6 | N/A | No model context or long-run agent changes. |
| PB7 | PASS | Cache remains bound to filesystem event-log identity/metadata; changed logs revalidate. |
| PB8 | N/A | No model validation/retry changes. |
| PB9 | PASS | Explicit operator caching request; no unresolved harness decisions. |
| PB10 | PASS | RED and GREEN, all gates ≥90%; no excludes, skips or relaxed tests. |
| PB11 | PASS | Node filesystem bigint stat API used at the installed runtime; real filesystem/HTTP tests. |
| PB12 | PASS | No ROM reads or copies. |
| PB13 | PASS | Worklog, test/gate and mutation receipts retained; review and live replacement remain explicit closeout steps. |

Review roster note: the serving navigation worklog forbids local model review lanes while its measured cohort runs. Preserve that owner constraint; use external vendor reviewers and standing fresh independent fallback rather than making inference calls on the benchmark endpoints. `/models` discovery only was read-only and made no inference call. Dedicated Claude CLI has no login; Cursor Claude already returned account usage-limit failure in this conversation. Availability receipts remain in `/tmp/pokebench-dpad-review.stderr`; attempt the remaining external vendor harness and retain reduced diversity if unavailable.
