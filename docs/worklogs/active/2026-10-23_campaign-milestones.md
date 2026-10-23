# Campaign milestones and earned progress clock

## Problem Statement
User approved the full campaign-arrival/story proposal, including Slateport beach, on 2026-10-23 and requested earned progress reset the drought clock. Existing all-gym measurement events deliberately do not reset it. Optional achievements must stay separate.

## Skills Loaded
pokebench-story-milestones, pokebench-game-state, feature-switch, feature-explainer, agent-observability, close-the-loop, viewer-e2e, execute-worklog, talk-to-claude; multi-model-review for final review.

## Architecture
Extend the shared native catalog using the pinned Emerald source. Preserve legacy predicates and metadata; declare new measurement coverage separately. Include raw story variables in the existing locked measurement snapshot, never model readout. Introduce default-OFF campaign-progress-clock-v1: only observed, non-optional campaign milestones reset drought time/actions. Optional achievements remain outside campaign depth/frontier and do not reset this clock. Keep future story names out of model guidance.

## Invariants
- INV-1: OFF retains prior briefing behavior for the same legacy stream.
- INV-2: Earned campaign progress resets wall/action drought; present-at-start, unknown, repeats and optional achievements do not.
- INV-3: Arrivals require native stable world state; beach excludes boat transit, Route118 excludes the west bank, Ever Grande landing and north exit are distinct.
- INV-4: Story completion uses source-owned flags/variables and separately records trainer victory versus closing scenes. Resettable Elite Four evidence survives in immutable events with attempt state.
- INV-5: Recorder, evidence qualifier, replay, comparisons and frontier use one catalog; no new timeline marks or future-route prompts.
- INV-6: Exact ROM/source, missing data unknown, checkpoint origin and raw archives preserved.

## Security Review
Read-only memory under existing frame lock, typed bounded snapshot additions; no new endpoints, game input, dependencies or network.

## Milestones
**M1 — Campaign catalog and clock integration**
- [ ] RED tests committed before implementation
- [ ] Native reader/catalog/consumer integration
- [ ] Optional achievement separation
- [ ] Default-OFF registry and explainer
- [ ] Adversarial deletion/restoration and historical native proof
- [ ] Gates: test, lint, build, coverage >=90, vendor
- [ ] GREEN commit
- [ ] Principles self-review and independent multi-model review
- [ ] Serialized landing and viewer proof if review gates allow

## Closing the Loop
Use retained raw RAM read-only, production detector/recorder/clock tests, schema regeneration, isolated headless viewer and themed explainer desktop/phone proof. No gameplay/probes/GPU or live-run modifications. Viewer restart after landing only with owner coordination.

## Session Log
- Authorized by user after the source-backed proposal; no additional design approval needed. Work in codex/campaign-milestones; canonical checkout and active runs untouched.

## Surprises
None yet.

## Multi-Model Review Log
Pending. Required cloud lanes cannot be replaced for self-merge without user approval.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog

- RED: new campaign tests fail before implementation (missing optional catalog/predicates/switch and snapshot fields).
