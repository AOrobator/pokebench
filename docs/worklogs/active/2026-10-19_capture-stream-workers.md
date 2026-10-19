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

### Implementation and focused proof

- Shared upstream hub now owns one connection per run/game-port identity. PNG parse/CRC validation is O(B) once per source frame; fanout makes O(C) send attempts and necessarily transmits O(B*C) bytes to C subscribers. Each client retains one send and one replaceable latest frame. Final unsubscribe, source replacement, invalid/error/close, fallback and viewer shutdown are covered.
- Real two-client RED observed two upstreams instead of one. Disabling hub reuse after GREEN reproduced that failure; restored. Viewer-focused 64 tests and full viewer coverage passed; root TS coverage also passed 2,581 agent and 1,275 viewer tests with every required coverage metric above 90%.
- RAM capture now reserves one of eight slots before acquiring the frame lock, copies 527,360 fixed RAM bytes plus CPU/frame metadata and copied framebuffer pixels, then leaves the callback/lock. Request decoding and PNG encoding run against immutable snapshots; a separate spawned process performs base64/hash/JSON/gzip/durable archive/index/pair writes. All successful requests retain synchronous durable acknowledgments. Slots bound admitted persistence work; total request memory also includes snapshots retained by callers and IPC copies.
- State, settled observations, battle waits and whiteout ON/OFF routes are wired. Worker death (actual spawned os._exit), pair failure, abandonment, duplicate submission, shutdown and ROM mirrors are tested. Focused Python 117 tests, mypy (94 files), ruff and diff checks pass.
- Performed narrow mutation moving persistence into capture_frozen: the actual settle-callback barrier test failed with `frame callback retained persistence work` in 0.41s, then passed restored. This mutation receipt is in the agent transcript, not a saved log. The test mutates backing RAM and framebuffer after the atomic copy and checks preserved decoded screen, pixels, raw frame and pair hash.
- Initial broad Python attempt omitted the ROM environment (229 integration skips) and exposed one lifecycle fixture invoking routes after fake vendor_main returned. The fixture now keeps the server lifetime active through its requests and asserts closed-archive failure afterward. Final ROM-enabled full coverage/gates are running; skipped integration tests are not counted as proof.
- Controlled baseline with checkpoint, small active action batches and state polls stayed near 60 core FPS; it does not reproduce campaign 7–20 FPS. Full observation/capture load and candidate comparison are still being measured. These changes remove demonstrated lock and fanout hazards; restored campaign throughput remains unproven.
- Main advanced independently from 64ca188a to 16384dec during implementation. Integrate current main before freezing/review; gates on the prior base do not certify the integrated candidate.
