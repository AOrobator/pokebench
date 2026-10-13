# Deterministic loop detection

## Problem Statement
Operator approved implementation of planning stalls, observation stalls, ineffective actions, short cycles and repeated rejections, with warning, bounded recovery, explicit stuck termination and review/landing before another run. Recorded Swarm trial made95planning calls after its last press. Existing guards do not cover this behavior.

## Skills Loaded
PokeBench feature-worklog; local inference stack multi-model-review; PB1–PB13 current project principles. User approval is the start gate; no additional approval needed for routine implementation choices.

## Architecture
One typed bounded monitor consumes completed calls and coherent returned state in the existing sequential pinned pi0.73.1 loop. Stable semantic state excludes elapsed playtime, timestamps, event IDs and objective wording. Warning reaches subsequent model context and event log; persistent episode terminates as existing stuck reason. No model supervisor, scripted gameplay, route/name skill, RAM writes or new dependencies. Shared episode prevents overlapping detectors charging duplicate strikes. Unknown/unobservable screen state does not prove equivalence. Versioned harness feature declares policy.

## Invariants
- INV-1: planning metadata alone never advances game; six calls warn and persistent metadata-only recovery stops. Test real pi consumer including batched calls.
- INV-2: reliable state changes permit dialogue advancing, naming letters, map exploration and battle changes; missing state never proves no-change. Test positive/negative semantic fixtures.
- INV-3: observation, ineffective action, length2–4cycles and repeated model rejection detectors warn from bounded histories and persist across cosmetic changes. Tiny injected policy bounds pin defaults separately.
- INV-4: warning is recorded and reaches model before terminal escalation; stuck terminal schema/viewer remain replayable. Test pinned loop/context/batching/abort/log.
- INV-5: no canonical source/build or benchmark endpoint changes during frozen cohort. Isolated worktree only; root coordinates landing and any native smoke.
- INV-6: ROM never copied/staged; pristine pinned vendor; typed JSON/no any; 90coverage floors unchanged.

## Security Review
Monitor performs no I/O/game actions, accepts only validated events/state, bounds retained history, never stores screenshots or credentials. Service/network failures remain infrastructure/model_error paths rather than gameplay rejections. No public network or permissions changes.

## Milestones
**M1 — Deterministic monitor and production wiring**
- [ ] Tests and RED commit
- [ ] Monitor, semantic equivalence, warning/recovery, event/viewer/pinned loop wiring
- [ ] Gates: tests/lint/build/coverage/vendor
- [ ] GREEN commit
- [ ] Delete/restore guard mutations with specific assertion failures
- [ ] Recorded-run replay/native isolated smoke after cohort ends
- [ ] Principles self-review and selected multi-model roster LGTM
**M2 — Landing and closeout**
- [ ] Root coordinated canonical integration, sequencer unchanged, reviewed artifact identity
- [ ] Report exact gates, review diversity and limitations

## Closing the Loop
Continue until reviewed deliverable or explicit blocker. Root owns canonical integration; do not mutate main. Original cohort source freeze40262a0 preserved. Worklog updated per commit; archiving user-gated.

## Session Log
2026-10-12: read CLAUDE.md, current resumed experiment worklog, PB principles and skills; created codex/loop-detection in managed isolated checkout from40262a0. Source discovery: returned state includes naming cursor/text/page, field dialogue, story flags, location/position/party; no reliable battle command/opponent state or clock/menu cursor readouts. Do not claim those unobservable domains are semantically unchanged.

## Surprises
State schema lacks reliable generic menu/clock/battle phase readouts. Conservative unknown handling is required for ineffective/observation/cycle detectors outside naming and fully legible field scenes; planning/rejection detection remains available everywhere.

## Multi-Model Review Log
Pending. Endpoint reviewers wait for root confirmation original benchmark cohort terminal; offline distinct-model reviewers possible. Exhausted options and any fallback must be recorded honestly.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER: archive after closeout.
2026-10-12 RED: added11focused detector contracts; run fails because loop-detection.js production module is absent. No implementation edits yet. Tiny thresholds exercise warning/exposure/recovery; production thresholds pinned separately. Conservative semantics avoid unknown/battle/locked menu and multi-button net-effect assumptions.
2026-10-12 implementation checkpoint: completed all five monitor paths, persistent shared warning/recovery episode, finite recovery even for unknown observations, actual coherent prepress snapshot IDs and batched-call cancellation, additive loop_guard schema/tail/viewer, default enabled POKEBENCH_LOOP_GUARD=0 ablation and versioned metadata. Existing model-error retry and first terminal reason preserved; infrastructure errors do not consume gameplay recovery.18+semantic focused tests and6pinned pi consumer scenarios cover all detectors, warning context, completed state order and stopped trailing presses.14detector/semantic mutations +5wiring mutations each produced assertion failures then restored (ignored review receipts). Counterfactual replay catches original6746 planning warning1042/stop1264; other Swarm planning episodes recover on realpress. Raw oldlogs lack new prepress snapshot ID, so no claim those replays validate action/cycle detection. No originals rewritten.
2026-10-12 GREEN gates:407agent +149viewer +378unchangedPython =934tests; TSbuild/lint, Pythonruff/format/mypy, vendor pin/clean and all independent90coverage floors pass. Agent statements98.33/branches93.00/functions98.39/lines98.91; viewer97.48/91.48/98.43/98.37; Pythonlines99.34/branches96.77/functions100.00. Monitor itself95.80/93.06/100.00/97.54. New publisher tests retain oldschemas and declare offswitch. Five realconsumer scenarios plus unknownrecovery variant use tiny policybounds; no benchmarkendpoint requests yet. Review and native smoke still pending; gates are not landing.

## M3 — Native progress recovery and qualified UI semantics
Operator/root approved follow-up after integration regression: native false→true story progress must recover a stall despite unavailable UI; foreign run/null baseline/duplicate flag must not. Reuse game-owned MILESTONES story predicates rather than inventing progress. Bind observations to one run and increasing sequence. Qualified active_ui projection can compare owner-verified phase/selected/readiness/value; documentation controls and diagnostic prose never progress. Confirmation owner supplies schema/qualification; no RAM decoder copied here. Planning/rejection remain universal, other comparisons stay conservative where UI unknown/printing/diagnostic/battle/multi-button effects are unavailable. RED regressions already committed by roota0e76dd; reproduce locally before implementation. Full gates/deletion proof/new frozen review remain necessary; prior945review does not qualify new behavior.
Passive diagnostic vs injected behavior separation is under root contract discussion; no new flags added yet. Proposed distinct typed would_warn/would_stop diagnostics vs actual warning/stop ensures viewer never claims a passive run was stopped. User approved patch-comparison protocol is independent; do not launch benchmarks here.
M3 RED4da1019 reproduces root native transition failure (28pass/1fail). Added qualified active_ui selection/value/control-exclusion and diagnostic/readiness falsepositive contracts; oldsemanticState fails qualifiedprojection/ineffectiveUI tests as expected. Owner qualified types include optional value and verifiedname/gender/clock phases; clock_view ambienttime intentionally not progression.
M3 GREEN:427agent +149viewer +378unchangedPython=954tests; build/schema/types/lint and all90coverage floors pass. Agent98.25statements/93.30branches/98.40functions/98.79lines; viewer97.48/91.48/98.43/98.37; priorunchangedPython99.34/96.77/100. Native/UI12performedmutations individuallyassertion-red thenrestored: nativeprogressrecovery, runbind, sequenceorder, knownnegative, achievementonce, actualtruckbaseline, UI diagnostic/readiness/selection/clockvalue, controlsproseexclusion/projection. Source reuses MILESTONESstorypredicates and ignores unknownnegative; qualifiedUI fields fromconfirmationowner exactschema only. Pinnedpi actualrecorder test proves nativeCLOCK_SET recovery despiteunknownUI withoutstuckabort; previousrootRED regressions preserved with explicitnullablefixtureguard. No passive/enforcement flags implemented yet. Prior945review source not reused as thisgreenreview; newpacket pending rootcumulative review.

## M4 — Matched passive diagnostics and enforcement
User selected preparefourperarmfirst; parent approved minimal owner contract from passive-split-proposal.md. Startbase1dc039b, cleannew codex/loop-passive branch preservesf741 and reusesmergedqualifiedsource. Both arms attach samepolicy; flagonlyfeedback/block/stuckabort. Typed mode+disjoint diagnostic would_warn/would_stop/would_recover versus enforcedwarning/stop/recovered. Legacy no-mode logs remainhistoricalmodeunrecorded. Nextturn_start opens sameboundedvirtualrecovery inbothmodes; passive thresholds logonceper episode and keepobserving, genuine recovery resetsand canbegin another episode. Passivecalls/context/results/retries/inputs/terminalreason unchanged. Common passivefeature metadata plus optionalenforcementfeature/policyversion; strict0/1flag parsing existingconfigowner. No registry/preset/runner/navigation orreporter edits. NewRED/GREEN/gates/mutations/nativeproof/reviewrequired; currentrootlanding excludesfollowupuntilqualified.
M4 implementation/gates:480agent +169viewer +420Python=1069tests; allcoveragefloors unchanged, build/schema/types/lint/ruff/format/mypy/vendor green. Agent98.37statements/93.86branches/98.64functions/98.91lines; viewer97.70/91.27/98.57/98.55; Python99.39lines/97.14branches/100functions. Bothactualpinnedpi modes pass: diagnostic emitswould_warn/would_stop/would_recover, nofeedback/retries/resultchange/abort, trailingpress executes andbudgetends; enforcedfeedback+blockedpress+stuck. Publisher declares commondiagnostic/policy identity bothflags and optionalenforcement; invalidflags rejected.15shape-preservingmutations assertion-red/restored acrosscontext/block/abort/flagforwarding/strictvalues/virtualturnexposure/nonflood/schema modepair/viewerlabel/commonmetadata. InitialREDschemafixture timestamp lackedmilliseconds and was not qualified evidence; correctedvalidtimestamp exercisesmode/schema viaindividualmode-pair mutations. Existingdefaultenforced preserved; upcoming measuredarms require explicit0/1 settings. No comparativeefficacyclaim or registry/runner edits. Nativebothmodes and selectedreview pending.
