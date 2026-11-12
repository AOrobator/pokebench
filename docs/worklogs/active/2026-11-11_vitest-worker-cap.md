# Vitest worker cap

## Contract and authorization
JOB vitest-worker-cap-20261111 relayed the operator's 21:43 ET approval: "yeah that looks good, i like the proposal". Cap agent and viewer Vitest workers at eight per suite so three concurrent suites do not each claim the 32-core host. Branch codex/vitest-worker-cap; isolated worktree /private/tmp/pb-vitest-worker-cap; base dc5436a3a.

Production path set: packages/agent/vitest.config.ts and packages/viewer/vitest.config.ts only. Add maxWorkers: 8 under test in each. Installed Vitest 5.0.3 exposes maxWorkers and no minWorkers in its types/implementation, so do not add an unsupported minimum. Provenance: the approved worker-cap request. Existing owner invariants: keep includes, excludes, coverage floors, setup files, no-I/O guards, test bodies and recipes identical. Non-goals: gameplay, viewer restarts, scheduler, suite serialization, dependencies, test rewrites. Terminator: full gates, Claude + independent GPT LGTM (Grok standing waiver reported in job), landing-board fast-forward and post-main just test. Split any requested change beyond the two configs into separate work.

## M1
- [x] Inspect pinned Vitest API and existing recipes/configuration.
- [x] Apply eight-worker caps; real config-loader RED before edit in both packages (`undefined !== 8`); GREEN and cheap checks below.
- [ ] Quiet CPU window: just lint, measured just test (includes build), just verify-vendor.
- [ ] Freeze packet; principles self-review; Claude and GPT review; synthesis.
- [ ] Land through board; post-main just test; record evidence and release.

## Validation plan
No permanent config-mirroring unit test: this is a two-literal configuration edit. A temporary assertion through Vitest's real createVitest config loader will fail before the change and pass after for both packages, checking maxWorkers and unchanged coverage/test selection/setup against the base config. Focused existing tests prove guard-loaded execution. Full just test proves unchanged coverage and no-I/O guard proof suites. Measure one run with process-tree CPU samples and wall/CPU time. Provided baseline: 76 s wall, 462 CPU-s, ~12 s bursts at ~100% whole-host CPU (relay confirmed top every 3 s: mean 31.9%, median 16.8%, p90 99.6%, peak 100%, 4/24 samples >80%; exact wall 76.46 s, user 409 s, sys 53 s; baseline main 4125c5a77). Do not claim three-suite concurrency measured from one run.

## Evidence
Initial inspections complete; no application behavior changes. Review/gates/landing pending.

RED receipts: /tmp/vitest-cap-{agent,viewer}-red.log. Temporary config-loader check is outside the ordinary no-I/O suites and does not add an I/O test. No RED commit needed for a disposable verification probe rather than a new repository test.

GREEN: both config-loader probes pass at maxWorkers=8 and exact before/after preserved selection/setup/coverage equality. Both package tsc --noEmit and per-package eslint vitest.config.ts pass; agent milestones 32/32 and viewer custom-lane 4/4 pass. Vendor pin verified clean. Initial root pnpm exec eslint did not resolve a binary; corrected to package-local invocation, passed. Full CPU window requested; Grok standing waiver confirmed by relay.
