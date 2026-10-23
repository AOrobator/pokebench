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
- [x] Principles self-review and independent multi-model review
- [x] Serialized landing under explicit operator approval and verified Grok outage waiver
- Viewer refresh/browser/PID receipts retained separately under final ignored evidence packet; feature activation remains outside this milestone.

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

- Operator approved fixing only Aqua Hideout allFlags proof gap, syncing latest main, final review and merge on success. Verified standing general Grok-outage waiver from server-cited human message "yes dont wait for grok" (2026-10-21T20:35:35Z); coordinator scope note distinguishes general authorization. No new Grok-only permission required. Final proof adds no production behavior.

- Sync latest main c69ad74a5: preserve move-learn offer identity feature/order/defaults and append campaign switch after it. Resolved shared registry/filter/index/doc conflicts; no move-learning behavior altered by campaign delta. Aqua Hideout every-to-some mutation fails the new per-guard test; restoration passes.

- Sync integration checks caught overlapping registry positions and the schema's matching optional-key exclusion type. Preserved both switch defaults and corrected mechanical expectations; no thresholds/skip/retry changes. Agent standalone3943pass. One concurrent full-gate attempt timed out unchanged live-human import test then leaked into its next case; retain log, run normal final gates after build/lint rather than changing that unrelated test.

- Final Aqua Hideout cases are independent parameterized tests: neither flag,821only,822only,both. every->some mutant fails both single-guard cases independently; restore passes8story-progress tests. Final combined normal gate3943agent/1739viewer/4044Python passed before splitting those cases into four; coverage reruns all3946agent. No production change from test refinement. Shared-host concurrent gate attempt exceeded unchanged map-cycle history fixture's5s timeout; no timeout/skip/serialization change. Retain failed and normal gate logs; final coverage attempted without another owned compile/test job.

- Final native coverage passes4044tests (63.45s),97.37%lines/93.32%branches/100%functions. TScoverage3946agent+1739viewer; agent99.21/93.37/97.79; viewer98.01/91.52/95.10. Final lint/build/vendor pass; final test-file lint/types pass. Earlier native coverage failed unchanged viewer-restart whole-host snapshot when unrelated ephemeralPID87695 exited; protected2367/3395/34823/53193/53718 survive. No production change or gate suppression used.
- Final authorized round3 cumulative review prepared against currentmain c69ad74a5. Direct navigation/campaign owners allow this earlier review/landing window and have no competing8790check. Separate cloud outage waiver already verified; source remains defaultOFF/no active-run modification.

## Final review and landing receipt
- User explicitly approved narrow Aqua Hideout proof fix, latest-main sync, final review, and merge on pass. Four independent guard cases; every->some mutant fails both single-guard cases; restore8pass.
- Round3 frozen basec69ad74a50b03ef10302ec3d79e99da6e5bfb9ae →sourcef5450b8231095000b66cb981eff27e99c5d30087. ExactbinarypacketSHA25660f2441e2774e815dcb7039bf74d4a3ac96e32d6f9c7f52c8c4499ee47b9eabb. ClaudeCLI, independentGPTSol(gpt-5.6-sol/xhigh,fork_none), distinctfallbackAstra(gpt-6-astra/high,fork_none), supplemental scope reviewer all terminalLGTM, independently verified cleanpre/postidentity. PB1-PB13PASS, all9testqualitydimensions reviewed; no runtime scopegrowth.
- Grok finalCursorattempt exit1usageexhausted. Verified general standing human waiver "yes dont wait for grok",2026-10-21T20:35:35Z, server-cited [private message reference] in localClaudehistoryf7406a93 lines4145/4964; coordinator's general-scope explanation is recorded separately from verbatim humanquote. Reduced vendor diversity disclosed; no extra waiver required.
- Gates at source3946agent/1739viewer/4044Python pass; lint/build/vendorpass, coverage agent99.21/93.37/97.79,viewer98.01/91.52/95.10,Python97.37/93.32/100(lines/branches/functions). Eleven unique mutation receipts,13native states, immutable originalprefix before/after, backgrounddesktop/phone proof. Full latercampaignnativecompletion/gameplaybenefit remains unclaimed.
- Landed exactsourcef5450b823 fast-forward while board#1 with verified chatID 00000000-0000-4000-8000-6e66d6c7b105. Postmerge canonicalpackagebuild refreshed stale agent/dist (optionalexportmissing before,11after); trackedsource unchanged. Then normalmainjusttest passes3946agent/1739viewer/4044Python (38.32snative), log /tmp/campaign-main-tests-rebuilt.log. Earlier stale-artifact failure preserved, not suppressed.
- Onepostlanding evidence-only commit touches this worklog only. CurrentGPU/controller2367/3395/34823 andMacGLM53193/server53718 preserved. No activepreset,gameinput,GPU,inference or runstart change. Onecoordinated8790refresh to evidenceHEAD and postrefreshheadlessbrowser/PID/buildstamp proof tracked in ignored runs/reviews/campaign-milestones-f5450b823/r3; launch/featureactivation remains unperformed. Worklog not archived.
