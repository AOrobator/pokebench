dialog-button-b-v1 · guidance · bundle arm only · default off

# Dialogue button B

> Markdown twin of [dialog-button-b-v1.html](../dialog-button-b-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

B moves a message along. A, on the field, talks to whatever the player is facing, so the same sign or person starts again.

## What the buttons do

On the field, A is the button that starts the script of the object in front of the player. B does not start that script. While a message is up, A or B advances it, and the harness already presses B to read dialogue through. The model was still pressing A once the field was free, which started the sign again.

![A starts the facing object, B advances or closes](dialog-button-b-v1/fig-1.svg)

*The prompt tells the model which button is for a message. It does not rewrite a chosen A into a B.*

## The section

When the switch is on, this is added to the system prompt, just before the trust order. It names no character, place, or story step.

![Prompt order: dialogue button, then trust](dialog-button-b-v1/fig-2.svg)

*Off, the prompt is unchanged. On, only this section is inserted, and the trust order stays the last thing the prompt says.*

Dialogue button: B is the button for a message. Press B to advance or close one. Do not press A to move a message along: A talks to whatever you face and starts its message again, so the same sign or person speaks once more. Once you can walk, leave instead of pressing A in front of it.

## Status

Default off. On in the bundle arm of `bundle-v-control`, off in the control arm. Pending experiment `dialog-button-b`, not queued and not measured on its own. The cook already running keeps the build it started on; this switch does not change it.
