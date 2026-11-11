Feature switch · observation · `tutorial-party-owner-v1` · default OFF · bundle arm only · pending experiment

# Tutorial party owner

> Markdown twin of [tutorial-party-owner-v1.html](../tutorial-party-owner-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

In Norman's Wally scene the readout shows the ZIGZAGOON the game lends the player, and a party whose owner cannot be established no longer makes the agent throw away the whole observation.

## Why

Run dc5a (T687-885, about 5 minutes) and f551 (T566-586): every observe, press and navigate_to in Petalburg Gym returned only `malformed /pokebench/observation payload`. The game server sent `party_owner: "unknown"`, which the agent's state schema does not allow (`player | tutorial | rental`), so the agent rejected the whole state. In the tutorial battle (93eb seq 16529) the party read `UNKNOWN LvNone`.

Cause: `LoadWallyZigzagoon` builds the ZIGZAGOON with `CreateMon` (TACKLE, GROWL, TAIL WHIP at full PP), then sets moves 2-4 to MOVE_NONE without clearing their PP. The decoder treated a PP on an empty slot as corruption.

## What the model reads

```
OFF, dc5a raw 10618 (the state the agent rejected)
Party (unknown): UNKNOWN LvNone HP None/None · HARNESS BUG: harness bug: Pokémon invalid move or PP
state JSON: party_owner "unknown"  -> agent: malformed payload
```

```
ON, dc5a raw 10618
Party (tutorial): ZIGZAGOON Lv7 HP 23/23 · moves TACKLE PP 35 · nickname ZIGZAGOON
state JSON: party_owner "tutorial" (source native_wally_tutorial_script)
```

```
OFF, 93eb seq 16529 (tutorial battle)
Party (tutorial): UNKNOWN LvNone HP None/None · HARNESS BUG: harness bug: Pokémon invalid move or PP
```

```
ON, 93eb seq 16529
Party (tutorial): ZIGZAGOON Lv7 HP 24/24 · moves TACKLE PP 33 · nickname ZIGZAGOON
```

*Recorded RAM re-rendered on the real ROM with the switch off and on (env/tests/env/test_readout_truth_fixes.py). The original party-only comparison is shown here. The October 19 repair below also restores battle details.*

## How it decides

![decision flow](tutorial-party-owner-v1/fig-1.svg)

*ON keeps every other check (move ids below 355, PP at most 64, a real move's PP within its maximum). If ownership still cannot be established, the readout says `Party (unknown)` and the state leaves out the optional `party_owner` field; `party_ownership` keeps the reason, and the agent keeps the observation.*

## Game grounding (pret/pokeemerald 731ad5bf, US ROM f3ae0881)

| Fact | Source | Value |
|---|---|---|
| Zigzagoon built | `LoadWallyZigzagoon` (src/field_specials.c:1423-1435) | CreateMon(SPECIES_ZIGZAGOON, 7), MOVE1 TACKLE, MOVE2-4 MOVE_NONE |
| Party | `gPlayerParty` 0x020244EC, slot 0 | species 288, Lv7, HP 23/23 (dc5a) |
| Saved original party | SaveBlock1 + 0x234 / + 0x238 | TORCHIC b7441706:761f35ea |

## Limits

- An owner that cannot be established still reads `Party (unknown)`; the switch only stops the agent losing the observation.
- The October 19 extension threads the same switch through the battle reader, active UI and native action journal; unrelated menu decoders retain their contracts.

## Status

Original party repair: October 17 top-50 audit. Current battle-coverage candidate: a working branch, worklog `docs/worklogs/active/2026-10-19_wally-battle-readout.md`. Existing server switch, default off; experiment pending. Correctness tests and native archive readback are separate from cloud review, main landing and measured benefit.

## Battle decoder coverage repair · October 19

The same switch now reaches the battle reader and active UI reader. The native Wally tutorial flag, player-side ZIGZAGOON at level 7 and TACKLE followed by three empty slots qualify the retained PP exception. Ordinary battles and invalid PP still fail validation.

Verified archive: round 1 whole-map, turn 47, state 971, raw archive 886. Its move IDs are 33, 0, 0, 0 and PP bytes 35, 40, 30, 0. Empty slots stay empty in observations. When no player choice is waiting, the active UI says the game controls the tutorial.

Source: pret/pokeemerald 731ad5bf, LoadWallyZigzagoon and Wally battle controller. OFF retains the original battle decoder error. This repair establishes observation correctness; it does not establish runtime or milestone-speed recovery.
