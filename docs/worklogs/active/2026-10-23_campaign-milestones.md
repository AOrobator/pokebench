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
- [x] RED tests committed before implementation (`876d5005d`)
- [x] Native reader/catalog/consumer integration
- [x] Optional achievement separation
- [x] Default-OFF registry and explainer
- [x] Adversarial deletion/restoration and historical native proof
- [x] Gates: test, lint, build, coverage >=90, vendor
- [x] GREEN commit
- [ ] Principles self-review and independent multi-model review
- [ ] Serialized landing and viewer proof if review gates allow

## Closing the Loop
Use retained raw RAM read-only, production detector/recorder/clock tests, schema regeneration, isolated headless viewer and themed explainer desktop/phone proof. No gameplay/probes/GPU or live-run modifications. Viewer restart after landing only with owner coordination.

## Session Log
- Authorized by user after the source-backed proposal; no additional design approval needed. Work in codex/campaign-milestones; canonical checkout and active runs untouched.

## Surprises
- Interior arrival needs to count before automatic entry scenes finish; surface arrivals retain unlocked-control proof.
- Space Center partner battles use special battle ownership, so stable saved stage 3 proves the win upper bound; ordinary trainer bits are not assumed.

## Multi-Model Review Log
Round1: Claude and independent runtime/semantics reviewers BLOCKING on one shared P2: campaign last-progress label retained old since-progress map history. Integrity reviewer LGTM. Grok cursor grok-4.7-high unavailable, exit1 usage exhausted (receipt in runs/reviews/campaign-milestones-r1/grok.stderr). Required cloud lanes cannot be replaced for self-merge without user approval.

Accepted bounded fix: clear path and entered with campaign progress. Production observe/stallText regression covers both ON and OFF, former room exclusion and return-door eligibility. RED confirmed, both individual deletion mutations fail, restored test passes. No new production owner/domain. Round2 cumulative review pending; no landing or activation.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog

- RED: new campaign tests fail before implementation (missing optional catalog/predicates/switch and snapshot fields).

- Implemented 94 campaign additions + eight separate optional acquisitions. Production readout remains byte-identical; new default-OFF behavior switch resets earned extended progress only.
- Native proof: 13 hash-validated 0d5d archives through read_game_state/state_json; retained beach snapshot seq112822 turn976 at (21,23). Committed RAM fixture and parsed-state fixture cover native landing and cave arrivals.
- Immutable original-prefix comparison: 80 old splits ->85 candidate splits, four new campaign arrivals and optional Flash; no duplicate, missing or changed original split. Prefix a514c85f1db36b94ff092333f0f8c34536800f047397ad8b7b42432051656cae. Scratch copy only; original active run unchanged.
- Eight unique adversarial removals all fail; restoration passes: clock wiring, origin, optional exclusion, land-avatar check, raw variables, recorder claim, frontier optional filter, modern replay guard. Receipts: runs/reports/campaign-milestones/mutations.
- Coverage gate passed: agent lines99.21 branches93.36 functions97.79; viewer lines98.01 branches91.50 functions95.10; Python lines97.37 branches93.32 functions100. No thresholds/excludes changed. Full coverage run 4044 Python tests.
- Earlier setup failures were missing isolated ROM environment/native binding, resolved using known external ROM path and native-only mgba link. Sparse historical fixtures may omit avatar data; remains unknown rather than fabricated on-foot.
- No gameplay/inference launched, no active run/source/config/service changed. Candidate browser preview is offline on8901 with copied event prefix and immutable raw/frame hardlinks.

- Final full gates: 3935 agent +1738 viewer +4044 Python tests; justlint/build/schema/vendor pass. All coverage stacks exceed90.
- Headless preview: desktop1280/1440 and phone375, campaign/full-baseline toggle, beach point visible once and no document overflow or console errors; explainer opened/collapsed at all three widths and inspected. Historical run is isolated offline replay; no live-run proof claimed.
- Principles PB1-PB13 self-review PASS with evidence in runs/reviews/campaign-milestones-r1/principles.md. Frozen scope in boundary.md.

- Round2 gates:3936 agent+1738 viewer+4044 Python tests; build pass; lint completion recorded in review packet. Additional optional-splits headless UI screenshot verified; no console errors. Offline replay header remains LOADING because the original run prefix has no terminal event; no live/complete-run claim.
