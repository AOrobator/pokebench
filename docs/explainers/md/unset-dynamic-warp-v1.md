Feature switch · observation · `unset-dynamic-warp-v1` · default OFF · bundle arm only · pending experiment

# Unset dynamic warp

> Markdown twin of [unset-dynamic-warp-v1.html](../unset-dynamic-warp-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Before the moving truck stops, its exits read as a dynamic destination, not PETALBURG CITY.

## Why

0e05 (seq 693-786, 9 readouts) and 93eb (seq 758-2281, 65 readouts) showed the truck's back door as `PETALBURG CITY (dynamic warp; map 0/0)`. The truck's door is a MAP_DYNAMIC warp; its target (`SaveBlock1.dynamicWarp`) is all zero until the truck stops and its script runs `setdynamicwarp MAP_LITTLEROOT_TOWN, 3, 10`. All-zero WarpData decodes as map 0/0, which is PETALBURG CITY. Only (127,127) was treated as unset.

## What the model reads

```
OFF, 0e05 seq 693 (truck moving)
Warps: (4,1) -> PETALBURG CITY (dynamic warp; map 0/0) [activation unknown], …
Warp destination at (4,1): PETALBURG CITY (dynamic warp; map 0/0)
```

```
ON, 0e05 seq 693
Warps: (4,1) -> dynamic destination [activation unknown], …
Dynamic warp at (4,1), elevation 0; movement; activation depends on metatile (see local map); conditional; dynamic destination
Warp destination at (4,1): dynamic destination
```

```
After the truck stops, with game-known warp naming
Warp destination at (4,1): dynamic destination
(typed state retains internal map 0/9; the readout does not reveal LITTLEROOT TOWN before MOM names it)
```

*Recorded RAM re-rendered on the real ROM with the switch off and on (env/tests/env/test_readout_truth_fixes.py). Nothing else in the readout changes.*

## How it decides

![decision flow](unset-dynamic-warp-v1/fig-1.svg)

*The 8-byte WarpData (mapGroup, mapNum, warpId, padding, x, y) is unset when every byte is zero. Any set value, including a real map 0/0 with a coordinate, reads as before.*

## Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881)

| Fact | Source | Value |
|---|---|---|
| WarpData | include/global.h:581-588; `dynamicWarp` at SaveBlock1 + 0x14 (global.h:989) | 0e05 raw 226: 00 00 00 00 00 00 00 00 |
| Set by | `InsideOfTruck_EventScript_SetIntroFlags`: `setdynamicwarp MAP_LITTLEROOT_TOWN, 3, 10` | 0e05 raw 263: (0, 9, -1, 0, 3, 10) |

## Limits

- Needs `named-warp-destinations-v1`: only it reads `SaveBlock1.dynamicWarp` and names warp destinations.
- A script that sets the dynamic warp to map 0/0, warp 0, at (0,0) would read as unset; no Emerald script does.

## Status

A working branch (2026-10-17 top-50 run analysis, Group A); gates in `docs/worklogs/active/2026-10-17_readout-truth-fixes.md`. Server switch, default off, bundle arm only; registered as a pending experiment, not queued. Not reviewed or measured yet.
