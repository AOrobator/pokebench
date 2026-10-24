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
- [x] GREEN recipe amendment; focused agent 47 PASS, viewer affected batch 18 PASS; build and vendor checks PASS. Full gates pending.
- [ ] Gates: test, lint, build, coverage >=90%, vendor
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

- GREEN: production normalized arm/server tests 3 PASS; affected viewer tests 18 PASS. Exact JSON structural comparison against ebed5a7f3 proves only intended gym/dependency base values, factor membership and onInBoth membership changed. Existing tests updated for authorized both-arm behavior and exact shifted factor indices. Initial full agent pass 4 failures, all expected changed recipe assertions (4224 passed); corrected.
