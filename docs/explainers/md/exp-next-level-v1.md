# EXP NEXT LEVEL

> Markdown twin of [exp-next-level-v1.html](../exp-next-level-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`exp-next-level-v1` · server readout switch · bundle-only, default off · Rustboro gym strategy report, training and catching sets (the operator, 2026-10-21: "both sets")

Each entry of the readout's Party line gains the two numbers the POKéMON summary screen shows under the stats. The state JSON gains `party_next_level`, which the Training block repeats for the whole party.

Run 97a0 challenged ROXANNE 22 EXP. Points short of Lv16, the level at which TORCHIC evolves and learns DOUBLE KICK; 35df, fd95, 2e93 and a8f9 were 279–397 short on their last tries. The model never saw the number (0 deliveries in run 1331).

## What the model reads

ON

Party (player): TORCHIC Lv14 HP 37/37 · EXP. POINTS 1619 · NEXT LV. 416 · moves SCRATCH PP 35, …; WURMPLE Lv4 HP 17/17 · EXP. POINTS 100 · NEXT LV. 25 · moves … Training (game numbers and game words from this run; not advice): - Party: TORCHIC Lv15 · EXP. POINTS 2180 · NEXT LV. 355; POOCHYENA Lv4 · EXP. POINTS 119 · NEXT LV. 6

OFF (today)

Party (player): TORCHIC Lv14 HP 37/37 · moves SCRATCH PP 35, …; WURMPLE Lv4 HP 17/17 · moves …

Actual output on run 1331's raw RAM (turn 660) for the Party line, and run fd95's turn-591 state for the Training block.

## How it is wired

![The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.](exp-next-level-v1/fig-1.svg)

*The switch travels from the run preset to one owner, which adds its text to the tool result. Nothing else changes.*

## Game grounding

pret/pokeemerald 731ad5bf `src/strings.c` gText_ExpPoints "EXP. POINTS" and gText_NextLv "NEXT LV."; `src/pokemon_summary_screen.c` expToNextLevel = gExperienceTables\[growthRate\]\[level + 1\] − exp (0 at Lv100). ROM: gExperienceTables 0x0831F72C, gSpeciesInfo 0x083203CC (growthRate at +19). Party EXP. Points come from the decoded party structure the readout already reads.

## Status

- Tests on recorded runs 1331, 97a0, fd95 and 6abf (see the worklog `docs/worklogs/active/2026-10-21_training-catching-switches.md`).
- Bundle arm of bundle-v-control, bundle-cook-1h, whole-map-cook-1h and whole-map-pair-2h: ON. Control arm and next-run default: OFF.
- Pending experiment `experiments/exp-next-level-v1.json`, not queued. No measured runs yet; nothing here claims the switch helps.
- Recorded check: run 1331's RUSTBORO CITY state reads TORCHIC 1619 → NEXT LV. 416 and WURMPLE 100 → 25; run 97a0's reads 2513 → 22.
