# hyperqwen-bundle-24h-v3 — restart on the stable-codes bundle

Operator instruction (2026-11-02): "restart the hyperqwen run with the latest bundle on main".

## Why a new experiment id

`hyperqwen-bundle-24h-v2` was already **1 / 1 done**. Its single trial,
`runs/2026-11-02T02-55-21_hyperqwen-gpu0_07a7`, was ended by the operator at 11.9 h and recorded valid
(`endReason: "operator_abort"`, `"reason": "ended by the operator (operator_abort); progress before it counts"`,
`primaryReached: true`, `furthest: "ROCK_TOMB_RECEIVED"`, depth 78, 779 turns). The ledger keys on the
experiment id, so re-running v2 correctly starts nothing.

`experiments/fixed/hyperqwen-bundle-24h-v3.json` is a byte-for-byte copy of the v2 definition except for
`id`, `title` and `worklog`: same seed `079870c5d2f6222d`, same lane A (GPU0, vLLM `127.0.0.1:18020`,
game port 8075), same `cook` phase, same 24 h wall cap, same start save
`runs/launch-receipts/fast-text/MAIN_MENU.state`.

## What the new bundle carries that the stopped one did not

The stopped trial ran `875132337f5e` and spent ~40 minutes of wall clock stalled in Rusturf Tunnel
(`24/4`) in front of `AQUA_MEMBER_M`, whose two bodies gate the only route to the exit tile `(29,16)`
(BFS: 53 reachable tiles with them solid, 177 if passable). Three readout defects fed that stall:

- `stable-map-codes-v1` — the compact grid re-lettered its code tokens by first appearance, so `F` was
  floor on turn 395 and an NPC on turn 396.
- `solid-tile-leads-v1` — `Next tiles` printed `down (12,6) ground (cave); collision (#), cannot be
  entered from here`, i.e. the floor first and the refusal as an afterthought, and the model pressed
  DOWN into a wall repeatedly.
- `auto-talk-interrupt-note-v1` — the supervisor's walk to the grunt was interrupted by a Whismur
  battle and reported as `not_free` with `text: null`, so the model was never told the walk happened.

All three are on in both arms in `experiments/feature-configs/current.json`; the base glyph and legend
meanings are unchanged.

## Fixed alongside: `play --help` started a run

`plainPlay` reads one flag, `--commit`, and ignored every other argument. `fixed-run play --help`
therefore prepared an experiment checkout and launched a real trial (observed at 19:45:49: it printed
`preparing the experiment checkout for d5a3dc8` and only stopped at gateway discovery). Unknown argv is
now a usage error (`exit 2`) and `--help`/`-h` prints `USAGE` and exits 0, both before any checkout is
prepared. Two tests cover it, each passing a `hostDeps` that throws if preparation is attempted.

## Verification

- `packages/viewer/src/fixed-cli.test.ts`: 39 passed (37 before, 2 added).
- `fixed-run check hyperqwen-bundle-24h-v3` before the launch.
