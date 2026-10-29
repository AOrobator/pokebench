# Qwen viewer elapsed clock

User authorization: "why is time unavailable for the qwen run in the viewer? we need a fix".

Bounded bug fix: restore display-only elapsed time for complete current snapshots carrying a recorded timestamp regression, retaining the warning and labelling watch-page clocks approximate. No recording rewrite, gameplay input, model/harness change, grading change, new timeline marks or trainer-card markup changes.

Evidence: current Qwen 2026-10-29T07-49-48_qwen36-gpu0_82e1 is live, current complete=true, elapsedMs=null, warning="Recorded time moved backwards; current display is not timing validation". Only regression in read prefix: native_action seq14770 at08:48:36.956 to state seq14771 at08:48:36.939, -17ms. Current projection suppresses elapsed forever when warning is nonnull.

Source stage: RED tests projection + mounted app, GREEN projection and approximate display, cheap checks then coordinated full gates, background browser proof, cloud review. Landing stage: board and FF merge after gates/review. Activation stage: separately coordinated viewer-only refresh, process continuity and live browser proof. No gameplay restart.

Invariants: incomplete aggregate/time stays null; complete elapsed excludes pauses and freezes when ended/paused; warnings persist; no splits/measurement authority in current snapshots; warning clocks visibly approximate. Existing shared source and recordings preserved.

Skills: viewer-e2e, close-the-loop, execute-worklog, talk-to-claude (CPU/restart/landing coordination).

Status: discovery complete; implementation pending. No landing or activation yet.

RED commit bab7ba07b initially hit missing compiled dependency, not behavioral RED. Reused agent dist from immutable served d1b5eb62 after verifying zero agent source delta; no heavy build. Actual RED /tmp/qwen-clock-red2.log: 2 expected assertion failures (projection null vs4ms; missing approximate header),27pass. Corrected fixture expected hms format before behavioral RED. CPU prerequisite grant arrived after withdrawal; release sent.
GREEN cheap checks:29 tests PASS; viewer tsc --noEmit PASS; changed-file eslint PASS; git diff --check PASS. Production diff: complete current elapsed is no longer suppressed solely by warning; watch header/top clock and TIME stat prefix approximate and stat explains approx. Existing warning unchanged. No new snapshot schema or grading authority. Full gates requested via relay. Before browser screenshot1440 inspected: current Qwen time unavailable, card0:00, TIME unavailable, game frame live.

Full first pass:5057agent/2340viewer PASS with coverage above90; Python4930pass/1fail because fresh worktree lacked mgba package; initial lint failed same missing import. Installed existing canonical native binding into owned venv (no native build/no source change). Exact failing test file now2PASS. Full receipts preserved in /tmp/qwen-clock-full-test.log and full-lint.log.
Candidate browser real prefix at1280 showed symbol+space wrapping before time. Shortened marker to ~ with no whitespace, retaining approx. in TIME label. Source correction confined same app/controls/test paths.29focused tests PASS again, native view2PASS; types and changed lint pass. Candidate browser first details click attempted hidden panel; corrected proof script selects RUN DETAILS before opening summary. No application navigation defect inferred from that script mistake.

Final executable gates on0132a6e: just test PASS5057agent,2340viewer,4931Python,116gateway plus3protected card visual baselines; coverage agent lines99.16/branches92.45/functions97.48, viewer98.32/90.85/94.97, Python97.50/93.60/99.90, gateway99.21/96.51/100. Full just lint PASS after owned-venv binding setup repair. verify-vendor PASS. No gate/assertion/timeout/fixture weakening. Browser final background proof at1280/1440/375: current clock advancing two renders, approximate header/top clock/TIME stat, RUNNING and game frame; no page errors or non-GET requests. Six screenshots opened/inspected, no clipping. Script fixed hidden desktop clock wait for mobile (attached node instead of visible hidden desktop element), no UI behavior change. Real source copy26361records retains regression; original recording unchanged. Preview8796 stopped. Baseline real catalogs563/563unique, cards334/334unique, Qwen exactly once.

Activation must update independent projector with just current-main before one just viewer-main; viewer refresh alone leaves old writer. Coordinator reserves order in principle after landing; ask for go then. Existing derived store retained, no gameplay re-ingestion/restart. Both Qwen82e1 and GLM31a7 current snapshots complete and live before upgrade. Protected process baseline10021,36725,47723,37156 saved; capture fuller runtime tree before activation. Source readiness gates/browser complete, cloud review next. Landing/activation pending.
