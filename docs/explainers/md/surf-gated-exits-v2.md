Feature switch · observation · `surf-gated-exits-v2` · default OFF · bundle arm only · pending experiment

# Surf-gated exits v2

> Markdown twin of [surf-gated-exits-v2.html](../surf-gated-exits-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The notes surf-gated-exits-v1 adds to water-only exits say only that the water cannot be crossed yet; they no longer name the Balance Badge or SURF.

## Why

Operator decision (Operator, 2026-10-17 1:59 PM): on Route 103 the player has not been told about the Balance Badge or SURF, so naming them is route foreknowledge (PB4). Operator rule (2:17 PM): say what the game would show. Pressing A at surfable water starts `EventScript_UseSurf` (and its `gText_WantToUseSurf` prompt) only from `GetInteractedWaterScript` (src/field_control_avatar.c:448-461), and only when `FLAG_BADGE05_GET` is set, `PartyHasMonWithSurf()` is true and the player faces surfable water. Otherwise, away from a waterfall, it returns no script and the game shows nothing, so the readout states only the observable fact.

## What the model reads

```
OFF (v1), 4caa T198 ROUTE103
- EAST -> ROUTE110 (map 0/25), offset -60; not an exit you can use now: every way from where you stand to this edge crosses water, and Surf needs the Balance Badge and a party Pokémon that knows SURF (you have neither)
Warp destination at (45,6): ALTERING CAVE (not an exit you can use now: across water, needs Surf)
```

```
ON (v2), 4caa T198
- EAST -> ROUTE110 (map 0/25), offset -60; not an exit you can use now: every way from where you stand to this edge crosses water you cannot cross yet
Warp destination at (45,6): ALTERING CAVE (not an exit you can use now: across water you cannot cross yet)
```

```
ON (v2), bd60 T706 ROUTE104
- SOUTH -> ROUTE105 (map 0/20), offset 0; not an exit you can use now: every way from where you stand to this edge crosses water you cannot cross yet
```

```
ON (v2), untaken-exits line when every exit is across water
Exits here you have not taken: none you can walk to (every exit listed on this map is across water you cannot cross yet)
```

*Recorded RAM re-rendered on the real ROM with the switch off and on (env/tests/env/test_readout_truth_fixes.py). Nothing else in the readout changes.*

## How it decides

![decision flow](surf-gated-exits-v2/fig-1.svg)

*v2 changes wording only: which exits are gated, and when Surf opens them again, is still surf-gated-exits-v1. v2 needs v1; with v1 off it does nothing.*

## Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881)

| Fact | Source | Value |
|---|---|---|
| Silent owner | `GetInteractedWaterScript` (src/field_control_avatar.c:448-461): returns `EventScript_UseSurf` only if `FlagGet(FLAG_BADGE05_GET)`, `PartyHasMonWithSurf()` and `IsPlayerFacingSurfableFishableWater()` all hold; a waterfall has its own scripts; else `NULL` | no script, no message |
| When Surf works | the same condition; which exits are gated is unchanged from v1 | unchanged from v1 |

## Limits

- With only one of the badge and a Surf user the game also shows nothing (the same condition fails), so v2 reads the same.
- With exit-reachability-v1 on, its notes for exits reachable neither on foot nor across water ("not reachable on foot from where you stand") win for those exits and are unchanged; v2 replaces only the Surf wording on water-only exits. When both kinds are cut, the untaken-exits line reads "none you can walk to (every exit listed on this map is across water you cannot cross yet or cannot be reached on foot from where you stand)".

## Status

A working branch (2026-10-17 top-50 run analysis, Group A); gates in `docs/worklogs/active/2026-10-17_readout-truth-fixes.md`. Server switch, default off, bundle arm only; registered as a pending experiment, not queued. Not reviewed or measured yet.
