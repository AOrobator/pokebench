# SAID TYPE MATCHES

> Markdown twin of [said-type-matches-v1.html](../said-type-matches-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`said-type-matches-v1` · agent readout switch · bundle-only, default off · Rustboro gym strategy report, training and catching sets (the operator, 2026-10-21: "both sets")

Every field page that names a type ("WATER-type") is kept once with its map. At battle decisions, each foe's and the player's battler type and moves that a kept line names are listed with that line and its map.

The RUSTBORO GYM GUIDE says the ROCK type "can't stand WATER-type and GRASS-type moves", but nothing linked that line to the WINGULL with WATER GUN or the SHROOMISH with ABSORB the runs fought afterwards.

## What the model reads

ON

Type words the game printed this run, and what in this battle they name: - Foe SHROOMISH (GRASS): SHROOMISH is GRASS-type, ABSORB is GRASS-type, STUN SPORE is GRASS-type — said on RUSTBORO CITY GYM: "The ROCK type is very durable, but it can't stand WATER-type and GRASS-type moves."

OFF (today)

(no block)

Actual output on run 6abf's events at its wild SHROOMISH battle decision (seq 30081), after the guide's lines at turn 689.

## How it is wired

![The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.](said-type-matches-v1/fig-1.svg)

*The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.*

## Game grounding

The gym guide's lines, pret/pokeemerald `data/maps/RustboroCity_Gym/scripts.inc`. Move types from the recorded battle state's move table (gBattleMoves type). Only lines the game printed this run; before a type line nothing shows.

## Status

- Tests on recorded runs 1331, 97a0, fd95 and 6abf (see the worklog `docs/worklogs/active/2026-10-21_training-catching-switches.md`).
- Bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h: ON. Control arm and next-run default: OFF.
- Pending experiment `experiments/said-type-matches-v1.json`, not queued. No measured runs yet; nothing here claims the switch helps.
