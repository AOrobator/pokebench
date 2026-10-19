# Viewer frame-budget investigation

## Authority and boundary

The operator requested deep investigation in this order: per-stage measurement, binary transport, checksum/relay optimization, then browser rendering, benchmarking each change independently. Prior permission to delegate applies. No Rust rewrite, gameplay speed change, active campaign restart, experiment launch or unreviewed main landing in this phase. Live servers and user tabs are preserved; candidate servers use owned scratch roots without queue approvals.

## Questions and protocol

1. Bind baseline to exact source, scheduler policy, workload, frame sequence and resource use. Distinguish core frame advance, source publication, upstream receipt, viewer delivery, browser image-load completion and actual paint (image loads alone are not paint).
2. Measure existing JSON/base64/PNG validation and send paths, including event-loop delay and intentional overwrite/latest frame drops. Identify the largest observed loss before proposing replacements.
3. Benchmark binary transport versus unchanged baseline with identical PNG payloads and topology, alternating order across at least three repetitions. Preserve origin/auth, frame validation, buffer bounds, teardown and legacy compatibility.
4. Benchmark checksum/relay optimization independently versus baseline, not stacked with binary. Native or table CRC must reject the same corrupt fixtures. Report no-effect outcomes.
5. Only then investigate browser decode/presentation if measurable headroom remains; no speculative rewrite. Use real browser proof before claiming a UI change.
6. Real-game two-server confirmation under observation load for promising candidates, with fresh controlled source pins and scheduling. Do not claim model benchmark benefit or hours-long stability.
7. Keep original gameplay cadence separate. Pinned vendor target is 80 FPS, dialogue 4x (320); additive per-frame sleeps lower actual throughput. Commit 3c626e32 introduced normalization to 59.7275. Document this provenance; do not silently change active campaign speed.

## Starting evidence

Prior round-10 clean42c4a65a simultaneous model play under Interactive launch policy measured59.70/59.72core,56.96/57.14direct and49.17/48.41viewerFPS; actual browser image-load completions48.37/sec. Prior label 'presented' means image load, not a direct compositor paint measurement. Background policy on same code stayed near11.6core/10viewerFPS. These are historical receipts, not a fresh baseline or isolated transport attribution.

## Session log

- Created isolated managed worktree at current main e31fc573 before investigation changes. Registered prior attachment server-stream-performance is stale/missing on disk and was not reused. Existing primary branch and campaign frozen checkouts untouched.

## Results / review

Pending measurements. Production changes require RED/GREEN, full gates and frozen review before landing; unavailable reviewer lanes remain unavailable unless operator grants a specific exception.
