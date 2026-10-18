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
- [x] Write tests (registry last and default off; OFF thirteen opens silent; ON third opening warns; setting the clock, one look, and a look after leaving the tile do not count; production path)
- [x] COMMIT: `test(clock-view-loop): count reopening the set bedroom clock` (RED) `5e3c44af`
- [x] Implement
- [x] Gates on this tip, before review: `just test` agent 2374, viewer 1137, pytest 2707. `just lint` clean. `just build` ok. `just coverage` agent 98.02/94.22/98.28/99.24, viewer 95.36/91.38/93.79/97.62, Python 97.66/93.82/100. `just experiments-check` ok 106. `just verify-vendor` ok. `just pages-check` on the explainer prints nothing.
- [x] COMMIT: `feat(clock-view-loop): count reopening the set bedroom clock` (GREEN) `ad55bde3`
- [x] Explainer, pending experiment, bundle arm (on in the bundle arm of bundle-v-control, off in the control arm)
- [ ] Multi-model review loop until clean
- [ ] Land on local main

## Closing the Loop

Tests for the detector and the production wiring. Explainer served locally. The live cook is left running on the build it started with.

## Session Log

- 2026-10-17 11:07 PM: RED. `clock-view-loop.test.ts` on main `a0f669d4`: 3 failed, 2 passed. Last switch is `battle-menu-loop-v1`. The third opening raises no notice. `live.ts` does not read the switch. Commit `5e3c44af`.
- 2026-10-18 12:30 AM: Round 1 review found three misses. RED adds tests: `navigate_to` off the tile must clear the count, turning on the tile must not, the opening transition before `clock_set` must not count, and the cycle warning must not say a message reopened.
- 2026-10-17 11:19 PM: GREEN. `clockViews` is `LoopDetector`'s last argument after `menuLoop`, and `attachLoopGuard`'s last argument. Wired from `features["clock-view-loop-v1"]` in `live.ts` and `decision-probe.ts`. Deletion proof: removing that read from `live.ts` failed the production-path test (exit 1); the same for `decision-probe.ts` (exit 1); both restored and the test passed. Bundle arm of `bundle-v-control` lists the switch; base features keep it false, so the control arm stays off. Pending `experiments/clock-view-loop.json` has no queue position. `source.commit` is the RED sha `5e3c44af84a0b657c3ad89fb9b0969e95ed7459d`; repin to the merge SHA after landing.
- 2026-10-18 1:20 AM: Operator directed the landing before review finished. `main` fast-forwarded through `clock-view-loop-v1` `cf013f99`, then merged `stale-story-goal-v1-r2` `aa1e76f1`. The bundle base keeps `battle-menu-loop-v1`, `clock-view-loop-v1`, and `stale-story-goal-v1` false, so the bundle arm turns all three on and the control arm leaves them off.
- 2026-10-18 1:22 AM: The merge left `stale-story-goal-v1` out of the preset schema, so a preset that named it failed closed. It is optional again, default off. The clock guard now ignores an unset clock, clears the count when a press or navigate_to leaves the tile, and does not call that look a reopened message. Turning in place does not clear it.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone

- [ ] ASK USER: archive this worklog
