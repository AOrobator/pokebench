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

Pin: `899eeaf6b` (`main`), clean tree. The definition and this worklog are committed first, so the pin the
trial records includes them.

## Verification

(filled in after the launch: runner pid, run id, `run_start` provenance, workbench card, `experiments-audit`)
