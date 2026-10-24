# Actionable exits

## Problem Statement
The Oct 24 run analysis found dormant Route 116 Terra Cave warp records advertised as exits (0517 seq 29346, 107 attempts) and unreachable SOUTH/Verdanturf retained among exit choices. User approved addressing both with separate switches enabled only in the bundle; gym-door-label-v1 both-arm activation is delegated and lands independently.

## Skills Loaded
feature-switch; pokebench-game-state; feature-worklog; feature-explainer; agent-observability; close-the-loop; execute-worklog; talk-to-claude.

## Architecture
- `active-warp-exits-v1` default OFF: require a source-supported warp activation metatile before promoting a static warp record into an exit. Current-map checks use coherent live tiles, remote arrival summaries use qualified ROM terrain facts and do not promise script activation. Share across model readout, state targets, arrival summaries, supervisor/untaken exits. Preserve unknown/unreadable evidence honestly.
- `available-exits-presentation-v1` default OFF, needs exit-reachability-v1: move confirmed blocked exits out of interaction choices into a compact unavailable-facts line; remove approach instructions and supervisor bearings for them. Unknown reachability remains a candidate with its existing caveat.
- Register, transport, document and test both independently. Enable only as bundle factors in the evolving bundle-v-control and bundle-v-control-2h recipes. Preserve active runs and historical definitions.

## Invariants
- INV-1 OFF preserves previous readout/state/prompt behavior byte for byte. Regression comparisons.
- INV-2 No raw static event alone establishes an active entrance. Closed/open ordinary doors, arrows, ladders and dormant records test the rule; retained native RAM validates production reader.
- INV-3 Blocked, unknown and available are distinct; no navigation suggestion contradicts confirmed blockage. Tests through readout and supervisor factory.
- INV-4 Flags independent and default OFF; control OFF, bundle ON for both in future recipe expansion; no run launch or mutation.

## Security Review
Read-only native state under existing reader; no RAM writes, ROM copies, new endpoints, route advice or inferred story names. Reference source pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

## Milestones
**M1 — Implement and validate the two approved switches**
- [x] RED tests and commit
- [x] GREEN implementation; mutation proofs
- [x] Full test/lint/build/coverage >=90% and vendor checks
- [x] Native archived RAM proof and explainers with background browser verification
- [ ] Frozen cloud reviews Claude/Grok/fresh GPT; landing board; main merge and served verification

## Closing the Loop
Retained native readouts and production delivery tests; no measured gameplay launched. Explain exact surface coverage and remaining limits, preserve active process identities across coordinated viewer restart.

## Session Log
- User approved preceding design then requested both fixes, separate switches bundle-only, and parallel subagent gym both-arm activation/landing. This is authorization for this worklog scope; no repeated approval requested.
- Created managed isolated worktree from main ebed5a7f3. Gym subagent owns a different checkout. Canonical main clean at intake.

- RED: native presentation regression 2 failed / 2 passed; active-warp reader test collection fails with missing module before implementation. Registry test registered before switches exist. Test evidence /tmp/actionable-presentation-red.log.

- RED commit ba7726f31; focused native GREEN: 39 checks (35 dormant, 4 presentation), no skipped ROM proof. Active production-wiring deletion: 2 failed, restored: 2 passed; receipts /tmp/active-warp-wiring-mutation-20261024-154226.log and /tmp/active-warp-wiring-restored-20261024-154226.log.

- Full candidate coverage: agent 4232 tests (99.14% lines /92.74 branches /97.53 functions), viewer1833 (98.04/91.66/95.18), Python4146 (97.38/93.37/100). Floors unchanged. Coverage log /tmp/actionable-coverage.log.
- Python lint/format/mypy clean; TS lint found one new test shorthand rule, corrected and targeted ESLint clean. Build passed. Protected trainer-card gate 3/3 passes at documented canonical POKEBENCH_CARD_ART; vendor clean. Logs /tmp/actionable-trainer-card.log and /tmp/actionable-vendor.log.
- Native delivery: 4 agent tests parse retained native state, annotate observation and invoke SupervisorBriefing. Dormant TERRA CAVE is absent, blocked NORTH never reappears as an untried option. Two evolving recipe expansion tests confirm control OFF and bundle ON, defaults OFF.
- Presentation operand mutation /tmp/actionable-presentation-operand-mutation-20261024.log fails the native case when split_exits is bypassed in the test process; restored /tmp/actionable-presentation-operand-restored-20261024.log passes. No file/runtime state changed by that mutation.
- Background explainers: themed/check clean, HTTP200; 1280/1440/375 collapsed and expanded screenshots captured and visually inspected in contact sheets at runs/mockups/actionable-exits. Mobile long-symbol overflow fixed. All six final checks report no page overflow or page errors. Scratch viewer8897 with copied modern run prefix: both Harness Config cards link via real clicks to correct explainers, historical run shows NOT RECORDED, no page errors. Initial older showcase fixture was incompatible; replaced scratch-only fixture with modern preserved prefix, originals untouched.

- Clean full just test passes4232 agent /1833 viewer /4146 Python +3 protected card checks; full just lint passes. Latest terrain-graph correction adds one regression:50 affected active-warp/map-section checks pass. No geometry facts use a dormant ordinary-floor event as a barrier under ON. Final synced-tip gates will rerun after integrating main.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog

- GREEN commit5169c057f. Syncing current main7133032cc before frozen review. Gym branch cannot land because required Grok cloud lane is quota-blocked; it remains independently reviewed and unmerged.

- Synced main7133032cc into owned branch (merge369553b88). Final exact production source gates PASS: just test4232 agent /1841 viewer /4147 Python plus protected trainer3; coverage agent99.14/92.74/97.53, viewer98.04/91.67/95.18, Python97.38/93.37/100 (L/B/F); just lint/build/verify-vendor PASS. Logs /tmp/actionable-synced-{test,coverage,lint,build,vendor}.log. No new skips, exclusions, timeouts or runner policies.
- Offline derived replay proof (no emulator input or model call): schema-valid scratch-only8events from native reader fixtures, explicitly named offline-exit-readout-proof. Real browser selects #replay, opens recorded observation rows and inspector: seq3 has no TERRA CAVE, seq6 has Unavailable from here; zero page errors. Captured/inspected screenshots and JSON receipt under canonical runs/mockups/actionable-exits/offline-*. Original run/event/RAM files unchanged. Scratch8897 server stopped after proof; main8790 untouched.
- Gym candidate2594c77ab independently verified against base7133032cc, digest ef392aa0a29d822c26ad5557fa52254d4421966ca1b335fbfada70a0e5271564; clean tree and parent reran3recipe seam tests PASS. Claude/GPT and distinct Astra/Sol fallback LGTM, required Grok quota-blocked. No landing; missing required cloud lane must be resolved by explicit operator direction. Parent will finish its own reviews before bundling one concrete request.

- Gym independently landed2594c77ab and evidence-only maina1d1fa341. Parent privately integrated gym asf75cdcbbc. Parent final integrated driver started16:06:56.495 NY, terminal verified16:16:01.025 (hard-end16:25 released early). All stages exit0: test4232agent/1844viewer/4147Python +3protected baselines, coverage all90 floors, lint/build/vendor. Logs /tmp/actionable-integrated-*.log and /tmp/actionable-integrated-gates.json. No owned review/driver/scratch8897 process left active at release.
- Original human standing Grok waiver verified from trusted project relay usercitation [private message reference] at2026-10-22T14:47:31Z (10:47:31AM NY), source f7406a93 Claude project log line6309: "land without grok. you're not a very good coordinator if you force me to go into chats". Coordinator confirmed current applicability. Claude+GPT+distinct fallback reviews qualify; no fresh user approval needed.
- Initial own Claude attempt was superseded while incomplete by gym integration; no verdict counted. Stream retained at runs/reviews/actionable-exits/superseded-pre-gym. Final independent review will be sealed on the integrated candidate. No unready mainhold. SharedCPU coordinator admits no new heavy job/restart until finite handoff; only cloud read-only/digest inspection while queued. Requested focusedMAX45seconds for additional label-owner/operand proof, no fullsuite.
- Source-private gym viewer dirty default checkout has101preexisting tracked deletions; child preserved it and successfully used POKEBENCH_VIEWER_WORKTREE=/private/tmp/pokebench-viewer-gym-label. Verified served clean2594 stamp and sole8790PID41245. Final parent restart must coordinate and use actual clean served tree, preserving all gameplay. Main source tests passed after gym merge; child board released.
- Coordinator relayed direct-human config scope amendment in moving-NPC chat: one maintained featureconfig, futurelaunchers updated, three oldrecipes archived, active runs untouched. Pending new switch activation values sent to migration ownerredacted-id. Do not add unknown flags to main or duplicate canonical owner; coordinate final config target before porting recipe activation.

- Synced evidence-only maina1d1fa341 privately aseecd084ddd90951dbc78a190fa6dd4988432f241; production source unchanged from the fully gated integration. Initial evidence commit hook rejected same-second freshness; updated this entry after merge timestamp and retried normally, no bypass.
