# HyperQwen 24h current-bundle cook

**Started:** 2026-10-31
**Status:** Active; operator authorized launch

## Intent

Operator asked to kick off a HyperQwen 24-hour bundle run against the live TP2 HyperQwen endpoint (`127.0.0.1:18020`, vision on, `max_model_len` 262144).

## Definition

- Id: `hyperqwen-bundle-24h`
- Arm: current feature recipe, `singleArm: bundle`
- Cap: 24h / 20k turns, MAIN_MENU start `b3a6cc1c19836600a15febf41b8f8b19661ce5d4`
- Lane A: game `8075`, model `http://127.0.0.1:18020`, vision true, key `~/.config/pokebench/hyperqwen.key`
- Serving pin: `qwen3.8-27b`, context 262144 (matches live HyperQwen TP2 boot)

## Ops notes

- Stopped the paused Oct-27 `hyperqwen-control-3h` runner (reserve exhausted after a 65k context overflow) and archived its experiment ledger under `runs/aborted/`.
- Live HyperQwen owns both 4090s (`MAX_SEQS=2`); this trial uses one slot. Nous Hermes may share the second.

## Session log

- 2026-10-31: added fixed definition and launched via `just fixed-run run hyperqwen-bundle-24h`.
