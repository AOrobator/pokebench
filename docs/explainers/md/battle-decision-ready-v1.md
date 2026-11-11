POKéBENCH · SHARED HARNESS REPAIR

# A battle decision starts at a decision screen.

> Markdown twin of [battle-decision-ready-v1.html](../battle-decision-ready-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The harness dismisses ordinary battle messages before asking the model what to do. The model still chooses every move, item, switch and answer. The latest settled observation stays available through retries and non-game tool calls until a newer game observation replaces it.

## The failure with the switch OFF

Encounter message<br>
Waiting for A or B

→

battle_action<br>
Refused; nothing changes

↻

A repeated request can encounter the same waiting message indefinitely. Existing post-action auto-advance deliberately skips refused calls.

## With battle-decision-ready-v1 ON

Before model request<br>
Read fresh state

→

Ordinary message: B<br>
Animation: wait

→

Real choice: stop<br>
Show final screen + text

At battle_action entry, the same driver settles any remaining non-choice text before validating the requested action against fresh state. Automatic B presses and pages have their own recorded receipt. If an intervening choice, battle end, unknown state or cap is reached, the queued action is not executed.

## Choices stay with the model

Stop at FIGHT / BAG / POKéMON / RUN, move and target menus, YES/NO questions, move-learning questions, the bag, party and naming screens. Never blindly press until FIGHT appears.

The existing driver limits each settling operation to 50 automatic presses and 90 seconds. It returns after three consecutive busy waits, each bounded at 600 emulated frames. A cap is reported; it does not authorize the requested move.

## Game evidence and comparison

Emerald source `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`: `src/text.c`, `TextPrinterWait` and `TextPrinterWaitWithDownArrow` accept A or B for ordinary waiting text. The existing native battle classifier identifies message, animation, input, prompt and screen ownership.

The switch defaults OFF for omitted and legacy presets. The operator explicitly requested it ON in both control and bundle in `bundle-v-control`. It is a shared repair, so the bundle comparison does not estimate this repair's individual effect. Historical runs retain their original configuration.

Status: implementation and regression verification underway; independent review, landing and live proof pending. No measured trial launched.
