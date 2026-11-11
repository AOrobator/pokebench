# SEEN TRAINERS LEDGER

> Markdown twin of [seen-trainers-ledger-v1.html](../seen-trainers-ledger-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`seen-trainers-ledger-v1` · agent readout switch · bundle-only, default off · Rustboro gym strategy report, training and catching sets (the operator, 2026-10-21: "both sets")

In the Training block: the trainers heal-before-trainers-v2 listed on each map the player stood on this run, by map: not beaten, battled and not beaten, or beaten, by the name a battle showed or else the sprite kind and tile. Fully beaten maps collapse to a count.

After losing to ROXANNE, the 4 control runs never fought TOMMY or MARC in the same gym; the bundle runs with the gym readiness readout did.

## What the model reads

ON

Training (game numbers and game words from this run; not advice): - Trainers the readout listed on maps you stood on this run (the game's trainer flags): ROUTE103: WOMAN_2 at (71,11) not beaten, TWIN at (64,12) not beaten, FISHERMAN at (50,8) not beaten, POKEFAN_M at (56,13) not beaten, BLACK_BELT at (67,5) not beaten, MAN_5 at (67,9) not beaten, SWIMMER_F at (36,6) not beaten, SWIMMER_M at (36,13) not beaten ROUTE102: LASS at (8,7) not beaten; 3 beaten (CALVIN, RICK, ALLEN) PETALBURG CITY GYM: WOMAN_5 at (4,94) not beaten, MAN_3 at (4,81) not beaten, MAN_3 at (4,42) not beaten, WOMAN_5 at (4,55) not beaten, MAN_3 at (4,68) not beaten, WOMAN_5 at (4,16) not beaten, MAN_3 at (4,29) not beaten ROUTE104: LASS at (31,24) not beaten, FISHERMAN at (29,8) not beaten, YOUNGSTER at (18,67) not beaten, FISHERMAN at (15,59) not beaten; 3 beaten (GINA & MIA, WINSTON, CINDY) PETALBURG WOODS: 2 beaten (LYLE, JAMES) RUSTBORO CITY GYM: ROXANNE battled, not beaten; 3 beaten (JOSH, TOMMY, MARC)

OFF (today)

(no lines)

Actual output on run fd95's events up to turn 591.

## How it is wired

![The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.](seen-trainers-ledger-v1/fig-1.svg)

*The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.*

## Game grounding

The game's trainer flags (TRAINER_FLAGS_START 0x500 + trainer id) and each map's object templates, as heal-before-trainers-v2 reads them (pret `src/battle_setup.c` GetTrainerFlagFromScriptPointer). Only maps the player stood on; nothing names a place to go. Needs heal-before-trainers-v2.

## Status

- Tests on recorded runs 1331, 97a0, fd95 and 6abf (see the worklog `docs/worklogs/active/2026-10-21_training-catching-switches.md`).
- Bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h: ON. Control arm and next-run default: OFF.
- Pending experiment `experiments/seen-trainers-ledger-v1.json`, not queued. No measured runs yet; nothing here claims the switch helps.
