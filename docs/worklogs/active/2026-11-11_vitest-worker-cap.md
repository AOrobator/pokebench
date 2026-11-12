# Vitest worker cap

## Contract and authorization
JOB vitest-worker-cap-20261111 relayed the operator's 21:43 ET approval: "yeah that looks good, i like the proposal". Cap agent and viewer Vitest workers at eight per suite so three concurrent suites do not each claim the 32-core host. Branch codex/vitest-worker-cap; isolated worktree /private/tmp/pb-vitest-worker-cap; base dc5436a3a.

Production path set: packages/agent/vitest.config.ts and packages/viewer/vitest.config.ts only. Add maxWorkers: 8 under test in each. Installed Vitest 5.0.3 exposes maxWorkers and no minWorkers in its types/implementation, so do not add an unsupported minimum. Provenance: the approved worker-cap request. Existing owner invariants: keep includes, excludes, coverage floors, setup files, no-I/O guards, test bodies and recipes identical. Non-goals: gameplay, viewer restarts, scheduler, suite serialization, dependencies, test rewrites. Terminator: full gates, Claude + independent GPT LGTM (Grok standing waiver reported in job), landing-board fast-forward and post-main just test. Split any requested change beyond the two configs into separate work.

## M1
- [x] Inspect pinned Vitest API and existing recipes/configuration.
- [x] Apply eight-worker caps; real config-loader RED before edit in both packages (`undefined !== 8`); GREEN and cheap checks below.
- [x] Quiet CPU window: just lint, measured just test (includes build), just verify-vendor.
- [x] Freeze packet; principles self-review; Claude and GPT review; synthesis.
- [ ] Land through board; post-main just test; record evidence and release.

## Validation plan
No permanent config-mirroring unit test: this is a two-literal configuration edit. A temporary assertion through Vitest's real createVitest config loader will fail before the change and pass after for both packages, checking maxWorkers and unchanged coverage/test selection/setup against the base config. Focused existing tests prove guard-loaded execution. Full just test proves unchanged coverage and no-I/O guard proof suites. Measure one run with process-tree CPU samples and wall/CPU time. Provided baseline: 76 s wall, 462 CPU-s, ~12 s bursts at ~100% whole-host CPU (relay confirmed top every 3 s: mean 31.9%, median 16.8%, p90 99.6%, peak 100%, 4/24 samples >80%; exact wall 76.46 s, user 409 s, sys 53 s; baseline main 4125c5a77). Do not claim three-suite concurrency measured from one run.

## Evidence
Initial inspections complete; no application behavior changes. Review/gates/landing pending.

RED receipts: /tmp/vitest-cap-{agent,viewer}-red.log. Temporary config-loader check is outside the ordinary no-I/O suites and does not add an I/O test. No RED commit needed for a disposable verification probe rather than a new repository test.

GREEN: both config-loader probes pass at maxWorkers=8 and exact before/after preserved selection/setup/coverage equality. Both package tsc --noEmit and per-package eslint vitest.config.ts pass; agent milestones 32/32 and viewer custom-lane 4/4 pass. Vendor pin verified clean. Initial root pnpm exec eslint did not resolve a binary; corrected to package-local invocation, passed. Full CPU window requested; Grok standing waiver confirmed by relay.

## Full gates and measurement
COMMIT: `Cap agent and viewer Vitest suites at eight workers` (593cf19ea). `just test` PASS: agent 251 files/3051 tests; viewer 123 files/1307 tests; env 3466; gateway 39; no-I/O guard proof PASS. Coverage floors untouched and pass (agent statements 64.81/branches 61.09/functions 64.27/lines 70.35; viewer 42.73/45.05/47.78/43.48). `just build` passed as test prerequisite; `just lint` and `just verify-vendor` PASS. Receipts /tmp/vitest-cap-after.{stdout,stderr,top}.log and .json, /tmp/vitest-cap-lint.{stdout,stderr}.log. Coverage emitted an existing gateway warning: replay module never imported; gate still passed.

Single-run measurement with /usr/bin/time -l and top whole-host CPU every 3 seconds: baseline 76.46 s real, 409 user+53 sys=462 CPU-s, peak 100%, mean31.9%, median16.8%, 4/24 samples >80%. After 102.79 s real, 357.87 user+26.50 sys=384.37 CPU-s, peak49.01%, mean25.47%, median18.70%, 0/33 >80%; peak RSS 3,041,689,600 bytes. Wall +34.4%; CPU-s -16.8%; peak -50.99 percentage points. Not a repeated study or proof of three concurrent suites. Relay confirms another lint started in final ~2 s of measured run (after Vitest phases), so total timing/mean are slightly contaminated; the Vitest-phase peak is unaffected. CPU reservation released after lint.

## Integration compatibility
Main advanced dc5436a3a -> 2c1fdf7f3 with only an unrelated direct-provider worklog evidence update. Merged on branch as 7ec41be3f; source/config/test/dependency contracts unchanged, so full gate evidence retained at implementation pin593cf19ea. No main hold requested. Final executable feature delta against new main remains exactly two maxWorkers literals. Freeze after this evidence commit for review.

Packet preparation correction: main moved to d3ae55add between the branch merge and packet creation; the first packet accidentally compared to that unmerged new base and showed an unrelated evidence reversal. Canceled the incomplete Claude invocation (no verdict counted), preserved /tmp/vitest-cap-aborted-* artifacts, and resynced main before resealing. No source changes; gate evidence remains valid.

COMMIT: branch-only integration sync7a8292fbe retained all source evidence. Evidence commit initially rejected by freshness hook because the merge had just created a newer commit; updated this log and retried with hooks enabled. Canceled the prematurely launched review; no verdict counted for either aborted packet.

## Multi-model review and synthesis — round 1
Frozen base a6adc45f840f8d7f1ad640f8a035c86116881220; head fadd406bb148c0ce5b83f96a10905fa4085b9e47; binary diff SHA256 bcc5919962b4f07ce513a9c785ebb21337d8e9710269e09a0de939e456fa42f9. Clean HEAD/status and digest reproduced before/after both reviews. Packet /tmp/vitest-cap-review.diff; boundary /tmp/vitest-cap-boundary.md; principles /tmp/vitest-cap-principles.md covers all PB1–PB13, 6 PASS/7 N/A/0 FAIL. Original base-to-head source delta remains two literals; no review-generated scope growth.

Claude CLI, dedicated reviewer profile, permission-mode plan: VERDICT: LGTM (/tmp/vitest-cap-claude.log; events and separate stderr retained). Independent GPT cloud lane: fresh Codex subagent gpt_review, fork_turns=none, VERDICT: LGTM; independently reproduced fixed-ref digest and clean pre/post HEAD/status. Grok standing waiver confirmed by relay, disclosed. No local inference reviewer used. Two earlier packet-preparation invocations were canceled without a counted verdict; review round1 uses only this final clean frozen identity.

Consensus: no blockers; pinned API and actual pool consumer honor the cap; selection/setup/coverage/guards/recipes unchanged. Contradictions: none. Unique findings: Claude cosmetic spacing observations (no source changes needed), and hypothetical future repeated worker-tuning study (out of scope). Unsupported claims: no three-suite performance or repeatability claim made. Missing prelanding evidence: none; post-main just test still required. Finding disposition: 0 blockers, 0 accepted fixes, 0 scope expansions; future tuning is a nonblocking hardening follow-up. Convergence: green in first complete round; unchanged paths/owners/contracts.

All nine test-quality dimensions examined: (1) real loader reaches both configuration callers; (2) separately observed RED then GREEN for both literals, exact unchanged-config assertions; (3) no shared-global changes; (4) no shared-collection assertions; (5) no flake fix or shared-state test added, resource bound is operator-requested; (6) no retries/sleeps/skips/serialization; (7) exact-value assertions retain actual/expected payload; (8) bounded one config load/snapshot/compare per package, no growing fixture loops; (9) no production-size fixture filling. Residual risk: one timing sample with final~2s unrelated lint overlap; manual CLI overrides can change configured cap. Terminates source review; proceed to board and post-main verification.
