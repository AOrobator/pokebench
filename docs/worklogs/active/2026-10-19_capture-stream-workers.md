# Capture and stream worker performance repair

## Outcome and authority

The operator requested a bounded queue for RAM capture work and a shared upstream stream per run, then instructed updating the worklog and landing the fixes. Existing standing approval permits local main landing after reviewers approve. No Rust rewrite.

## Frozen scope

Production owners: raw_ram.py, observation.py, serve.py and their capture/settle integration; viewer server.ts and an extracted stream hub if useful. Preserve atomic RAM/CPU/frame/screenshot pairing, durable receipts and errors, request semantics, and pristine vendor code. No gameplay capability, feature switch, experiment, or evidence loss. Queue admission and durable completion waits must occur outside emulator lock/game-loop callbacks. Worker lifecycle and bounded backpressure belong to this repair. Viewer fanout must share validation and one upstream per game/run identity while bounding slow-client buffers and closing unused upstreams.

## Plan

1. RED: deterministic slow-persistence barrier and real transport multi-client regressions.
2. GREEN: immutable atomic capture, bounded durable worker queue, shared upstream hub.
3. Verify full tests, independent 90% coverage, lint, build, vendor; owned real server capture/spectator load and browser stream proof.
4. Frozen cumulative packet, principles PB1–PB13 and independent Claude/Grok/GPT reviews; fast-forward local main and verify viewer refresh.

## Evidence and limits

Live restarted round 8 at 64ca188a still delivered about 9–20 FPS under active observations. Compression/hash/JSON/fsync occur under memory_lock, sometimes on the frame callback. Multiple production viewer subscribers independently open upstreams; development viewer processes without live upstreams do not explain this amplification. Host CPU availability does not remove lock/GIL serialization. No restored FPS claim until measured.

## Session log

- Worklog created before implementation; clean viewer branch fast-forwarded to current main 64ca188a. Running campaign checkouts remain pinned and untouched. Full live game-server adoption will require a later coordinated restart; landing alone cannot replace their Python code.

## Review log

Pending.
