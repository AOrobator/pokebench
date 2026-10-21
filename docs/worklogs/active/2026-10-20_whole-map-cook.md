# Whole-map navigation cook (12 one-hour pairs)

Design: docs/experiments/whole-map-cook-1h.html. Operator: The operator approved 12 wall hours of 1-hour pairs (2026-10-20 11:16 NY), launch gated on every planned bundle fix landing.

## Gate
- [x] Preset update (stale-story-goal-v2, semantic nav, exploration in bundle; exit reachability in control): main 6ee8bf6b
- [x] briefing-repeat-count-v1 (inert without supervisor-briefing-v2) and navigate-already-here-v1: main d2e9bf6d
- [x] fixed-point-breaker-v1 with auto-talk, story-character-stall-gate-v1: main 0b34087b
- [ ] semantic-navigation-v2 replacing v1 (the operator: v1 off everywhere)
- [x] positive-supervisor-v1 variant A in the bundle (main 2826e466) (the operator's choice 2026-10-20 after round 3; probes: helps menu/woods loops, worse on the 3259 ledge loop)

## Log
- COMMIT: `docs: design the 12-pair whole-map navigation cook` (a5a233a9)
- COMMIT: `docs: note briefing-repeat-count-v1 is inert in the bundle` (7a2ff2bd)
- COMMIT: `docs: record cook gate progress` (1b83a717)
- COMMIT: `config: one-hour whole-map pair (bundle + full-map navigation vs control)` (7e9b7ed7)

## One-pair run (the operator 2026-10-20 13:14 NY)
experiments/fixed/whole-map-pair-1h.json: control vs the bundle at 59cfcc62 + full-map-navigation-v1, semantic-navigation-v1 and deterministic-exploration-v1 off in both (the operator: v1's prompting is a bug). One pair, 1 hour, MAIN_MENU fast-text save. Plan seed 163a5a8a0d173130, definition sha256 0ef8f6b34f6d.

Reviews (frozen packet runs/reviews/whole-map-pair-1h/): Grok cursor-grok-4.5-high VERDICT: LGTM; Claude (subagent; CLI login expired) VERDICT: LGTM. GPT optional per coordinator.

## 12-pair definition plan (coordinator 2026-10-20 13:34 NY)
Base it on bundle-cook-1h after the loop thread lands: duplicate-turn-collapse-v1 on in both arms, fixed-point-breaker-v1 off in both, auto-talk-v1 bundle only, plus semantic-navigation-v2 and full-map-navigation-v1 in the bundle. whole-map-pair-1h stays as pinned.

## Rerun pair (the operator 2026-10-20 16:09 NY: "stop and re run")
whole-map-pair-1h stopped at 16:09 (both runs operator_abort; bundle furthest RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED at 63 min, then whiteout; control furthest RUSTBORO_GYM_TRAINER_JOSH_DEFEATED at ~1h52m). experiments/fixed/whole-map-pair-1h-v2.json: current main bundle-cook-1h (semantic-navigation-v2, auto-talk-v1, duplicate-turn-collapse-v1 both arms, unfinished-activity-v1) + full-map-navigation-v1 in the bundle. One pair, 1 hour. Seed fe9b6116f9857e59, definition sha256 6dc8ec6d15a1.
Reviews (runs/reviews/whole-map-pair-1h-v2/): Grok cursor-grok-4.5-high LGTM; Claude subagent LGTM.

## Pair v3 (the operator 2026-10-20 18:05 NY: restart the bundle arm, keep GPUs busy)
experiments/fixed/whole-map-pair-1h-v3.json: main 0e1a9261 bundle-cook-1h (five whiteout fixes) + full-map-navigation-v1, one pair, 1 hour. Seed 2ca46c70b53028e8, sha256 61aa4b3bc5ce. Fixed-run definitions always run both arms, so the bundle restart is a fresh pair launched when control a8f9 ended. Nickname fix not yet in.

## Definitions from main bdf6b313 (nickname + fail-open fixes in, 2026-10-20 18:25 NY)
- whole-map-pair-1h-v4.json: replaces v3 (never launched); bundle adds caught-nickname-prompt-v1 and fail-open-input-v1. Seed 695536385330ad9b (sha256 superseded below).
- whole-map-cook-1h.json: 12 one-hour pairs, same bundle + full-map-navigation-v1, duplicate-turn-collapse-v1 on in both, fixed-point-breaker-v1 off in both. Seed 1415772d5e90722e; each lane runs 6 of each arm. Supersedes the unlanded 0e1a9261 draft.
- Held-out probes on the cook bundle config (positive-supervisor off vs on, 32/side): 4cd7 T313 17→12, 0389 T740 17→13, 4865 T327 11→18, 0389 T164 6→18 (p=0.004). runs/decision-probes/2026-10-20_heldout-cook-config/.
- Reviews (runs/reviews/whole-map-defs-bdf6b313/): Grok LGTM; Claude subagent LGTM.

## evolution-decision-v1 on in both arms (the operator 2026-10-20 18:42 NY)
The control model cancelled Torchic's Lv16 evolution in a8f9 (turn 1170, B in the native cancel window). evolution-decision-v1 moved from bundle switches to onInBoth (base true) in bundle-v-control, bundle-cook-1h, whole-map-pair-1h-v4 and whole-map-cook-1h. The control base now differs from the frontier incumbent (frontier-incumbent-4caa, run 0e05) by this switch.
- The operator 18:44 NY: exclude the supervisor redesign. positive-supervisor-v1 moved to offInBoth in whole-map-pair-1h-v4 and whole-map-cook-1h (bundle-v-control and bundle-cook-1h unchanged). The operator 18:45 NY: evolution switch in both arms (above).
- Current definition sha256 after both edits: whole-map-pair-1h-v4 4632a7a61a7e, whole-map-cook-1h 7c12ca8d7dbd. Round-2 review fixes: explainer and overview text, worklog hashes, bundle-v-control title arrow restored.
- 18:57 NY: rebased on main 5c26dc62 (whiteout-healed-v1 in the bundle). Regenerated whole-map defs from bundle-cook-1h with seeds/plans kept: whole-map-pair-1h-v4 sha256 ddedef847c1d, whole-map-cook-1h eda3fa2969a8. Round-3 reviews of the earlier changes: Grok LGTM, Claude LGTM.
- Round 4: Grok LGTM, Claude LGTM. Landing.

## counter-talk-v1 on in both arms (the operator 2026-10-20 19:17 NY)
Moved from bundle switches to onInBoth (base true) in bundle-v-control.json and whole-map-cook-1h.json; evidence in the 'Counter-talk effect in control' thread (stalled 1/45 with it on vs 23/47 off). Running pair v4 unchanged. New sha256: bundle-v-control b1e24b405b6b, whole-map-cook-1h d5ceed05b7f8. pnpm -r test: agent 2977, viewer 1436 pass.
- Overview updated for counter-talk in both arms (Grok round-1 finding).
- Reviews: Grok LGTM (round 2), Claude LGTM. Landing.

## counter-talk everywhere + gym readiness (the operator 19:25 NY: counter talk in every run)
bundle-cook-1h: counter-talk-v1 to onInBoth (sha256 1dae5952af02). whole-map-cook-1h regenerated from it with gym-readiness-readout-v1 in the bundle (sha256 b0f0ac8fe1e3). whole-map-pair-1h-v4 left as is (paused in-flight pair; a relaunch would be v5). jit-* and starter-decision-salience already have counter-talk on in both via base.
- Reviews: Grok LGTM, Claude LGTM (nit fixed: overview cites main d53baa1e). Landing.

## Pair v5 (the operator 19:53 NY: launch another 1hr bundle v control now; test whole map + sem nav)
whole-map-pair-1h-v5.json from main ba71c60f bundle-cook-1h with the whole-map recipe (full-map-navigation-v1 in the bundle; positive-supervisor-v1 off in both; counter-talk-v1 and evolution-decision-v1 on in both; semantic-navigation-v2 and gym-readiness-readout-v1 in the bundle). Seed 296ec5f2910b4a71, sha256 de6de4d91c20. v4 had already ended operator_abort after ~3 min.
- Reviews: Grok LGTM, Claude LGTM. Landing.

## Pair v6 and the redesign off everywhere (the operator 20:14 NY restart both; 20:21 NY positive-supervisor off everywhere)
v5 stopped 20:15 (both operator_abort; bundle ef9f stuck at the clock YES/NO box since 20:02). whole-map-pair-1h-v6.json from main dc7d0293 bundle-cook-1h (includes same-target-no-progress-v1 and party-item-confirmation-v1) + full-map-navigation-v1. positive-supervisor-v1 moved to offInBoth in bundle-v-control and bundle-cook-1h (whole-map-cook-1h already off); fixed-runner test updated. Hashes: v6 21470a7f749d (seed 783798b95caaa403), bundle-v-control c70f063ec831, bundle-cook-1h eb377e15ffc4. pnpm -r test: agent 3013, viewer 1440 pass.

## story-progress-clock-v1 in the bundle arms (coordinator relay of the operator's call, 20:42 NY)
Added as a bundle switch (base false) to bundle-v-control, bundle-cook-1h and whole-map-cook-1h; running v6 untouched. Tests updated: same-target-no-progress.test no longer pins its switch as the last entry; open-goal-prompt.test lists story-progress-clock-v1 among bundle-only extras. Hashes: bundle-v-control 2668ce57c1b8, bundle-cook-1h b384d78a190c, whole-map-cook-1h 972f446b0f91. pnpm -r test: agent 3030, viewer 1442 pass.
- Reviews: Grok LGTM, Claude LGTM. Landing.

## exit-labels-v3 and party-item-confirmation in the cook (the operator 23:35 NY)
Added both to the bundle arm of whole-map-cook-1h (base false); its switches now equal bundle-cook-1h's plus full-map-navigation-v1. sha256 262b9dedf747.
- Rebased onto e635fcbf (short-cycle-fixed-point-v1); whole-map-cook-1h sha256 c481e9381383. Pair v7 (the operator 23:36 NY): whole-map-pair-1h-v7.json = whole-map-cook-1h arms, one pair; seed 37aa72134a9e06b1, sha256 9dfca876c47a.
- Reviews: Grok LGTM, Claude LGTM. Landing; v7 launch waits for story-battle-heal-first-v1.

## Pair v8 (the operator 00:10 NY: go after Codex's landing)
v7 launched 00:00 and was stopped at turn 1 (the operator: wait for Codex). Codex added pending-field-dialogue-v1 to the bundle. whole-map-pair-1h-v8.json = whole-map-cook-1h arms at main ec8f514b, one pair.

## Two-hour pair loop (coordinator relay of the operator, 2026-10-21 00:18 NY)
The operator lifted the 1-hour cap for this loop. experiments/fixed/whole-map-pair-2h.json = v8's arms (whole-map-cook-1h bundle + full-map-navigation-v1 vs control), one pair, 7200000 ms cap, seed 5f451acf1ed6b943 (plan: lane A control, lane B bundle), file sha256 d41c733695fb.
scripts/whole-map-loop.sh: detached, LLM-free rounds of `just fixed-run dry-run whole-map-pair-2h --phase cook --wall-ms 7200000` from a clone pinned to main each round (each round: two pairs, every lane plays each arm). A viewer STOP (not cancelled) or ABORT on any loop run, or an operator run_end, writes runs/dryruns/whole-map-loop.STOP, SIGTERMs the round's runner (no new trials; playing trials run to cap) and ends the loop; The operator OK'd this design (no new viewer control). Starts only when the definition's lease pools (8091, 8098) are free and game ports 8075/8076 are closed, so it follows v8 and never shares a lane; the GLM Mac lane (pool 8099, port 8077) is disjoint. Never prunes: holds above 75% of the frame cap.
- Fake-data rehearsal (fake just/runner, ports 1807x): held on a live lease, ran a full 4-trial round, archived it to runs/dryruns, started round 2; ABORT in control.jsonl stopped the loop mid-round with no new trials; STOP+cancel_stop did not stop; run_end operator_stop did; STOP present refuses start; PAUSE and frame-cap holds; hand STOP during a hold exits.
