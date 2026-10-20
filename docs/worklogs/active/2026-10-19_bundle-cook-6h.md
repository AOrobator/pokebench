# Bundle vs control, six-hour cook pair

## Operator decision

On 2026-10-19 at 11:13 PM ET, the operator asked for another cook pair: control on one GPU, bundle on the other, six hours maximum.

The four-hour pair had already ended. Control `2026-10-19T20-12-11_qwen36-gpu1_86ac` ended as an emulator or game-server crash. Bundle `2026-10-19T20-12-11_qwen36-gpu0_4cd7` ended as a model error: the request was 67724 tokens and the context is 65536. That runner had a zero replacement reserve, so it was waiting. It was stopped before this pair started. Those run directories stay where they are.

## What runs

- Definition `experiments/fixed/bundle-cook-6h.json`.
- Arms, switches, control base, lanes and serving match `experiments/fixed/bundle-v-control.json` on this main.
- One trial per arm, one lane each, concurrent (`singlePair`).
- Start: `runs/launch-receipts/fast-text/MAIN_MENU.state` (sha1 `b3a6cc1c19836600a15febf41b8f8b19661ce5d4`).
- Wall cap: 21,600,000 ms (6 hours). Turn cap stays 20,000.
- Replacement reserve: 0.

## Launch

- [x] `just fixed-run check bundle-cook-6h` (seed `c628fc13d3c8ade8`, 21600000 ms)
- [x] Approved after the operator said to start this pair
- [x] Launched 2026-10-19 11:16 PM ET from main `f482b662`. Runner pid 4462.
  - Control, lane A, GPU1, port 8075: `2026-10-19T23-16-14_qwen36-gpu1_7ca0`
  - Bundle, lane B, GPU0, port 8076: `2026-10-19T23-16-14_qwen36-gpu0_7346`
- [x] Both `run_start` rows: experiment `bundle-cook-6h`, wall cap 21600000 ms, harness `f482b662` dirty false, start sha1 `b3a6cc1c19836600a15febf41b8f8b19661ce5d4`. `just experiments-audit` printed nothing. The viewer dropdown lists `Bundle vs control, let it cook (6 hour pair)`.
