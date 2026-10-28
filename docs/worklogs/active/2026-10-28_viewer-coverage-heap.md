# Viewer coverage heap budget

Owner: Codex chat 00000000-0000-4000-8000-813dbe13e931, isolated existing YAML checkout reused after YAML landed4c4649b80. Coordinator assigned this main-health diagnosis when canonical postmerge tests failed, explicitly directed a small separate branch with normal gates if more heap is required. Human instruction remains “Continue. Make sure you land your work.” No production model/run behavior, live process, assertion, test, coverage threshold/exclude, worker count or isolation change is included.

Outcome: prove the existing viewer coverage workload fits an explicit8GBJavaScript heap, then commit that budget only to the viewer coverage command. Vitest5 filters ordinary parent execArgv, so the budget must reach forked workers (NODE_OPTIONS is a candidate; inspect installed pinned source). Full90percentgates and review still required. No PATH changes or fixture rewrites in this branch.

RED evidence: main4c canonical build0 then justtest1; panels.test.ts fork SIGABRT at4087.2MB oldspace with default4GBheap. Same exact revision fullgate passed in isolated checkout. Targeted221panel tests pass alone but verbose heap reaches4013MB,4043MB then4081MB, leaving almost no slack. Coverage-alone221tests pass; global floor failure is expected when only1of177files runs and is not credited as a gate. No threshold override used. Logs canonical runs/reviews/viewer-coverage-heap-20261028 and runs/reviews/instruction-memory-yaml-final-20261028/postmerge.

Both canonical and isolated shells resolve ~/.local/bin/node to the same ~/.hermes/node/bin/node v26.7.0, heap_size_limit4395630592, including just --command. No canonical .env heap/PATH override or canonical-only leak; existing shared symlink is not changed.

- [x] Diagnose actual heap pressure without test/assertion changes; report before gate edit.
- [ ] Under coordinator START after snapshots soak, run viewer fullcoverage with8GB and heapstats; compare exact tests/coverage and worker budget.
- [ ] If supported, commit viewer-only resource budget; RED/GREEN uses real failing and passing coverage executions, no mirrored implementation test.
- [ ] Normal full lint/build/test/vendor gates and PB1–PB13/self+independent cloud review on frozen packet, standing verified Grok waiver with distinct fallback.
- [ ] Board-controlled local FF and canonical postmerge test; complete YAML singlelocked clean-runtime viewerrefresh/liveproof and evidence-only worklog receipts, release board/CPU.

Non-goals: more model context, gameplay/GPU/inference, runtime feature flag, architectural test refactor, heap leak cleanup, worker serialization/retries/skips, new deps, Node/PATH replacement, weakened floors, hidden result edits or historical/live-run changes. Do not archive this or YAML worklogs without human request.

Coordinator explicitly APPROVED coverage-only NODE_OPTIONS=--max-old-space-size=8192 as an unblock at5:06, preserving every assertion/threshold/exclude/worker setting. Later direction: use existing YAML #1board slot for this postmerge repair; ff-only after focused checks and quick independentClaude+GPT review, one canonicalpostmergefulltest proves both, single8790refresh. CPU START awaits snapshotssoakRELEASE about5:15. I retain distinctSol/Astra fallback as well under existing humanGrokwaiver. No heavychecks started beforeSTART.

Implemented one coverage-script resourcebudget line; no appcode/gatecriteria/testchanges. Follow-up (outside this unblock, not silently satisfied): find panels.test.ts retained DOM/cards/fixtures across221tests and fix lifetime/cleanup through appropriate tests, so8GBdoesnotbecome the next ceiling. Defaultsinglefileverboseends4081MBand fullworker4087MBOOM indicate retention pressure; largerbudget is a bounded resource allowance, not a leak fix.

Heap focusedacceptance: actualcommittedviewercoverage command2292PASS/floors90PASS, maxreportedheap4423MB,19.6s. All4selectedreviewersLGTM; c61ebd4f1FFlanded underexplicitcoordinatorauthorization usingexistingYAMLrepairslot. Canonicalcombinedbuild0;4936agent/2292viewerPASS, thenPython4868PASS/1FAIL: oldtest_gate_wiring exactscript pin rejectsnewapprovedbudgetprefix. NoOOM.

Coordinator explicitly approved viewer-specific exactexpectation update (notlooseprefix), agentpin andeverythresholdassertion unchanged; CPU remainsours, quickClaude+GPTdeltareview thenFF+canonicalfulltest+refresh. Isolated follow-up branchcodex/viewer-coverage-pin fromc61. ExistingguardRED1, changedonlyviewerexpectedfullstring, entiregatewiringfileGREEN. Twoactualmutations(dropcoverage/dropheap) eachAssertionError/exit1; pkg restoredexacthash. No assertion removed or loosened, no floor/exclude change.

Evidencequalification: postmerge-after-heap helper's output-directory substitution missedthefullpath and overwroteoriginalOOMlog. Fulloriginalfileisnotretained; exactnative tool-output excerpts recovered into postmerge-before-heap-failure-native-excerpts.json, plusindependentreviewerobservations/defaultheapstats. LaterfailedPythonpinattempt full logs snapshottedunderpostmerge-after-heap-attempt1. Finalrunner uses a uniqueoutputdirectory and refusesexistingpaths.
