# Navigation experiments: destination topology, bounded A*, combined

## Problem Statement
Operator authorizes experiment1 first (named map destinations/connections/bounds), then experiment4 (bounded local A*), and testing them together. Current names-ON ThinkFast wandering: invented east/south exits after native clock; stairs confused with home exit. Implement two independent optional flags, measure destination selection separately from path execution. Existing active comparison source remains frozen. No automatic story-objective assignment, no milestone cap.

## Skills Loaded
feature-worklog, pokebench-game-state, agent-observability, pokebench-patch-evaluation, multi-model-review. User's explicit instruction approves this worklog's scoped experiments; no new approval barrier inferred.

## Architecture
Experiment1: read game-owned current map dimensions/connections under existing snapshot lock, identify destination names using existing MapNames, annotate warp destination names and factual boundary connections. No suggested story route or hidden quest planner. Experiment4: independent navigate_to tool, bounded A* using verified live tile collision/elevation/objects, no battle/dialog/map-loading movement. Existing press path records every executed button and pre/post state. Replan/check actual position between short steps; stop on blocked/changed map/locked field/abort/budget. It never sets the goal, teleports, writes RAM, or auto-interacts. Geometry available internally to planner regardless experiment1 text toggle; no topology text leaked through feature4-only arm. Historical optional flags defaultOFF, strict types and dependency validation.

## Invariants
INV-N1 Truth: matching reference/ROM, coherent locked snapshot; transition/uninitialized maps unavailable. Bounds/connection directions/offsets and destination names source-grounded; unknown destinations explicit. Paired recorded proof before gameplay.
INV-N2 Independent treatments: flags world-destinations-v1 and bounded-navigation-v1; names-interactionsON in all conditions, exact two-bit factorial matrix with all other configuration frozen. BothOFF reproduces legacy readout/tools/prompts; eachON only adds declared behavior.
INV-N3 Bounded real action: path only uses supported verified terrain, current map/position, each ordinary action recorded; turning doesn't count as moving; dynamic obstacle, transition, lock or stop prevents continuing stale plan. No script-trigger bypass or undo/reset.
INV-N4 Protocol: ThinkFast4fresh boot runs per condition16total, baseline/topology comparison first then A*/combined, counterbalanced within blocks, serial reserved endpoint,30min1500turns,targetNULL,objectivesOFF,existing loopguardON. Every outcome retained, no rescue/replacements/mid-cohort edits.
INV-N5 Completion evidence: new passive post-clock milestones land/qualify on common build before new cohort; native splits and first gym/badge remain measurement, not stop conditions. No model claim grading.

## Security Review
Isolated worktree, external ROM symlinks only, vendor/reference unmodified, normal production controller/event owner, concrete JSON types. No local model reviewers or simultaneous measured/probe games. Preserve canonical humanUI WIP. Tools do not invoke shell/subprocess or write game memory.

## Milestones
M1: destination topology RED/GREEN, propagation/model/viewer proof, flags/history compatibility and gates.
M2: bounded A* RED/GREEN, native movement semantics/recording/abort proof and gates.
M3: common frozen integration includes reviewed post-clock milestones; independent reviews, landing and served-build receipts.
M4: finish existing named cohort; immutable factorial presets/queue, native qualification probes when lease free, launch16runs and report.

## Closing the Loop
Report native split reach counts/4, conditional time medians/range, turns/tokens/buttons, movement failures, transitions, loop interventions and per-run terminal reason. Predeclare primary frontierRIVAL_MET, downstreamSTARTER_CHOSEN/RUSTBORO_CITY_GYM/STONE_BADGE, plus new house-exit/rivalhouse/bedroom diagnostics. Regress if fewer native completions; speed candidate only if completion at least equal and median≥10%faster. Combined compare separately against each single treatment and baseline; four/condition exploratory, interaction estimates descriptive, no automatic promotion. Preserve reports/config/model serving/source/vendor/ROM hashes.

## Session Log
2026-10-13: explicit operator authorization. New isolated navigation-experiments WT from main259340b. Implement1→4; current cohort remains frozenf0ea5af. Sixteen runs maximum8hours after current cohort and qualification, not yet scheduled/launched. Only ThinkFast initially, no expansion to all endpoints inferred.

## Surprises
Local map grid alone does not expose named open-edge map connections. navigate_to A* alone cannot correct a false destination.

## Multi-Model Review Log
Pending frozen implementation/gates. No local model review lanes; external vendors/fresh independent fallback per standing skill.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER before archive.

M1 RED: production reader tests named north continuation, signed offsets, dimensions and unknown vs no connections; malformed pointers/counts/directions reject. Reference global.fieldmap.h157/MapHeader0x0C; connection globals1south2north3west4east5dive6emerge. Existing verified current MapHeader0x02037318 reused; native coherence requires stable field owner.

M1 GREEN: named game connections and dimensions, named warp maps in model text only whenworld-destinationsON, optional recorded topology and Field State viewer output. Old presets defaultOFF/strictbooleans; format_readout default reproduces old text.662agent236viewer516Python pass, TSbuild/lint and Pythonruff/mypy/coverage90floors pass. Six distinct producer/delivery/JSON/direction/alignment deletions fail and restoregreen. Native qualification after active frozen cohort lease; not yet claimed runtime-qualified.

Integration: reviewed post-clock milestone mainf8d2de2 merged into navigation WT afterM1e2b832c. Resolved three test-only conflicts preserving both topology checks and new three-ref milestone/evidence behavior; combined feature counts observation12,measurement6. Active measured executable unchanged.

M2 RED: bounded walking A* with collision/object/water/elevation/warp rules; zero-elevation connector must retain current layer, doors approached frombelow; real press adapter handles turns and aborts stale route on mapchange. Local radius7 geometry,8ordinarybuttonattempts per call, no destination assignment.

M2 integration decisions: partial paths toward a selected distant in-bounds destination use only known local tiles (no unseen-tile invention). Current map_id line is feature4's required tool interface, independent of feature1 names/connections. Ordinary press now has an explicit checked execution seam; Nav compares fresh map/position/readiness before recording or submitting a command. Objective wrappers preserve their own guards around that seam. Parent cancellation propagates into state reads; each segment observes a coherent final frame/state. Loop guard recognizes Nav actions but zero-action arrival cannot clear planning stall. Existing ordinary-press/prompt behavior remains unchanged when NavOFF. No goal selection or generic interaction solver added.

M2 GREEN: ordinary checked-press execution, bounded known-tile A*, independent map-id documentation, coherent final frame/state recording, cancellation/pause gates and zero-action planning-loop handling implemented. Tests retain objective enforcement around checked calls. Full gate final receipts under runs/navigation-proof; coverage floor unchanged. Performed deletion/restoration includes each terrain/object/warp/layer guard, checked submission and factory, final observer/recorder, objective wrapper, loop acted flag and tiny command bound. Two initially weak caller mutations unexpectedly passed; retained first attempts and strengthened tests, fresh uniquely named attempts fail and restore green. No native runtime motion qualification claimed until the current measured lease releases.

Metric grounding: pinned Emerald source May1F MeetRival sets RivalState3/TownState1; rival meeting can occur downstairs. RIVAL_MET remains primary frontier; house/bedroom visit splits are diagnostics and absence is not failure when the frontier/downstream progresses. Baseline/topology block ABBAABBA precedes A*/combined CDDCCDDC. This preserves requested experiment order but cross-block comparisons are temporally confounded; report them as exploratory rather than causal interaction estimates.

M3 code landing complete: main3611aa89bfa1e2a749ad66e81bb94f7d21017f53 matches exact reviewed frozen256bf2347bd75d8db1645bda5e9f0149f640e1cc tree. Candidate gates686agent237viewer520Python =1443tests, lint/build/coverage unchanged. Sol(gpt-6.1-sol) and Astra(gpt-6-astra) fresh fork-none independent reviews LGTM with verified cleanHEAD/diff before/after. CursorOpus/Sonnet quota exhausted and ClaudeCLI timeout; Grok supplemental LGTM lacked independent shell digest. Standing fallback used, reduced vendor diversity recorded. All root/other-chat WIP and stale sequencer preserved. Review synthesis/frozen diff/landing receipt: runs/navigation-proof/.

M4 queue activated2026-10-13T23:58:32Z: finite driverPID27930, reporterPID27931, runs/launch-receipts/navigation-topology-astar-think-fast-n4/queue.json confirms waiting_for_existing_cohort with16remaining. Existing named cohort currentlytrial7; preserve completion of7/8. Four fresh boot ThinkFast runs per baseline/topology/A*/combined, registered order and full immutable presets in plan.json. Objective trackingOFF, dependent guardsOFF, existing loopguardON, named interactionsON, targetNULL,30min1500turns. No measured new trial launched yet. Runtime gate first verifies five served assets against frozen WT bytes, then excluded real-ROM probe verifies native topology/model text and real ordinary navigation/recorded parent+button chain. Failure holds remaining queue, retained launcher_error; no silent replacement. Serial lease acquired after prior cohort terminal, first8topologycomparison followedbyA*/combined8. Three narrow script relocation/evidence follow-ups reviewed independently Sol/AstraLGTM; queue scripts use absolute frozen imports and normalized viewer ownership paths. Source stays frozen during queue/trials. Finite reporter writes comparison.json/md after terminal; no automatic promotion, no benefit claim yet.

2026-10-13 21:16EDT execution update: named8 completed20:46EDT. Nav qualification nativeprobe20-46-15_probe-navigation-qualification_9712 successfully read Littleroot20x20/NORTH→ROUTE101 and executed ordinaryUP (8,7)→(8,6), but final external assertion used wrong ToolResult joinfield tool_call_id instead of id. Queue held20:50EDT before any measured launch; originalfailed helper/log/terminal/queue/derivedreport/ledger preserved under attempt1 artifacts+hashes. Corrected helper; retained716event source256bf23 native corpus independently schema/source/coherentframe/position/topology-delivery/currentservedbytes audited, no native rerun or measured replacement. Firstresume-r2 review blocked missingplan declaration and symlink-spelling viewerPID check; both fixes batched inr3, failingr2 retained. Sol/Astra independentlyLGTM r3 after exact preparation/runtimeowner/preservation checks. Nativequalified-r2.json binds corpusSHA86a3959407239461ad3bde0383288af23ca6716710062ed7f17b4706abd9d05a, call708/button710/result713/state714 and frame000713_0.png SHA24ce0476464839b01f3d00728ece4e9946dc7ee6.

Resume driver46049/reporter46050 activated21:14:35EDT. Actualtrial1 baseline2026-10-13T21-14-35_think-fast_c375 PID46080 running,15pending, original16order/caps/presets unchanged. Globallease owned46049. Viewer8793 healthy and fresh-browser reload shows actualLIVE trial with mapdestinations/boundednav switches and new post-clock splits; snapshot runs/navigation-proof/live-trial1-viewer.png, five actualserved hashes in served-build.json. No benefit claim yet. Other-chat state-only candidate9eff58c remains isolated/pendingreview/nativeproof; no competing games/models authorized until explicit release.

Empirical model-speed audit2026-10-13 requested byoperator: runs/reports/model-speed/{report.md,summary.json,audit.json} retainall4models' recordednon-probe inventory, selectedcohort membership/native-sequence evidence, incomplete/historical/false-native labels. StablecompletedFastrepaired8: acceptedname8/8 median1:32,60turns; clock5/8 median5:32. Oldercommon-source mainnaming20/24actual: Qwen7/7 median4:34,28turns; Swarm4/7 median2:31,36turns; LongCtx2/6 median4:03,39turns (looparmsseparatelyincludedreport). HistoricaluncappedQwen7clock3/7 median20:15; Swarm7clock0/7; no equivalentLongCtxclockcohort. CurrentNavfirst4completedFast also name4/4/clock4/4, keptseparatepartialbatch. PracticalobservedFastwallclocklead despite2.1xQwennamingturns, about3xshorternamingtime. NOTpuremodelcausalranking: Fastnewerharness/objectivesOFF vothersON, distincthardware/turncaps/source/promptvariants; no verifiedstarter/rival/gymwinner. WronglegacyRIVAL event3167 in805e excluded; name-target termination isnotdownstreamfailure. No newgameplay/sourcechanges/incumbentpromotion; measured16unchanged.
