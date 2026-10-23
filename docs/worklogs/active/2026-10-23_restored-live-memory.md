# Restore live memory across continuation run IDs

Authorization: The operator directly instructed via coordinatorredacted-id on2026-10-23: "Have autoresearch fix the stale supervisor context, finish tests and reviews, and land it for future runs. Keep the current runs untouched." Existing Grok-outage waiver applies with distinct cloud fallback. No additional compute or campaign restart is authorized.

Root cause: RunRecorder.restoreHistory broadcasts original source-run identities. LoopCoordinator and ObservedInstructions bind the first identity and reject current continuation events. Their old supervisor/observed-progress state is repeatedly delivered after current tool observations. Campaign originals/initial checkpoints and all ended traces remain untouched.

Scope: one default-OFF restored-memory-run-v1 switch, applied only to in-memory historical event dispatch in a continuation. ON dispatches cloned historical events into the current recorder namespace; source prefix bytes/IDs/sequence/timestamps, persisted conversation/budget, newly recorded evidence and scoring remain unchanged. This preserves historical evidence while allowing existing consumers to process new events. Adjacent observed instruction memory shares the same necessary run-boundary repair. Future autoresearch runtime qualification explicitly opts in; normal presets remain OFF.

## Required proof
- [ ] Commit RED production restoration/supervisor+instruction regressions and OFF invariant.
- [ ] Implement bounded namespace repair + production/future-runtime wiring, registered switch/explainer.
- [ ] CPU-only production multi-turn private-stub proof follows a fresh location and expires old supervisor; exact source prefix/conversation provenance preserved.
- [ ] Performed wiring mutation fails; full default tests/coverage/lint/build/vendor pass with90% floors.
- [ ] Frozen principles and independent cloud reviews approve exact integrated source.
- [ ] Normal landing board FF main/postmain tests/evidence/viewer check; prove future configuration ON separately from any launch.

Excluded: grading context segmentation/controller peer-cancel policy, scoring changes, gameplay advice, current/ended source or metadata edits, campaign continuation/resumption/replacement and additional GPU calls. The first campaign stopped itself after a910221byte single-decision grading package exceeded600000byte bound, automatically cancelling its peer. This is retained infrastructure failure, not an efficacy result.

## Expanded authorization and frozen recovery constraints
Verified directly in coordinator chatredacted-id via read_thread, human message 00000000-0000-4000-8000-7770d285c1e9: "Have autoresearch fix the grading limit and stop cancelling healthy runs when grading fails. Finish tests, reviews, and landing, then restart both GPUs with those fixes and the stale-context fix enabled. Keep the Mac run untouched."

M2 therefore also owns bounded lossless grading of oversized native decisions, isolating grading failures from healthy running peers, and immutable carry-forward budget accounting before an explicitly authorized fresh recovery launch. Retain unchanged prompt search/scoring/mandatory heldout/readiness stages. Carry2 prior launched episodes and2460992physicalGPUms; remaining34episodes and55139008GPUms. Stop without nominee if full required confirmation no longer fits; never drop/reallocate mandatory stages or manufacture a skipped retest. No current/ended run or Mac mutation; new compute only after all fixes/tests/reviews/landing plus affected-owner clearance.

- M1 RED: real withRun→RunRecorder→attachLoopGuard/contextTools test reproduces old supervisor remaining after fresh Devon observation; ON assertion fails, exact legacy OFF identity/bytes test passes. Receipt launch-preparation/restored-memory-red.log. Historical native source prefix remains unchanged. No implementation yet at this commit.
- M1 GREEN implementation: historical envelope aliasing is gated only by registered default-OFF restored-memory-run-v1 in the withRun factory. Original prefix bytes and source identities on disk remain unchanged. Current event consumers now receive one consistent namespace; existing supervisor consumption and instruction progress updates work without adding new model advice. Guarded future qualification supports explicit live-memory-runtime, strict loader permits only this added common feature, and protected qualification inherits that common mode only after finalist freeze. Normal presets remain OFF. Focused production/runtime/registry suites101/101pass. Two initial test assumptions corrected: the negative feature mutation must invert the fixture's actual default, and additive registry positions changed by one. No assertions removed or gate/timeout changes. Explainer/feature card mapping added; final full gates, CPU multi-turn proof, mutations and cloud reviews pending.
