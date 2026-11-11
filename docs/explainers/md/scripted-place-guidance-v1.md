POKEBENCH · GUIDANCE SWITCH · DEFAULT OFF

# The scripted Gym tour names a real destination.

> Markdown twin of [scripted-place-guidance-v1.html](../scripted-place-guidance-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Pokémon Emerald forces a boy to lead the player to Petalburg Gym. The switch recognizes only that source-defined conversation and lets the existing story destination block retain its exact Gym line.

## Evidence path

**Game-owned script**

The same call contains “Hiya! … A rookie TRAINER?” and the Gym-sign explanation on Petalburg City.

→

**Resolved destination**

“See? This is PETALBURG CITY's GYM.” resolves to Petalburg City Gym and its door at `(15,8)`.

## OFF versus ON

**OFF · previous behavior**

The unnamed scripted speaker is outside the story-character destination stream, so no Gym goal is retained.

→

**ON · exact exception**

Only the complete forced conversation is eligible. Arbitrary unnamed dialogue, signs, and generic place mentions remain excluded.

## Boundaries

This does not move the player, infer hidden story state, or broaden generic dialogue parsing. It supplies the exact place to the existing story-destination or harness-trust display when that consumer is enabled, and uses the ROM-derived map table for the door.
