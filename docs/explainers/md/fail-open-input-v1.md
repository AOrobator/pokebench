# Fail-open input

> Markdown twin of [fail-open-input-v1.html](../fail-open-input-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`fail-open-input-v1` · agent switch · bundle-only, default off

Operator, 2026-10-20: a fail-open design for boxes or UI the harness does not recognize, so the model decides from what is on screen, and B can dismiss them. Before this switch, when the automatic text advance stopped on a hold it could not name, the rest of the model's batch was dropped.

## Which stops fail open

![Only the stops that mean "the harness waited and could not tell what the game wants" fail open. A recognized decision point still stops the batch, so a YES/NO box or menu is never answered by inputs typed before the model saw it.](fail-open-input-v1/fig-1.svg)

*Only the stops that mean "the harness waited and could not tell what the game wants" fail open. A recognized decision point still stops the batch, so a YES/NO box or menu is never answered by inputs typed before the model saw it.*

## What the model reads

OFF the harness took over the battle text; 1 remaining input not sent: A.

ON The harness does not recognize what the game is waiting for, so it sent the rest of your inputs as you asked: A. Decide from the screen what they did.

The inputs are sent one at a time through the same press path, so each gets its own press result, and the recorded `dialogue_auto_advance` event lists them as sent, not dropped. B in the batch is sent the same way, so B can dismiss a box the harness does not know.

## Evidence

Run c6c2 pressed `[DOWN, A]` 19 times on the post-catch nickname box (turns 376–411). Each time DOWN went through, the battle advance waited 3 × 600 frames (`battle_busy`) and the A was dropped. The test fixture is the recorded level-up box from run 54a7 with `levelup-box-v1` off, which is the same kind of unrecognized battle hold.

## Status

Tests in `packages/agent/src/levelup-box.test.ts` (ON sends A and B after the hold, OFF drops, a recognized stop still drops, registry). Pending experiment `experiments/fail-open-input-v1.json`; no measured runs yet.
