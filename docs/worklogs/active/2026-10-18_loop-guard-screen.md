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
- [x] Registry, presets, defaults, wiring, explainer, pending experiment, bundle arm
- [x] Gates
- [x] COMMIT: `feat(loop-guard-screen): quote the open screen's controls` (GREEN)
- [x] Delete the wiring once and watch the factory test go red; restore it

Deleting `this.features["loop-guard-screen-v1"]` from `bearings()` turned `loop-guard-screen.test.ts` red: 3 failed (the adjustment quote, the confirmation highlight, and the production `loopSupervisor` path), 4 passed (registry, OFF, the clock transition, and the stall note). Restored. The factory test is green.

Gates, 2026-10-18, on this worktree after the vendor submodule was checked out and `POKEBENCH_ROM` was available:

- `just test`: agent 2401, viewer 1140, pytest 2707 passed.
- `just lint`: tsc, eslint, ruff, mypy clean.
- `just build`: agent and viewer built.
- `just coverage`: agent lines 99.25 / branches 94.23 / functions 98.30; viewer lines 97.62 / branches 91.38 / functions 93.79; Python lines 97.66 / branches 93.82 / functions 100. Floor 90.
- `just experiments-check`: ok, 106 experiments.
- `just verify-vendor`: vendor OK at the pin.
- `just pages-check docs/explainers/loop-guard-screen-v1.html`: printed nothing.

**M3 — Review and land**
- [ ] Multi-model review until the three cloud lanes return LGTM
- [ ] Fast-forward main
- [ ] Report the merge SHA

## Closing the Loop

Tests for the note. Explainer via `just pages-check` and a local link. The live viewer restart waits until it will not cut the cook that is running.

## Session Log

- 2026-10-18 1:49 AM EDT: operator asked for the loop-guard path to quote the open screen's controls, behind a switch, reviewed, landed, and in the bundle.
- 2026-10-18 2:05 AM EDT: wiring is one condition in `SupervisorBriefing.bearings`. ON reuses the stall path's interface note. The clock transition stays a field note. The bundle base keeps the switch false and lists it last in `switches`, so the bundle arm turns it on.

## Surprises

- A fresh worktree does not check out `env/vendor/continual-harness`. Pytest failed on a missing `map_groups.json` until `git submodule update --init`. The new venv also lacked the mGBA binding, so mypy could not see `mgba._pylib` until that package was linked from the main checkout's venv. Neither is a product change.

## Principles Adherence

Scored against `docs/agent-principles.md` PB1–PB13.

| ID | Score | Why |
|---|---|---|
| PB1 | PASS | The note quotes the result's own interface. It does not grade the run. |
| PB2 | N/A | No run was discarded. The pending experiment is not launched. |
| PB3 | PASS | The cdb1 run is the hypothesis, not a verdict. The experiment is pending and not queued. |
| PB4 | PASS | The new sentence is a named switch, default off, recorded in harness features. |
| PB5 | PASS | One switch. Hypothesis is in `experiments/loop-guard-screen.json`. |
| PB6 | N/A | No context-budget change. |
| PB7 | PASS | The note is the supervisor text the loop guard already records. No new event kind. |
| PB8 | N/A | No retry or tool-schema change. |
| PB9 | PASS | The operator asked for this wording: quote the controls the game is showing, not a walkthrough. |
| PB10 | PASS | No test skipped, no floor lowered. The wiring deletion went red, then was restored. |
| PB11 | N/A | No new call into pi, mGBA, or the vendor server. |
| PB12 | PASS | The ROM was not copied. Pytest used `POKEBENCH_ROM`. |
| PB13 | PASS | RED committed, GREEN follows, gates recorded. Review is the next milestone. |

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone

- [ ] ASK USER
