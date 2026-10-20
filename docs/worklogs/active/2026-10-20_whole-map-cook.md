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
