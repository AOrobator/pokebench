# Gym labels in both arms

## Problem Statement
The operator explicitly requested enabling the existing gym-door-label-v1 in both arms and landing it in parallel with the parent exit work. The analyzed control runs omitted GYM because their feature receipts have this existing fix OFF.

## Skills Loaded
CLAUDE.md; talk-to-claude; execute-worklog; feature-worklog; close-the-loop; local-inference-stack multi-model-review.

## Architecture
Only evolving bundle-v-control and bundle-v-control-2h definitions change: move gym-door-label-v1 from switches to onInBoth and set base.features true. Use existing armPreset and server feature transport. No observation code or global defaults change. Required existing dependencies named-warp-destinations-v1 and exit-labels-v2 also move to onInBoth in bundle-v-control; otherwise the production parser rejects gym ON in control. bundle-v-control-2h already has this dependency ON in both. Preserve pinned control-base files, all other recipe values, historical definitions and active runs. This recorded plan implements the operator's approved request; no new scope or launch.

## Invariants
- INV-1: Both normalized arms enable gym labels through serverFeatureEnv. Production parser/arm/preset test.
- INV-2: Other recipe values and pinned bases remain unchanged. Structural comparison against approved baseline.
- INV-3: Ordinary defaults stay OFF. Default/preset assertions.

## Security Review
No new input, network, data access or persistence owner; JSON recipe activation only.

## Milestones
**M1 — Activation**
- [x] RED production recipe test: both approved recipe activations fail before config change; omitted-default test corrected to include required flags.
- [x] GREEN recipe amendment; focused agent 47 PASS, viewer affected batch 19 PASS; build and vendor checks PASS. Full gates pending.
- [x] Gates: all test constituents, lint, build, coverage >=90%, vendor (counts and runtime correction below)
- [ ] Frozen cloud review (Claude/Grok/fresh GPT)
- [ ] Landing board, main test, coordinated viewer restart and receipts

## Closing the Loop
Read-only production arm expansion proves future control/bundle presets and server transport. No gameplay launch or benefit claim. Coordinate shared viewer restart with parent; preserve gameplay processes.

## Session Log
- 2026-10-24: Owned branch codex/gym-label-both-arms from ebed5a7f3. Parent confirmed exactly two evolving recipes. User authorization: “have a subagent enable gym-door-label-v1 in both arms and land that”.

## Surprises
Production parser caught the required exit-labels-v2 dependency OFF in the older control. Parent informed; dependency activation is necessary to honor gym labels in both arms.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog

- RED commit 91cdc1b55. Production recipe failures captured in /tmp/gym-label-red2.log; default check corrected to use the valid legacy preset shape (features omitted entirely).

- GREEN: production normalized arm/server tests 3 PASS; affected viewer tests 19 PASS. Exact JSON structural comparison against ebed5a7f3 proves only intended gym/dependency base values, factor membership and onInBoth membership changed. Existing tests updated for authorized both-arm behavior and exact shifted factor indices. Initial full agent pass 4 failures, all expected changed recipe assertions (4224 passed); corrected.

- Sync current main 42edb3f22 (independent trigger-boundary promotion) before review. Keep all incoming production recipes/tests; resolve only overlapping exact index expectations and gym=true assertion. Full prior pass: agent4228 PASS; viewer1830 PASS, two remaining shifted frontier index checks now corrected. Coverage failed unchanged live-human timeout/secondary leaked call and serial-comparison child stdout under concurrent load; no test suppression or threshold change. Focused eslint on gym test PASS after prior concurrent edit lint failure.

- Integrated coverage: agent all4228 PASS and all floors PASS; viewer1839 PASS/1 FAIL solely incoming battle-history factor positions (our removed factors shift3/1); corrected those exact indices. Full rerun required after correction.

- Worktree qualification setup corrected: local @pokebench package link now resolves this worktree (direct shared node_modules had produced duplicate-private-type tsc errors); .env links canonical runtime configuration and mGBA links installed binding. Initial direct uv Python invocation lacked dotenv/binding; retain its failures as setup diagnostics, not source verdict. Final unmodified just gates run sequentially with correct setup; no tracked runtime/dependency changes, test retries/limits/serialization or floor changes. Synced evidence-only main7133032cc.

- Final qualification on integrated tree: just test source suites agent4228/viewer1840/Python4106 PASS. Its protected-art step initially lacked ignored local art; documented POKEBENCH_CARD_ART path restores unmodified trainer-card-check, all3 baselines PASS. Full just coverage PASS with agent L99.14/B92.73/F97.53, viewer L98.04/B91.68/F95.18, Python L97.37/B93.33/F100; full lint/build/vendor PASS. Unchanged app-controls at121 timed out once earlier; isolated unchanged file14PASS, subsequent full viewer1840PASS. No test policy changes.
- Minimal activation copy correction: existing registry description removed stale “bundle only”; existing explainer names exact two both-arm recipes. No registry ID/order/default/wiring or HTML layout change.

- Existing explainer changed activation sentence only; zero-network pages check PASS, screenshots at1280/1440/375 captured via headless Chromium and inspected (all text visible, no overflow/cutoff); no desktop focus or UI activation. Focused registry/name tests2PASS after copy correction; no runtime behavior changed by copy. Review evidence under runs/reviews/gym-label-both-arms.
