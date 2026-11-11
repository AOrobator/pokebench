# People not talked to

> Markdown twin of [untalked-people-header-v1.html](../untalked-people-header-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`untalked-people-header-v1` · observation · needs `harness-trust-v1` · default OFF · bundle arm only

The people ledger already says when each person on the map was last talked to, but as one line among about 60 in the readout. This switch puts the people not talked to since the latest story milestone in the short "Read from game memory, always true:" header at the top of every observe, press and navigate_to result.

## Why

Run 47c3 (s2479) showed "object 4, sprite WOMAN_4 … last talked to on turn 64 (… 5 story milestones since)" while standing in MAY's house, then left the room at turn 97. Runs that heard her line ("MAY went out to ROUTE 103") found MAY within 3–8 minutes; the rest took 11.5–68.6.

## The header, off and on

![The exact line untalked-people-header.test.ts asserts after a talk on turn 3 and a story milestone on turn 5.](untalked-people-header-v1/fig-1.svg)

*The exact line `untalked-people-header.test.ts` asserts after a talk on turn 3 and a story milestone on turn 5.*

## Rules

| Question | Answer |
|---|---|
| Who is listed | Every object the game has loaded on this map with a script, item balls excepted, in the people ledger's order |
| Talked to | The people ledger's rule (an A press facing them, or a page attributed to the faced sprite), plus the harness's own auto-talks |
| Story milestone | One the game observed this run; measurement-only milestones and ones present at the start do not count |
| Names | Sprite kind, unless character-presence-v1 places a story character on that tile ("object 4, MOM (sprite WOMAN_4)") |
| Nobody left | "… since your last story milestone: none." |
| Battles and other screens | No line |
| Instruction or place | None. It states who has not been talked to; it does not say to talk to them |

## Status

Default OFF in every preset and in the next-run defaults; not in any arm until the operator adds it. Registered as a pending experiment, not queued or approved. Unit and production-factory tests pass; the cloud review lanes and any measured runs have not happened yet.
