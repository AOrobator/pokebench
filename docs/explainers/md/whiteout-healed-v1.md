# Whiteout healed

> Markdown twin of [whiteout-healed-v1.html](../whiteout-healed-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`whiteout-healed-v1` · agent switch · bundle-only, default off · approved by the operator 2026-10-20 6:31 PM ET ("lets build it, bundle only")

In run `2026-10-20T16-14-34_qwen36-gpu1_c6c2` the model lost to MAY at turn 256 and whited out. The readout right after said `TORCHIC Lv5 HP 20/20`, yet for turns 257 to 263 its thinking planned to go to the POKéMON CENTER to heal TORCHIC before fighting MAY again. It noticed the full HP at turn 264. Nothing in the harness said that whiting out heals the party.

## What the game does

![The heal happens before the warp, so the first overworld state after the warp already shows the healed party. The switch reads that state; it never assumes the heal.](whiteout-healed-v1/fig-1.svg)

*The heal happens before the warp, so the first overworld state after the warp already shows the healed party. The switch reads that state; it never assumes the heal.*

## Part 1: the battle recap names the healed party

battle-loss-recap-v1 pins one recap line to every game result after a loss until the next story milestone. With this switch on, a recap for a whiteout goes on with the party as the first overworld state after the warp read it: every Pokémon except eggs, in party order, with HP and max HP from RAM.

**c6c2 turn 256, result seq 6924** (state 6922), recorded with the switch off:

Battle recap: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 256 and whited out; the game returned you to GREE's HOUSE 2F (map 1/1). The game shows MAY (trainer 535) has not been defeated.

The same result with the switch on (computed from the recorded events by the tests):

Battle recap: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 256 and whited out; the game returned you to GREE's HOUSE 2F (map 1/1). The game shows MAY (trainer 535) has not been defeated. Whiting out restored your whole party: TORCHIC 20/20 HP.

The clause is the same on every later result that carries this recap (turns 257 to 263 included), because it is what the state after that warp showed. The second whiteout in c6c2 (turn 277, state 7942) replaces it with its own party reading.

| State after the warp shows | Clause |
|---|---|
| Every Pokémon at max HP | `Whiting out restored your whole party: TORCHIC 20/20 HP, WURMPLE 15/15 HP.` |
| A Pokémon below max (should not happen) | `After whiting out, the game state showed your party: TORCHIC 20/20 HP, WURMPLE 9/15 HP.` |
| A Pokémon whose HP was not read | `After whiting out, the game state showed your party: TORCHIC HP not read.` |
| An egg in the party | left out of the list |
| No Pokémon read | no clause |
| A lost trainer battle with no whiteout | no clause |

## Part 2: the system prompt says it too

With trainer-heal-guidance-v1 on, its section has the only copy of the blackout sentence. The switch adds one clause before its period; nothing else in any prompt variant (full prompt, scene prompts, just-in-time guidance) changes.

If every Pokémon in your party faints, you black out: you lose half your money and wake up back at the last POKéMON CENTER you entered, or at home, far from where you were.

If every Pokémon in your party faints, you black out: you lose half your money and wake up back at the last POKéMON CENTER you entered, or at home, far from where you were, with your whole party healed.

## What stays the same

- blackout-readout-v1 already says "healed your party and halved your money" in its one-time notice. Unchanged.
- respawn-readout-v1's line ("If your party faints, you wake up … and lose half your money") is game-server text behind its own switch, and the supervisor heal warnings use a different blackout sentence. Both unchanged, to keep this switch small and agent-only.
- Off: the recap and the prompt are byte for byte today's. The tests replay every c6c2 recap with the switch off and compare it with the line the run recorded.

## Wiring

![Both parts read only the FeatureSet handed to the production factories. No game-server change and no new event.](whiteout-healed-v1/fig-2.svg)

*Both parts read only the FeatureSet handed to the production factories. No game-server change and no new event.*

## Status

Joins the bundle arm of `bundle-v-control` and `bundle-cook-1h`; a pending experiment entry is registered with no queue position. No measured runs yet.
