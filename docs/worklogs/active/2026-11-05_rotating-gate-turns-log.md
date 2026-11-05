# Rotating-gate turn reasons and push log

**Started:** 2026-11-05
**Status:** in progress
**Branch:** `claude/rotating-gate-turn-reasons` (from main `165f79568`), worktree `/private/tmp/pb-gate-turns`.
**Approval:** The operator 2026-11-05 12:37 PM: "i want a bigger reply cap for deepseek 32k. we need to say which way a gate can turn and why a push was refused, we also need a log of every gate push." Then, relayed: "all of these switches should be on for the next astra and deepseek runs".

## Problem statement

DeepSeek 08b5 concluded gate 3 was frozen (turns 142, 169) from "did not turn", when only clockwise was refused. It also forgot earlier pushes once they left context (turn 151). Neither fact is available to it now.

## Design

Both switches are agent side, read from the state already recorded: `map_observation` arms and `navigation_grid` collision. No server switch, no schema change.

- `rotating-gate-turn-reasons-v1`, needs `rotating-gate-positions-v1`. Runs pret `RotatingGate_CanRotate` over the observed arms (`sRotatingGate_ArmPositions*`, collision == 1). A refused press names the turn the push asked for and the wall tile. A note pinned before each decision on a gate map lists each gate's free and blocked turns.
- `rotating-gate-push-log-v1`, needs turn reasons. Built from recorded `state` and `button_press` events, so it does not depend on context. Lists every turn and refused push, plus each entry to the map with whether the gates are at their starting positions. Delivered in the same pinned note, recorded as `ledger_context`, never added to history, so it does not accumulate per message.
- No target orientation, suggested push, solver or golden-route data.
- Both registry default OFF, onInBoth base true. OFF is byte-identical.
- Reply cap: not a switch. A DeepSeek preset with `sampling.maxTokens` 32768 is generated after landing, at the landed pin. `budgetLimit` subtracts the reply cap from the served context.

## Milestones

- [x] M1: RED tests
- [x] M2: GREEN, wiring, configs, explainer
- [ ] M3: gates, reviews, landing

## Log

- RED: `rotating-gate-log.test.ts` fails to import `rotating-gate-log.js`.

- GREEN: 41 tests across `rotating-gate-log` and `rotating-gate-press`; focused agent 138 and viewer 158 pass. Removing the `press-result` argument and the `play-wiring` context each failed its production test; restored.
- Design change while building: the sweep reads `map_grid`, not `navigation_grid`, which is a 15x15 window. The first replay returned no turns at all for that reason.
- Replay of the new code over recorded runs, read only: 08b5, 66 turns, 25 refused pushes, 25 named a wall, 4 entries at 95 log lines and 11,783 characters. 4d66, 10 turns, 5 refused, 5 named a wall, 1 entry. The first replay also logged a false entry at a read without gates on the same map; fixed and pinned by a test.

## Multi-Model Review Log

## Landing
