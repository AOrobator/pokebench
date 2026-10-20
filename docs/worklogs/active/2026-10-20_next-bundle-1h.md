# Next bundle and the one-hour cook pair

## Operator decision

2026-10-20, 10:52 AM ET, the operator in the "Cook runs analysis" thread:

- Control gains `battle-move-tool-v1` and `battle-menu-loop-v1` (no probe). `context-token-budget-v1` and `tutorial-party-owner-v1` are already on in control.
- Next bundle = the current bundle (including the 10/19 batch) minus `supervisor-briefing-v2` and `ineffective-navigation-v2`, with `stale-story-goal-v1` replaced by v1 + v2. `harness-trust-v1` and never-reached switches such as `evolution-decision-v1` stay on.
- Cook runs are capped at one hour from now on.

## Milestones

### M1 Definitions

- [x] `bundle-v-control.json`: the four control gains move to `onInBoth`; the two dropped switches move to `offInBoth`; `stale-story-goal-v2` joins the switches after v1. Its 20-per-arm cook phase keeps 2 h because the pending `open-goal-prompt` incumbent is frozen to it; one-hour cooks use `bundle-cook-1h`.
- [x] `bundle-cook-1h.json`: `bundle-cook-6h-v2` with the same switch changes, `maxWallMs` 3,600,000, new seed `b90edf21281900ca`, plan regenerated with `fixed-run plan` (control B/GPU0, bundle A/GPU1).
- [x] Tests: supervisor-recovery, fixed-runner, battle-effective-damage and open-goal-prompt guards follow the decision; new fixed-runner test pins the control gains, story-goal v1+v2 and the one-hour cap.
- [x] `fixed-run check` on the branch build: both definitions clean, control base matches.
- [ ] Rebase onto main after "Semantic nav into the bundle" lands; add `semantic-navigation-v1` and `deterministic-exploration-v1` to `bundle-cook-1h` switches.
- [ ] Gates: lint, agent, viewer, pytest
- [ ] Review: Claude and Grok lanes LGTM on the frozen packet
- [ ] Land ff-only, `just viewer-main`
