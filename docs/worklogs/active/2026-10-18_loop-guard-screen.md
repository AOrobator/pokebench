# Worklog: loop-guard-screen-v1

Branch `loop-guard-screen-v1`, base main `bcde8cd4`. Local only. The operator asked for this (2026-10-18): the loop guard's supervisor note should look at the open screen and quote the controls the game is showing, behind a switch, reviewed, landed on main, and included in the bundle arm of `bundle-v-control`.

## Problem Statement

Control run `2026-10-18T01-30-48_qwen36-gpu1_cdb1` opened the bedroom clock at turn 87 and set it at turn 217. From turn 93 through 213 the loop guard raised a cycle note every six turns (21 notes). Every note briefed the field at the last overworld tile, (7,2) facing down, and listed the PC, notebook, GameCube, region map and television as untried. The clock was on the adjustment screen the whole time (ready, controls "LEFT/RIGHT changes time; A opens confirmation"). The model pressed B 117 times (turns 98–214). The drought note at turn 215 is the stall briefing, which already names the open interface. It said the clock confirmation had NO highlighted. The next press was UP, A. The clock was set at turn 217.

The stall path already drops the field list and quotes the controls when the latest result is a ready interface. The loop-guard path (`SupervisorBriefing.text`) never looks at that screen.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, feature-explainer, experiment-queue, pokebench-game-state (the controls line is the game's own string; no new walkthrough sentence).

## Architecture

Switch `loop-guard-screen-v1` (guard, needs `loop-guard-supervisor-v1`, default off, bundle arm only). When on, `text()` uses the stall path's interface note if the latest result is a ready interface: the interface name, the highlighted choice when there is one, and `controls the game shows:` quoting `active_ui.controls`. A transition whose input is not active is not a ready interface, so the field note stays. Off: `text()` is today's field note even while a ready interface is open. The stall briefing is unchanged.

## Invariants

- INV-1 OFF: a loop-guard note is byte-for-byte today's, including inside a ready interface.
- INV-2 ON quotes only the interface the result already carries (phase, highlighted choice, controls string). No next-milestone hint, no route.
- INV-3 A result that is not a ready interface (the clock transition) keeps the field note with the switch on.
- INV-4 The stall briefing's screen note does not depend on this switch.

## Security Review

No new tool, no memory write, no network. The note quotes strings the game server already put on the state.

## Milestones

**M1 — RED**
- [x] Failing test: ON quotes the clock adjustment controls; OFF lists the untried field objects
- [x] COMMIT: `test(loop-guard-screen): quote the open screen's controls` (RED)

`pnpm exec vitest run src/loop-guard-screen.test.ts` in `packages/agent`: 3 failed, 2 passed. OFF and the clock transition keep the field note. ON and the factory path still say "Listed here that you have not tried yet" and never "controls the game shows".

**M2 — GREEN**
- [ ] Registry, presets, defaults, wiring, explainer, pending experiment, bundle arm
- [ ] Gates
- [ ] COMMIT: `feat(loop-guard-screen): ...` (GREEN)
- [ ] Delete the wiring once and watch the factory test go red; restore it

**M3 — Review and land**
- [ ] Multi-model review until the three cloud lanes return LGTM
- [ ] Fast-forward main
- [ ] Report the merge SHA

## Closing the Loop

Tests for the note. Explainer via `just pages-check` and a local link. The live viewer restart waits until it will not cut the cook that is running.

## Session Log

- 2026-10-18 1:49 AM EDT: operator asked for the loop-guard path to quote the open screen's controls, behind a switch, reviewed, landed, and in the bundle.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone

- [ ] ASK USER
