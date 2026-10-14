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
- [ ] RED producer/aggregate tests, then minimal typed read-only aggregation.
- [ ] RED mounted viewer navigation/chart/current card/details/queue tests; implement selected design.
- [ ] Full applicable viewer gates and independent90 coverage floors, mutation receipts, actual retained replay and served-artifact hashes.
- [ ] Frozen independent review, landing, viewer deployment and recoverable worktree cleanup.

## Closing the Loop
Verify viewer→workbench→live viewer, chart/row→configuration drawer, native splits/current objective/elapsed, responsive fit and withheld queues. Preserve actual screenshot/test/review/landing receipts separately. Existing overlay spacing and objective-ablation worklog changes in this checkout remain part of final scoped diff; the pending objective-system24 trial experiment is unchanged.

## Session Log
2026-10-13 operator explicitly approved round2 design7 with responsive charts, bottom-only queue and clickable current-run meta card. Implementation isolated from canonical main. Existing main cohort ended at trial20 with retained launcher_error: health/slot occupancy unavailable; original services restored and lease released. Trials21–24 are withheld, not queued. Diagnose the infrastructure cause separately; no silent resume/replacement.

## Surprises
The prior benchmark was not still running at UI implementation time; current and queue status must use durable/live evidence.

## Multi-Model Review Log
Pending frozen implementation packet; no approvals claimed.

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
