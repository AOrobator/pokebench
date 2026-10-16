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

## Review synthesis

GREEN main commit `fabcdbe`; serving variant `4fb2db6` (navigation-compatible snapshot). Frozen source/test packets: main `080f669777d1d1eb6f259a9683d63c7d29fdc42f2cddfe2669773988a8c95620`, live `b9fdf7c3e411b86b65e16f41cbd78f095bbd8caa25a92fd58f0657c5d3801a90`. Neither packet changed during review.

Selected reviewers: Cursor Grok (`cursor-grok-4.5-high`, exit0, empty stderr, final literal `VERDICT: LGTM`); independent read-only Sol (`/root/cache_review_sol`, gpt-6.1-sol) and Astra (`/root/cache_review_astra`, gpt-6-astra) fallback/GPT roster, both literal `VERDICT: LGTM`. Claude profile unavailable and Cursor Claude usage-limited as recorded; local benchmark endpoints excluded under serving-worklog policy. Reduced vendor diversity and explicit omission of local endpoint reviews; no normal five-lane claim.

Sol initially returned BLOCKING for missing performed eviction/ownership proof; Astra also requested explicit caller-wiring receipts. Performed these on an isolated copy of the frozen source and tests, without modifying either review checkout: disabling LRU eviction fails `expected0 >0`; module-shared reader fails fresh-server `expected6 tobe8` reads; comparison caller bypass fails `expected8 tobe6` reads; history and milestone bypasses each fail `readSync` zero-call assertion with2reads. Logs: `/tmp/viewer-cache-adversarial-{eviction,server-owner,comparisons-wire,history-wire,milestones-wire}.log`. Restored all five; `/tmp/viewer-cache-adversarial-restored.log` passes10/10. Sol and Astra independently inspected the added receipts and approved the unchanged packets. No code fixes, contradictions, owner growth or scope expansion; evidence-only round two terminates.

All nine test-quality checks covered: real filesystem and HTTP caller seams; performed operand/wiring deletions; mocks restored by afterEach; unique owned roots/exact responses; sequential awaited HTTP and independent server ownership with cleanup; no sleeps/retries/skips in tests; Vitest payload diffs/read counts; fixtures at most three14-event logs with one file write per fixture and no growing-prefix validation; injected2-entry cap, separately pinned256default. Every PB row remains scored with zeroFAIL. No missing merge evidence for the authorized in-memory caching contract; cold validation remains a named limitation.

## Running viewer receipt

Controlled real-catalog timings: cold20009ms, warm40ms and35ms, identical78107-byte response and SHA-256 `98af04fc01529a4abac1bdb95a604a7994cf89e5e433d3473e576b221724b520`.

Updated the actual8793 viewer from PID38672 to PID8188 using the isolated build. Its launch script preserves the existing navigation CLI, agent launch path, run root and endpoint; only viewer modules/static files come from the serving snapshot. No agent or emulator restart: PID87596/87609 retained, game8070 `/health`200 before/after. Cache warmed once; immediate reconnect contention gave1770/138ms, subsequent stable real-server requests44/35/36ms, all200 and78107bytes. Startup/timings/PID receipts in serving worktree `runs/launch-receipts/viewer-comparison-cache/`.

Refreshed the user's existing Chrome tab at8793 and verified RUNNING, advancing T392 clock, live screen URL, empty problems and visible game frame. Corrected RIGHT SVG vertex is served and present in DOM. Screenshot: `/Users/user/.codex/visualizations/2026/10/14/00000000-0000-4000-8000-ef312cb524d7/viewer-cache-live.png`.

Complete: cached repeat refreshes, automatic file invalidation, bounded isolated cache, gates, review and running-viewer proof. First validation after server restart remains cold; no persistent cache or nonblocking cold scan claim. Unrelated worklog changes from other work remain untouched.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-14). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
