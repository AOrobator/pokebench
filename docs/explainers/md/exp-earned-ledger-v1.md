# EXP EARNED LEDGER

> Markdown twin of [exp-earned-ledger-v1.html](../exp-earned-ledger-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`exp-earned-ledger-v1` · agent readout switch · bundle-only, default off · Rustboro gym strategy report, training and catching sets (Operator, 2026-10-21: "both sets")

In the Training block: the amounts in the game's "… gained … EXP. Points!" pages the model was shown, by the battle they came from (trainer name, or wild and the species), for the last 10 battles that printed any, and the lowest and highest per page for trainers and for wild POKéMON.

After losing to ROXANNE, runs walked past gym trainers worth 147–183 EXP. Points per page and fought wild POKéMON worth 15–59.

## What the model reads

ON

Training (game numbers and game words from this run; not advice): - EXP. Points the game printed (its "… gained … EXP. Points!" pages), the last 10 battles that printed any, oldest first: turn 409 · LYLE (trainer) on PETALBURG WOODS: TORCHIC 34, TORCHIC 34, TORCHIC 34, TORCHIC 34 turn 419 · wild POOCHYENA Lv6 on PETALBURG WOODS: TORCHIC 47 turn 443 · GRUNT (trainer) on PETALBURG WOODS: TORCHIC 105 turn 447 · wild SLAKOTH Lv5 on PETALBURG WOODS: TORCHIC 59 turn 451 · JAMES (trainer) on PETALBURG WOODS: TORCHIC 82, TORCHIC 82 turn 462 · WINSTON (trainer) on ROUTE104: TORCHIC 90 turn 467 · GINA & MIA (trainer) on ROUTE104: TORCHIC 46, POOCHYENA 46, TORCHIC 46, POOCHYENA 46 turn 491 · JOSH (trainer) on RUSTBORO CITY GYM: TORCHIC 183 turn 517 · TOMMY (trainer) on RUSTBORO CITY GYM: TORCHIC 147, TORCHIC 147 turn 525 · MARC (trainer) on RUSTBORO CITY GYM: TORCHIC 147, TORCHIC 147 Per page this run: trainer battles 34–183 · wild POKéMON 15–59

OFF (today)

(no lines)

Actual output on run fd95's events up to turn 591.

## How it is wired

![The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.](exp-earned-ledger-v1/fig-1.svg)

*The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.*

## Game grounding

pret/pokeemerald `src/battle_message.c` sText_PkmnGainedEXP "{B_BUFF1} gained{B_BUFF2}\\n{B_BUFF3} EXP. Points!" (B_BUFF2 is " a boosted" for traded POKéMON). Each page is attributed through the recorded state its page names: a trainer battle when trainer_opponent.battle_active, else the wild foe on the field. A page whose state was not recorded is dropped, never guessed.

## Status

- Tests on recorded runs 1331, 97a0, fd95 and 6abf (see the worklog `docs/worklogs/active/2026-10-21_training-catching-switches.md`).
- Bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h: ON. Control arm and next-run default: OFF.
- Pending experiment `experiments/exp-earned-ledger-v1.json`, not queued. No measured runs yet; nothing here claims the switch helps.
