# Split ribbon workbench

## Problem Statement
The operator selected round-two Split Ribbon Workbench and authorized implementation. Build a separate Runs & Comparisons screen reachable from the viewer and back. Charts must fit their container without horizontal scrolling. Remove the redundant execution strip at the top. Instead, show a live-run navigation card with model, elapsed time/cap, turn budget, benchmark target and latest recorded objective; absent a healthy live run, show the ordinary back-to-viewer link. Keep the complete execution queue at the bottom. Clicking a run or split reveals its recorded model/harness settings and explicit ON/OFF features. Use real recorded splits, never mockup values.

## Skills Loaded
Feature-worklog and agent-observability: durable recorded state, truthful queue/current status, mounted viewer/replay proof. Patch-evaluation: timing and reliability stay separate; this display change does not promote a behavioral patch. Multi-model-review is the repository landing gate.

## Architecture
Existing typed event reader/RunView owns run parsing and event folding. Add a read-only aggregate endpoint and an independently navigable comparison document sharing the current fonts/theme. Render responsive SVG charts with adapted label layout and viewport-sized viewBox, no minimum width/overflow scroll. Reuse feature catalog/recorded effective feature data; missing historical values remain unknown. Queue data comes from the viewer RunQueue and retained validated comparison manifests/ledgers, with controller lease/terminal evidence to distinguish queued, withheld and completed. No hidden gameplay launch or reconstruction of unrecorded completion.

## Invariants
- INV-W1 Native observed splits only, present-at-start/legacy/unqualified records excluded from earned timing. Test malformed/native-evidence/partial timelines.
- INV-W2 No live-state invention: server health qualifies live status; elapsed/objective/target come from recorded owners. Test idle, running, paused, ended and unavailable.
- INV-W3 Source/config provenance retained; effective ON/OFF/unknown features faithfully decoded. Test historical absence and false flags.
- INV-W4 Read-only analytics and truthful queue status; stopped controller means withheld, not scheduled. No secrets/ROM or arbitrary artifact paths returned. Test traversal, malformed manifests/ledgers and interrupted cohorts.
- INV-W5 Charts fit narrow/desktop containers without horizontal scrolling, navigation/details keyboard accessible, stale refresh does not override user selection. Test mounted state/navigation; inspect real replay at responsive widths.

## Security Review
Loopback existing CSP/static allowlist; bounded typed JSON boundary; only fixed run/receipt roots read. Escape model/objective strings, do not expose endpoint credentials or complete private configuration files. No agent/environment/vendor/schema edits, no input sent to games.

## Milestones
- [x] RED producer/aggregate tests, then minimal typed read-only aggregation.
- [x] RED mounted viewer navigation/chart/current card/details/queue tests; implement selected design.
- [x] Full applicable viewer gates and independent90 coverage floors, mutation receipts, actual retained replay and served-artifact hashes.
- [ ] Frozen independent review, landing, viewer deployment and recoverable worktree cleanup.

## Closing the Loop
Verify viewer→workbench→live viewer, chart/row→configuration drawer, native splits/current objective/elapsed, responsive fit and withheld queues. Preserve actual screenshot/test/review/landing receipts separately. Existing overlay spacing and objective-ablation worklog changes in this checkout remain part of final scoped diff; the pending objective-system24 trial experiment is unchanged.

## Session Log
2026-10-13 operator explicitly approved round2 design7 with responsive charts, bottom-only queue and clickable current-run meta card. Implementation isolated from canonical main. Existing main cohort ended at trial20 with retained launcher_error: health/slot occupancy unavailable; original services restored and lease released. Trials21–24 are withheld, not queued. Diagnose the infrastructure cause separately; no silent resume/replacement.

## Surprises
The prior benchmark was not still running at UI implementation time; current and queue status must use durable/live evidence.

## Multi-Model Review Log
Rounds 1–5 and their frozen packets, findings, failures and literal verdicts are retained under `runs/workbench-landing-proof/`. Round 5 independently approved the reviewed source; landing/deployment remain separate below.

## Boy Scout Log
Existing overlay spacing patch preserved; no unrelated refactor.

## Archive Milestone
- [ ] ASK USER: archive this worklog after completion.

## Handoff checkpoint (2026-10-13)
Operator redirected this chat to Think Fast gameplay and requested UI handoff to the side chat. Source implementation is checkpointed, not landed or independently reviewed. Viewer coverage passed (96.45 statements, 90.12 branches, 95.75 functions, 98.05 lines); agent 652 tests, viewer/agent lint and recursive build passed. Receipts are in runs/workbench-proof. Actual snapshot contains 108 runs, 20 main-cohort trials, withheld 21–24, zero problems/live runs. Preview remains on http://127.0.0.1:8796/comparisons.

Remaining: independent mutation/deletion/restoration receipts, external reviewer packet and principles scoring, responsive live screenshot/served hashes, landing and deployment. Local models are reserved for benchmarking and must not receive review requests. Known review targets: statSync archival race; integer validation at DTO boundary; stale current-run card on refresh failure; legacy null target label; fractional median turn/token display; PID-only coordinator identity. Preserve canonical main, the stale sequencer, all prior benchmark artifacts and this active worktree. Do not archive until source lands and preview no longer depends on it.

## Landing continuation (2026-10-14)
Operator explicitly requested a subagent to finish landing this approved existing screen. Isolated integration branch codex/stats-workbench-landing starts d2a4976; preserves original f4d75fe preview checkpoint. Cherry-picked RED84c3e85 and implementation with current spectator exports/human routes/current close controls preserved. No model services, gameplay or8793 restart authorized to this agent. Original incomplete proof is not counted as green. Completing aggregate/current build gates, adversarial render proofs, independent review and parent-coordinated landing. Frontier follow-on side chat holds until integration ready.

Landing RED: added mounted failure-of-polling test requiring withdrawal of current/live claim while retained plots stay visible, and browser-boundary fractional identity/budget tests. These close handoff-listed risks without adding new execution ownership. Existing serial owner records only PID+cohort; report that limitation, do not redesign execution protocol in analytics.

Landing GREEN: added safe-integer validation for native sequence, turns, token counts and integer budgets; polling failure withdraws live claim and ticking card with explicit stale-snapshot notice/back link. RED r2 observed both intended failures (24pass/2fail). R1 integrated lint/build pass; viewer coverage branch89.84 fails90 floor honestly, adding meaningful consumer boundary branches before freeze.

Consumer coverage addition: exercise legacy unknown targets/budgets/model/objectives, dirty source, nonvision configuration and zero-duration native split rendering; these are actual handoff contract branches, not mirrors or floor suppression. No application excludes/thresholds changed.

Mutation attempt r1 retained two unexpected passes: removing native qualification and ribbon delivery escaped old tests. Added actual contradictory native evidence record and mounted ribbon exact run/split assertion, preserving attempt logs; fresh mutation receipts required. Card-withdrawal and integer-boundary mutations failed/restored as intended.

Proof r2: strengthened native-contradiction/ribbon assertions now fail under each exact deleted operand, all four changed-critical mutations restoregreen (runs/workbench-landing-proof/mutations-r2). Retained r1 unexpectedpasses and fixture-correction failure separately. Real8798API snapshot160runs, bestdea1RIVAL_MET5565 at1477.567s, allfourastar runs shown1/4, preservedwithheld45plannedslots. Actual1280desktop and390narrow render, scrollWidth==clientWidth atboth; narrowcharts314px. Splitclick shows source256bf/fullpreset/tools/features/evidence; viewerback/comparisonlinkverified. Screenshotsdesktop/details/narrow retained. Human241MiB exceeds existing64MiBreadbound and isexplicitinvalid, notfabricated; newfrontierchatownsstreamingreferencework. No8793restartornewgameplay.

Final gate r1 correctly rejected test fixture union access (legacy state has no story). Narrow fixture on declared current story field; no app behavior changes. Re-running final gates before review freeze.

Final lint r2 found nullable story fixture narrowing incomplete; added explicit nonnull guard before spread. Test fixture only. Review identity supersedes r1 packet for this type-only correction; previous packets/failedlogs retained.

Final applicable TS gates r3: lint/build pass; agent863tests and coverage all independentfloorspass; viewer399tests and lines97.98/branches90.47/functions95.13 pass. Canonicalvendorbbab97ad73e460b7cd7c08527d10ced30cc03fbe clean; noenvironmentchanges, ROM/game untouched. Snapshotcold42.84s on retained160runs, warm0.100s; giantlogs explicitlyexcluded currentbound. Retained-window/replay logs immutable. Frozenreview pending mandatoryexternalavailability and fallback; no independentLGTM/landing/deployment claimed.

Review round1 closed: fresh independentAstra6 andSol5.6 both VERDICT:BLOCKING on one consensus INV-W4/PB2 defect: late-invalid matching-digest ledger published partialmembership/exclusions/acceptedcohort state before fullvalidation. Accept and repair now within existingcohortQueue owner; no newAPI/owner. Cold42.84s initialfetch vs20sdeadline is explicit nonblockinghardeningfollowup, streaminghuman/persistentfrontier/strongerPIDowner separate scope. CLI6.1sol/6sol accountunsupported and externalquota/timeoutreceipts retained; reducedvendor fallbackAstra/Sol5.6. Testqualityallnine reviewed; both confirm batchedlinearfixtureI/O and no suppression/pollution. REDrequire rejected lateinvalidreceipt leaves recordedrun cohortnull, excludednull, validnativeearned split/terminalfailure intact. No promotion/newgameplay/8793restart.

ReviewfixGREEN: stage per-receipt infrastructure failures locally and publish acceptedcohort/membership/failures onlyafter every ledgerrow validates. RED18testbatch17pass/1fail observed actual cohort/exclusion leakage; existingaccepted validinfraoutcome semantics unchanged. No API/runtimeowner/extra file added. Disklow broadgates deferredpendingparentstorageclearance, focusedtests run now.

Reviewfixqualified: ledger-red reproduces17pass/1fail; GREEN18pass. Separate membership-beforevalidation and failure-beforevalidation mutations eachfail/restoredpass, retained ledger-mutations/receipts.json. FullTS gatesafterrepair: agent863/viewer400tests, lint/buildpass; viewerlines97.98/branches90.47/functions95.13. Noexclusionslowered. PriorrenderednativeUI/7servedassetshashes unchanged (repairserveraggregationonly); QA8798processstilloldmodule, notclaimednewserverrepairdeployed. Parentownsfinal8793deploymentafterreview/landing. Source/renderer/validsnapshotqualifications retained, malformedreceiptJSONfilesystemtestcoversrepairproducer. Workloground1 findingssynthesis preserved; re-reviewfullcumulativepacket+fixdelta now required beforeland.

Round2 convergence checkpoint and explicit operator scope receipt: parent relayed operator “Yes, complete that bounded repair.” Scope remains existingstats queue contract only: reuse production ledger schema/validator, validate serialorder including final livependinglaunch, publishatomically; no newruntimeowner/frontierfeature. Round2AstraLGTM andSolBLOCKING bothretained; partialpublicationrepairacceptedgreen, single-reviewer verifiedproduction-schema gapaccepted. Existingfixture rows omitted at/eventsSha256 and boundary duplicated weakvalidation. REDmigratefixtures toproductionshape then rejectmissingfields/extras/invalidfailurecodes/outoforder/invalidtimestamps withoutchangingannotations. Reuse exportedfilesystemComparisonHost(m).readLedger(), notnewpublicschema.

Round3 boundedGREEN: existingfilesystemComparisonHost.readLedger nowowns row schema parsing; analyticsawaits it afterexistingmetadata size/symlink check. Currentcohortowner checks exactmanifesttrial launch/outcomepair order, validtimestamps and pendinglastlaunch; noevents/source/schema/newAPIchanges. REDtypedfixtures26tests19pass/7fail asintended; production-shapedfixtures retainonewriteperledger. Existingatomicpublish staysafterentirevalidation.

Typedowner subtraction: remove duplicated rawrow field/type/knowntrial/duplicate checks nowprovidedby productionparser+exactordinal/type guard. Retain only TSoptional-reason narrowing for outcome projection. Added post-infrastructure-failure nextlaunch rejection soeach neworder/time/stop operand canbe independently broken/restored. No scopegrowth; sameowner fewer redundantvalidators.

Round3 final qualification: 863agent/409viewer tests, fullTS lint/buildpass; viewerlines97.98/branches90.44/functions95.11 preserveindependent90floors. Six separate newparser/serialidentity/phase/finite-time/paired-time/infra-stop operands eachfaildeleted/passrestored in typed-ledger-mutations/mutations.json. Existingpublicationproof retained; no new module/API/owner. Priorround2identity+verdicts preserved review-round2/. Explicitoperatorboundedrepair complied; freeze fullcumulative anddelta from481cc1c forround3 externalreview. No newserviceor8793deploymentclaimed; serveraggregationnewasyncowner remains pendingcanonicaldeploy byparent.

Round3 closed: SolLGTM/AstraBLOCKING on remaining productionstopcondition mismatch: outcomeexit0 withnulleventsSha256 orunknownterminalreason muststop justlikenonzeroexit. Accept as sameexplicitlyconfirmedledgerboundary, notnewscope. Parentreleasedfreeze for exactpredicate repair, productionshapetests and independentoperandmutations; retainvalidfinalpendinglaunch. REDstandaloneinvalidoutcome mustwithholdremainingandexcludeinfrastructureoutcome; laterlaunchmustrejectwholeledgeratomically.

Stop-predicateGREEN uses productionRUN_END_REASONS and exactsupervisorfailure disjunction(exitnonzero, digestnull, terminalreasonnotknown). Missingdigest getsclearinfrastructurelabel, notmisleading“milestone.” Atomicpublish/orderstillhold; sourcefixturestandingvalidpendinglaunch remains. No new publicAPI/file/owner.

Original-scope eligibility repair: parentauthorizedsamebatch because existingcontrols/history alreadypromiseoperator_abort excludedfromresults and aggregateINV-W1/4mustremainconsistent. Retainedsnapshot had10nonprobeaborts withnull exclusion, includingd94f/9a76nativepoints. Preservevisibleterminalreason/nativeinspectionevidence, butexplicitlyexcludeabortsfromplots/denominators; operator_stop remainseligible. This isno newstatisticalpolicy/domain/owner. REDproductionabort/stoprecords andmountedconsumer exclusionvisibility.

AbortGREEN: loadsets explicitoperator-abortedexclusionafterterminalfold; probeexclusionprioritypreserved. Existingeligibilityconsumer removesplot/denominatorcredit whileoutcomerow/detail/raweventsretainreason+nativeevidence. Operatorstop positivecase remainseligible. Noeventlogrewrites.

Round4 final qualification: REDstop4fail/27pass, REDabort1fail/43pass; focusedGREEN44pass. Null-digest, unknown-reason and abortexclusion eachfaildeleted/passrestored independently in stop-abort-mutations. Full863agent416viewer tests, TS lint/buildpass; viewerlines97.98/branches90.46/functions95.12. Allfailuresandpriorroundpackets retained. Sameconfirmedledgerboundary+originalcontrol/historyaborteligibility promise; no newproductionfile/API/schema/owner. Nativeevidenceretainedwhileabortsgetnoplot/denominatorcredit. Freeze fullcandidate+deltafrom2b61a28 forround4 review. 8793landing/deploymentnotyetclaimed.

Round4 closed: AstraLGTM/SolBLOCKING on secondrun_start replacing provenance withinone eventtimeline. Parent relayed explicit operator authorization/waiver: “Yes—finish existing fixes until review is green,” existingcorrectness-only scope, no newfeatures/owners and repeatedcheckpointwaiver. Accept duplicateheader as INV-W1/3/PB7 defect. Sameowner scan: initialnonheader, foreignrun IDs, seqgaps/duplicates, nonfinite/backwardtimestamps andeventsafterterminal alreadyreject; no furtherconcrete malformedtimelinehole found in those boundaries. ExistingFSarchive race/coldlatency remain recordedhardening; no newdomain. REDproductiontimeline with earnednative split then second model/source header andterminal mustbeinvalid, preservefirstprovenance, eraseanalyticscredit.

DuplicateheaderGREEN: reject any later run_start beforeRunView/headerfold, leavingoriginalmodel/sourcefirstheaderimmutable and no graded splits oninvalidtimeline. Oneguard inexistingload, no API/schema/ownerchange. REDobservedreplacedmodel/source andretainedsplit; focusedGREENpendingthenindependentguarddeletion/restoration.

FocusedduplicateheaderGREEN34pass; independentlydeletingonlysingleheaderguardfailsnative/provenanceassertion, restored34pass (header-mutation). Precommithookcorrectlyblocked GREENcommit on same-secondworklogmtimefreshness; appendtheseactualnewreceipts and retrywithhookenabled, no bypass. FullTSgates running onrestoredsource.

Round5 qualification: all863agent417viewer tests, lint/buildpass; viewerlines97.99/branches90.47/functions95.12 withunchanged90floors. Duplicateheaderguard oneproductionline, focusednativeprovenanceRED/GREEN andindependentdeletionproof retained. Priorround4verdicts/packet preserved review-round4/. No other same-owner concrete malformedtimelinebugs found, no newfeatures/owners/API/schema. Parentownsreview/merge/8793deployment; sourcefreezenowforfreshcumulativereview+deltafrome6c5c18.


## Review synthesis and implementation closeout — 2026-10-14

**Reviewed source:** `432431c88f995b9f5a89f763604e3e68245cc4b7`, base `d2a4976`; cumulative diff SHA256 `c1739d228b7303ce7e0475418f01d492cdf5400fd604e3651c1ff1dd96fac29a`. Both fresh, read-only Sol 5.6 and Astra reviewers ended exactly `VERDICT: LGTM` in round 5. Their receipts independently retain unchanged HEAD, clean status and matching cumulative/fix digests. This commit records results only; no runtime changes.

Normal-lane availability failures remain retained: Claude CLI timed out; Cursor Claude Opus/Sonnet reported usage limits; Cursor Grok timed out. Local Fast/Swarm reviews were not invoked because the operator reserved local models for benchmarking. Codex Sol 6.1/Sol 6 were account-unsupported; supported independent Sol 5.6 and Astra CLI contexts supplied the authorized fallback. **Vendor diversity is reduced; this is not normal-roster success.**

Accepted in-contract findings are repaired and re-reviewed: partial ledger publication, production row-schema/order and supervisor-stop mismatches, operator-abort comparison credit, and duplicate headers replacing provenance. Earlier stale live-card and fractional count boundary defects are also repaired. Original findings, unexpected mutation passes, failed gates and all superseded packets are preserved. The operator explicitly confirmed the bounded validator repair, then authorized “Yes—finish existing fixes until review is green,” with correctness-only scope and repeated-checkpoint waiver. No new feature, schema, API or runtime owner was added by review fixes.

Principles synthesis (all current IDs; zero FAIL): PB1 PASS—native-qualified timing; PB2 PASS—failed runs retained and abort/infra exclusions explicit; PB3 PASS—no improvement claim; PB4 PASS—read-only analytics and feature tri-states; PB5 N/A—no behavioral trial; PB6 N/A—no context changes; PB7 PASS—immutable event/provenance checks; PB8 N/A—no model retry changes; PB9 PASS—explicit scope/confirmations; PB10 PASS—unchanged independent 90% gates; PB11 PASS—existing production validator reused; PB12 N/A—no ROM access; PB13 PASS—tests, worklog and independent review complete, deployment handed off explicitly.

All nine test-quality checks were examined: real JSON/filesystem/HTTP and mounted consumer seams; performed operand deletion/restoration; isolated roots with no environment/cwd mutation; assertions select test-owned identities; controlled async tests without timing suppression; no retries/sleeps/skips/serialization workaround; concrete native/config/provenance assertion payloads; linear batched fixtures without per-row I/O or repeated growing-state work; sparse size-bound fixtures without filling production caps. Reviewers found no remaining blockers. Review context was separate from gameplay; no reviewer information or gameplay rescue was injected into a measured run.

Final gates: **863 agent and 417 viewer tests**, lint and build pass. Viewer coverage: lines **97.99%**, branches **90.47%**, functions **95.12%**. The duplicate-header guard independently fails when deleted and passes when restored; earlier atomic publication, schema/order/stop, abort eligibility and rendering mutation receipts remain retained. Actual 8798 replay demonstrated native event 5565, configuration inspection, viewer navigation and desktop/narrow fit; seven served UI assets matched built bytes. That process still holds an older aggregation module and is **not** proof of deployed final repairs.

Deferred, non-blocking work remains explicit: cold aggregate latency (42.84 seconds versus the browser's 20-second timeout), 241 MiB human-log streaming beyond the existing read bound, persistent human/frontier comparisons, and stronger coordinator identity. The frontier side chat owns its approved follow-on design. No benchmark was launched, no model service changed, and no incumbent was promoted by this task.

**Handoff:** implementation/gates/review are complete. Parent owns merge, integrated build/checks, restart of 8793, served-byte/browser verification and the landed SHA handoff. Landing/deployment/cleanup checkbox remains open until those receipts exist. Preserve the original `f4d75fe` worktree and 8796 preview while they remain dependencies; no worklog archival is authorized here.

## Canonical landing and served proof

Parent merged reviewed source432431c and docs-only closeout7711304 into canonical main9accc1ed8fc682a0af220d0fbf259e0ded41b416. Built both packages and restarted only the owned idle8793 viewer (PID85019), preserving queue/draft and all unrelated worklogs. The owned wrapper now passes the already-configured public origin through the reviewed CLI and loads existing .env, preserving the portal path while binding loopback. Six served HTML/CSS/JS assets match canonical built bytes. Browser verified /comparisons, filters, actual bestdea1 RIVAL_MET24:37 nativeevent5565, full model/harness details and return to mainviewer. At1280px document width is1280 (no horizontal overflow); renderer is unchanged from retained390px qualification. Proof: runs/workbench-landing-proof/landed-served.json and main-details.jpg. Initial canonical snapshot took50.881s over160runs, then was warmed; cold-load hardening remains explicitly open. Persistent human/frontier visualization and supported8trial manifest adapter remain owned by sidechat 00000000-0000-4000-8000-852f145f4746, not claimed delivered by this landing.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-14). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
