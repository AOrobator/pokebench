# Item 1: recovery guards preserve runs

Authorized: five-fix brief 2026-10-24-frontier-top5.md and coordinator delegation; no switch may end a run. Worktree /private/tmp/pokebench-navigation-nonterminal, branch codex/navigation-recovery-nonterminal, base bbefc77b8.

## Frozen scope
Navigation-recovery-v1 ON replaces every exhausted episode with a factual nonterminal briefing, including later map cycles and stale-map refusals. Foot-reachable doors/warps join map edges. Navigation OFF remains byte-identical. Map-cycle-recovery-v1 retains detailed visit/exit history but no longer licenses a later stop. Milestone-stall-stop-v1 ON replaces its abort with a factual notice; OFF remains unchanged. No new tools, routes, defaults, experiments or timeline marks. The deterministic-loop-guard-v1 ON threshold emits one factual nonterminal supervisor notice; diagnostic OFF output remains identical. Baseline failure limits are audited and retained.

## Plan and gates
- [x] RED regressions committed (0510c112f, 049b4cf78).
- [x] GREEN navigation, generic switch-owned threshold and stall repair; explainers/catalog updates.
- [ ] Gates, independent cloud reviews, board-controlled ff-only local landing.
- [ ] Coordinated single viewer refresh and headless delivery proof; no gameplay/GPU changes.

## Evidence audit
Read-only original event logs confirm all six map_cycle/stop notices followed by run_end stuck: f0c2 #3122 t133 (state3120), 6bc3 #3102 t124 (state3100), 597a #4656 t159 (state4654), 7c9f #3415 t68 (state3413), 1772 #18841 t416 (state18839), ba89 #8178 t275 (state8176). ba89 state8176 has map1/4 position6,12, no connections and two foot warps6,12 and7,12; old stop falsely said none qualified. Original logs remain untouched. Tracked gzip fixture preserves ba89 state/stop/end.
Game reference clean at 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. src/field_control_avatar.c TryDoorWarp/GetWarpEventAtPosition own door/warp coordinates; no new mechanic or destination is inferred.

## Termination audit (initial)
- navigation-recovery.ts emitted stop and set stopped after 12 delivered eligible calls; map-cycle-recovery offered only one reprieve. Repair in scope.
- play-wiring.ts stallStop -> live.ts governor.abort(stalled): switch-owned 10-minute timer. Repair in scope.
- loop/coordinator.ts generic threshold -> attachLoopGuard -> governor.abort(stuck): baseline guard, also reachable by interaction/transition/pushback/battle/menu/clock/dialogue/trigger/refusal/navigation loop switches. live.ts246 proves enforcement is itself enabled by deterministic-loop-guard-v1. Coordinator authorized the minimal ON threshold repair; OFF diagnostic phases remain unchanged. attachLoopGuard still honors genuine terminal events; current guarded episodes no longer emit enforced stop.
- harness.ts failureLimit: baseline malformed/invalid/text-only/gateway error bound, not introduced by a switch. replyFailuresEndRun=false is a preset policy; text-only-supervisor-v1 grants three notes then returns to baseline bound, and fixed-point-breaker alters reminders. No unbounded-failure policy change authorized.
- live.ts hard wall/turn/absolute continuation budgets, explicit operator controls/signals, verified native target completion: distinct run policies, retained.
- run.ts exception/crash and server teardown: operational failure, not a guard strategy. Prior drought schema crash fixed upstream 059d09ef3; do not hide exceptions or rewrite history.

## Session log
Initial rules/skills/evidence read. No live services, gameplay, endpoints or schedules touched. Focused tests only until finite CPU window coordinated.

RED: focused navigation-nonterminal regressions: 5 failed as intended (both missing doors and repeated terminal phases); live stall regression now expects hard-budget completion and a recorded nonterminal note.

Scope amendment from coordinator: live.ts246 proves deterministic-loop-guard-v1 ON enables generic terminal enforcement (OFF is diagnostic), so generic threshold termination is switch-owned and covered by the human no-switch termination rule. Authorized narrow coordinator.ts threshold nonterminal notice with OFF diagnostic phases unchanged; include menu-refusal bypass tests. No failure-policy change or new strategy.
Adversarial receipts: navigation-budget, walking-warps and live-stall-wiring each failed when its actual delivery operand was deleted and passed after restoration; unique logs under runs/proof/navigation-nonterminal/. Focused 155 tests green before added enforced/diagnostic live delivery cases (4/4 green).

Additional RED: generic enforced test reaches actual governor.abort(stuck); OFF diagnostic never exposes a warning and retains only would_warn, preserved exactly.

## Complete termination audit and minimal correctness boundary
Production abort/stop assignments were searched across all agent TypeScript sources (excluding tests/data), then followed through live.ts, harness.ts and loop/coordinator.ts.

| Owner / switches | Terminal mechanism | Disposition |
|---|---|---|
| deterministic-loop-guard-v1 | Enforced generic threshold emits stop; attachLoopGuard aborts stuck | Replace only enforced threshold with one factual supervisor note, retain diagnostic would_stop and existing thresholds |
| interaction-loop-detection-v1, transition-loop-detection-v1, pushback-loop-detection-v1, battle-observation-loop-v1, ineffective-loops-v1, battle-menu-loop-v1, clock-view-loop-v1, reopened-dialogue-loop-v1, trigger-script-loop-v1, battle-refusal-loop-v1, ineffective-navigation-v2, same-target-no-progress-v1, menu-refusal-recovery-v1, progress-aware-cycles-v1, move-learn-loop-fingerprint-v1 | Supply/retire generic candidates or episodes; ordinary generic threshold is the only common terminal path (same-target already nonterminal) | Common enforced-threshold repair covers every candidate; no detector strategy changed. Menu refusal bypass of rich supervisor explicitly tested |
| navigation-recovery-v1, map-cycle-recovery-v1 | Separate 12-call stop and stopped propagation; second cycle could stop after first reprieve | Every exhausted navigation episode now briefs; detailed history remains optional; no new routes/tools |
| milestone-stall-stop-v1 | Timed live governor.abort(stalled) | Replace with one factual note per milestone window; conflicts recorded as diagnostic; budgets remain distinct |
| loop-guard-supervisor-v1 | Rich recurring briefings bypass generic terminal threshold except menu refusal | Existing rich behavior preserved; OFF now reaches simple nonterminal generic note; menu case repaired by common path |
| text-only-supervisor-v1/v2, cut-off-reply-feedback-v1, fresh-retry-v1, fixed-point-breaker-v1, duplicate-turn-collapse-v1, state-only-decisions-v1 | Feedback/context changes feed baseline Governor failureLimit; text-only supervisor grants three reprieves then returns to baseline | No switch-owned terminal callback. Baseline failure policy retained, including gateway errors/invalid replies. A malformed tool result can still hit that policy; this is not a new blanket retry strategy |
| navigation-cycle-stop-v1 and bounded automatic dialogue/battle/navigation stops | End one tool's internal action batch, return control to model | Not run_end; retain bounded tool execution |
| native-target-stop-v1 | Measurement metadata for explicit target's NativeTargetStop -> milestone | Intentional configured success boundary, not behavioral-switch guard |
| BudgetTimer, maxTurns/maxWallMs, absolute continuation deadline, operator control/signal, human Finish, campaign cap/grade stop, run.ts exception | Configured cap, operator request or operational failure | Retained; no switch-owned recovery decision and no live runner/scheduler changes |

Model tool names, schemas, availability, system-prompt sections and scene gates are unchanged; tool-prompt-sync requires no new section. Existing semantic-navigation gating is tested for bearings. Existing event schema and Activity History supervisor/diagnostic paths are reused, with no timeline additions. Base deterministic guard now links to the existing shared supervisor explainer; no trainer-card changes.

Standing Grok outage approval verified read-only in primary 00000000-0000-4000-8000-1bb4e739f4f4.jsonl line6309: server-copied user [private message reference] at2026-10-22T14:47:31Z, “land without grok. you're not a very good coordinator if you force me to go into chats”. Actual outage receipts and distinct fallback verdicts still required; no invented Grok approval.

GREEN proof before full gates: 257 agent tests across12 focused suites; 304 viewer panel/server tests; TypeScript noEmit and changed-agent-file ESLint pass. Six deletion/restoration pairs preserved: navigation-budget, walking-warps, live-stall-wiring, generic-enforced-threshold, stall-notice-bound, base-guard-explainer-map. Each deletion failed its intended assertion; each restoration passed. No test retries or threshold/exclude changes. Fixture loops are bounded (3 navigation windows ×12 calls,30 generic calls); live fixture uses owned temp roots, injected model/fetch/process seams and pinned real pi, no actual inference or native gameplay.

Dependency proof: private copied package dependency links resolve owned agent workspace, not canonical agent dist. Own vendor checkout is exact clean bbab97ad73e460b7cd7c08527d10ced30cc03fbe. Python commands use canonical interpreter read-only with PYTHONPATH set explicitly to this worktree env; no uv editable install/shared venv mutation. Five explainers pass pages-theme/pages-check. Full gates, review and landing remain pending.

Headless desktop/phone inspection caught overflow from an unbroken source hash and two uncontained SVG diagrams; fixed wrapping and local diagram scrolling before source freeze. Browser uses headless:true and never touches operator tabs/windows. No external page requests or page errors.

Item3 source-grounded text correction before review: StallStop ignores MEASUREMENT_ONLY_MILESTONES, so the timer notice must say “newly observed milestone that resets this clock”, not claim no milestone of any kind was recorded. Live delivery assertion first changed and failed; clock policy remains identical.

Timer wording correction GREEN: live delivery + play-wiring + run-control suites all pass (count in tool receipt); no timing-policy change. Full gate head remains pending slot.
