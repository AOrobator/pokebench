# Passive patch-results comparison/reporting

## Problem Statement
The operator asks this side conversation to coordinate with the main chat and take non-conflicting implementation work. Proposed ownership is the passive offline comparison/report engine described in the patch-evaluation worklog. Main chat notified; only unique new-module files are owned here, with redirect on conflict. No existing agent interaction or shared runtime changes.

## Skills Loaded
PokeBench feature-worklog and patch-evaluation; skill-creator used for the existing reporting contract. Production code follows repository RED/GREEN, gates and multi-model review. Main chat coordinates selected reviewers and integration; no review/model endpoint use without coordination.

## Architecture
New pure report module/tests consuming immutable recorded evidence and explicit experiment configuration. Four-per-arm accounting, qualified native target completion/time/turn/token summaries, compatible incumbent/candidate comparison, completion-first verdict/recommendation, evidence and plain harness/infrastructure attribution. No file writes to source runs, no game/model requests, no prompt/feature-registry/runner/event/viewer changes. Rendering artifact can feed later viewer integration. Freeze a bounded pure input contract before production edits; main contract alignment stays explicit and adapters/shared changes are deferred until coordinated.

## Invariants
- INV-1: incomplete/failed/censored trials remain visible; missing splits neverzero. Four-per-arm and compatible metadata are eligibility gates, not invented confidence.
- INV-2: only recorded qualified native observed target progress counts; present_at_start and legacy/unqualified labels cannot earn a split. Evidence links stay attached.
- INV-3: comparablebuild/model/start/budgets/flags checked from supplied provenance; one effective patch differs. Model-specific results cannot average away regressions.
- INV-4: completion-first comparison; faster earlyfailed stop neverimprovement, survivor times carrydenominators; post-run recommendations do not execute promotion.
- INV-5: harness/infrastructure issues explicitlyreported, affected cohorts retained and rerunrecommendation qualified. No activegameplay/model/intervention changes.

## Security Review
Pure deterministic computation over typed validated records, no credentials/ROM/script execution/network/file mutations in measured runs. No widened coverage exclusions/no any/new dependencies.

## Milestones
**M1 — Freeze comparison contract**
- [x] Notify main coordinator/propose exclusive new-module ownership
- [x] Main reservation: exclusive new passive reporting module/tests/artifact confirmed by main chat
- [x] Initial RED: suite cannot import absent production module (0collected); this is scaffolding RED, not claimed detector mutation evidence
- [x] Implementpureengine/reportartifact and explicitcontract
- [x] Eight guard deletions yielded assertion failures with31testscollected; exactsource restored
- [x] Gates:403agent147viewer378Python=928; workspaceTS lint/build, Pythonruff/format/mypy/vendor, all90floorsgreen
- [ ] Independentreview and main handoff of exactreviewedartifact

## Closing the Loop
Only dedicated isolated branch codex/patch-results-report. Main sharedskill/worklog and canonicalcheckout untouched. Do notlanduntilrootcoordinated; no newbenchmarktrials fromthisassignment. Testengineagainstrealimmutablelogs honestly, old3-per-armdata cannotfulfillnew4-per-armcomparison. Scopeexpansionrequirescoordination.

## Session Log
2026-10-12: sent mainchatproposal; readcurrent summary/event interfaces. Newmanagedworktree created at /Users/user/.codex/worktrees/patch-results-report/pokebench; registration failed because sidechat thread notregistered, checkoutreturnedvalid and reused, no duplicatecreation. Base currentmain16c8939.

## Surprises
Existing summary counts unqualified legacy milestones; thisnewcomparison mustnottrust summary milestone list alone for nativeprogress. Currentrun_start doesnotyetstore fullpatchvector/incumbentpresets; immutable explicitreportinput contract mustdisclosemissingruntimeprovenance, notinventbackfilledflags.

## Multi-Model Review Log
Pending.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER: archive after closeout.

Contract checkpoint: featureID boolean preset vectors match actual run_start harness_features; runtime/ROM environmentidentity requires explicit immutable receipt because current metadata lacks these fields. Newpuremodule only; no livecaller/CLI integration. Userauthorization covers this bounded work; main notifiedagain and canredirectifanotherownerexists.

Main reservation received: no sharedregistry/runner/UI/runtime edits; exposeexplicitmanifest/preset contract, retainN3historical vsN4future, distinguishunqualified vsfailure. Initialtestcommand failedmissinglocalpackage dependency link; linkedexistingignorednode_modules thenredconfirmedmissingpatch-results module. No depsinstalledorversionschanged.

Implementation checkpoint: mainreserved scope,31focused behavior cases green (after correcting fixtureimport/type and requiredterminalframes). Typedpurecompare+Markdownrender, nativeproof/coverage, explicitflags/receipt contract atdocs/designs/patch-results-contract.md. Agentwholecoverage previously396cases/98.17statements92.33branches98.18functions99.21lines; latest31casesneedfinalrerun. WorkspaceTS lint/build previouslygreen. Prettiernotinstalled; no dependencyadded, repositoryeslint/tscgates used. REDcommit57042f9 (initialmoduleabsenceonly); no claim ofmutationproofyet.

GREEN checkpoint: 31focusedcases; full928tests (403agent+147viewer+378Python). Agent98.68statements93.20branches98.53functions99.22lines; newmodule98.80/93.89/100/100; viewer97.47/91.45/98.42/98.36; Python99.34lines96.77branches100functions. InitialPythoncheck had2fails because vendorworktreeuninitialized; pinnedsubmoduleinitializedclean thenall378passed. No Python/vendorbehaviorchanged. HistoricaltypedQwenN3replayCLOCK_SET2baseline/1candidate correctlyineligible(incompleteprotocol+explicitmissingexternalenvironmentreceipt), verdictinconclusive/retain. Evidencefiles inignoredruns/launch-receipts/patch-results-report. PrinciplesPB1–13read/scoredzeroFAIL; no independentreviewyet.

COMMIT: RED `test(report): specify passive patch comparison contracts` (`57042f9`); GREEN `feat(report): compare passive patch results against incumbent` (`b19a3cd`). Implementation/gatescomplete, review/landingpending.
