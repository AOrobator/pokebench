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
