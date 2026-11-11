dialogue-a-line-v1 · guidance · on in both arms · default off

# Dialogue A line

> Markdown twin of [dialogue-a-line-v1.html](../dialogue-a-line-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

B is the button for a message. A still talks to whatever the player faces, so walking away instead of pressing A skips a person who is in the way.

## The rule that was wrong

The dialogue section ended by telling the model to leave instead of pressing A in front of what it had just read. That was written for signs, where a second A only repeats the same line, and it generalizes to people: in the 24h run of 2026-11-01, turn 354 stood one tile west of a person who blocked the only corridor east, bumped the wall with RIGHT instead of pressing A, and concluded it was stuck. It made no further milestone for eleven hours. The one action it never tried was A on that person.

![A starts the facing object, B advances or closes](dialogue-a-line-v1/fig-1.svg)

*Off, the dialogue section and the talking paragraph keep their previous words, byte for byte. On, the same facts are stated without the leave rule.*

## The two sections

On, the dialogue section scopes the anti-A rule to a message already read and says A is how you talk to a person or read a sign. The talking paragraph keeps navigate_to_target as the preferred way when the readout gives the person a target, and adds the case where it gives none: face the person and press A. Neither names a character, place, or story step.

Dialogue button: B is the button for a message. Press B to advance or close one. A talks to whatever you face and starts that sign's or person's message again. Do not press A to advance a message, or press it again on a message you have already read. To talk to a person or read a sign, press A once on it.

Talking is cheap: when the readout gives the person a navigate_to_target target, call navigate_to_target with it; it walks there, faces them and presses A, and the harness reads the conversation until your next decision. When it gives none, face the person and press A.

## Status

Default off, so every earlier preset and every recorded prompt reproduces its own bytes. On in both arms of `current`: control and bundle both carry `dialogue-a-line-v1` in the recipe's features. Off, nothing changes; the section and the talking paragraph are the ones the previous runs recorded.
