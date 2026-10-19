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
- Frame PNG/base64 encoding is disabled with no subscriber. With a subscriber, the producer publishes each completed source frame and uses the emulator's real core frame counter. The viewer uses same-origin binary WebSocket push with one frame in flight, drops obsolete frames under backpressure, and falls back to the pinned `/ws/frames` route for already-running older games.
- A regression test sends three frames through the viewer socket and proves it remains open after successful `ws` callbacks. This caught the browser failure where `ws` reports success as `null` and the proxy incorrectly treated every successful first frame as an error.
- Game-loop pacing is an absolute-deadline schedule (`max(work, period)`), scoped to the game-loop thread; unrelated sleeps and model-visible behavior remain unchanged. The new `/pokebench/frames` route also uses absolute 60 Hz deadlines rather than adding serialization and send time to every 16 ms sleep.
- Two isolated candidate games ran concurrently for 30 seconds from the same checkpoint. Each delivered exactly 1,800 messages: lane A 60.00 FPS (source 80.01 FPS, p50 16.53 ms, p95 18.17 ms); lane B 60.00 FPS (source 80.01 FPS, p50 16.72 ms, p95 18.09 ms). Before the deadline route the same lanes delivered 55.50 and 55.25 FPS despite the same ~80 FPS source cadence.
- Owned-browser proof on candidate port 8799 selected each live campaign lane and observed a distinct `blob:` frame URL with the visible note `live`; returning to the first lane recovered another `blob:` frame. Console output contained no application error or warning (only unrelated extension warnings). Already-running game servers exercised the legacy-route fallback.
- Final frozen-tree gates pass: lint (TypeScript/ESLint plus Ruff, format and mypy over 94 Python files); tests (agent 2,567, viewer 1,244, Python 2,743); coverage (agent 97.86/94.09/98.31 statements/branches/functions, viewer 95.18/91.07/93.89, Python 97.09/92.73/100 lines/branches/functions); build; vendor integrity; and whitespace validation.
- The isolated measurement servers were stopped. Shared campaign game PIDs 32038/32039 and their artifacts were not restarted or relabelled; only the owned candidate viewer on port 8799 was used for browser proof.

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
