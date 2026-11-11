# LEADER ATTEMPT LEDGER

> Markdown twin of [leader-attempt-ledger-v1.html](../leader-attempt-ledger-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`leader-attempt-ledger-v1` · agent readout switch · bundle-only, default off · Rustboro gym strategy report, training and catching sets (Operator, 2026-10-21: "both sets")

On a gym map's field, and at a ready battle decision against a GYM LEADER, each earlier battle with that leader this run: the party's levels and EXP. Points, the BAG, each of the leader's POKéMON seen with the HP it was left at or fainted, the outcome the game wrote, and the money before and after; then the party now.

6 of 9 ROXANNE rematches started with exactly the EXP. Points of the loss before (run 6abf three times running at 1500), and each loss halved the money.

## What the model reads

ON

Training (game numbers and game words from this run; not advice): - Battles with GYM LEADER ROXANNE this run: 1. turn 501: TORCHIC Lv13 EXP. POINTS 1592, POOCHYENA Lv4 EXP. POINTS 119 · BAG POKé BALL ×4, GREAT BALL ×1 · ROXANNE's POKéMON: GEODUDE Lv12 HP 13/33 · you lost · money ₽6920 → ₽3460 2. turn 538: TORCHIC Lv15 EXP. POINTS 2180, POOCHYENA Lv4 EXP. POINTS 119 · BAG POKé BALL ×4, GREAT BALL ×1 · ROXANNE's POKéMON: GEODUDE Lv12 HP 2/33 · you lost · money ₽3908 → ₽1954 Now: TORCHIC Lv15 EXP. POINTS 2180, POOCHYENA Lv4 EXP. POINTS 119 · BAG WAILMER PAIL ×1, POKé BALL ×4, GREAT BALL ×1 · money ₽1954

OFF (today)

(no lines)

Actual output on run fd95's events: the first two ROXANNE losses, on the gym field before the third.

## How it is wired

![The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.](leader-attempt-ledger-v1/fig-1.svg)

*The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.*

## Game grounding

Trainer class LEADER is 0x20 (pret `include/constants/trainers.h`, as gym-readiness-readout-v1 uses). Foe HP per party slot from the recorded battle state; the outcome is battle.outcome; money after is the first field state after the battle. Seen-only: nothing from the ROM's trainer parties.

## Status

- Tests on recorded runs 1331, 97a0, fd95 and 6abf (see the worklog `docs/worklogs/active/2026-10-21_training-catching-switches.md`).
- Bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h: ON. Control arm and next-run default: OFF.
- Pending experiment `experiments/leader-attempt-ledger-v1.json`, not queued. No measured runs yet; nothing here claims the switch helps.
