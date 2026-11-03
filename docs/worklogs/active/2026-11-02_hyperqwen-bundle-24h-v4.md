# hyperqwen-bundle-24h-v4 — 24 h restart on the 2026-11-02 script-trigger boundary build

Operator instruction (2026-11-02 22:23 EST): "please kick off a 24hr hyperqwen bundle run on pokebench on the
latest main".

## Why a new experiment id

`hyperqwen-bundle-24h-v3` was launched 2026-11-02 14:53 on pin `40d51feb` and ended **valid** at the
operator's hand 5 h 20 m later, so the id is spent (`1 / 1 done`, `0 invalid`) and the ledger would start
nothing for it.

Its single trial `runs/2026-11-02T14-53-03_hyperqwen-gpu0_de7a` recorded `endReason: operator_abort`,
`"ended by the operator (operator_abort); progress before it counts"`, `primaryReached: true`,
`furthest: "ROXANNE_FIRST_INTERACTION"` (depth 74), 560 turns, `wallMs: 19223185`. The 24 h DeepSeek control
arm that was running beside it (`2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8`, furthest
`GRANITE_CAVE_B1F`, 875 turns) was aborted at the same time, so both lanes were idle when this launch began.

`experiments/fixed/hyperqwen-bundle-24h-v4.json` is a byte-for-byte copy of the v3 definition except for
`id`, `title` and `worklog`: same seed `079870c5d2f6222d`, same lane A (GPU0, vLLM `127.0.0.1:18020`, game
port 8075), same `cook` phase, same 24 h wall cap, same start save
`runs/launch-receipts/fast-text/MAIN_MENU.state`, same `bundleMaxTokens: 8192`.

## What the new bundle carries that the stopped one did not

`main` moved from the v3 pin `40d51feb` to `899eeaf6b`, and the feature recipe `current.json` changed twice:

- `trigger-navigation-boundary-v1` is **gone**, not switched off (`bc342fd26` RED, `1ddc26c48` GREEN,
  `899eeaf6b` worklog). The guarded planner no longer refuses when `navigate_to`'s only routes cross a
  script-trigger tile: it prefers a script-free route, and when none exists it steps once into the first
  matching script tile and returns the resulting state. The v3 arm could still be handed the deleted
  refusal ("every route navigate_to sees to (1,8) crosses a script-trigger tile") which dead-ended at
  `2026-10-24T08-12-35_qwen36-gpu1_0517` turn 73.
- `player-map-visibility-v2` and `dark-area-flash-reminder-v1` moved from `onInBoth` to `offInBoth`
  (`def665b08`): visibility V2 and the dark-area FLASH reminder are off in both arms.
- The native action journal orders by id and frame instead of wall clock and records `server_exit`
  evidence (`b463203f4`), plus the red lint baseline main had been carrying is repaired (`e45fd087c`).

The stable-map-codes, solid-tile-leads and auto-talk-interrupt readouts the v3 worklog describes are
unchanged and still on in both arms.

## Launch

Pin: `0c6060e98` (`main`), clean tree. The definition and this worklog are committed first, so the pin the
trial records includes them.

- Viewer rebuilt at the pin before the launch: `just viewer-main` printed `viewer at 0c6060e98234bd879f26b500aab49cce4d889f98`;
  the serving `node` (pid 63425, ppid 1) runs `/Users/user/.cache/pokebench/05a6eefc879030e8/builds/0c6060e98234bd879f26b500aab49cce4d889f98`,
  so the viewer is not older than the pin.
- `just fixed-run check hyperqwen-bundle-24h-v4` passed: 1 planned trial, `definition sha256 73340cfa…`,
  cook 0 control + 1 bundle with the 86400000 ms cap from `runs/launch-receipts/fast-text/MAIN_MENU.state`,
  lane A `http://127.0.0.1:18020`, control base `whole-map-bundle-fd95` matching outside the switches and
  off-in-both flags. The printed bundle list carries `stable-map-codes-v1`, `solid-tile-leads-v1`,
  `auto-talk-interrupt-note-v1`, no `trigger-navigation-boundary-v1`.
- Detached launch (`runs/experiments/hyperqwen-bundle-24h-v4/launch.sh`, `nohup` + redirect + `disown` in a
  shell that returns): runner `63975` (`just`, ppid 1) → `fixed-cli` pid `65012`.

## Verification

- Run `2026-11-02T22-29-22_hyperqwen-gpu0_828b`, `run_start` 2026-11-02T22:31:10-05:00 (turn 0).
- `run_start` provenance: `evaluation.experiment {id: hyperqwen-bundle-24h-v4, arm: bundle, trial: 1, of: 1}`,
  budgets `{max_turns: 20000, max_wall_ms: 86400000}`, `harness.commit 0c6060e98234bd879f26b500aab49cce4d889f98`,
  `harness.dirty false`, `start_state.sha1 b3a6cc1c19836600a15febf41b8f8b19661ce5d4`, model
  `qwen3.8-27b` (context 262144, vision), sampling `{thinking_level: medium, max_tokens: 8192}`.
- Recipe as recorded: `trigger-navigation-boundary-v1` absent, `player-map-visibility-v2` false,
  `dark-area-flash-reminder-v1` false, `stable-map-codes-v1` / `solid-tile-leads-v1` /
  `auto-talk-interrupt-note-v1` true.
- Live at 22:38 EST: turn 61, `0:07:21 / 24:00:00`, story 15/203, 18 milestones, frames saving (129 PNGs at
  that read; `GET /api/runs/<id>/frames/001457_0.png` → 200, 240×160 PNG), `/api/workbench` reports the run
  `live` with no `problem` and `problems` empty, `experiments-audit` prints nothing and exits 0, the run's
  `.err` has no `FAILED`, and both 4090s report 100 % utilisation with the vLLM lane loaded.
- Headless-Chrome screenshot of `http://127.0.0.1:8790/#run=2026-11-02T22-29-22_hyperqwen-gpu0_828b` shows
  the live overworld frame on the GBA screen, the run card `hyperqwen-bundle-24h-v4` / preset
  `hyperqwen-bundle-24h-v4-cook-bundle`, `T61 · 0:07:21 / 24:00:00`, empty errors lane.
- Two `retry` events (turns 19 and 36, `reply hit max_tokens`, attempt 1) — the 8K cap's normal fresh-retry
  path, not a stall; the viewer's failure counter reads 1 of 3.

Note for anyone reading gates off `main` today: the tree went dirty mid-verification with a concurrent
worker's `open_milestone` change (`docs/worklogs/active/2026-11-02_open-milestone-stall.md` adds the stall
kind to `packages/agent` before `packages/viewer/src/trace.ts` knows it), so `tsc`/`just build` is red on
`main` right now and any `just` recipe with the `build` prerequisite fails. Status and the audit were read
from the `dist` built at the pin instead. Trials run from `/private/tmp/pokebench-fixed-0c6060e98234` at
`0c6060e`, so that working tree cannot reach this run.

