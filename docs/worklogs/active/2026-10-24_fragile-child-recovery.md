# Fragile child test recovery

## Problem Statement
Canonical main ebed5a7 failed its post-main test gate: 4227 passed, one failed because a child did not emit stdout before the real 100 ms startup watchdog expired. The output-retention test conflates process startup with a ready child's hang handling.

The operator authorized fixing fragile tests and landing the first pilot on 2026-10-24 (user msg_00000000-0000-4000-8000-280221f4d483). Coordinator separated this already-authorized test-only recovery first; the broader committed pilot remains active afterward. Initial implementation split: serial-comparison.test.ts plus this worklog. After actual integrated coverage exposed the other already-approved fragile fixture, current recovery scope ALSO includes live-human.test.ts and ONLY the behavior-neutral live.ts completion export, as specified in the originally approved pilot architecture. No execution/dispatch/error-handling, recipes, dependency declarations, workers, timeouts or coverage policy changes.

## Skills Loaded
feature-worklog, execute-worklog, multi-model-review (including test-quality), talk-to-claude, close-the-loop, viewer-e2e. Existing operator no-focus boundary applies throughout.

## Architecture
Use an owned loopback readiness signal after the fixture emits both streams and installs its signal handler. Intercept only the existing 100 ms watchdog in the output-retention test and invoke it after readiness. Preserve a separate real 100 ms silent-child startup timeout. Own cleanup restores the timer and closes sockets/server, including pre-spawn log conflict.

## Invariants
- INV-1: production execution/dispatch/error handling unchanged; only name/export the existing live entrypoint completion promise. Remove only naming/export assignments and prove exact byte equality with base.
- INV-2: real silent startup timeout remains 100 ms; focused execution and guard deletion.
- INV-3: hung child output and timeout classification remain asserted; delete classification and confirm RED.
- INV-4: fixture resources/global timer restored on pre-spawn failure; log-conflict case and cleanup mutation.
- INV-5: default workers, all normal gates, independent reviews and per-metric 90% floors retained.
- INV-6: active gameplay processes and leases untouched; compare identities before/after the one coordinated viewer refresh.

## Security Review
Private ephemeral loopback test server and owned disposable fixture children only. No gateway inference, gameplay launch, ROM copy, credentials or external writes. Only existing entrypoint completion is named/exported; byte-neutrality proof removes those assignments/export and exactly reproduces base execution source.

## Milestones
- [x] M1: isolate test repair and focused guard evidence.
- [x] M2: fresh unchanged build/test/lint/coverage/vendor gates under granted finite CPU window.
- [x] M3: frozen exact packet, all selected independent cloud reviews and synthesis.
- [x] M4: landing-board fast-forward, canonical checks, one safe viewer refresh and protected-state proof.

## Closing the Loop
Prove the actual normal test command on the reviewed branch and canonical main. Preserve main failure evidence and report source versus evidence commits separately. The truthful-drought owner performs a separately granted light feature proof after release; no duplicate restart.

## Session Log
2026-10-24: created isolated managed worktree from exact ebed5a7f331a9c2501fb7a695994afc9be7cebd9. Approved narrow scope excludes live-human/live.ts because their repair is coupled through a completion export. Broader pilot remains committed at c188f2c for completion after recovery.

## Surprises
Canonical test failure is an OS startup scheduling race, not evidence that production hang handling lost output from a ready child.

## Multi-Model Review Log
Pending fresh selected reviews after standard qualification. Existing broader-pilot reviews are not reused for this new packet.

## Boy Scout Log
No unrelated cleanup.

## Archive Milestone (user-gated)
Not requested; keep active.

Focused proof: all 46 serial-comparison cases passed. Mutating production timeout classification and fixture timer restoration independently produced intended RED assertions; exact original source restored, then all 46 passed again. Evidence: runs/fragile-child-proof/{mutation-receipt.json,timeout-classification.log,timer-restoration.log,focused-green.log}. ESLint passed. Existing canonical 4227-pass/1-fail failure is the source RED; no new production behavior is introduced.

R1 full unchanged gates on4609967b PASS347.525s (4230agent/1829viewer/4106Python+3protectedcards), above90allmetrics. Claude/GPT/Sol LGTM; Astra BLOCKING concrete late pre-spawn I/O after readiness deadline can miss optional watchdog cleanup and strandchild/timer restoration. Both Grok routes exhaustedusage; verified humanwaiver+distinct fallback roster retained, reducedvendor diversity. Full mandatory synthesis at runs/fragile-child-proof/r1/synthesis.md. Accepted only samefixture lifecycle fix plus deterministic late-spawn regression; productionpathset remainsEMPTY. Actualmain advanced42edb3f22 duringreview, so currentpacket is not integratedqualification; waitingactualownerrelease beforeintegration/newCPUgates. This commit adds deterministic REDordering test; no weakened100ms/defaultworkers/floors.

R1 accepted fix: readiness deadline begins immediately before launch only in readiness-using modes; unused conflictmode has no rejecting timer. Cleanup flag survives late watchdog registration; its already-existing zero-delay fixture timer dispatches the stored watchdog if cleanup began first. Added same-fixture late-spawn mode: reject readiness synchronously while actual launch I/O remains pending, assert callback not yet registered, then require finally restoration/serverclosure. Actual RED commit11a31ffbd: this case hit Vitest5000ms timeout; outer12s supervisor also timed out because child/outcome remained, then terminated only its owned session group. Both facts retained; not a clean test-process exit. Integrated released actualmain7133032cc1da7cd49363b6bd32a53294afcdb557 (trigger boundary promotion+evidence) before GREEN; no overlapping source conflicts. Fresh normal gates and R2 required; no stalepacket qualification reused.

Correction after20280bb44: first focused attempt FAILED (5failed42passed), not GREEN: cleanup flag declared inside try was unavailable in finally; ESLint also failed. Both logs retained. Moved only that fixture flag to outer owner scope. No normal gate or review approval claimed for the failed candidate; process inspection after tool teardown found no remaining pokebench-comparison child. Regression RED wrapper timeout12s and Vitest5s failure retained honestly.

Focused final correction:47/47 serial cases PASS, including deterministic cleanup-before-late-watchdog registration, real100ms silentchild and pre-spawnEEXIST; ESLintPASS. Production files and normal recipes unchanged. Full normal qualification/R2 still pending.

Integrated gate attempt R2 on clean23c0b8110/base7133032 STOPPEDfirstfailure at2026-10-24T19:52:58.193560Z after281.503s; CPUreleased immediately/no retry. BuildPASS41.96s; normaltestPASS115.23s (4231agent/1837viewer/4106Python+3protectedcards); lintPASS90.03s. CoverageFAIL34.27s: unchangedlive-human.test.ts assignedidentity case Vitest5000ms timeout, following generatedidentity releaseexpected1 got2 (4229agentPASS2FAIL). Serialrepair cases passed; viewer/Pythoncoverage andvendor not reached. Full receipt/logs in runs/fragile-child-proof/normal-r2. No qualification/READY/reviewR2/landing claim. Exact actual gate re-exposes existing human-lifecycle coupling excluded from strict serial-only recovery: previously preserved broaderpilot completion-based human test repair requires behavior-neutral live.ts entryCompleted export. Reported failure+minimum existing two-file dependency to coordinator for packet split decision under original human fragiletest approval. No silent export/runtime/recipe/tool/cache/CPU/policy scope growth; no active run/service/viewer changes.

Coordinator recovery decision under original direct human fragiletest approval: include existing live-human.test.ts repair+minimal behavior-neutral live.ts completion export because strict serial-only split was an implementation choice, not a human prohibition, and actual required coverage exposed that adjacent already-approved fixture. Original pilot approved Architecture explicitly names this exact promise export/test cleanup; this is moving its existing subset into recovery, not a new runtime owner or reviewer-driven scope growth. Sourcepaths now exactly serial-comparison.test.ts, live-human.test.ts, live.ts and this worklog. Preserved broaderpilot cache/CPU/normalizer/recipes excluded. Existing entry().catch invocation remains once with identical dispatch/error body; stripping ONLY completion naming/export/null-resolved-assignment reproduces main live.ts byte-for-byte (completion-neutrality.json). New deferred-run test mutated to expose prematurely resolved completion while actual entry stillruns: intended RED expectedtrue tobefalse, restoredexactsource. Full fresh qualification/selectedreviews required, previousfailedcoverage retained.

Combined focusedGREEN54/54 (47serial+7human), ESLintPASS. Delayedcompletion regression proves promise remains pending during withRun, then signal removals+single lease release after completion; globals restore only after actual entrypoint completion. No service/inference calls (mock spawn forbids them), no timeout/worker change.

## Recovery final integration and local landing
Source4293758025c30aed1a2fede313bf68a12567f7d3 applies EXACT reviewed four-file patch to releasedmaina1d1fa3417d50ed140c2167b7dd185f1996de637. Own binarydiff8d8b2bb1d18cf95ce7eb02923590f4dc251eee67608fac458e0f828319f99946 is byte-identical to reviewedbcdbbda092739127d2c68dc3f52373ef50aad8db/base7133032, including pre-evidence worklog. Original reviewed branch/REDlineage preserved. Integration branchcodex/fragile-child-recovery-current. Exact-own-diff landing rule retains reviews only after new full integration gates; no stale validation reused.

Complete R2 selected roster: realClaudeCLI LGTM(exit0/stderr0), fresh normalGPT, distinctfreshSol+Astra all literalLGTM with exactclean pre/post identity. Both actual currentGrok routes usage-exhausted exit1, neverapproval. Verified primaryhuman standinglandwithoutGrok waiver plus distinctfallback; reducedvendor diversity explicit. Full synthesis authenticreviews and performed guard RED/restoration retained. No newblockers; optional diagnostic/assertion hardening and existing stderr-open handle leak outsidepatch deferred.

Fresh integrated ALL5 literalnormalgates PASS305.769s,20:28:43.313493Z–20:33:49.080704Z: build16.710/test104.414/lint74.932/coverage109.498/vendor0.199s.4232agent/1840viewer/4106Python+3protectedcards. L/B/F agent99.14/92.74/97.53, viewer98.04/91.67/95.18, Python97.37/93.33/100; unchanged90floors/defaultworkers/timeouts. Preflight conflict checks yielded before starting gates; failed priorattempts retained, no test retry/suppression. No loop prepare lock during qualification per coordinator. Citation's disclosed one-core~20s difflib overlap retained as attributed evidence, no causalclaim.

Board#1 exactchat 00000000-0000-4000-8000-f4634e65bfd1 verified. Main FF-only to4293758025c30aed1a2fede313bf68a12567f7d3. Canonical LAND20:42:30.021121Z–20:44:52.253062Z,142.233s: buildPASS17.384s, testPASS at110.673s cumulative, ONEviewer-mainPASS at139.258s. Existing nonblocking prepare lock ONLY refreshstep and immediatelyreleased, no lock during build/test. Dynamicpreflight discovered actualcleanqwentreea1d listener and stopped before mutation; assumption corrected while retaining then-authorizedgymtarget. Later in-flight qwen-target correction was not applied before staticdriver refreshedgym; disclosed, coordinator directed NOsecondrefresh. Actual listener73131/PPID1 clean4293758 from/private/tmp/pokebench-viewer-gym-label. No claim it servesqwen; no damageddefaulttree/loop/env/schedule/input change.

Critical-section before/after snapshots match all13 protectedPID/PPID/start/fullargv identities, six lease/endpoint hashes, root.env and PAUSE/STOP existence/hashes. Controller captured last64KiB tail hashes match (not a full-file-hash claim). No active agent/game-server/model process signaled, only authorized oldviewer replaced.

Headless publicproof20:48:02.898986Z–20:48:08.687657Z selects actualB2026-10-24T16-25-04_qwen36-gpu0_04e1 via Watch, RUNNING, framepresented14→20/received17→34, empty visibleproblems. ActualEmerald screenshot pixels inspected. Configdroughtcard+explainer open; served panels/explainer bytes and clean buildstamp match429. Helper exits1 due console502; not masked. Separate admitted diagnostic20:50:33.889915Z–20:50:41.434900Z,7.545s, identifies exact repeated GET/api/models HTTP502 (unchanged localmodeldiscovery route server.ts493-499 outsidefourfilepatch). Eventstreamabortonnavigation recordedseparately. Owned positive surfaceproof holds; generalviewerhealth/modeldiscovery NOT claimed. No productfix or secondrestart. Originalfailedproof and diagnostic/screenshots retained.

Canonical evidence: runs/reviews/2026-10-24_fragile-fixtures-4293758025c3/ contains integratedgate logs, frozenR2 boundary/principles/selectedreviews/synthesis, RED/restoration and actualfailure receipts, landing/protectedsnapshots, publicproof/diagnostic/screenshots. Initial evidence-copy helper used canonicalcwd for the owned proof path and failed before anywrite; corrected absoluteownedpath. This evidence-only commit touches ONLY thisdocs/worklogs body underlandingexception; boardrelease and source/evidenceSHAs reported directly aftercommit.

Recovery subset complete with explicit unrelated/api/models limitation. Item3owner may perform its separateLIGHTfeatureproof withoutduplicate refresh. Original broader firstpilot remains ACTIVE at preservedc188f2cdf9bd40c3922b092d16cf6aadc1e285a6: validation reuse/CPUtooling still require currentintegration, fresh receipts/callerproof, fullR3reviews and landing. This is not wholepilotcompletion. Archival notrequested.
