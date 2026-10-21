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
- Cooperative implementation uses the same strict snapshot generator for synchronous callers and asynchronous HTTP readers, yielding every 16 parsed lines or 4 ms (tiny injected line bound in tests). Head JSON is serialized in bounded chunks with socket backpressure/abort handling rather than one large stringify. No validation is removed; bytes remain the same JSON array.
- Further bounded-read hardening replaces the initial whole 8 MB buffer/string split with 64 KiB reads on one opened descriptor and a frozen end. Complete lines retain UTF-8 integrity; long lines join fragments once, partial tails remain excluded. The first cooperative soak overlapped focused tests and is diagnostic only, not acceptance evidence.
- Three performed mutations fail their intended tests: remove cooperative yielding, remove head-response drain wait, discard upstream metadata. All mutations restored. Head JSON/SSE integrity, backpressure and reader abort tests pass with tiny chunk bounds.
- Python tooling now has an independent worktree virtualenv. A temporary shared-env link used during setup caused uv to repoint its editable project; canonical uv sync immediately restored it before replacing the worktree link with an owned environment. Running games use separate frozen environments and were unaffected.
- Repository lint passes, including Python mypy over 112 source files. Initial full Python test/coverage attempts lacked POKEBENCH_ROM in the fresh worktree environment (164 failures, 515 skips), not missing archive files; use the operator's existing external ROM path for the real gate. No exclusions or retries-as-suppression were introduced. Viewer coverage clears the floor (95.42% statements, 91.31% branches, 94.33% functions, 97.94% lines).
- Added exact UTF-8 multi-chunk/frozen-descriptor coverage: one 80 KB valid event crosses the 64 KiB I/O quantum; append and atomic path replacement during a cooperative yield must not alter the snapshot or cursor. This tests a read quantum, not a filled 8 MiB cap.
- Synced current main d93a916a1 (0ede4832 merge tip); own delta remains nine viewer/test/worklog files. Full gates pass: agent 3,398; viewer 1,645; Python 3,806, zero skips. Lint (including mypy 112 files), build and vendor integrity pass. Coverage: agent 99.20% lines/93.14% branches/97.80% functions; viewer 97.94/91.30/94.33; Python 97.29/93.11/100.00.
- Acceptance uses simultaneous baseline (f232182f2 instrumentation-only), candidate and direct streams on the same three real games, identical regular APFS snapshot copies and isolated scratch roots with no approval/autorun. During 90s of repeated three-run history/card requests, baseline initial head dispatch mean/max 105.74/562.67 ms; candidate 4.26/20.11 ms. Baseline vs candidate proxy FPS: GPU1 53.35 -> 55.05 (direct 55.23); GPU0 55.48 -> 57.53 (direct 57.65); GLM 74.95 -> 77.56 (direct 77.95). Candidate retains 99.50–99.79% of direct-stream rate; baseline 96.15–96.59%. Baseline max gaps 569–593 ms; candidate 161–314 ms; direct 137–315 ms. Remaining source/host hitches are not claimed fixed. Receipts: `/private/tmp/pokebench-viewer-stalls/paired-*.json`; test activity did not overlap this final paired sample.
- Candidate browser on 8808: real Watch card click selects GPU0, RUNNING, live blob PNG pixels visible and advancing, zero sampled application console errors. Snapshot trace/card data is deliberately static while screen subscriptions show the real live games. Production games retain PIDs 40414/41983/40415. Further browser interval/return-path and post-rollout proof will be recorded separately.
- Reserved landing-board slot 1. Existing Claude landing/restart completed independently; 8790 now PID 64977 at d93a916a1. Sent restart coordination via authorized relay; no listener, messages saved. No production viewer changes by this branch yet.
- Round 1 Claude/Grok/GPT found two concrete in-boundary defects: uncaught metrics URL classification and missing cooperative-read cancellation. RED regression run: 113 pass, two fail at those exact boundaries. Strengthened real sender and histogram assertions. Snapshot qualification: only the two Qwen paired logs are byte-identical; GLM candidate includes a 184-byte append and is supporting directional evidence. The acceptance paragraph's blanket identical-copy claim is superseded by this qualification.
