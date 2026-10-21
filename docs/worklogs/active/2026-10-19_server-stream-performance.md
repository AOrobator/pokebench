# Server stream and emulator frame-rate regression

## Phase 2: two-run 60 FPS optimization

Operator direction on 2026-10-19: keep the existing TypeScript/Python architecture (no Rust rewrite), optimize it with parallel specialist review, and prove the result under two concurrent runs. The nominal real-time target is 59.7275 emulated frames per second per run; viewer presentation must use bounded latest-frame delivery rather than accumulating stale frames.

### Phase-2 ground truth

- The live viewer deliberately refreshes its screenshot URL every 500 ms, limiting visible motion to 2 FPS.
- Direct read-only WebSocket sampling observed roughly 4.5 emulated frames/s in each active game server while the viewer was under load, although `/status` returned the configured `80` rather than measured throughput.
- `/api/workbench` returns 5,058,554 bytes on every five-second refresh. Observed recomputation-bound responses took 0.62–0.86 s; cache hits took about 0.016–0.019 s.
- A growing live log invalidates the workbench cache and is reduced from byte zero. Polling a log whose length grows linearly therefore performs quadratic cumulative byte work over run duration.
- The vendor game loop obtains a screenshot every frame and PNG/base64-encodes every second frame for its WebSocket cache even with no WebSocket consumers; the PokeBench viewer separately polls and re-encodes `/screenshot`.

### Phase-2 invariants

- INV-6: After initial validation, a live event-log byte is parsed at most once per viewer process; appends are incremental and total reduction work is linear in bytes appended.
- INV-7: Frame delivery is bounded and latest-frame-only. A slow or absent viewer cannot create a frame backlog or consume per-frame encoding work.
- INV-8: Performance work preserves event order, schema validation, run/replay status, terminal semantics, and every model-visible observation and action.
- INV-9: Configured `/status` cadence is not accepted as throughput proof; acceptance measures source `frame_count` against monotonic wall time.
- INV-10: Acceptance requires a two-run soak with the real candidate viewer, actual achieved-frame measurements, browser-visible frames, bounded memory, and preserved shared run processes. Unit tests or configured FPS alone are insufficient.

### Phase-2 plan

- [x] Replace growing-log whole-history reductions with an incremental reducer/checkpoint or an equivalently linear design, with a mutation-sensitive byte-read test.
- [x] Remove frame encoding when there are no subscribers and replace 2 FPS polling with bounded push delivery where safely possible.
- [x] Audit game-loop pacing, per-frame hooks, native-memory reads, locks, allocations and compression with an independent game-engine reviewer.
- [x] Run focused and full gates, then verify startup, live selection, frames, return navigation, polling stability, console and build identity in an owned browser preview.
- [x] Measure two simultaneous servers with the candidate viewer and report achieved FPS separately from display FPS; do not disturb or relabel existing campaign recordings.

### Phase-2 evidence

- The live reducer now tails only appended bytes after its initial validated read, retaining partial lines and incremental SHA-256 state. Normal cumulative work changes from Θ(total-log-bytes × polls) (quadratic as a log grows linearly) to Θ(total-log-bytes); inode replacement, truncation, same-size rewrite, and evidence-identity change deliberately trigger a full O(n) rebuild. Mutation and terminal-eviction tests cover those reset paths.
- The app polls a card projection rather than the full workbench. On the live two-run set the selected card payload was 24,822 bytes versus 510,942 bytes for the cached full workbench (20.6× smaller). Rich data is retained for selected/live cards; peer identities stay minimal.
- Frame PNG/base64 encoding is disabled with no subscriber. With a subscriber, an absolute 60 Hz publication deadline retains every nominal ~59.7 FPS source frame while capping 4× fast-dialog encoding at 60 PNGs/second; the payload uses the emulator's real core frame counter. The viewer uses same-origin binary WebSocket push with one decode in flight plus one latest queued frame, drops obsolete frames under backpressure, validates the complete PNG chunk/CRC structure, promotes a candidate URL only after browser decode succeeds, and falls back to the pinned `/ws/frames` route for already-running older games.
- A regression test sends three frames through the viewer socket and proves it remains open after successful `ws` callbacks. This caught the browser failure where `ws` reports success as `null` and the proxy incorrectly treated every successful first frame as an error.
- Game-loop pacing is an absolute-deadline schedule (`max(work, period)`), scoped to the game-loop thread; every other `time` module attribute delegates transparently, including the pinned debug endpoint's `ctime`. The vendor's requested 80/320 Hz periods are scaled to the game's nominal 59.7275 Hz base cadence while preserving its 4× fast-dialog ratio, avoiding the earlier candidate's unintended idle-game acceleration. The new `/pokebench/frames` route samples at an absolute 120 Hz but transmits only when the emulator frame counter changes; the oversampling avoids phase-alias drops at a source rate near 60 Hz without duplicating frames.
- A first 60 Hz stream sampler was rejected because two concurrent lanes sourced 59.66/59.70 FPS but delivered only 58.18/58.40 FPS. After the 120 Hz sampling correction, a 120-second simultaneous soak delivered 7,135 frames in 120.014 s (59.451 FPS, source 59.668, p50 16.654 ms, p95 24.526 ms) and 7,131 in 120.006 s (59.422 FPS, source 59.631, p50 16.645 ms, p95 24.477 ms). Server RSS fell by 10,448 KiB and 10,672 KiB over that soak rather than growing.
- Owned-browser proof on candidate port 8800 used both isolated live lanes concurrently. Across 139.4 seconds, the two hidden tabs received 59.12 and 59.18 FPS and completed SVG-image loads at 57.43 and 57.46 FPS; hidden-tab scheduling, not the source or proxy, was the remaining presentation limiter. In the normal one-selected-screen layout while both game servers remained active, the selected tab received 59.69 FPS and presented 59.60 FPS over the final 32.8-second interval. Both screens continuously held distinct `blob:` URLs with visible `live` notes, and the browser reported no warnings or errors.
- Review-found hardening now ignores error/close callbacks from superseded sockets, rejects truncated or CRC-corrupt PNGs, stages browser decoding before replacing the last good frame, detects both between-poll and during-reduction same-size log rewrites through `ctime`, and binds incremental reducer output to the opened file descriptor so an atomic path replacement cannot relabel old bytes as the new inode. The pacing proxy delegates the vendor's unrelated `time.ctime` call, and deterministic 4×-dialog coverage proves 240 source callbacks produce only 59–61 encodes.
- Final candidate gates pass after rebasing onto current main: lint (TypeScript/ESLint plus Ruff, format, and mypy over 94 Python files); tests (agent 2,574, viewer 1,261, Python 2,750); coverage (agent 97.86/94.08/98.27 statements/branches/functions, viewer 94.99/90.92/93.71, Python 97.07/92.68/100 lines/branches/functions); build; vendor integrity; and whitespace validation. The final main advance added four replay-sheet viewer tests without changing this patch's coverage-bearing paths; build-first viewer lint and all 1,261 tests passed again on the integrated candidate. The pre-rebase first coverage attempt hit the unrelated five-second `people-id-cards-delivery` recorded-run timeout; the unchanged test then passed 5/5 alone and the unchanged full coverage gate passed on the next idle run. After the rebase, building the newly landed agent package before the viewer tests supplied main's new `isExtension` export, and the full build-first sequence passed without source changes.
- Post-landing production profiling found that the lightweight `/api/cards` response still called the full partial-workbench loader first: a cold viewer queued all 367 run reductions (19.57 GiB across 457 logs) and only then discarded almost all of their output. The follow-up card snapshot reads O(catalog) first/last-line metadata, but reduces only the selected run plus health-confirmed live candidates; historical experiment peers are materialized directly from their `run_start` cohort identity. On the observed catalog this cuts scheduled reductions from 367 to 2–3 while preserving selected replay detail, both active cards, same-port newest ownership, and trainer allocation. `/api/workbench` remains the explicit full-catalog path and has an independent cache.
- The exact active 48 MB log showed that schema interpretation dominated its cold reduction: 2.53 s for roughly 4,960 lines versus 0.23 s when compiled. Event validation now dispatches by the already-required event discriminator and lazily compiles one validator per event type, retaining the old `Value.Errors` path for byte-for-byte invalid diagnostics. The real candidate card response returned in 0.204 s cold and 0.001 s warm; after background completion the viewer settled idle, and subsequent incremental reads remain proportional only to appended bytes. A monolithic compiled-union attempt was rejected after real-process measurement showed excessive startup residency.
- The isolated measurement servers and candidate viewer were stopped cleanly. Shared campaign artifacts were not restarted or relabelled; their game processes ended naturally during the work.

## Scope

Repair the load-sensitive viewer event-stream failure and the dramatic emulator frame-rate regression reported on 2026-10-19. Preserve the running campaign while replacing only the viewer after the candidate is proven. This is performance/reliability work: it changes neither model-visible behavior nor benchmark capability, so it needs no feature switch or experiment entry.

## Ground truth before edits

- Main: `f9a495aaeb52d4afced5437e773f9c78a861e9c0`.
- `just coverage` times out in `packages/viewer/src/server-stream.test.ts` at `stops reading once a client abandons a long stream, and keeps serving`; the same test passes alone, making the failure load-sensitive rather than green.
- Active campaign runs on ports 8075 and 8076 show fixed 10-frame press plus 8-frame release actions taking about 2.4–2.6 s. Recorded median button-to-native-action latency was about 0.7–0.8 s before source `cd596604`, then about 4.1 s from `cd596604` onward.
- The source boundary between the last fast and first slow runs contains only `battle-effective-damage-v1`; this is correlation, not yet causation.
- Port 8790 was served by PID 87545 from `/private/tmp/pokebench-viewer`; it held four 271–348 MB historical `events.jsonl` files open and sustained roughly 400% CPU. The active game servers are PIDs 19982/19983 and must not be restarted or interrupted by this work.
- Root cause: production CLI startup set `baselines.warm: true`, which eagerly queued every ended run, while the shared pool admitted four whole-log reductions at once. A rebuild changes the cache identity when reducer dependencies change, so a viewer restart can immediately saturate several cores and memory bandwidth scanning run history.
- The apparent source-hash correlation with `battle-effective-damage-v1` was disproved: isolated old/current server runs from the same checkpoint both stepped at roughly 45–48 FPS. The viewer process and its open logs identify the actual shared-host contention.

## Invariants

- INV-1: A disconnected stream stops file reads promptly and does not keep the viewer busy.
- INV-2: A slow stream cannot delay unrelated viewer requests.
- INV-3: Log bytes remain ordered, validated, and delivered once; live catch-up and terminal `done` semantics stay unchanged.
- INV-4: A viewer restart does not eagerly scan historical logs; requested reductions are serialized so they cannot consume several cores at once.
- INV-5: Existing game processes and run artifacts remain untouched across the viewer replacement.

## Plan and evidence

- [x] Bind running viewer, game servers, source hashes, process ownership, and run artifacts.
- [x] Establish historical frame-latency breakpoint from recorded events.
- [x] RED: `cli.test.ts` failed because the production offload seam was absent; the pool-size contract expected 2 and observed 4. Full coverage also reproduced the redundant 30,000-event post-abort reread timeout.
- [x] GREEN: production offload no longer requests catalog warm-up; the worker pool serializes whole-log reductions; the abort test proves the viewer remains usable with a separate two-event run rather than rereading the same 30,000-event fixture.
- [x] Focused tests and adversarial abort/backpressure proof: 58/58 focused tests pass. The abandoned active stream stops further file probes, a separate short stream completes, unrelated requests stay responsive, and backpressure still waits for `drain`. The abandonment test destroys a native Node response while an unterminated log is polling; making the close handler a no-op fails `expected 17 to be 8`, and restoration passes. After syncing with main, the slow-reader test injects backpressure at the real `ServerResponse.write` seam with 400 events instead of depending on a 30,000-event OS-buffer race; deleting the production `drain` wait makes it fail `expected 10 to be 9`, and restoring the wait makes it green.
- [x] Production composition proof: `viewerOffload` accepts an injected worker constructor for testing, then the production-path test queues two baseline jobs plus one workbench job and observes one spawned worker and one active request. Replacing the caller's computed pool size with literal `4` fails `expected 3 to be 1`; adding `warm: true` fails `expected true not to be true`; both mutations were restored.
- [x] Repeated warm focused timings (58/58 each, no retries or widened timeout): Vitest durations were 3.44 s, 5.57 s, 3.32 s, 3.36 s, and 3.36 s; wall times were 3.80 s, 6.01 s, 3.69 s, 3.72 s, and 3.71 s.
- [x] Full gates after rebasing onto `e326e6d9`: `just test` passes (agent 2567; viewer 1230; Python 2495), and the final `just coverage` passes (agent 97.86/94.09/98.31, viewer 95.46/91.35/93.99, Python 96.95/92.46/99.44). `just build`, `just verify-vendor`, TypeScript lint, Ruff lint/format, and mypy (93 files through the canonical native-binding environment) pass. The first post-rebase coverage run hit one unrelated `HumanRestarts` readiness timeout; the exact test then passed 5/5 in isolation and the full coverage gate passed without a source or timeout change. The same-main baseline still fails the old load-sensitive server-stream tests this packet replaces.
- [x] Candidate viewer on owned port 8798 and real-browser proof: live run and trainer cards rendered, `/api/runs` returned 200 in 0.206 s, and browser console had no application errors (only MetaMask extension warnings). Cold startup became idle before a page requested comparison data; an opened dashboard then used the single permitted worker rather than four.
- [x] Live repair: sent SIGTERM only to viewer PID 87545, preserving game PIDs 19982/19983, and served the candidate on 8790 for the live check. The temporary foreground candidate ended during the subsequent build/gate cycle; durable `just viewer-main` follows the reviewed fast-forward to main.
- [ ] Round-one reviewers converged on three evidence gaps (caller-level one-worker proof, explicit no-warm/abandonment mutations, repeated warm timings); all are repaired above. Freeze a cumulative round-two packet, obtain the required explicit approvals, then land and capture the durable live receipt.

## Principles self-review

- PB1–PB5: N/A; no benchmark outcome claim or measured treatment launch.
- PB6: Applies: long logs and cumulative stream load are the reproducer.
- PB7: Applies: preserve append-only event-log fidelity and replay.
- PB8: Applies: stream abandonment and timeouts must remain bounded and visible.
- PB9: No unresolved product decision; repair existing reliability contracts only.
- PB10: Applies: repair the red coverage gate without widening timeout or weakening assertions.
- PB11: Applies if Node or mGBA runtime behavior is relied on; prove against pinned dependencies.
- PB12: ROM access, if needed for an isolated live benchmark, goes only through `POKEBENCH_ROM`.
- PB13: Applies: close with gates, evidence, worklog, commit, and review.
