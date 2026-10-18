# Clock view loop

## Problem Statement

On `2026-10-17T21-38-43_qwen36-gpu1_c18f` (the bundle arm), the clock was set at turn 110. From turns 114 through 138 the player stood at (5,2) facing the wall clock and pressed A thirteen times. Each opening press ended on the clock transition (input not ready, the minute ticking, controls "Clock transition; selection input is not active"). The next A closed it ("A or B closes clock") back to the same tile. The loop guard already counts clock adjustment and the YES/NO confirmation. A clock transition is not a ready interface, so those thirteen opens never counted and no supervisor note fired.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, execute-worklog, close-the-loop, agent-observability, multi-model-review.

## Architecture

Switch `clock-view-loop-v1` (guard, needs null, default off). `LoopDetector`'s last argument `clockViews`, after `menuLoop`, wired from the FeatureSet in `live.ts` and `decision-probe.ts` (`attachLoopGuard`'s last argument). ON counts a press whose result is `clock_transition` or `clock_view` at the same place, ignoring the minute. The third such result raises the existing cycle warning and the supervisor briefing. Setting the clock does not count. Closing the clock onto the same tile does not reset the count. Leaving that tile does. OFF: those results do not count.

Bundle arm of `experiments/fixed/bundle-v-control.json`: the switch is on. Control arm: off. Pending `experiments/clock-view-loop.json` has no queue position.

## Invariants

- INV-1: OFF is the previous guard. A clock transition or clock view result does not count, and setting the clock still uses the old path.
- INV-2: The minute is not part of the place. Thirteen opens at (5,2) facing up count as one place.
- INV-3: The switch is read only from the FeatureSet passed into `attachLoopGuard`.

## Security Review

No new IO, no new server surface, no new model-facing text. The existing cycle warning and supervisor briefing fire.

## Milestones

**M1 — Count the clock look**
- [ ] Write tests (registry last and default off; OFF thirteen opens silent; ON third opening warns; setting the clock, one look, and a look after leaving the tile do not count; production path)
- [ ] COMMIT: `test(clock-view-loop): ...` (RED)
- [ ] Implement
- [ ] Gates
- [ ] COMMIT: `feat(clock-view-loop): ...` (GREEN)
- [ ] Explainer, pending experiment, bundle arm
- [ ] Multi-model review loop until clean
- [ ] Land on local main

## Closing the Loop

Tests for the detector and the production wiring. Explainer served locally. The live cook is left running on the build it started with.

## Session Log

- 2026-10-17 11:07 PM: RED. `clock-view-loop.test.ts` on main `a0f669d4`: 3 failed, 2 passed. Last switch is `battle-menu-loop-v1`. The third opening raises no notice. `live.ts` does not read the switch.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone

- [ ] ASK USER: archive this worklog
