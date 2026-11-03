# hyperqwen-bundle-24h-v5 — 24 h restart with the open-milestone switches on in the bundle

Operator instruction (2026-11-03 00:03 EST): "you can restart the hyperqwen run", following "we need those two
switches to be on in the bundle".

## Why a new experiment id

`hyperqwen-bundle-24h-v4` launched 2026-11-02 22:29 and was still running its single bundle trial
(`2026-11-02T22-29-22_hyperqwen-gpu0_828b`, 193 turns at 23:25) when the operator asked for the restart. Its
preset was materialized at launch from the pre-change recipe (`definitionSha256 73340cfa…`), so the live trial
could not carry the two switches. Stopping a trial with SIGTERM records it as `operator_abort`, which counts as
a valid outcome and is not replaced from the reserve, so the v4 id is spent once its trial ends.

`experiments/fixed/hyperqwen-bundle-24h-v5.json` is a byte-for-byte copy of the v4 definition except `id`,
`title` and `worklog`: same seed `079870c5d2f6222d`, same lane A (GPU0, vLLM `127.0.0.1:18020`, game port 8075),
same `cook` phase, same 24 h wall cap, same start save `runs/launch-receipts/fast-text/MAIN_MENU.state`
(`b3a6cc1c1983`), same `bundleMaxTokens: 8192`. Same seed on purpose: the RNG stream stays comparable with v3 and
v4 through the turns before the two switches can act.

## What the new bundle carries that v4's did not

- `drought-progress-credit-v2` (`9f8993be1`): while the last GYM LEADER battle this run is still a loss, a level-up
  restarts the drought clock only for a POKéMON that battle saw, so a POKéMON caught after the loss cannot smother
  the clock.
- `open-milestone-stall-v1` (`9f8993be1`): one supervisor note per 30 actions while that loss stays open, with the
  trainer, place, turn, party at that battle and party now; banked through battle and heal holds; retired by a win
  or the game's own defeated flag. Readout facts only.
- Both moved from default-OFF to the bundle-only role in `experiments/feature-configs/current.json` (`fb7042cbf`);
  the control base still matches outside the switches and off-in-both flags, so the control arm is untouched.

Why these two: run `2026-11-02T14-53-03_hyperqwen-gpu0_de7a` lost to ROXANNE at turn 342 and spent the next 2 h 45 m
on Route 104 levelling a WINGULL caught after the loss; the drought clock fired once in that window because every
such level-up restarted it. Full evidence in `docs/worklogs/active/2026-11-02_open-milestone-stall.md` and the two
explainers under `docs/explainers/`.

## Launch

- Pin: this commit (`main`, clean tree, definition and worklog committed first so the trial records them).
- Viewer rebuilt at the pin before the launch (`just viewer-main`).
- `just fixed-run check hyperqwen-bundle-24h-v5` must pass with both ids at the tail of the bundle switch list.
- Detached launch per `.claude/skills/detached-long-lived-processes/SKILL.md`; the v4 runner and its trial are
  stopped first so the lane's game port is free.

## Verification

- Pin `ce6f83fc4` (`main`, clean tree), viewer rebuilt at the pin before the launch (`just viewer-main` →
  `viewer at ce6f83fc43800a1462a45fb4cec2fc15c4f51feb`, 1 live gameplay process kept).
- v4 stopped first, per the launch skill: `kill -TERM` on the runner `65012`, then on its trial `66126`
  (`live.js play`). Trial `2026-11-02T22-29-22_hyperqwen-gpu0_828b` ended `operator_abort` at turn 278, wall
  5 615 791 ms, furthest `TEAM_AQUA_WOODS_EVENT_COMPLETE`; the ledger records it as an interrupted observation
  ("interrupted by SIGTERM"), not replaced. `runs/experiments/runner.json` gone, port 8075 free, no `live.js`.
- `just fixed-run check hyperqwen-bundle-24h-v5` passed: 1 planned trial, `definition sha256 7bb984fc…`, cook
  0 control + 1 bundle with the 86 400 000 ms cap from `MAIN_MENU.state`, control base `whole-map-bundle-fd95`
  matching outside the switches and off-in-both flags, and the printed bundle list ends
  `… rusturf-entry-followup-v1, drought-progress-credit-v2, open-milestone-stall-v1`.
- Detached launch via `runs/experiments/hyperqwen-bundle-24h-v5/launch.sh`: wrapper `46495` reparented to pid 1,
  runner `47706`, trial child `51801`. Runner log: `preparing the experiment checkout for ce6f83f`.
- Run `2026-11-03T00-08-32_hyperqwen-gpu0_f604`, `run_start` 2026-11-03T00:09:30-05:00 (turn 0).
  `evaluation.experiment {id: hyperqwen-bundle-24h-v5, arm: bundle, trial: 1, of: 1}`,
  `evaluation.preset_id hyperqwen-bundle-24h-v5-cook-bundle`, `harness.commit ce6f83fc438…` with `dirty: false`,
  `start_state.sha1 b3a6cc1c1983…`, `budgets {max_turns: 20000, max_wall_ms: 86400000}`.
- **The switches are in the arm**: `evaluation.features` carries `drought-progress-credit-v2: true` and
  `open-milestone-stall-v1: true` alongside their prerequisites (`turn-drought-clock-v1: true`,
  `drought-progress-facts-v1: true`, `stall-briefing-v1: true`), with `milestone-stall-stop-v1: false` as before;
  331 features recorded.
- `just fixed-run status hyperqwen-bundle-24h-v5`: running, 0 / 1 done, 0 invalid, lane A (GPU0, :8075) running
  trial 1 (cook, bundle). No `FAILED` in `logs/*.err`.
- Viewer: `/api/workbench` lists the run as `status: live` with no `problem` and an empty `problems` list;
  `just experiments-audit` prints nothing and exits 0. In the browser the viewer opens at
  `#run=2026-11-03T00-08-32_hyperqwen-gpu0_f604`, shows `preset hyperqwen-bundle-24h-v5-cook-bundle`, a
  `0:0x:xx / 24:00:00` clock, `Watching LIVE`, and the turn counter advancing (34 → 36 while sampled ~25 s apart)
  with no version-skew banner. This build has no separate WATCH RUN control and no game-frame canvas on the run
  page, so the frame-level claim is the advancing live turn counter, not a rendered screen.
