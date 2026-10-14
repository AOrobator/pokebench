# Elevation transitions in navigate_to

Requested by the operator (map observation audit follow-up, 2026-10-14). Source: pret/pokeemerald 731ad5b, `IsElevationMismatchAt` and `ObjectEventUpdateElevation` (src/event_object_movement.c:7673, 7725).

Bug: `planNavigation` kept the old elevation across elevation-0 tiles (refusing 3 → 0 → 4 stairs such as the Route 104 pier) and adopted 15 on multi-level tiles (refusing every ordinary tile afterwards). The game sets the walker's elevation to the destination tile's, except that nothing changes when either the source or the destination tile is 15; a walker at 0, or a destination at 0 or 15, never mismatches.

Scope: the elevation rule in navigation.ts only. Walkable behaviors (sand, bridges 0x70), ledges and the whole-map planner are owned by sibling threads.

## M1: game elevation rule

- [x] RED: real-map fixtures (Route 104 pier, Littleroot multi-level tiles, Route 110 under-deck) from pokeemerald map.bin; old zero-elevation test corrected
- [ ] GREEN: mirror the game's mismatch and update rules
- [ ] Gates: test, coverage ≥90, lint, build
- [ ] Merge latest main
- [ ] Review: principles self-review, Claude CLI, Codex, Grok
- [ ] Explainer: runs/explainers/elevation-transitions.html
- [ ] Operator approval to merge into main
- RED: navigation.test.ts 4 failed / 13 passed (expected: stairs, pier, Littleroot, Route 110).
