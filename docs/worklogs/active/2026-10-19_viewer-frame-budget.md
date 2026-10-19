# Viewer frame-budget investigation

## Authority and boundary

The operator requested deep investigation in this order: per-stage measurement, binary transport, checksum/relay optimization, then browser rendering, benchmarking each change independently. Prior permission to delegate applies. Follow-up operator decision: "we need to target the og pokeagent settings as our goal". Target original configured80FPS normal /320FPS dialogue; retain original work-plus-sleep as an explicit reference and distinguish configured from achieved rate. No Rust rewrite, silent active-campaign speed change, experiment launch or unreviewed main landing in this phase. Live servers and user tabs are preserved; candidate servers use owned scratch roots without queue approvals.

## Questions and protocol

1. Bind baseline to exact source, scheduler policy, workload, frame sequence and resource use. Distinguish core frame advance, source publication, upstream receipt, viewer delivery, browser image-load completion and actual paint (image loads alone are not paint).
2. Measure existing JSON/base64/PNG validation and send paths, including event-loop delay and intentional overwrite/latest frame drops. Identify the largest observed loss before proposing replacements.
3. Benchmark binary transport versus unchanged baseline with identical PNG payloads and topology, alternating order across at least three repetitions. Preserve origin/auth, frame validation, buffer bounds, teardown and legacy compatibility.
4. Benchmark checksum/relay optimization independently versus baseline, not stacked with binary. Native or table CRC must reject the same corrupt fixtures. Report no-effect outcomes.
5. Only then investigate browser decode/presentation if measurable headroom remains; no speculative rewrite. Use real browser proof before claiming a UI change.
6. Real-game two-server confirmation under observation load for promising candidates, with fresh controlled source pins and scheduling. Do not claim model benchmark benefit or hours-long stability.
7. Target original gameplay configuration by explicit operator instruction: pinned vendor target is80FPS, dialogue4x(320); additive per-frame sleeps lower actual throughput. Commit3c626e32 introduced normalization to59.7275 without preserving that setting. Benchmark OG behavior and candidate timing separately; do not treat59.7 as the desired game-speed ceiling. Display/publication cadence and game action timings remain separate metrics. Any production cadence restoration must be explicit and reviewed, not hidden inside transport deltas.

## Starting evidence

Prior round-10 clean42c4a65a simultaneous model play under Interactive launch policy measured59.70/59.72core,56.96/57.14direct and49.17/48.41viewerFPS; actual browser image-load completions48.37/sec. Prior label 'presented' means image load, not a direct compositor paint measurement. Background policy on same code stayed near11.6core/10viewerFPS. These are historical receipts, not a fresh baseline or isolated transport attribution.

## Session log

- Created isolated managed worktree at current main e31fc573 before investigation changes. Registered prior attachment server-stream-performance is stale/missing on disk and was not reused. Existing primary branch and campaign frozen checkouts untouched.
- Operator clarified OG settings as goal before full measurements. Initial59.7 smoke remains diagnostic only; primary capacity matrix will use80/320source rates and real-game confirmation will compare the original80/320configured work-plus-sleep baseline. Cadence provenance receipt: .cache/frame-budget/cadence-provenance.md (ignored).

## Results / review

Operator clarified and approved the target: achieve 80 game FPS normally and 320 during dialogue using deadline pacing. The earlier 60 FPS guidance is superseded. Original additive work-plus-sleep pacing is a historical reference, not the desired implementation or an assumed achieved rate; current 59.7275 normalization is a comparison arm, not the target. Game progression, publication, socket delivery and display remain separate acceptance measurements. Deadline80 restoration is explicitly authorized, but still requires implementation tests and review before production rollout.

Stage-1 diagnostic receipts (ignored `.cache/frame-budget/`):

- Small catalog, two publishers and two clients per publisher: 80.00–80.07 socket FPS with zero missing frame IDs in all three idle and three polling repetitions. This measures transport capacity, not browser paint or real-game execution.
- 320 Hz stress: two publishers deliver approximately 295–318 socket FPS; missing IDs match bounded latest-frame overwrites. This is stress capacity, not a proposed 320 FPS display target.
- Warm 372-run catalog with actual worker offload and four polling clients: unchanged 80 Hz sources deliver approximately 55–70 socket FPS, with 0.94–2.38 second main-loop stalls. Catalog workload and fixture-generation GC debt are not yet separated; this does not establish a unique cause.
- Real 8.5 KB PNG microbenchmark: JSON parse approximately 0.004 ms, parse/base64 approximately 0.005 ms, PNG validation approximately 0.090 ms mean. The scaled diagnostic validation p95 is approximately 0.27–0.34 ms. These costs alone do not explain the observed stalls.

Completed independent prototype comparisons (24 windows, three alternating-order pairs per candidate/rate, two sources × two clients with polling and production worker offload; no historical catalog). Every invocation checked 1,067 PNG parity fixtures with zero disagreements:

- Binary-only: 80 Hz baseline/candidate approximately 80.06/80.05 socket FPS. At 320 Hz paired candidate deltas were +11.09, -6.45 and -0.03 FPS: no consistent improvement. Do not ship a transport format change on this evidence.
- Native-CRC-only: 320 Hz decode p95 approximately 0.267→0.042 ms; viewer CPU approximately 26.33→19.15% of one core, lower in all three pairs. However delivered socket FPS approximately 319.86→316.36, lower in every pair. This is a stage-cost reduction, not an end-to-end FPS improvement. No production optimization selected from this result.

Real-game pacing comparison is running. First scratch launch stopped cleanly before measurement after the diagnostic passed a Git SHA instead of the worker's 64-hex code identity to viewerOffload. Corrected the ignored orchestrator to use production codeIdentity(fileURLToPath(workerUrl)); both failed-at-start servers exited0. New receipt root `.cache/frame-budget/real-game-pacing-r2/` freezes corrected harness. The same current publication cap stays unchanged to isolate pacing.

Additional source finding: production passes --no-ocr, which disables all vendor dialogue detection, including its RAM check; no owned adapter feeds its cached speed selector. Thus 320 is a conditional source setting, not verified active natural-dialog behavior today. Do not claim natural-dialog 320 throughput from the synthetic stress test. Restoring a RAM-owned dialogue speed bridge would be a separate behavior change.

Real-game pacing repeats complete: two owned native Petalburg emulators per case, 4Hz full observations per emulator, two viewer clients plus one direct observer per emulator, three rotated 15s repetitions. Original additive80: 46.69–47.43 core FPS; deadline80: 76.09–80.00; current59.7: 57.55–59.73. Deadline80 reached80 on both lanes in one repetition but not all; do not call80 sustained. All1,078 requested captures succeeded, no skipped busy ticks/failures, and all18 game processes exited0. Raw archive integrity still needs independent verification. Existing60 publication cap stayed unchanged; deadline80 viewer delivery55.38–59.98 is not an80stream claim. Per-stage evidence points toward additional frame-hook overhead: native frame approximately0.6ms, cache update approximately0.8ms, step_environment approximately8ms in first deadline case; nested wall times include lock/GIL waits and cannot be subtracted into exclusive CPU attribution.

Actual browser profile complete on two80Hz synthetic PNG sources and two1000-state-event live fixtures: 46s paired warm window delivered79.99965/79.99287 socket and SVG-load FPS, with zero new staged overwrites or Long Tasks. Detached-load p95 latest2048 samples1.1/0.7ms; render p952.7/2.8ms. Both DOM visibility states stayed visible; no compositor trace or actual-paint claim. Startup lane0 had five Long Tasks(max770ms) and134 overwrites before the stable window; not a startup-stall fix. Inspected screenshot had visible game pixels; lane1 console warnings/errors empty. Receipt `.cache/frame-budget/browser-profiler/paired-browser-receipt.json`. Browser tabs18/19 and owned listeners stopped. PTY Ctrl-C prevented source published/CPU final reports; those source claims are unavailable, not inferred.

Fresh-process/GC-controlled catalog profiling complete. Three alternating idle/poll pairs, fully warm372-run catalog, explicit full GC and quiet barrier before measurement, prebuilt fixture files rather than in-process370k-row generation: idle80.03–80.07FPS, polling70.70–70.90FPS in all three pairs. Polling loses548–558client frame IDs exactly equal to bounded overwrites; source publishers remain80Hz. Separate diagnostic15s request pass returned2,148,532,224logical bytes via32,784main-thread readSync calls and49,152opens. This is page-cache/logical-read traffic, not proven physical disk traffic. /api/runs accounts for1,660,157,952bytes; each selected cards path244,187,136bytes. GCmax5.33ms/total55.81ms versus max event-loop stall872ms, so GC pauses alone do not explain the pauses. Request work is now causally implicated; detailed parser CPU attribution remains unmeasured. Receipts `.cache/frame-budget/catalog-controlled/{protocol,results,summary}.json`.

Separately prepare a byte-identical bulk canonical EWRAM/IWRAM diagnostic: normal SnapshotMemoryReader currently crosses Python/CFFI per byte on every frame-hook read, while native mGBA itself is fast. Preserve byte semantics, caller locking, full captures and existing noncanonical/side-effectful bus behavior; do not optimize by sampling fewer frames or dropping events. Attribution-only real-game probe is running; bus/bulk comparisons follow without attribution timers.

## Implementation milestones after attribution

- [ ] M1: RED/GREEN server-owned per-run summary memoization, keyed by exact current file identity, with fresh discovery and health. Preserve build-skew semantics; no module-global cache, cache-on-failure, or hidden freshness TTL. Characterize partial/I/O failures before caching. Benchmark only this delta against frozen baseline on the same warm372-run catalog. Defer cards LRU, whole-catalog coalescing and receipt indexing.
- [ ] M2: If native byte-parity and matched real-game comparisons support it, RED/GREEN plain canonical RAM bulk reads as a byte-preserving refactor. Preserve caller locking, raw capture completeness, bus fallbacks, and no retained native pointer. Benchmark separately from catalog and cadence changes.
- [ ] M3: Restore the operator-selected80FPS deadline policy explicitly in recorded configuration, with feature-switch requirements and metadata preserving historical comparability. Test publication80 separately at fixed deadline80. Natural-dialog320 activation is a separate unsupported path; do not silently enable vendor OCR.
- [ ] Final: gates, frozen cloud review roster, real-browser candidate proof, local landing and coordinated viewer restart; current campaign pin/provenance must remain explicit.

Native attribution-only case: action-history journal approximately4.65–4.69ms thread CPU/frame versus native emulator approximately0.445ms. Its task snapshot ran approximately26.6times/frame; repeated640-byte task reads are a substantial constant factor, not a growing-history scan. Nested timings overlap and include instrumentation overhead.

Three alternating15s bus/bulk pairs complete, two native games per case, fixed deadline80 and unchanged publisher/observation load. All12 lanes measured approximately79.97–80.07core FPS. Existing bus step mean5.92–6.03ms versus bulk1.84–1.89ms, consistently about69% less step wall time. This establishes frame-budget headroom, not uncapped FPS or natural-dialog320. Every lane verified512same-frame byte samples (135EWRAM/377IWRAM), zero mismatches/allocation failures; measured read counts/bytes stayed comparable. Whole-region parity and raw archive verification remain pending. Receipt `.cache/frame-budget/bulk-reader-r1/`.

M1 RED independently repeated by parent: targeted run-catalog-cache.test.ts exits1, all16tests fail. Fourteen expose missing createRunCatalog; integration tests show4 and6 unnecessary edge reads on unchanged logs. No production implementation yet. COMMIT planned: `test: expose repeated viewer catalog reads` (RED).

No active campaign settings changed in this phase.

Production changes require RED/GREEN, full gates and frozen review before landing; unavailable reviewer lanes remain unavailable unless operator grants a specific exception.
