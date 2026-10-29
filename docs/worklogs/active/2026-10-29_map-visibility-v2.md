# Map visibility rollback and V2

User authorization 2026-10-29 in Codexredacted-id: turn player-map-visibility-v1 OFF in both control and bundle; restart current Qwen run without it; implement V2 matching whole fully-lit current maps and illumination-limited dark maps. Earlier report-only restriction superseded for this explicit scope. No other run is authorized to stop or restart.

## Bounded stages

1. Disable V1 in sole maintained current feature recipe, preserving historical definitions and recordings. Verify resolved control and bundle bits. Land reviewed recipe and coordinate replacement of current GPU0 Qwen1ad5 with same model/settings/start/24h, V1 off and V2 off. Launcher owner has been contacted; no concurrent restart.
2. Implement separately registered default-OFF player-map-visibility-v2. Whole current-map static terrain/warps/connections on verified fully-lit maps; dark maps retain native illumination and previously seen static terrain. Visible actors remain limited to current screen/light; hidden NPC templates and global route graph remain withheld. Unsupported/transitional visibility stays unknown. V2 takes precedence when both switches are enabled; V2 OFF preserves V1 and OFF/OFF exactly. Add production wiring tests, native archive replays, explainer, gates and independent review. Land; do not activate V2 in measured gameplay without further authorization.

## Boundaries

Changes limited to visibility projection, its existing consumers, switch plumbing, recipe and related tests/docs. No new tools, game inputs, navigation solver, timeline additions, trainer-card design, gateway/model changes, historical rewrite or benchmark benefit claim. Restart is a fresh run, not checkpoint continuation or erasure of the old result. Operational compute ownership/clearance and landing board apply separately.

## Evidence

Initial diagnosis run2026-10-29T06-25-35_qwen36-gpu0_1ad5 at pin927b6b0c: 62 wall refusals for16,8, no new milestone after129 by350; whole-map visibility is a candidate contributor, not proven cause. Original evidence retained.

- [ ] Recipe RED/GREEN and review/landing
- [ ] Cleared replacement run and viewer proof
- [ ] V2 RED/GREEN, factory mutation and native replay
- [ ] V2 full gates/review/landing and explainer delivery

Coordination: sent current launcherredacted-id explicit replacement ownership request, Claude relay delivered reservation proposal; awaiting acknowledged window. No stop/launch or heavy CPU job yet.

Recipe RED: initial focused attempt failed on absent agent build (setup failure, not RED). After explicitly granted CPU START and prerequisite pnpm agent build, updated both-arm regression fails because current onInBoth still contains V1; /tmp/map-visibility-rollback-red.log retains assertion. COMMIT: test operator-directed V1 rollback RED.

Recipe GREEN: moved V1 from onInBoth to offInBoth and set shared features false. Focused generated-arm/registry tests2PASS; changed-file ESLint and viewer tsc PASS. Historical control donor and definitions unchanged. Ownerredacted-id handed operational ownership; Claude coordinator granted fresh24h GPU0window from replacement launch, GPU1/18020/MacGLM preserved. Full lint/test/vendor running under grantedCPUwindow. COMMIT: recipe rollback GREEN.

Operational source addition: both earlier dry-run experiment IDs already have ledgers; preserve them rather than moving/rewriting them to bypass refusal. Add one fresh tracked qwen36-24h-visibility-off definition using the existing singleArm mechanism, same model/build/start/sampling and GPU0only. This is within the authorized restart, not an added cohort. New regression RED on absent definition retained /tmp/map-visibility-replacement-red.log. COMMIT: replacement identity RED. Existing frozen rollback reviews remain valid for unchanged recipe; new definition receives delta review and affected fixed-definition/fixed-run rehearsal checks before landing. No new application code or execution mechanism.

Replacement GREEN: fresh singleArm definition validates; generated V1off bundle, GPU0only8098/game8076, MAIN_MENUhash and24h cap pinned. Focused97tests PASS includes real fixed-runner fake-host lifecycle rehearsals and definition materialization. Changed-file ESLint PASS. COMMIT: fresh replacement definition GREEN.

Initial recipe review0e1f066d4/base927b6b0c/diffSHA2565df12851d8fa35e1b6d9e357de5a099bf3e83a3b6db2061b4649ecd8fed68d17: ClaudeCLI success/exit0/empty stderr terminal LGTM; normal independent GPT rollback_gpt_review terminal LGTM. Actual Grok cursor-grok-4.5-high exit1 usage exhausted. Coordinator explicitly reconfirmed operator allbranch waiver with exact human provenance [private message reference], the operator 2026-10-22T14:47:31Z, native Claude 00000000-0000-4000-8000-1bb4e739f4f4: "land without grok. you are not a very good coordinator if you force me to go into chats". Earlier "yes dont wait for grok". Source supplied by designated coordinator; no independent archive read in this turn. Reduced-vendor-diversity fallback required, never GrokLGTM.

Rollback gates: full lint PASS. Full justtest executed agent5049/viewer2335/Python4913/gateway116 PASS with90%floors; fresh-worktree approved-card art absent caused final3browserfail (original log retained). Supported POKEBENCH_CARD_ART=/Users/user/dev/pokebench/runs/sprites/trainer-card-v1 restores environment; exact same3headlesscardchecks PASS1.7s, noassertion/source/baselinechanges. .env linked; pristinevendorPASS. CPU RELEASE sent. Full suites cover unchanged original executable contracts; fresh definition+test added during that gate have focused97test proof and fullcombinedmain will run before activation. No hidden claim of a single clean full-command exit.

Final reviewed packet base927b6b0c50a0e5b5221e6daae4c1a662ee7c213e/head dd6b1cebcbc271b3b1a1f24294bc39fc5dacaeb0/diffSHA256e23aaa1435f68464469739dfa8bfd0e6b2131a6cc65e925cf9074dba0bd7ad18: ClaudeCLI exit0/one successful result/empty stderr, normal independentGPT rollback_gpt_review, distinctAstra fallback rollback_fallback_astra all terminal VERDICT: LGTM. Grok unavailable, notLGTM; reducedvendor diversity under humanwaiver provenance above. Nonblocking staleV1catalog/explainer wording deferred to V2documentation stage. Frozen packet and logs /tmp/map-visibility-rollback-review; copied durable canonical ignored receipt before activation.
COMMIT: record rollback gates and final review approval (evidence-only).

Rollback landed FF de4c84763d0c51428e8c92e74133a9295f7b10cd at #1 board; main unchanged since reviewed base, source delta exact reviewed. Coordinator granted postmainCPU and sole8790refresh ownership, fresh24hGPU0window; required combinedmainjusttest now running, old1ad5 untouched pendingPASS. V2 branch starts independent source stage; neither this source nor builds touch canonical main/runningtrial pins.

V2 RED:14focused projection tests fail on missing whole_lit capability, /tmp/map-visibility-v2-red.log. Cases: wholelit625cells beyondcamera, exactV1darkness levels1..7, rememberedhidden terrain, invalid/menu/locked/noillumination no disclosure, hiddenactor withheld. COMMIT: V2projectionRED.
Postmain de4c84763 fulljusttest FAILED at citation-evidence.test.ts: filename whitelist recognizes only four maintained-current protocols and wrongly calls new featureRecipecurrent source historical, while demanding its citation feature OFF. Retained canonical main-test.log. No refresh/stop/launch. CPU RELEASE and land-done sent;1ad5continues. Correction branch codex/map-visibility-restart-gate changes only that test's classification to explicit raw featureRecipe==current; all existing feature-bit/switch/onInBoth assertions remain. Same six tests now PASS; changed-fileESLintPASS. Earlier broad recipe gates retained for unchanged app/runtime contracts; new combinedmainfullgate mandatory before activation. COMMIT: correct current-recipe test classification from postmainRED.

Correction frozen base de4c84763d0c51428e8c92e74133a9295f7b10cd/head d4ea8e90bef04002ae0646d486ec4bc8a9b9ebfa/diffSHA256fbe11031e691ba77467552ea150195a7befbeff3d3ec8d5c38d37f3285f375a4: ClaudeCLI exit0/one result/empty stderr terminalLGTM, normalGPT rollback_gpt_review and Astra fallback rollback_fallback_astra terminalLGTM. ChangedfileESLint+affectedagenttsc+sixcasesPASS. HumanGrokwaiver and reduceddiversity unchanged. Coordinator precleared prioritylanding and freshpostmainCPU, sameconditionalactivation plan, no permission inferred from failure. COMMIT: record correction approval (evidenceonly).

Integration: merged reviewed restart-gate correction242f7e276 into V2 branch, retaining both worklog evidence strands; no V2 source on canonical main.

V2 factory/registry RED: additional production-factory test distinguishes V2 independent enable from V1 mode and bothOFF identity; before wiring it fails while14projectioncases pass. Registry/prompt test fails before registration. Logs /tmp/map-visibility-v2-factory-red.log and registry-red.log. COMMIT: V2productionwiringRED.

V2 GREEN source: independent defaultOFF/server flag, V2 precedence, whole-map geometry requested by V2 itself even if older full-map flags areOFF. Verified flashLevel0/stableoverworld reveals whole current map; levels1..7 retain exactV1projection. NPCs still require native current-screen/light proof. Places, trainer-sight, observation and archive replay use eithervisibilitymode; journalfilter likewise. V1testfixtures explicitly keep newV2OFF to preserve the historical treatment; assertions retained.

Focused59Python and4agenttestsPASS; agent/viewertsc/mypy andchangedfileESLint/RuffPASS. Production installedHTTPobservationshow625litcells independentlyV1OFF. Actual wiring mutation (force whole_lit=False in real read_state factory) makes that HTTPtestRED; restored59PASS. Earlier mypy invocation from repo root had no target; corrected from env config directoryPASS, no source adjustment.

Native archived replay with validatedROMhash/archivehashes: Littlerootstate8156/raw3124/result8157 OFF400/V1=99/V2=400tiles and northconnectionretained; darkBrawlygym88ea raw30297 OFF504/V1=4/V2=4; GraniteB1F429f raw19321 OFF832/V1=5/V2=5. V2OFF stateJSON/readout bytes exactly equal242fbaseline in allthreecases, bothV1ON andV1OFF. Pairedgym/caveframes inspected. Newexplainer themed/zero-networkvalidated, headless1440/375screenshots inspected (phone and desktop); no pageerrors/overflow. No gameplayV2activated or benefitclaim. CompiledpromptOFFcompare and affectedviewer/fullgates pending CPU afterreplacementliveproof.

Operational restart: ede500aeb viewerrefreshone completed. Old1ad5 gracefullyended07:40:28EDT operator_abort turn532, furthestROUTE_101_AFTER_HANDOFF; eventualrecoveryprecededrollback, so no impossibility/regressioncausalityclaim. Originalrecording74.9MB andledgerpreserved, allprotectedPIDs alive. Firstnohupwrapper exitedduringprerequisitebuild beforeanyrunner/trial; recordretained. Persistentstart_new_session launcher90551 invokesjustfixed-run normally, runner91116/player93854/newrunf292 atsamecleanpin; coldnativecv2dyldlibraryinitialization pendingfirstevent. No launchclaimyet. Stage1CPUreleased; V2CPUgrant explicitly deferred untilreplacementprovenlive.
COMMIT: implement daylight-aware visibility V2 GREEN.
