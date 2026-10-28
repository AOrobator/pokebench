# Scene capture coverage and profiling

Authorized by the operator: implement safe-point sampling, lightweight continuous event coverage, bounded raw diagnostics around gaps, and profiling before increasing visual cadence. Preserve active runs, inputs, frame counts, and historical recordings.

One bounded change behind a new default-OFF registered switch; OFF reproduces the prior scene journal endpoint/text/hooks. No emulator extra steps or game-memory writes. Reuse scene-journal owner and raw-memory format; no new timeline marks or trainer-card changes. A safe-point deferral is distinct from decode/storage failure; never claim skipped intermediate states were recovered.

- [ ] Profile old hook and isolate safe-point rejection cost using native checkpoint replay, with CPU clearance.
- [ ] Commit production-shaped RED coverage for typed coverage, deferred/recovered sampling, bounded raw diagnostics and OFF invariance.
- [ ] Implement minimal measured design, profile hook/encoding/bytes/retention/throughput; retain visual cadence unless evidence requires more.
- [ ] Prove model delivery + recording/replay/Activity History and explainer path in isolated background browser.
- [ ] Full gates, mutation receipts, principles self-review and independent cloud review. No live activation or gameplay restart included.

Baseline: main ca754cfffd2b3d2d5dca0b85b13c304e437ece88. Worktree branch codex/scene-capture-profiling. Original scene journal samples after each native frame, rejects non-WaitForVBlank state, resets continuity, and reports the rejection as CAPTURE GAP. Memory notes used only as historical caution about false liveness/capture interpretations; current source is authoritative.

RED: 3 new Python tests fail on missing safe_capture keyword; existing 12 pass. TypeScript production factory test rejects absent safe-mode behavior. Baseline native profile (3 checkpoints x 3 order-balanced repeats x 5 modes x600 frames, fixed RTC/no inputs): same final writable-memory hashes across every mode; median legacy hook44.83us, raw-ring addition about19.65us, every-frame PNG hook504.48us. Full raw ring8 retains4,218,880bytes. First exploratory PNG attempt failed on RGBX mode; corrected explicit RGB conversion, complete log retained. No visual cadence increase planned. CPU coordinator cleared one isolated no-inference emulator; no shared ports used.
COMMIT: test scene safe-point coverage and bounded diagnostics RED.
