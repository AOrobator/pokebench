# Item 1: recovery guards preserve runs

Authorized: five-fix brief 2026-10-24-frontier-top5.md and coordinator delegation; no switch may end a run. Worktree /private/tmp/pokebench-navigation-nonterminal, branch codex/navigation-recovery-nonterminal, base bbefc77b8.

## Frozen scope
Navigation-recovery-v1 ON replaces every exhausted episode with a factual nonterminal briefing, including later map cycles and stale-map refusals. Foot-reachable doors/warps join map edges. Navigation OFF remains byte-identical. Map-cycle-recovery-v1 retains detailed visit/exit history but no longer licenses a later stop. Milestone-stall-stop-v1 ON replaces its abort with a factual notice; OFF remains unchanged. No new tools, routes, defaults, experiments or timeline marks. Generic baseline loop stops and failure limits are audited, not broadly rewritten (coordinator reconciliation).

## Plan and gates
- [ ] RED regressions committed.
- [ ] GREEN navigation and feature-owned stall repair, explainer/catalog updates.
- [ ] Gates, independent cloud reviews, board-controlled ff-only local landing.
- [ ] Coordinated single viewer refresh and headless delivery proof; no gameplay/GPU changes.

## Evidence audit
Read-only original event logs confirm all six map_cycle/stop notices followed by run_end stuck: f0c2 #3122 t133 (state3120), 6bc3 #3102 t124 (state3100), 597a #4656 t159 (state4654), 7c9f #3415 t68 (state3413), 1772 #18841 t416 (state18839), ba89 #8178 t275 (state8176). ba89 state8176 has map1/4 position6,12, no connections and two foot warps6,12 and7,12; old stop falsely said none qualified. Original logs remain untouched. Tracked gzip fixture preserves ba89 state/stop/end.
Game reference clean at 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. src/field_control_avatar.c TryDoorWarp/GetWarpEventAtPosition own door/warp coordinates; no new mechanic or destination is inferred.

## Termination audit (initial)
- navigation-recovery.ts emitted stop and set stopped after 12 delivered eligible calls; map-cycle-recovery offered only one reprieve. Repair in scope.
- play-wiring.ts stallStop -> live.ts governor.abort(stalled): switch-owned 10-minute timer. Repair in scope.
- loop/coordinator.ts generic threshold -> attachLoopGuard -> governor.abort(stuck): baseline guard, also reachable by interaction/transition/pushback/battle/menu/clock/dialogue/trigger/refusal/navigation loop switches. Minimal generic nonterminal recommendation pending coordination; blanket suppression changes all-switches-OFF baseline and is excluded per coordinator.
- harness.ts failureLimit: baseline malformed/invalid/text-only/gateway error bound, not introduced by a switch. replyFailuresEndRun=false is a preset policy; text-only-supervisor-v1 grants three notes then returns to baseline bound, and fixed-point-breaker alters reminders. No unbounded-failure policy change authorized.
- live.ts hard wall/turn/absolute continuation budgets, explicit operator controls/signals, verified native target completion: distinct run policies, retained.
- run.ts exception/crash and server teardown: operational failure, not a guard strategy. Prior drought schema crash fixed upstream 059d09ef3; do not hide exceptions or rewrite history.

## Session log
Initial rules/skills/evidence read. No live services, gameplay, endpoints or schedules touched. Focused tests only until finite CPU window coordinated.

RED: focused navigation-nonterminal regressions: 5 failed as intended (both missing doors and repeated terminal phases); live stall regression now expects hard-budget completion and a recorded nonterminal note.

Scope amendment from coordinator: live.ts246 proves deterministic-loop-guard-v1 ON enables generic terminal enforcement (OFF is diagnostic), so generic threshold termination is switch-owned and covered by the human no-switch termination rule. Authorized narrow coordinator.ts threshold nonterminal notice with OFF diagnostic phases unchanged; include menu-refusal bypass tests. No failure-policy change or new strategy.
Adversarial receipts: navigation-budget, walking-warps and live-stall-wiring each failed when its actual delivery operand was deleted and passed after restoration; unique logs under runs/proof/navigation-nonterminal/. Focused 155 tests green before added enforced/diagnostic live delivery cases (4/4 green).

Additional RED: generic enforced test reaches actual governor.abort(stuck); OFF diagnostic never exposes a warning and retains only would_warn, preserved exactly.
