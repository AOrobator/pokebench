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
- whole-map-pair-1h-v4.json: replaces v3 (never launched); bundle adds caught-nickname-prompt-v1 and fail-open-input-v1. Seed 695536385330ad9b, sha256 21d40f1bdd83.
- whole-map-cook-1h.json: 12 one-hour pairs, same bundle + full-map-navigation-v1, duplicate-turn-collapse-v1 on in both, fixed-point-breaker-v1 off in both. Seed 1415772d5e90722e, sha256 dc2230899760; each lane runs 6 of each arm. Supersedes the unlanded 0e1a9261 draft. Launch waits on the operator's call on positive-supervisor-v1.
- Held-out probes on the cook bundle config (positive-supervisor off vs on, 32/side): 4cd7 T313 17→12, 0389 T740 17→13, 4865 T327 11→18, 0389 T164 6→18 (p=0.004). runs/decision-probes/2026-10-20_heldout-cook-config/.
- Reviews (runs/reviews/whole-map-defs-bdf6b313/): Grok LGTM; Claude subagent LGTM.

## evolution-decision-v1 on in both arms (the operator 2026-10-20 18:42 NY)
The control model cancelled Torchic's Lv16 evolution in a8f9 (turn 1170, B in the native cancel window). evolution-decision-v1 moved from bundle switches to onInBoth (base true) in bundle-v-control, bundle-cook-1h, whole-map-pair-1h-v4 and whole-map-cook-1h. The control base now differs from the frontier incumbent (frontier-incumbent-4caa, run 0e05) by this switch.
- The operator 18:44 NY: exclude the supervisor redesign. positive-supervisor-v1 moved to offInBoth in whole-map-pair-1h-v4 and whole-map-cook-1h (bundle-v-control and bundle-cook-1h unchanged). The operator 18:45 NY: evolution switch in both arms (above).
