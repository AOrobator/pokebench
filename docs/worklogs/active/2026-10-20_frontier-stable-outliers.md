# Stable Story Frontier time-outlier classification

User reported snapshot SHA256 3bd7ce404a6ce27a3bba79d58b106339e3e64b7355567d635aa2c92c6c58e18a,558104423bytes, still visible with HIDE TIME OUTLIERS. Resolved exactly to ended run2026-10-20T03-02-13_qwen36-gpu1_f28d, whose final story split is347.67minutes.

Read-only source/real-data/browser reproduction: all445runs hides it; its experiment(2runs), configuration(1run), or overlay alone leaves all32points visible with toggleON. Root cause: cutoff calculated from filtered visible series; fewer than10makes cutoffInfinity and a small long-run cohort can inflate its own threshold. Live Chrome tab1657055936 reproduced experiment:bundle-cook-6h-v2@eb1b225f3a55 with ON and32points. Original reported tab1657055914 is controlled by another chat and preserved. Optional clarification pending on exact reported filters; no assumption of original-tab repair.

Scope: viewer-only repair. Derive outlier cutoff from all chart-eligible agent recordings and their recorded story split maxima, before experiment/model/config/date/overlay filtering. Apply to selected ended overlays only. Keep human/frontier/current protection; retain minimum10 total eligible records and existing3xP90rule; OFF restores every point. Describe population in existing help. Do not alter recordings, benchmark outcomes, source-evidence details or add modules/dependencies. Check already-open detail behavior separately; no silent removal of provenance.

- [x] RED: mounted consumer regression fails on cohort filter (2 extreme points with toggleON); real snapshot and live experiment repro retain all32 reported-run points.
- [ ] Implementation and mutation proof
- [ ] Gates, inventory and browser proof
- [ ] Independent review and landing under repository rules
