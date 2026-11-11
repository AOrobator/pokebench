# Post-battle readout

> Markdown twin of [post-battle-readout-v1.html](../post-battle-readout-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`post-battle-readout-v1` · observation · game server · needs `battle-details-v2` · default OFF · proposed for the bundle arm

Two readout fixes around move learning. On the evolution or summary screen after a battle, the battle block says the battle has ended and shows the POKéMON as it is now, from the party. In battle, a ready learn-move YES/NO box becomes the Interface line instead of "input not ready".

## What went wrong

In bundle run `2026-10-21T13-33-54_qwen36-gpu0_ea04`:

- On the evolution screen, after TORCHIC had become COMBUSKEN and DOUBLE KICK had replaced SCRATCH, the battle block still read `You TORCHIC` and `Your moves … 1 SCRATCH` (seq 20991). It reads the battle's own copy of the POKéMON, which the game stops updating once the battle is over.
- In battle, the Interface line said `battle_resolving; input not ready` while the game's learn-move YES/NO box was open and waiting (seq 20256).

## Where each line comes from

![Applies only on the evolution, pokemon_summary or summary screen while the battle is finishing. The party member is matched to the battler by identity; with no match the battle copy is kept, and a matched member that cannot be read gives a visible HARNESS BUG line instead of a guess.](post-battle-readout-v1/fig-1.svg)

*Applies only on the evolution, pokemon_summary or summary screen while the battle is finishing. The party member is matched to the battler by identity; with no match the battle copy is kept, and a matched member that cannot be read gives a visible `HARNESS BUG` line instead of a guess.*

## What the model sees: after the battle

Readout of the test state built from ea04 seq 20991 (evolution screen, battle finishing, COMBUSKEN with DOUBLE KICK in the party, battle copy still TORCHIC with SCRATCH). OFF, exactly as pinned in `env/tests/env/fixtures/post_battle_off.json`:

```
Interface: evolution_move_learning; input ready; A or B advances the waiting move-learning text; inspect the next choice
Battle details: TRAINER single · turn 2 · finishing (outcome won)
Foe NINCADA Lv8 · BUG/GROUND · HP 0/23 · …
Actions (2×2 FIGHT BAG / POKéMON RUN; menu not open): FIGHT · BAG allowed — bag empty · …
You TORCHIC Lv16 · FIRE · HP 36/41 · status OK · ability BLAZE · …
Your moves (2×2 1 2 / 3 4; menu not open):
  1 SCRATCH NORMAL physical pow 40 acc 100 PP 34/35
  2 GROWL NORMAL status acc 100 PP 40/40
  3 FOCUS ENERGY NORMAL status never misses PP 30/30
  4 EMBER FIRE special pow 40 acc 100 PP 20/25
```

ON, the same state:

```
Interface: evolution_move_learning; input ready; A or B advances the waiting move-learning text; inspect the next choice
Battle details: TRAINER single · turn 2 · ended (outcome won)
Foe NINCADA Lv8 · BUG/GROUND · HP 0/23 · …
You COMBUSKEN Lv16 · FIRE/FIGHTING · HP 41/46 · status OK (from the party; the battle has ended)
Your moves (from the party; the battle has ended):
  1 DOUBLE KICK FIGHTING physical pow 30 acc 100 PP 30/30
  2 GROWL NORMAL status acc 100 PP 40/40
  3 FOCUS ENERGY NORMAL status never misses PP 30/30
  4 EMBER FIRE special pow 40 acc 100 PP 20/25
```

The Party block and the rest of the readout are the same in both.

## What the model sees: the learn-move box in battle

Test state built from ea04 seq 20256 (battle, learn_move box ready, YES highlighted).

|  | Interface line |
|---|---|
| OFF | `Interface: battle_resolving; input not ready; Use the game-owned battle input and selected control when ready` |
| ON | `Interface: learn_move; input ready; selected YES; UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO` |

The same for the `stop_learning_move` box. A box that is not ready, or another YES/NO box, keeps the battle Interface line. Mid-battle (battle still resolving) and states without battle details read byte for byte as OFF.

## Wiring

Applied by the game server: registered in `SERVER_FEATURES` in `packages/agent/src/features.ts` and `env/pokebench_env/readout.py`, and on the Python default-off list. `battle_details_lines(…, ended=)` writes the ended lines; `_learn_box_interface` replaces the Interface line.

## Status

- RED 9cedd233c, GREEN 5fa06e15e. Not merged into main.
- Default OFF. ON in the bundle arm only of the fixed bundles (the operator, 2026-10-21 10:44 PM ET).
- Tests: `env/tests/env/test_post_battle_readout.py` (OFF golden written before the switch existed). Multi-model review: not run yet.
- Not measured in runs. Pending experiment: `experiments/post-battle-readout-v1.json`.
