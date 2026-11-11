# Story-character stall gate

> Markdown twin of [story-character-stall-gate-v1.html](../story-character-stall-gate-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`story-character-stall-gate-v1` · guard · bundle arm only · default off · needs `stall-briefing-v1`

The loop guard should do no harm. In the 6h-v2 bundle (`…gpu1_f28d`) the player was on Route 103 with MAY at (10,3), the next story step. At turn 450 a loop-guard note listed the way south, and at 452 a 5-minute stall briefing fired. At turn 455 the model wrote "I am looping on ROUTE103 and need to leave" and walked away. The rival battle came 299 minutes later.

## Route 103, turns 414–455

![Positions from the recorded results (sketch, not to scale). navigate_to refused (10,4) four times: no route inside the 15×15 window it plans over, because the ledges cut the upper area off.](story-character-stall-gate-v1/fig-1.svg)

*Positions from the recorded results (sketch, not to scale). navigate_to refused (10,4) four times: no route inside the 15×15 window it plans over, because the ledges cut the upper area off.*

## The turn 450 note, off and on

\- Untried targets already shown here (up to 3; not a route recommendation): BOY_1 at 19,11 (A); Sign text "ROUTE 103 | ↓ OLDALE TOWN" at 11,9 (A) - Ways off this map across its edge (the game's map connections): SOUTH -&gt; OLDALE TOWN (map 0/10): stand on any tile from (8,21) to (11,21) and press DOWN

\- Untried targets already shown here (up to 3; not a route recommendation): BOY_1 at 19,11 (A); Sign text "ROUTE 103 | ↓ OLDALE TOWN" at 11,9 (A) - Story characters on this map you have not talked to since your last story milestone: MAY at 10,3 (out of view; where the map places this character, it may have moved)

Both are the real note rebuilt from the recorded events (test `stall-gate.test.ts`). The GPU queue's probe at turn 451 (8 samples a side): as recorded 4 of 8 left the route; with the note removed 0 of 8; with only the ways-off line removed 1 of 8.

## The rule

| While this holds | What changes |
|---|---|
| A story character the readout's own *Story characters* line places on this map has not been talked to since the latest story milestone | A due map back-and-forth or milestone-drought briefing waits (recorded once as `stall_gate`). Supervisor notes leave out the ways off the map (edge line, exits to maps not entered, untried targets on other maps) and list the untalked characters. |
| The player's latest step on this map went toward a story character the line places on a tile |  |
| Always, when the switch is on | A navigate_to counts its target as tried only when the walk ended on it or next to it, so a refused or partial walk toward MAY leaves her untried. |

Talked to means the people ledger's rule (the first page of an auto-advanced conversation came from facing that character after an A press, or from the faced sprite), a page spoken under the character's name, or a stage-3 auto-talk of the fixed-point breaker. A result without the line (a battle) keeps the last one; leaving the map ends it. Interface-dwell briefings are unchanged, and the briefing goes out at the next check once neither condition holds.

## Off

Stall briefings go out as soon as they are due, supervisor notes list the ways off the map, and a navigate_to tries its target tile whatever it reached.

## Status

Tests on real f28d events (turns 383–455) plus unit cases; wiring deletions go red. Decision probes at turns 451 and 453 (16 samples a side) go through the GPU queue. Not yet reviewed or measured.
