DEFAULT-OFF · BUNDLE ARM ONLY · REPLACES V1

# Semantic navigation v2

> Markdown twin of [semantic-navigation-v2.html](../semantic-navigation-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`semantic-navigation-v2` gives the model `navigate_to_target` and makes it the way to reach anything the readout lists: a person, an object, a door or stairs, another warp, or a walkable map exit. `navigate_to` stays for everything else. Version 1 added the tool but kept every prompt line pointing at coordinates, so the model almost never used it. Operator called that a bug, so v1 is now off everywhere and v2 takes its place in the bundle arm.

## Why v1 was not enough

Recorded probe, run f28d turn 443: Birch has just said to go see MAY, and she is on the same map. The same context was re-sampled 8 times with v1 on:

![8 samples: 7 navigate_to or press, 1 navigate_to_target with a wrong shape](semantic-navigation-v2/fig-1.svg)

The tool was offered but nothing told the model which argument a listed person takes. The prompt named navigate_to six times and navigate_to_target once.

## What the model reads: before and after

**Off (today)**

```
RIVAL_MAY_NORMAL id 2 at (10,3), elevation 3; A; conditional
- NORTH -> ROUTE103 (map 0/17), offset 0; walk off the map from any tile from (4,0) to (6,0): stand on one of these edge tiles and press UP
Story characters here (from this map's own object list): MAY at 10,3. …
```

```
- navigate_to: walks you to a tile on the current map. This is how you move …
Moving around: to go anywhere two or more tiles away on the current map, call navigate_to with that tile. …
- To talk to someone, target a free tile next to them, then press the direction that faces them and press A.
```

**On (v2)**

```
RIVAL_MAY_NORMAL id 2 at (10,3), elevation 3; A; conditional; navigate_to_target target {"kind":"object","local_id":2}
- NORTH -> ROUTE103 (map 0/17), offset 0; walk off the map from any tile from (4,0) to (6,0): stand on one of these edge tiles and press UP; navigate_to_target target {"kind":"connection","direction":"NORTH"}
Story characters here (from this map's own object list): MAY at 10,3 (navigate_to_target target {"kind":"object","local_id":2}). …
```

```
- navigate_to_target: walks you to a person, object, door, stairs, other warp or map exit that the readout lists with a navigate_to_target target, then talks to it, uses it or goes through it. …
- navigate_to: walks you to any other tile on the current map. …
Moving around: to reach a person, object, door, stairs, other warp or map exit that the readout lists with a navigate_to_target target, call navigate_to_target with that target …
```

Illustrative lines in the exact formats the code writes (map and ids are examples, not a recorded readout). Only targets the tool can tell apart and reach get an argument: a listed object by its local id; a warp that is the only warp on its tile; another interaction that is the only listed target on its tile; a walking connection that is the only one on its side and has walkable edge tiles. Exits cut off or across water get none.

## Every place navigation is mentioned

- **System prompt:** tool list (navigate_to_target first), the navigate_to_target section, the navigate_to section's rules, Moving around, dialogue auto-advance, Talk to people ("talking is cheap"), Exits you have not taken, the usage rule when Moving around is off, and the press reminder.
- **Tool descriptions:** navigate_to says it is for a plain tile; navigate_to_target says to copy the target after "navigate_to_target target".
- **Game server readout:** interaction candidates, map connections, story characters.
- **Harness lines:** untaken exits, the trust header's walkable exits and the Story goal's entrances, and the loop supervisor's "Listed here that you have not tried yet" (current map only).

## Results are handled like navigate_to's

![Result wrappers now include navigate_to_target and explore_map](semantic-navigation-v2/fig-2.svg)

With v1 these results skipped every wrapper, so a conversation opened by the tool was left on screen unread, and the Story goal and exits lines were missing. With v2 off, nothing here changes.

## Rules kept

- **No walkthroughs:** every target comes from the game's own lists (map objects, warp events, connections); no person, place or step is named by the harness.
- **Deterministic:** the arguments are exact copies of game identities; deterministic exploration runs with v2 the same way it ran with v1.
- **No truncation:** lines only gain a suffix; nothing is clipped.

## Status

- Bundle arm: `semantic-navigation-v2` and `deterministic-exploration-v1` on; control arm: both off. `semantic-navigation-v1` is off in both arms and in every preset.
- Pending experiment `semantic-navigation-v2` registered, not queued.
- Not yet measured: no claim that it helps until the bundle runs or the experiment says so.
