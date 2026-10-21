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
- [x] Approved in this session after the operator said to start the runs
- [x] Launched 2026-10-19 20:12 ET from main `08287126`. Runner pid 43157.
  - Control, lane A, GPU1, port 8075: `2026-10-19T20-12-11_qwen36-gpu1_86ac`
  - Bundle, lane B, GPU0, port 8076: `2026-10-19T20-12-11_qwen36-gpu0_4cd7`
- [x] Both `run_start` rows: experiment `bundle-cook-4h`, wall cap 14400000 ms, harness `08287126` dirty false, start sha1 `b3a6cc1c19836600a15febf41b8f8b19661ce5d4`. `just experiments-audit` printed nothing. The viewer dropdown lists `Bundle vs control, let it cook (4 hour pair)`.
