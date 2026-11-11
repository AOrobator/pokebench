# Story goal: player name

> Markdown twin of [story-goal-player-name-v1.html](../story-goal-player-name-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`story-goal-player-name-v1` · observation · default OFF · bundle arm only

When a story line says "He lives…" or "She lives…", the harness looks for the one story character named earlier in the conversation and points the Story goal at that character's house. With this switch on, the player's own name is never one of those candidates.

## What went wrong in e9ee

Run `2026-10-21T01-16-23_glm53-mac_e9ee` kept the default player name BRENDAN. BRENDAN is also a story character in the harness's list. When MOM said "He lives right next door" (seq 1628), two characters had been named before it: BRENDAN (the game prints the player's name there) and PROF. BIRCH. "He" was not resolved, and the Story goal kept MOM's older PETALBURG GYM line for 24 tool results (seq 1630 to 3812). Run `…_acfa`, with the player named ASH, resolved the same pages to Birch's house (seq 1536).

![Recorded pages and outcomes. The page text is e9ee's, word for word; the OFF and ON lines are what story-goal-player-name.test.ts asserts for those pages with the player named BRENDAN.](story-goal-player-name-v1/fig-1.svg)

*Recorded pages and outcomes. The page text is e9ee's, word for word; the OFF and ON lines are what `story-goal-player-name.test.ts` asserts for those pages with the player named BRENDAN.*

## The rule

- Only "He lives" and "She lives" lines change. The player's name comes from the readout's Player line (`name` in the state), the same name the game prints in place of the player.
- With the player's name dropped, exactly one remaining candidate resolves the line. Two or more still say "not resolved". In the test, "WALLY and STEVEN came by. He lives right next door." stays "He could be WALLY or STEVEN" with the switch on.
- An empty or unread player name drops nothing.
- A player name that is no story character changes nothing either way. Under ASH (acfa) both OFF and ON resolve to PROF. BIRCH'S HOUSE 1F.

The exact ON block on the Littleroot readout, from the test:

```
Latest story line naming a place (turn 33, MOM): "He lives right next door, so you should go over and introduce yourself."
- "He lives" (He = PROF. BIRCH, the one story character named before it in this conversation) = PROF. BIRCH'S HOUSE 1F (map 1/2). Way in: door on this map at (14,8).
```

## Where the switch is read

![Wiring. Both the story block and the harness-trust-v1 Story goal line build the same StoryDestinations; the highlighted box is the one place behavior changes.](story-goal-player-name-v1/fig-2.svg)

*Wiring. Both the story block and the harness-trust-v1 Story goal line build the same `StoryDestinations`; the highlighted box is the one place behavior changes.*

## OFF and ON

|  | OFF (before) | ON |
|---|---|---|
| Candidates for "He/She lives" | Every story character named earlier in the conversation, the player's own name included | The same, minus the readout's Player name |
| e9ee, BRENDAN | Not resolved; Story goal kept the PETALBURG GYM line | PROF. BIRCH'S HOUSE 1F, door (14,8) |
| acfa, ASH | PROF. BIRCH'S HOUSE 1F | Unchanged |

## Status

- Commit bc5565aaf (M1 GREEN). Not yet merged into main.
- Default OFF. Not in any bundle yet; that waits for the operator's OK.
- Tests: `packages/agent/src/story-goal-player-name.test.ts` (e9ee's pages, ASH case, two-name case, harness-trust line, both factories). Review round 1: Claude, Grok and GPT lanes LGTM.
- Not yet measured in runs. The ASH case reuses e9ee's pages with the name swapped, not acfa's own recording.
