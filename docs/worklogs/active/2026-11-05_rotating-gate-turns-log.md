# Rotating-gate turn reasons and push log

**Started:** 2026-11-05
**Status:** landed on local main; live proof comes with the 2-hour DeepSeek run.
**Branch:** `claude/rotating-gate-turn-reasons` (from main `165f79568`), worktree `/private/tmp/pb-gate-turns`.
**Approval:** The operator 2026-11-05 12:37 PM: "i want a bigger reply cap for deepseek 32k. we need to say which way a gate can turn and why a push was refused, we also need a log of every gate push." Then, relayed: "all of these switches should be on for the next astra and deepseek runs".

## Problem statement

DeepSeek 08b5 concluded gate 3 was frozen (turns 142, 169) from "did not turn", when only clockwise was refused. It also forgot earlier pushes once they left context (turn 151). Neither fact is available to it now.

## Design

Both switches are agent side, read from the state already recorded: `map_observation` arms and `navigation_grid` collision. No server switch, no schema change.

- `rotating-gate-turn-reasons-v1`, needs `rotating-gate-press-feedback-v1`. Runs pret `RotatingGate_CanRotate` over the observed arms (`sRotatingGate_ArmPositions*`, collision == 1). A refused press names the turn the push asked for and the wall tile. A note pinned before each decision on a gate map lists each gate's free and blocked turns.
- `rotating-gate-push-log-v1`, needs turn reasons. Built from recorded `state` and `button_press` events, so it does not depend on context. Lists every turn and refused push, plus each entry to the map with whether the gates are at their starting positions. Delivered in the same pinned note, recorded as `ledger_context`, never added to history, so it does not accumulate per message.
- No target orientation, suggested push, solver or golden-route data.
- Both registry default OFF, onInBoth base true. OFF is byte-identical.
- Reply cap: not a switch. A DeepSeek preset with `sampling.maxTokens` 32768 is generated after landing, at the landed pin. `budgetLimit` subtracts the reply cap from the served context.

## Milestones

- [x] M1: RED tests
- [x] M2: GREEN, wiring, configs, explainer
- [x] M3: gates, reviews, landing

## Log

- RED: `rotating-gate-log.test.ts` fails to import `rotating-gate-log.js`.

- GREEN: 41 tests across `rotating-gate-log` and `rotating-gate-press`; focused agent 138 and viewer 158 pass. Removing the `press-result` argument and the `play-wiring` context each failed its production test; restored.
- Design change while building: the sweep reads `map_grid`, not `navigation_grid`, which is a 15x15 window. The first replay returned no turns at all for that reason.
- Replay of the new code over recorded runs, read only: 08b5, 66 turns, 25 refused pushes, 25 named a wall, 4 entries at 95 log lines and 11,783 characters. 4d66, 10 turns, 5 refused, 5 named a wall, 1 entry. The first replay also logged a false entry at a read without gates on the same map; fixed and pinned by a test.

## Multi-Model Review Log

Round 1, packet 165f79568..13ba7e9cb, diff SHA-256 9627c76e8120dba920777990cf14b840c17b244a7a1af2ced6f8edce46ab7d2f.
- Principles self-review: zero FAIL rows; PB13 pending.
- Gates at 13ba7e9cb: `just lint`, `just test` (agent 2500, viewer 892, env 2930, gateway 38, floors met, no-I/O proof OK), `just verify-vendor` pass.
- Fallback reviewer (fresh read-only subagent, Sonnet): LGTM; note that presses pile up off gate maps.
- Claude CLI (`~/.claude-review`): BLOCKING. A direction press in a menu read with no gates stayed pending and could log a refused push that never happened. Accepted.
- GPT (Codex CLI gpt-5.6-sol): BLOCKING on three items. Refusals need press feedback, which `needs` did not say: accepted, `needs` is now press feedback. A repeated direction in a batch went unlogged: accepted, same one-step rule as `gatePressNote`. A mixed batch that moves nothing proves nothing and stays unlogged. A read with no map left stale gates in the note: accepted.

Round 2, packet 165f79568..0172311b5, diff SHA-256 f7dcc98dcb4dec189b2ecf6fca37d9bde1abc07d743495b14bc66b6daa18633e.
- Claude CLI: BLOCKING, one finding: the note grows without limit outside the context fitter, against the operator's 2026-10-28 rule. Accepted: the note shows the newest 200 whole lines and says how many are hidden; the recorded log and `lines()` stay whole. Reported to the operator.
- GPT: BLOCKING on two items. A press that only turned the player to face an arm logged a refused push: accepted, the log requires already facing that way. The first read of a run that starts in the gym said "entered": accepted, it says "first read on".

Round 3, packet 165f79568..af227d171, diff SHA-256 5adfee299f3891e8a6a3382ea28e1c4454523bc8b8357a8eb76185378f306ff7.
- Fallback reviewer: LGTM.
- Claude CLI: BLOCKING, one finding: the facing check dropped 9 of 30 real refusals in 08b5, because the 10-frame hold turns the player and then meets the arm. Accepted. This reverses round 2's GPT item: the line says only that the arm did not turn, true either way, so the check is removed.
- GPT: BLOCKING on three items. Unread first read said "entered": accepted, entry now needs an earlier different map. The feature card said "every": accepted, it states the 200-line limit. Explainer index and card test: accepted.

Round 4, delta af227d171..1477dc2d9, packet 165f79568..1477dc2d9, diff SHA-256 b835cddd0a026d553580b8dbd9919cfb96ef8f5d635dd275937a27c28122b0d8.
- Claude CLI: LGTM. Fallback reviewer: LGTM. GPT (Codex CLI gpt-5.6-sol): LGTM, replay 34 of 34 and 5 of 5 refusals name a wall.
- Grok is out until 11/17: Claude, GPT and the fallback reviewer are full approval by the operator's standing rule.
- Non-blocking: the comment in `rotating-gate-log.ts` says 08b5 logged 107 lines; the replay now gives 134, under the 200 limit. The first replay counts in this log predate the facing fix.
- Gates at 37c65ac6f (1477dc2d9 plus main's docs-only commits): `just lint`, `just test` (agent 2508, viewer 893, env 2930, gateway 38, floors met, no-I/O proof OK), `just verify-vendor` pass.

## Landing

Fast-forward to main at 605179d7a. Post-merge `just test` at that commit: agent 2508, viewer 893, env 2930, gateway 38, floors met, no-I/O proof OK. `just viewer-main`: viewer at 605179d7a, 2 live gameplay processes kept running (08b5 and Astra 9f4c, both pinned before these switches). No live emulator proof yet: the evidence is replay over 08b5 and 4d66.
