# Respawn readout (`respawn-readout-v1`)

Status: M1 RED. Part of `heal-respawn-sight` (M2 there). The operator approved the plan at 3:41 PM ET on 2026-10-20.
Shared design and evidence: the coordinator's `2026-10-20_heal-respawn-sight.md` (scratchpad). Worktree
`~/dev/pokebench-worktrees/respawn-readout-v1`, branch `claude/respawn-readout-v1`, from main 6c88d424.

## Problem

Run `2026-10-20T13-54-28_qwen36-gpu0_b300` never entered a POKéMON CENTER (`used_pokecenter 0`). It went
straight into the Rustboro Gym past the center door at (16,38), blacked out to HIKER MARC and woke up in its
bedroom in Littleroot, 9 map changes back. Nothing in the readout said where a blackout sends it.

## Game facts (pret/pokeemerald 731ad5b)

- `SaveBlock1.lastHealLocation` (+0x1C, `struct WarpData`: s8 mapGroup, s8 mapNum, s8 warpId, s16 x, s16 y),
  `include/global.h`. Set by `SetLastHealLocationWarp` (`src/overworld.c`) from `setrespawn`.
- Every `*_PokemonCenter_1F/scripts.inc` OnTransition runs `setrespawn HEAL_LOCATION_<TOWN>`; so does the truck
  intro (house 2F) and the Hall of Fame. The heal location is the town map tile below the center door
  (`src/data/heal_locations.json`, e.g. RUSTBORO CITY (16,39)), or the bedroom (house 2F (4,2)).
- `DoWhiteOut` (`src/overworld.c`): `SetMoney(money / 2)`, heal party, warp to lastHealLocation. The loss is
  `money - money / 2`; Emerald has no badge/level formula. No field text follows (`FieldCB_WarpExitFadeFromBlack`).
- Battle text: `sText_PlayerWhiteout` "is out of usable POKéMON!", `sText_PlayerWhiteout2` "whited out!".

## Design

A server readout line, default OFF, bundle only, placed right after `Money:`. On a started game, on the overworld
screen, out of battle:

`If your party faints, you wake up at your house in LITTLEROOT TOWN (9 map changes from here) and lose half your money (₽3222 of ₽6444).`

- Center respawn: `outside the POKéMON CENTER in RUSTBORO CITY` (the heal location is the tile below the door).
- Map changes: fewest changes over the ROM map table's warps and connections, both ways: a port of
  `hopsFrom` in `low-hp-trainer-warning.ts` (the server renders the readout, so it cannot call the TS).
  Counted to the map you wake on. `(on this map)` at 0; omitted when unreachable.
- Second sentence for each exit of this map (or this map) that is a POKéMON CENTER 1F whose heal location is not
  the saved one: "This town has a POKéMON CENTER you have not entered: RUSTBORO CITY POKEMON CENTER 1F at (16,38).
  Entering a POKéMON CENTER makes it the place you wake up if your party faints."
  "Entered" comes from what this server saw: centers it read the player standing in, plus the center behind every
  lastHealLocation it read. Only when the server saw the game from before the save existed is "not entered" claimed;
  otherwise (checkpoint start, re-render) the sentence says only that it is not where you wake up.
- No event: the line is an observation recorded with the readout; agent-observability asks for events for
  interventions and diagnostics. No timeline change.

## Milestones

- [ ] M1 RED: `env/tests/env/test_respawn_readout.py` (hops, heal kinds, wording, money rule, placement, OFF bytes,
      memory) + registry/preset tests.
- [ ] M1 GREEN: `env/pokebench_env/respawn.py`, GameState/read_game_state/readout/rerender/observation wiring,
      registry, presets, defaults.
- [ ] Explainer `docs/explainers/respawn-readout-v1.html`, FEATURE_EXPLAINERS, pending `experiments/respawn-readout.json`.
- [ ] b300 replay at state seqs 14716 (turn of seq 14724), 15196 (after seq 15195) and 15755 (turn of seq 15776).
- [ ] Gates, sync main, Claude + Grok review (2 rounds max).

## Session log

- 2026-10-20 ~4:00 PM ET: read brief, skills, game source. b300 raw RAM: lastHealLocation (1,1,-1,4,2) =
  BRENDANS HOUSE 2F at all three seqs; hops from RUSTBORO CITY 8, from the gym 9, in the bedroom 0 (house 1F
  is 8 from the gym: the brief's "8" counted the 1F).
- RED: `env/tests/env/test_respawn_readout.py` 27 failing against a stub `respawn.py` (heal points, map changes,
  reading, wording, money rule, memory, placement, OFF bytes, battle/off-field); `packages/agent/src/respawn-readout.test.ts`
  2 failing (registry, order).

## Surprises

- The brief's "8 map changes" from the gym counted the house 1F (heal-before-trainers' home). The respawn map is
  the 2F, 9 changes away. The line states 9.
- Emerald's blackout loss really is half (`DoWhiteOut`), not the later games' badge/level table.

## Multi-Model Review Log

## Boy Scout Log
