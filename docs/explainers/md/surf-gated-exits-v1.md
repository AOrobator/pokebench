Feature switch · observation · `surf-gated-exits-v1` · default OFF · bundle arm only · pending experiment

# Surf-gated exits

> Markdown twin of [surf-gated-exits-v1.html](../surf-gated-exits-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

An exit the player can reach only across water is not listed as an exit until the player can use Surf. The readout keeps the map fact, with a note saying it is across water.

## Why

Operator's rule: "For the exit lists, if an exit requires surf, but the user doesn't have the HM or the gym badge that enables surf, we shouldn't mark it as an exit."

Run `4caa` spent turns 198 to 597 on ROUTE103. 145 readouts said `Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)`, and 12 of its 19 supervisor briefings listed the same two. The model kept calling `navigate_to 79,8` and `navigate_to 45,6`. Both are across the route's water. The player had no badges and one TORCHIC (SCRATCH, GROWL, FOCUS ENERGY).

## What the game allows

![ROUTE103 reachability from (10,21)](surf-gated-exits-v1/fig-1.svg)

walkable from the player (238 tiles)surfable waterland reachable only across watersolidexit across waterwalkable exit

*ROUTE103 from the player's tile (10,21), read from 4caa's raw RAM at tool result 4770 (turn 198). On foot the player reaches 238 tiles; with water open, 640. Neither the cave mouth at (45,6) nor any of its neighbours, and none of the east edge tiles, is in the walkable set.*

Grounded in pret/pokeemerald 731ad5bf:

- `GetInteractedWaterScript` (field_control_avatar.c:448-452) starts Surf only when `FlagGet(FLAG_BADGE05_GET)` (the Balance Badge, SYSTEM_FLAGS + 0xB) and `PartyHasMonWithSurf()`.
- `PartyHasMonWithSurf` (field_player_avatar.c:1297) is true when a party Pokémon knows `MOVE_SURF` (57), checked only while the avatar is not already surfing (`PLAYER_AVATAR_FLAG_SURFING`, bit 3 of `gPlayerAvatar.flags` at 0x02037590).
- On foot, TILE_FLAG_SURFABLE water is refused (its elevation 1 mismatches land in `GetCollisionAtCoords`); a nonzero collision is impassable, except that a ledge (`MB_JUMP_*`) hops one tile on in its arrow direction.

## How the server decides

![Decision flow](surf-gated-exits-v1/fig-2.svg)

*A connection counts as across water when none of its walk-off edge tiles is reachable on foot but an edge tile crossable with water is. Elevation, one-way tiles and people are left out on purpose: each can only add walking room here, so a mistake keeps an exit listed.*

```
surf_gate (state JSON, present only with the switch), 4caa tool result 4770:
{"can_surf": false, "balance_badge": false, "party_surf": false, "surfing": false,
 "warps": [{"x": 45, "y": 6}], "connections": ["EAST"]}
```

## What the model reads

```
OFF (recorded, 4caa tool result 4770)
Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)
Warp to ALTERING CAVE (map 24/106) at (45,6), elevation 0; movement; activation depends on metatile (see local map); conditional; destination ALTERING CAVE (map 24/106) warp 0
- EAST -> ROUTE110 (map 0/25), offset -60; walk off the map from any tile from (79,7) to (79,11): stand on one of these edge tiles and press RIGHT
Warp destination at (45,6): ALTERING CAVE
```

```
ON (re-rendered on the real ROM from the same RAM; the exits line replayed through the agent)
Exits here you have not taken: none (you have taken every exit you can walk to on this map this run)
Warp to ALTERING CAVE (map 24/106) at (45,6), elevation 0; movement; activation depends on metatile (see local map); conditional; destination ALTERING CAVE (map 24/106) warp 0; not an exit you can use now: every way from where you stand to it crosses water, and Surf needs the Balance Badge and a party Pokémon that knows SURF (you have neither)
- EAST -> ROUTE110 (map 0/25), offset -60; not an exit you can use now: every way from where you stand to this edge crosses water, and Surf needs the Balance Badge and a party Pokémon that knows SURF (you have neither)
Warp destination at (45,6): ALTERING CAVE (not an exit you can use now: across water, needs Surf)
```

*Exit lists drop the exit, as Operator asked. The readout's map facts keep it with a note: deleting the east connection would make the readout say the map has no east edge, which is false too. The walk-off instruction is replaced, because it is the lure. Nothing else in the readout changes.*

```
OFF (recorded stall briefing, 4caa seq 6219)
- Exits to maps you have not entered since your last story progress: ROUTE103 (map 0/18): Warp to ALTERING CAVE (map 24/106) at 45,6; SOUTH edge -> OLDALE TOWN (map 0/10); EAST edge -> ROUTE110 (map 0/25)
- Ways off this map across its edge (the game's map connections): SOUTH -> OLDALE TOWN (map 0/10): stand on any tile from (8,21) to (11,21) and press DOWN; EAST -> ROUTE110 (map 0/25): stand on any tile from (79,7) to (79,11) and press RIGHT
```

```
ON (the same events replayed)
- Exits to maps you have not entered since your last story progress: ROUTE103 (map 0/18): SOUTH edge -> OLDALE TOWN (map 0/10)
- Ways off this map across its edge (the game's map connections): SOUTH -> OLDALE TOWN (map 0/10): stand on any tile from (8,21) to (11,21) and press DOWN
```

*The briefing lists "Listed here that you have not tried yet" and "Not tried yet on other maps" drop such a warp the same way. With only exits across water left, the untaken-exits line reads "none you can walk to (every exit listed on this map is across water, and you cannot use Surf yet)".*

Once Surf can be used (Balance Badge and a party Pokémon with SURF, or already surfing) every list and line reads as it does with the switch OFF. When a value that could make Surf usable could not be read (a party Pokémon's moves, the badge flags or the surfing state), `can_surf` is null and nothing is hidden.

## Measured on recorded runs

| Run | Readouts that change | Exits lines that change | Briefings naming the two exits |
|---|---|---|---|
| 4caa | 145 | 145 | 12 of 19 |
| 8b01 | 149 | 149 | 16 of 27 |
| 230d | 145 | 145 | 10 of 15 |
| 7ccf | 47 | 47 | 5 of 36 |
| sh02, 54a7, e588, 7a95 (untaken exits off) | 172, 123, 97, 47 | 0 | 0, 2, 0, 1 |

False drops: the gate was recomputed from raw RAM at every distinct tile 108 runs from 2026-10-1x stood on (132,319 overworld states, 11,767 distinct tiles). The only exits it ever marked as across water were ROUTE103's cave and east edge, and no run ever walked from a map straight into an exit the gate had marked. No other field move (Cut, Rock Smash, Strength) showed the same lure in these runs, so only Surf is gated.

## Wiring

- Registry: `packages/agent/src/features.ts` (observation, no dependency, last in the run record), a server switch in `SERVER_FEATURES` and `env/pokebench_env/readout.py`, default off in presets and the viewer's next run.
- Server: `env/pokebench_env/surf_gate.py`, read in `game_state.read_game_state` through `rerender.read_state`; notes in `readout.format_readout`.
- Agent: `packages/agent/src/surf-gate.ts`, used by `untaken-exits.ts` and `loop-supervisor.ts` (stall briefing, loop guard and text-only supervisor).

## Status

Bundle arm only (operator change, 2:53 PM New York, 2026-10-16), default off, registered as a pending experiment in `experiments/surf-gated-exits.json`, not queued. Tests, coverage and lint pass; the cloud review loop is recorded in the worklog. No measured runs yet.
