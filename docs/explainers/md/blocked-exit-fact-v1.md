Harness switch · blocked-exit-fact-v1 · observation · needs coordinate-script-conditions-v1 · default off

# Blocked exit fact

> Markdown twin of [blocked-exit-fact-v1.html](../blocked-exit-fact-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

When a script on an exit has turned the player back and its condition still holds in RAM, the result says so plainly and lists the map's other exits.

## What it does

When this run has seen a coordinate trigger on (or next to) an exit turn the player back, and that trigger's condition still matches in the result's own RAM, observe, press and navigate_to results end with one plain line: which exit, when it last turned the player back, that the script runs while a saved value keeps the setting it checks for, that it has that setting now, and the map's other exits by the readout's own names. It names no flag, story step or destination advice.

![Oldale west exit tiles](blocked-exit-fact-v1/fig-1.svg)

*No recorded state ever stands on (0,10): the step back happens inside one call. The refusal is read from the call (aimed at the trigger, a script ran, ended off it on the same map).*

## Before and after (54a7, T248, tool result seq 6071)

OFF (the recorded result, the lines that matter):

```
pressed LEFT
Press result: locked (field controls locked in a snapshot; no net movement)
1. turn 248 · OLDALE TOWN (map 0/10) · at 1,10 · MANIAC (sprite kind, not a name): "Aaaaah! Wait!
Location: OLDALE TOWN
Position: X=1, Y=10, facing right
Next tiles: up (1,9) collision (#), cannot be entered from here; down (1,11) person or object (N, object id 3); left (0,10) clear (.); right (2,10) clear (.)
Nearby script-trigger tiles (a clear terrain tile can still run a script):
- (0,10), elevation 3: variable 0x4051=0, needs 0; condition matches; script 0x081E903F
- WEST -> ROUTE102 (map 0/17), offset 0; walk off the map from (0,10) or (0,11): stand on one of these edge tiles and press LEFT
Warp destination at (5,7): OLDALE TOWN HOUSE1
Warp destination at (15,16): OLDALE TOWN HOUSE2
Warp destination at (6,16): OLDALE TOWN POKEMON CENTER 1F
Warp destination at (14,6): OLDALE TOWN MART
```

ON (the line added after the readout):

```
Blocked exit: WEST -> ROUTE102 (map 0/17). When you last tried it, at turn 247, the game ran a script at (0,10) and kept you on this map. This exit is blocked by a script that runs while a value the game saves still has the setting that script checks for; it has that setting now, so this exit stays blocked for now. Other exits from this map: NORTH -> ROUTE103 (map 0/18); SOUTH -> ROUTE101 (map 0/16); (5,7) -> OLDALE TOWN HOUSE1 (map 2/0); (15,16) -> OLDALE TOWN HOUSE2 (map 2/1); (6,16) -> OLDALE TOWN POKEMON CENTER 1F (map 2/2); (14,6) -> OLDALE TOWN MART (map 2/4).
```

## The condition, checked against pokeemerald and the ROM

- `data/maps/OldaleTown/map.json` coord event (0,10), elevation 3, `VAR_OLDALE_TOWN_STATE` (0x4051, vars.h) value 0, script `OldaleTown_EventScript_BlockedPath`.
- ROM, through gMapHeader of 54a7 state seq 6070: the same table, `(0,10) elevation 3 var 0x4051 value 0 script 0x081E903F`, then three `var 0x40C7 value 1` rival triggers on the south edge.
- ROM bytes at 0x081E903F: `69 4f ff 00 82 91 1e 08 4f 03 00 … 51 00 00` = lockall (0x69), applymovement LOCALID_PLAYER (0x4f, 0xff) PlayerStepBack, applymovement 3 (the MANIAC), waitmovement 0 (0x51): `OldaleTown_EventScript_BlockedPath` (data/script_cmd_table.inc opcodes).
- Saved value in that state: 0x4051 = 0; FLAG_ADVENTURE_STARTED (0x74) unset. `OldaleTown_OnTransition` sets 0x4051 to 1 only when that flag is set, which Birch does when he gives the Pokédex (`LittlerootTown_ProfessorBirchsLab/scripts.inc:510`). The line never says this; it says only that the value still has the setting the script checks for.
- A trigger variable below 0x4000 is a constant (VarGet returns the id itself), so it is never treated as saved state.

![Refusal rule](blocked-exit-fact-v1/fig-2.svg)

*Keyed by the coordinate event, not the tile: Littleroot (11,1) holds one event for town state 0 (the TWIN who stops you) and one for state 1 (sent to save Birch). Once the state is 1 the first no longer matches and the line stops.*

## Measured on recorded runs

| run | place | results with the line | turns | refusals recorded | true block? |
|---|---|---|---|---|---|
| 54a7 | LITTLEROOT TOWN, NORTH -&gt; ROUTE101 | 33 | T82–T114 | 17 | yes: LittlerootTown_EventScript_NeedPokemonTrigger (TWIN, town state 0) until the rival meeting (T155) |
| 54a7 | OLDALE TOWN, WEST -&gt; ROUTE102 | 187 | T247–T484 | 94 | yes: BlockedPath (the MANIAC); none in T344–T394 (Route 103, the MAY battle, Littleroot) |
| sh02 | BRENDAN'S HOUSE 1F, door (8,8) | 1 | T59 | 1 | yes: GoSeeRoom (intro state 4, Mom moves the player from the door) |

54a7: 220 of 655 game results carry the line; sh02: 1 of 1100. Every one was checked against the trigger's script in pokeemerald: no false positives. The first Oldale line is at T247, the result of the first push-back; T246 (arriving at (1,10)) has none.

Limits: a refusal is learnt only by trying; with world-destinations-v1 off a connection exit cannot be named, so there is no line; a sibling door tile with the same destination is listed as another exit (it is another warp in the game's table); a map connection is called blocked when one of its edge tiles holds the refusing trigger, even if another edge tile has none (Oldale's (0,11) can only be reached through (0,10)). A press counts as a try only when it is directions only, so a conversation started with A is never taken for the trigger's script.

## Status

Gates: `just test`, `just lint`, `just build`, `just coverage` (90% floor). Replays on recorded runs 54a7 and sh02 only; no measured runs, no live probe (lane freeze until 10 AM). The pending experiment entry is registered, not queued; only the operator approves runs.
