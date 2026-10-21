# Viewer proxy frame stalls

## Authorized outcome

Instrument the viewer frame path, establish the cause of proxy stalls, and optimize it without restarting running games or changing model observations/actions. Viewer-only implementation; no emulator, agent, feature, experiment, or timeline changes. Work in `codex/viewer-frame-stalls`.

## Evidence and invariants

- Initial live viewer: PID 36542, port 8790, source 4590d681458e9e439b0c0c74386288d500baf9aa. Games: PID 40414/8075, 41983/8076, 40415/8077. Capture current identities again before rollout.
- Prior simultaneous 30s observation: source 59.729 FPS, direct stream 58.595 FPS, proxy 53.894 FPS, proxy p99 90.504 ms/max 326.848 ms. Receipts: `/private/tmp/pokebench-performance-analysis-2026-10-21/`.
- INV-1: preserve every running game process, recording, input and model-visible observation; all live probes are read-only display subscriptions.
- INV-2: preserve PNG integrity checks, origin/host checks, bounded latest-frame delivery, and one shared upstream per live run.
- INV-3: diagnostics use bounded storage, no per-frame logging or persistence, and cannot create a frame backlog.
- INV-4: scratch viewer uses a scratch runs root without experiment approvals/ledgers or an autorunner; never launch candidate CLI against canonical runs.
- INV-5: claim root cause only from measured production-path evidence; separate source/receive/decode/send/browser stages.

## Milestones

1. Record baseline/profile in a scratch viewer and add failing tests for bounded frame metrics and the demonstrated bottleneck.
2. Implement instrumentation and the smallest measured optimization, preserve existing wire compatibility, and run focused/adversarial checks.
3. Complete repository gates and independent frozen Claude/Grok/GPT review; join shared landing board before moving main.
4. Verify candidate in the real browser, coordinate one viewer-only restart after approved landing, and prove source identity, frame delivery and game survival.

## Session log

- Read repository rules, active pointer, viewer-e2e, close-the-loop, execute-worklog and talk-to-claude. Requested restart coordination through the authorized Claude relay; no listener, message saved. Created an isolated managed worktree. No game or model changes.

## Multi-model review log

Pending implementation and frozen packet.
- Baseline CPU profile (owned 8808 preview, real read-only game subscriptions, scratch metadata root) identifies CRC validation ~804 ms, JSON serialization ~567 ms, event validation ~429 ms of sampled CPU. This is attribution evidence, not yet stall-duration proof. Initial measurement was interrupted by premature owned-preview shutdown and is discarded; repeat retains preview until measurement completion.
- RED: new bounded diagnostics test suite fails because the production diagnostics module is absent; existing 1,632 viewer tests pass. An incorrect package-script separator ran the full viewer suite; subsequent focused calls use `pnpm exec vitest run <files>`.
- Instrumented baseline proves the mechanism: recent-head dispatch blocks the viewer event loop (6 requests: mean 70.18 ms, max 100.24 ms; event-loop max 105.25 ms). Frame decode max 0.68 ms, send callback max 1.10 ms, no socket buffered checks/errors. Source age and upstream gaps rise to ~100–110 ms during these dispatches. Thus synchronous recent-event parse/JSON serialization, not PNG validation or a slow viewer socket, is the measured blocking owner.
- Corrected scratch root uses regular copied logs with read-only append mirroring; symlinked logs fail the existing grading integrity check and are not accepted as card-parity evidence. 35s regular-log baseline: Qwen 56.03/56.44 FPS, GLM 77.29 FPS, worst proxy gaps 110/208/110 ms while periodic recent-head requests return up to 8 MB each.
- GREEN instrumentation: 106 focused tests pass. Added a separate RED contract requiring cooperative recent-event parsing to yield with a tiny injected slice while preserving exact event arrays and cursors.
- RED cooperative tests now fail at the missing async reader (2/2); corrected the new fixture to carry the required turn/context fields before accepting RED. Instrumentation committed as f232182f. The second commit was correctly rejected by the worklog-freshness hook; recorded this update and retry normally.
