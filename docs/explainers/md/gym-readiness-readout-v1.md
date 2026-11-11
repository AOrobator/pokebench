# Gym readiness readout

> Markdown twin of [gym-readiness-readout-v1.html](../gym-readiness-readout-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`gym-readiness-readout-v1` · agent readout switch · bundle-only, default off

Six recorded runs reached the Rustboro gym with a lone TORCHIC at Lv12–15. ROXANNE won all six battles, and only one run fought the gym's other trainers (evidence). This switch puts the party's levels next to what the run has already seen of the gym, so the model can judge for itself. Operator approved it on 2026-10-20.

## What the model reads (recorded run a8f9, turn 1106)

Location: RUSTBORO CITY GYM Position: … Gym: RUSTBORO CITY GYM · GYM LEADER ROXANNE Your party: TORCHIC Lv15 HP 41/41 ROXANNE's POKéMON seen in battle this run: GEODUDE Lv12 ×2; any others not seen yet Said on this map: "ROXANNE, the GYM LEADER, is a user of ROCK-type POKéMON." "The ROCK type is very durable, but it can't stand WATER-type and GRASS-type moves."

With heal-before-trainers facts in the state, a last line lists the map's trainers, for example `Trainers on this map: JOSH at (5,13) (beaten), YOUNGSTER at (2,9) (not beaten), ROXANNE at (5,2) (battled, not beaten)`. A trainer is named only if a battle showed the name; otherwise the sprite kind is used.

## Where each part comes from

![The block is built only from recorded events this run. It never reads the ROM's trainer parties (sParty_Roxanne1), so before the first leader battle it says "none yet". It gives no advice and no level targets.](gym-readiness-readout-v1/fig-1.svg)

*The block is built only from recorded events this run. It never reads the ROM's trainer parties (`sParty_Roxanne1`), so before the first leader battle it says "none yet". It gives no advice and no level targets.*

## When it shows

Only on a map whose name ends in " GYM", on the field, outside battle, in a started game. It is added to observe, press and navigate_to results right after the Location/Position lines. Off: no block.

## Status

Tests: `packages/agent/src/gym-readiness.test.ts` on the a8f9 fixture (full block, before any leader battle, trainer list, gating, slot levels, page filter, wiring ON/OFF, registry). Pending experiment `experiments/gym-readiness-readout-v1.json`, activation RUSTBORO_CITY_GYM. There are no measured runs yet.
