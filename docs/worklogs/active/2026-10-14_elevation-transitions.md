# Elevation transitions in navigate_to

Requested by the operator (map observation audit follow-up, 2026-10-14). Source: pret/pokeemerald 731ad5b, `IsElevationMismatchAt` and `ObjectEventUpdateElevation` (src/event_object_movement.c:7673, 7725).

Bug: `planNavigation` kept the old elevation across elevation-0 tiles (refusing 3 → 0 → 4 stairs such as the Route 104 pier) and adopted 15 on multi-level tiles (refusing every ordinary tile afterwards). The game sets the walker's elevation to the destination tile's, except that nothing changes when either the source or the destination tile is 15; a walker at 0, or a destination at 0 or 15, never mismatches.

Scope: the elevation rule in navigation.ts only. Walkable behaviors (sand, bridges 0x70), ledges and the whole-map planner are owned by sibling threads.

## M1: game elevation rule

- [x] RED: real-map fixtures (Route 104 pier, Littleroot multi-level tiles, Route 110 under-deck) from pokeemerald map.bin; old zero-elevation test corrected
- [x] GREEN: mirror the game's mismatch and update rules
- [x] Gates: test, coverage ≥90, lint, build
- [x] Merge latest main
- [ ] Review: principles self-review, Claude CLI, Codex, Grok
- [x] Explainer: docs/explainers/elevation-transitions.html (tracked, per updated feature-explainer skill); before-routes verified against main a8cbcff planner
- [ ] Operator approval to merge into main
- RED: navigation.test.ts 4 failed / 13 passed (expected: stairs, pier, Littleroot, Route 110).
- COMMIT: `test: navigation elevation transitions from real maps (RED)` (254be39)
- GREEN: agent 893 tests pass; navigation.ts 91.82 lines / 92 branches / 100 functions; agent all-files 97.1/93.16/97.85; viewer 419 pass; Python 1803 pass, 96.53/91.65/99.34 (floor 90). Lint (tsc, eslint, ruff, mypy) and build clean.
- COMMIT: `fix: follow the game's elevation rule in navigate_to` (40e68db)
- Merged main a8cbcff (ledge hops landed). Ledge landings now use the same mismatch/entered rule (a jump shifts previousCoords to the take-off tile, so the update compares landing and take-off).
- Merged main e6f8cc2 (docs only): merge commit ad08a62.
- COMMIT: `docs: record elevation-transitions merge of main` (fc1d9d0)
