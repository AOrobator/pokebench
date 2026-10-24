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
- [ ] M2: fresh unchanged build/test/lint/coverage/vendor gates under granted finite CPU window.
- [ ] M3: frozen exact packet, all selected independent cloud reviews and synthesis.
- [ ] M4: landing-board fast-forward, canonical checks, one safe viewer refresh and protected-state proof.

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
