# Away note in town buildings

> Markdown twin of [away-note-buildings-v1.html](../away-note-buildings-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Switch `away-note-buildings-v1`. Default off; on in the bundle arm only. It needs `harness-trust-v1`. No measured runs yet, so no claim that it helps.

## What it fixes

With `harness-trust-v1`, a SUPERVISOR note follows the header when the player's own last two moves both took them farther from the place the Story goal line names. Farther is measured to the nearest way into that place: a door or a map edge on the current map, or the count of map changes in the game's map table.

Inside a building of that very place the note is wrong. A house's only way out is its front door into the town, so every step deeper into the house counts as walking away from the town, even when the game's own text sent the player there. Recorded cases:

| Run, seq | Arm | Map | Story goal line | Door distance |
|---|---|---|---|---|
| 6bc3, 1053 | bundle | RED's HOUSE 2F (map 1/1) | MOM: "Well, this is LITTLEROOT TOWN." | door at (7,1): 1 → 3 → 4 tiles |
| da1c, 1067 | control | RED's HOUSE 1F (map 1/0) | MOM: "Well, this is LITTLEROOT TOWN." | door at (8,8): 1 → 3 → 8 tiles |
| da1c, 14882 | control | RUSTBORO CITY GYM (map 11/3) | DAD: "Hm? Aren't you going to the POKéMON GYM in RUSTBORO CITY?" | door at (5,19): 0 → 11 → 18 tiles |

The house note fired in bundle runs 6bc3, 13bf, 4844, e0e6, f3b2 and 2e93. In 6bc3, MOM's lines on the house's 1F, earlier in the same scene, were "RED, your room is upstairs. Go check it out, dear!" and "Don't forget to set it!" (6bc3, seq 861). The gym note fired in control runs only (da1c, 4e9c, 83d7, 4f6f, 927e, d548). In the bundle, `gym-evidence-v1` already resolves DAD's line to the gym itself, so the player is inside the named place there.

## Which maps count as a building of the place

![Map ids, doors and connections are from the game's map table as the harness reads it (test-support/story-destinations-places.json). The player's house is shown with the player name of runs 6bc3 and da1c, RED. A highlighted map has no NORTH, SOUTH, EAST or WEST connection, and every door out of it, followed through other such maps, ends in the named place.](away-note-buildings-v1/fig-1.svg)

*Map ids, doors and connections are from the game's map table as the harness reads it (`test-support/story-destinations-places.json`). The player's house is shown with the player name of runs 6bc3 and da1c, RED. A highlighted map has no NORTH, SOUTH, EAST or WEST connection, and every door out of it, followed through other such maps, ends in the named place.*

The rule, as `buildingOf` in `harness-trust.ts` applies it to the current map:

| Check | If it fails |
|---|---|
| The current map is in the map table and is not the named place itself | not a building (the place itself already resets the count) |
| It has no NORTH, SOUTH, EAST or WEST connection | not a building: an outdoor map counts moves as before |
| Every door, followed through maps that also have no such connection, leads to the named place or to another such map | not a building if any door leads to another outdoor map or to a map the table does not list |
| At least one door reaches the named place | not a building (doors that never lead outside) |

The tests cover RED's HOUSE 1F and 2F for LITTLEROOT TOWN, RUSTBORO CITY GYM and RUSTBORO CITY DEVON CORP 3F for RUSTBORO CITY, ROUTE104 MR BRINEYS HOUSE for RUSTBORO CITY (not a building) and for ROUTE104 (a building). PETALBURG WOODS (map 24/11) also passes the rule for ROUTE104: it has no edge connection and its exits lead only to ROUTE104.

## The same three moves, off and on

![Positions, distances and the OFF text are from the recorded story_goal_away event at 6bc3 seq 1053 (text shortened with …). The ON result is what the test away-note-buildings.test.ts checks on the same shape of moves (house and gym: no note; MR BRINEYS HOUSE with a RUSTBORO CITY goal: the same notes as OFF).](away-note-buildings-v1/fig-2.svg)

*Positions, distances and the OFF text are from the recorded `story_goal_away` event at 6bc3 seq 1053 (text shortened with …). The ON result is what the test `away-note-buildings.test.ts` checks on the same shape of moves (house and gym: no note; MR BRINEYS HOUSE with a RUSTBORO CITY goal: the same notes as OFF).*

What does not change: the header, the Story goal line and the note's wording. The only difference in a run is that notes inside such buildings are missing, together with their `story_goal_away` events.

**Off:** the note counts moves on every map other than the named place, as today.

## Wiring

![The highlighted check is the only behavior change. It runs where the walk-away counter already resets on the named place itself.](away-note-buildings-v1/fig-3.svg)

*The highlighted check is the only behavior change. It runs where the walk-away counter already resets on the named place itself.*

## Status

- Tests: `packages/agent/src/away-note-buildings.test.ts` (the rule, the house and gym cases, MR BRINEYS HOUSE still counting, OFF parity, registry and production wiring).
- Default off; on in the bundle arm (`switches`) only. No measured runs yet, so no claim that it helps.
- Multi-model review and landing are pending.
