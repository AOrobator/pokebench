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

- Restarted after cadence fix ad5113ead: archived prior trial to runs/aborted/hyperqwen-bundle-24h-20261101T023944Z/.

- Relaunched pin `013d273b7` as `2026-10-31T22-48-04_hyperqwen-gpu0_eefc` (bundle; both switches ON; dirty false). Prior trial archived `runs/aborted/hyperqwen-bundle-24h-20261101T023944Z/` at RIVAL_BATTLE_WON / operator_abort T331. Viewer 8790 at same pin; workbench live; experiments-audit clean.

- 2026-11-01: set `bundleMaxTokens: 8192` (doubled from 4096) after post-Roxanne-whiteout forensics on `eefc`: thinking burned the shared 4096 cap with `stop_reason=length` and no tool call, then text-only supervisor notes. Live `eefc` left running at 4096; 8192 applies on the next launch/restart only.
