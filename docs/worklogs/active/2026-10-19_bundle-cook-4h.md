# Bundle vs control, four-hour cook pair

## Operator decision

On 2026-10-19, the operator said to start two concurrent runs on the GPU servers: one control arm and one bundle arm, a let-it-cook run, each with a maximum of four hours.

This is an exploratory pair. It does not start the pre-registered `bundle-v-control` confirmatory cohort (104 trials per arm, 15 minutes, CLOCK_SET).

## What runs

- Definition `experiments/fixed/bundle-cook-4h.json`.
- Arms, switches, control base, lanes and serving are copied from `experiments/fixed/bundle-v-control.json` on main `1d3f01b6`.
- One trial per arm, one lane each, concurrent (`singlePair`).
- Start: `runs/launch-receipts/fast-text/MAIN_MENU.state` (sha1 `b3a6cc1c19836600a15febf41b8f8b19661ce5d4`), the registered cook start.
- Wall cap: 14,400,000 ms (4 hours). Turn cap stays 20,000 and is not expected to bind.
- Replacement reserve: 0. An invalid trial stays recorded and is not replaced automatically.
- `milestone-stall-stop-v1` stays off in both arms, as in the bundle definition.

## Launch

- [x] `just fixed-run check bundle-cook-4h` (seed `c409c7f2d0dadf59`, 1 control on lane A / GPU1, 1 bundle on lane B / GPU0, 14400000 ms)
- [ ] Approved in this session after the operator said to start the runs
- [ ] Both lanes running, run_start matches the pin, and the experiment is in the viewer dropdown
