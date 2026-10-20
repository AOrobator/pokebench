# Next bundle and the one-hour cook pair

## Operator decision

2026-10-20, 10:52 AM ET, the operator in the "Cook runs analysis" thread:

- Control gains `battle-move-tool-v1` and `battle-menu-loop-v1` (no probe). `context-token-budget-v1` and `tutorial-party-owner-v1` are already on in control.
- Next bundle = the current bundle (including the 10/19 batch) minus `supervisor-briefing-v2` and `ineffective-navigation-v2`, with `stale-story-goal-v1` replaced by v1 + v2. `harness-trust-v1` and never-reached switches such as `evolution-decision-v1` stay on.
- Cook runs are capped at one hour from now on.

2026-10-20, 11:01 AM ET, the operator in the same thread: `exit-reachability-v1` goes into control; the whole-map cook is two pairs and includes semantic navigation and deterministic exploration.

## Milestones

### M1 Definitions

- [x] `bundle-v-control.json`: the four control gains move to `onInBoth`; the two dropped switches move to `offInBoth`; `stale-story-goal-v2` joins the switches after v1. Its 20-per-arm cook phase keeps 2 h because the pending `open-goal-prompt` incumbent is frozen to it; one-hour cooks use `bundle-cook-1h`.
- [x] `bundle-cook-1h.json`: `bundle-cook-6h-v2` with the same switch changes, `maxWallMs` 3,600,000, new seed `b90edf21281900ca`, plan regenerated with `fixed-run plan` (control B/GPU0, bundle A/GPU1).
- [x] Tests: supervisor-recovery, fixed-runner and open-goal-prompt guards (the battle-effective-damage edit was already on main from semantic nav) follow the decision; new fixed-runner test pins the control gains, story-goal v1+v2 and the one-hour cap.
- [x] `fixed-run check` on the branch build: both definitions clean, control base matches.
- [x] Exit reachability joins `onInBoth` in both files; `bundle-cook-1h` becomes two pairs per arm (`perArm` 2, `singlePair` dropped), plan regenerated (bundle A+B, then control A+B).
- [x] Rebased onto main 48309d51 after semantic nav landed; `semantic-navigation-v1` and `deterministic-exploration-v1` are bundle switches in `bundle-cook-1h` (already in `bundle-v-control`). The cook file now matches `bundle-v-control` except `original-speed-pacing-v1`, as in every cook pair.
- [x] Gates: lint clean; agent 2787, viewer 1359, pytest 2896 pass; `fixed-run check` clean for both (cook-1h sha256 recorded at review)
- [x] Review: Grok (cursor-grok-4.5-high) and Claude (subagent; `claude -p` OAuth expired) `VERDICT: LGTM` on packet sha256 9a469832…80c2, logs in runs/reviews/next-bundle-1h/
- [x] Landed ff-only on main at 6ee8bf6b (packet hash unchanged after rebase onto 957b5626); `just viewer-main` reports viewer at 6ee8bf6b; `fixed-run check bundle-cook-1h` on main exits 0

### M2 Supervisor and navigate_to fixes into the bundle

2026-10-20, coordinator relay after "Supervisor and navigate_to bug fixes" landed (056b778e, 6ca9661a): The operator wants every planned bundle fix in before the 12-hour cook.

- [x] `briefing-repeat-count-v1` and `navigate-already-here-v1` are bundle switches (base false) in `bundle-v-control` and `bundle-cook-1h`; plan regenerated (unchanged, 4 trials). Note: `briefing-repeat-count-v1` acts only with `supervisor-briefing-v2`, which is off in both arms, so it is inert in this bundle.
- [x] Tests: fixed-runner next-bundle pin covers both; open-goal-prompt exclusion list gains both.
- [x] Gates: lint clean; agent 2798, viewer 1361, pytest 2896 pass; `fixed-run check` clean for both.
- [x] Review: Grok and Claude (subagent) `VERDICT: LGTM` on packet 77f40444…48d9 (runs/reviews/next-bundle-1h-m2/)
- [x] Landed ff-only on main at d2e9bf6d; `just viewer-main` restarted the viewer

### M3 Loop breaker into the bundle

Coordinator relay after the loop breaker landed (5d07a65a, 83695092): add its switches before the 12-hour cook; fresh-retry is folded into the breaker; keep heal-before-trainers-v1 on in the bundle (auto-talk relies on it).

- [x] `fixed-point-breaker-v1` and `story-character-stall-gate-v1` are bundle switches (base false) in `bundle-v-control` and `bundle-cook-1h`; `stall-briefing-v1` (its parent) is on in base; `heal-before-trainers-v1` stays a bundle switch; plan unchanged.
- [x] Tests: fixed-runner pin covers both plus heal-before-trainers; open-goal-prompt exclusion list gains both.
- [x] Gates: lint clean; agent 2826, viewer 1363, pytest 2896; `fixed-run check` clean for both.
- [x] Review: Grok and Claude (subagent) `VERDICT: LGTM` on packet b517eedd…f5e9 (runs/reviews/next-bundle-1h-m3/)
- [x] Landed ff-only on main at 0b34087b; `just viewer-main` restarted the viewer
