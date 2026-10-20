# Whole-map navigation cook (12 one-hour pairs)

Design: docs/experiments/whole-map-cook-1h.html. Operator: The operator approved 12 wall hours of 1-hour pairs (2026-10-20 11:16 NY), launch gated on every planned bundle fix landing.

## Gate
- [x] Preset update (stale-story-goal-v2, semantic nav, exploration in bundle; exit reachability in control): main 6ee8bf6b
- [x] briefing-repeat-count-v1 (inert without supervisor-briefing-v2) and navigate-already-here-v1: main d2e9bf6d
- [ ] fixed-point-breaker-v1 with auto-talk, story-character-stall-gate-v1, supervisor exit-list fix (loop breaker thread)

## Log
- COMMIT: `docs: design the 12-pair whole-map navigation cook` (d2dbeb70)
- COMMIT: `docs: note briefing-repeat-count-v1 is inert in the bundle` (this commit)
