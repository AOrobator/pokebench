# Server stream and emulator frame-rate regression

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
- [x] Focused tests and adversarial abort/backpressure proof: 58/58 focused tests pass. The abandoned stream stops further reads, a separate short stream completes, unrelated requests stay responsive, and backpressure still waits for `drain`.
- [x] Full gates: `just test` (agent 2540, viewer 1205, Python 2492), `just build`, `just coverage` (agent 97.88/94.04/98.25; viewer 95.46/91.38/93.94; Python 96.96/92.48/99.44), and `just verify-vendor` pass. TypeScript lint plus Ruff pass. The isolated worktree's aggregate `just lint` cannot import `mgba._pylib` because this new worktree has not built the native binding; the identical mypy check passes with the canonical project environment (93 files).
- [x] Candidate viewer on owned port 8798 and real-browser proof: live run and trainer cards rendered, `/api/runs` returned 200 in 0.206 s, and browser console had no application errors (only MetaMask extension warnings). Cold startup became idle before a page requested comparison data; an opened dashboard then used the single permitted worker rather than four.
- [x] Live repair: sent SIGTERM only to viewer PID 87545, preserving game PIDs 19982/19983, and served the candidate on 8790 for the live check. The temporary foreground candidate ended during the subsequent build/gate cycle; durable `just viewer-main` follows the reviewed fast-forward to main.
- [ ] Multi-model read-only review and landing receipt.

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
