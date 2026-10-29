# Qwen viewer elapsed clock

User authorization: "why is time unavailable for the qwen run in the viewer? we need a fix".

Bounded bug fix: restore display-only elapsed time for complete current snapshots carrying a recorded timestamp regression, retaining the warning and labelling watch-page clocks approximate. No recording rewrite, gameplay input, model/harness change, grading change, new timeline marks or trainer-card markup changes.

Evidence: current Qwen 2026-10-29T07-49-48_qwen36-gpu0_82e1 is live, current complete=true, elapsedMs=null, warning="Recorded time moved backwards; current display is not timing validation". Only regression in read prefix: native_action seq14770 at08:48:36.956 to state seq14771 at08:48:36.939, -17ms. Current projection suppresses elapsed forever when warning is nonnull.

Source stage: RED tests projection + mounted app, GREEN projection and approximate display, cheap checks then coordinated full gates, background browser proof, cloud review. Landing stage: board and FF merge after gates/review. Activation stage: separately coordinated viewer-only refresh, process continuity and live browser proof. No gameplay restart.

Invariants: incomplete aggregate/time stays null; complete elapsed excludes pauses and freezes when ended/paused; warnings persist; no splits/measurement authority in current snapshots; warning clocks visibly approximate. Existing shared source and recordings preserved.

Skills: viewer-e2e, close-the-loop, execute-worklog, talk-to-claude (CPU/restart/landing coordination).

Status: discovery complete; implementation pending. No landing or activation yet.
