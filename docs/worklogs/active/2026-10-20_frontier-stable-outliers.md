# Stable Story Frontier time-outlier classification

User reported snapshot SHA256 3bd7ce404a6ce27a3bba79d58b106339e3e64b7355567d635aa2c92c6c58e18a,558104423bytes, still visible with HIDE TIME OUTLIERS. Resolved exactly to ended run2026-10-20T03-02-13_qwen36-gpu1_f28d, whose final story split is347.67minutes.

Read-only source/real-data/browser reproduction: all445runs hides it; its experiment(2runs), configuration(1run), or overlay alone leaves all32points visible with toggleON. Root cause: cutoff calculated from filtered visible series; fewer than10makes cutoffInfinity and a small long-run cohort can inflate its own threshold. Live Chrome tab1657055936 reproduced experiment:bundle-cook-6h-v2@eb1b225f3a55 with ON and32points. Original reported tab1657055914 is controlled by another chat and preserved. Optional clarification pending on exact reported filters; no assumption of original-tab repair.

Scope: viewer-only repair. Derive outlier cutoff from all chart-eligible agent recordings and their recorded story split maxima, before experiment/model/config/date/overlay filtering. Apply to selected ended overlays only. Keep human/frontier/current protection; retain minimum10 total eligible records and existing3xP90rule; OFF restores every point. Describe population in existing help. Do not alter recordings, benchmark outcomes, source-evidence details or add modules/dependencies. Check already-open detail behavior separately; no silent removal of provenance.

- [x] RED: mounted consumer regression fails on cohort filter (2 extreme points with toggleON); real snapshot and live experiment repro retain all32 reported-run points.
- [x] Implementation: consumer passes unfiltered recordings; classification uses full recorded story maxima. 78focused tests pass. Mutation proof follows.
- [ ] Gates, inventory and browser proof
- [ ] Independent review and landing under repository rules

Exact-run candidate inventory:445records; all/date-range(96)/single-day(14)/experiment(2)/configuration(1)/model(207)/overlay(1)/combined(1), all produce target0pointsON/32OFF/0ON with exact restoration. Details preserve exact reported SHA256 and558104423bytes. Browser candidate reproduced experiment/config/overlay and combined date+model+cohort+preset+overlay; also opened recorded point and verified exact source hash/bytes. No provenance data is hidden or edited.

Initial full gates:3046agent/1510viewer/3470Python pass; coverage floors maintained; TS/Python lint and build pass. One disposable happy-DOM inventory script exhausted its heap by repeatedly mounting all445runs; replaced only that ignored proof script with direct pure graph rendering. Production/unit tests were unchanged; bounded test fixtures remain20/21records. Shared main advanced with legacy trainer fallback removal; syncing before final verification/review.
