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
- COMMIT: `docs: elevation transitions explainer` (b59c999)
- Review round 1 (packet head fc1d9d0): Claude CLI BLOCKING. Verified against source: a finished step calls ShiftStillObjectEventCoords (UpdateMovementNormal :5093, UpdateJumpAnim :5446) then ObjectEventUpdateElevation with prev == cur, so the walker ends at the tile's height unless the tile is 15; the tile left only matters mid-step. Fix: entered = tile===15 ? walker : tile, drop `here`. Unreachable test state (walker 0 on a height-3 tile) replaced with a real one (walker 4 on the Route 110 crossing). Cursor GPT lane hit a usage limit; Codex CLI runs with -m gpt-5.6-sol (default gpt-6.1-sol unsupported on this account).
- RED (round 2): 2 failed / 18 passed (3→0→15→4→3 must be refused; ledge take-off from 15 onto 0 then 4).
- COMMIT: `test: finished steps take the tile's elevation unless it is 15 (RED)` (439819b)
- GREEN (round 2 fix): agent 899, viewer 419, Python 1803 pass; agent 97.21/93.29/97.86, viewer 95.54/90.49/95.12, Python 96.68/91.83/100; lint and build clean. Explainer updated to the finish-of-step rule.
- COMMIT: `fix: a finished step takes the tile's elevation unless it is 15` (d4b3a5d). Merging main 9f111d1 (viewer frontier work) before round 2.
- Merged main 9f111d1 (0dfa14b). Gates after merge: agent 899, viewer 474, Python 1803 pass; viewer 95.65/90.58/95.2; lint clean.
- COMMIT: `docs: record elevation-transitions merge of main 9f111d1` (8912697)
- Review round 2 (head 8912697): Claude LGTM, Grok LGTM, Codex BLOCKING (no test proves tile+height search identity; no test for a ledge landing on 15). Grok speculation verified against source: a far jump runs OnBeginStep at InitJump (prev=take-off, cur=ledge tile) and again at JUMP_HALFWAY (prev=ledge, cur=landing), then the finish update. So a 15 landing keeps the ledge-tile update: height = ledge tile's unless take-off or ledge tile is 15. Fix adds that and both tests.
- RED (round 3): 1 failed / 19 passed (ledge landing on 15 after a height-0 ledge tile); junction identity test is a mutation guard and passes.
