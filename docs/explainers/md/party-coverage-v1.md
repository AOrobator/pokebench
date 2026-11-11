# PARTY COVERAGE

> Markdown twin of [party-coverage-v1.html](../party-coverage-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`party-coverage-v1` · agent readout switch · bundle-only, default off · Rustboro gym strategy report, training and catching sets (the operator, 2026-10-21: "both sets")

At battle decisions: for each foe type met this run, each of the player's moves used on it and the effectiveness line the game printed right after, then the foe types no party move has drawn "It's super effective!" against. Rows show the types with any printed line and the current foe's type.

Every move TORCHIC had was resisted by ROXANNE's GEODUDE (EMBER and SCRATCH both printed "It's not very effective…"), and nothing showed the model what its party lacked.

## What the model reads

ON

Your moves by foe type this run (counted from the game's "… used …!" pages and the line it printed right after): - BUG (WURMPLE, CASCOON): EMBER used 1, "It's super effective!" 1; SCRATCH used 18 (no effectiveness line printed) - WATER (MUDKIP, MARILL, MAGIKARP): EMBER used 6, "It's not very effective…" 6; SCRATCH used 7 (no effectiveness line printed) - GRASS (SHROOMISH): SCRATCH used 3 (no effectiveness line printed) - ROCK/GROUND (GEODUDE): EMBER used 11, "It's not very effective…" 11; SCRATCH used 4, "It's not very effective…" 4 - Foe types met this run that none of your moves has drawn "It's super effective!" against: NORMAL, DARK, WATER/FLYING, WATER, NORMAL/FLYING, PSYCHIC, GRASS, ROCK/GROUND, FIGHTING

OFF (today)

(no block)

Actual output on run 6abf's events at its wild SHROOMISH battle decision (seq 30081).

## How it is wired

![The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.](party-coverage-v1/fig-1.svg)

*The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.*

## Game grounding

pret/pokeemerald `src/battle_message.c` sText_AttackerUsedX, sText_SuperEffective, sText_NotVeryEffective, sText_ItDoesntAffect. Foe types from the recorded battle state, named as the battle readout names them (TYPE\_\* order). Only the player's own party in single battles; no type chart.

## Status

- Tests on recorded runs 1331, 97a0, fd95 and 6abf (see the worklog `docs/worklogs/active/2026-10-21_training-catching-switches.md`).
- Bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h: ON. Control arm and next-run default: OFF.
- Pending experiment `experiments/party-coverage-v1.json`, not queued. No measured runs yet; nothing here claims the switch helps.
