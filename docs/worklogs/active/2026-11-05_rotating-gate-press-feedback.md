# Rotating-gate press feedback

**Started:** 2026-11-05
**Status:** in progress
**Branch:** `claude/rotating-gate-press-feedback` (from main `2ca2ff475`), worktree `/private/tmp/pb-gate-press`.
**Approval:** The operator asked for gate feedback on press as a correctness fix, on wherever its switch is on, relayed by the coordinator 2026-11-05.

## Problem statement

Run 5f0f misread gate state at turns 1961, 1987 and 1997 by comparing eight gate lines itself. A refused push reads "blocked or unavailable ... cannot distinguish collision from ignored input". A walking batch keeps only its last step's press result, so at turn 1960 a gate turned on step 1 or 2 of RIGHT, RIGHT, UP and nothing said so.

## Design

- Switch `rotating-gate-press-feedback-v1`, agent side only, needs `rotating-gate-positions-v1`, registry default OFF, onInBoth base true. OFF is byte-identical.
- `packages/agent/src/rotating-gate-press.ts` compares the gates of two snapshots. The orientation byte changes at once on a push, and the map observation carries it per gate.
- `pressResult` appends the note, so press, the dialogue wrapper and decision probes all get it. Only calls with a direction from a free field get one. navigate_to, which never pushes under `rotating-gate-navigation-v1`, gets none.
- A guarded walking batch compares per step and carries the trail on its last Press result line, because the dialogue wrapper reads that line and drops the Requested movement head when a conversation opens.
- A raw batch has only two snapshots, so its wording says it is a net comparison.
- Facts only: which gate turned and which way, or that it did not. No cause, no suggested push. The game prints nothing for a gate, so this is the plain observable fact.

## Milestones

- [x] M1: RED tests
- [x] M2: GREEN, switch wiring, configs, explainer
- [ ] M3: gates, reviews, landing

## Log

- RED c3a4b2945: the test file failed to import `rotating-gate-press.js`.
- GREEN: 172 focused agent tests pass across rotating-gate-press, features, play-preset, rejected-movement-stride, rotating-gate-navigation, press-result, blocked-batch, dialogue-auto-advance, decision-probe. Removing the `gatePressFeedback` factory wiring in play-config failed all four production wiring tests; restored.
- Replay over recorded 5f0f state events, turns 1955 to 2058, read only: 92 press calls, 26 with a turn, 0 unreadable. Turn 1960 RIGHT, RIGHT, UP gives "step 1 RIGHT: Gate 2 turned 90 degrees counterclockwise (arms north, south, west -> east, south, west); step 3 UP: Gate 2's arm between (4,18) and (4,19) did not turn". Turn 1961 gives Gate 2 turning clockwise on step 5. Every reported direction matches `sRotatingGate_RotationInfo*`: at turn 1983 walking north into a west arm is clockwise.
- `blocked-batch.ts` text stays as it was: the press note follows it, so "whether it stopped this input is unverified" and "did not turn" are both true together.

## Multi-Model Review Log
