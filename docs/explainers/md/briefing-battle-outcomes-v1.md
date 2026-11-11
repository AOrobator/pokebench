Harness switch · briefing-battle-outcomes-v1 · guard · default off, meant ON in both arms

# Briefing battle outcomes

> Markdown twin of [briefing-battle-outcomes-v1.html](../briefing-battle-outcomes-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The supervisor briefings now say whether the last battle against a story character was won or lost, and whether the player whited out, from recorded game state.

## What it fixes

In run 54a7 the model lost to MAY on ROUTE103 at turn 371 (TORCHIC at 3/21 HP), whited out and woke in its house. The stall briefings at T418 and T484 then said only "Last story progress: route 103 at turn 347". Nothing in them said a story battle had been lost. This switch is a briefing bug fix: it is meant ON in both arms, like transition-loop-detection-v1.

![Turns of run 54a7 with the last story progress, the lost battle and the briefings](briefing-battle-outcomes-v1/fig-1.svg)

*Run 54a7. The four briefings after T371 gain the loss and the whiteout. Before T371 the lines say none were recorded.*

## Before and after (54a7, stall briefing seq 11729, T484)

OFF (the recorded message, first lines):

```
SUPERVISOR: You are stalling. There has been no new story milestone for 15 minutes of play, and the game is not moving forward (stall briefing, 484 calls into the run). What you have been trying is not working, so do not try it again.
Stop and get your bearings:
- Where you are: OLDALE TOWN (map 0/10) at 1,10 facing right
- Last story progress: route 103 at turn 347 (137 turns ago)
- Characters the readout names here: MANIAC at 1,11
- Story steps the game confirms are done: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met; sent to save Birch; Birch rescue complete; Birch starter handoff complete
```

ON (the two added lines are highlighted; the rest is byte-identical):

```
SUPERVISOR: You are stalling. There has been no new story milestone for 15 minutes of play, and the game is not moving forward (stall briefing, 484 calls into the run). What you have been trying is not working, so do not try it again.
Stop and get your bearings:
- Where you are: OLDALE TOWN (map 0/10) at 1,10 facing right
- Last story progress: route 103 at turn 347 (137 turns ago)
- Latest battle against a story character: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371
- Latest whiteout: at turn 371, after losing to MAY (trainer 535) on ROUTE103 (map 0/18); the game returned you to GREE's HOUSE 2F (map 1/1)
- Characters the readout names here: MANIAC at 1,11
- Story steps the game confirms are done: player name confirmed; Mom clock instruction received; clock set; Mom rival instruction received; rival met; sent to save Birch; Birch rescue complete; Birch starter handoff complete
```

## Where the facts come from

- **Outcome**: `battle.outcome` as the game wrote it (`gBattleOutcome`; 54a7 state seq 8967 reads "lost", code 2). When no recorded state caught the outcome, a blackout means lost; otherwise a trainer battle is a win only when that trainer's defeated flag read unset during the battle and reads set afterwards (pokeemerald sets it only when the player was not defeated); otherwise the line says the outcome was not read.
- **Who**: `trainer_opponent` (measurement `trainer-opponent-v1`, below). A story character is a trainer whose ROM name is in the character-presence list (PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN).
- **Whiteout**: a lost or drawn battle followed by the overworld on another map; the place is the room name the readout uses (displayed names: GREE's HOUSE 2F).
- Reused, not duplicated: `RIVAL_BATTLE_STARTED` / `RIVAL_BATTLE_DEFEATED` (route103-rival-splits-v1) stay measurement-only milestones and are not counted as story progress. They name no trainer and cover only the Route 103 rival, so the briefing reads the general reading.

## trainer-opponent-v1 (measurement)

Every state records the trainer the game last set up a battle against. pokeemerald 731ad5bf: `gTrainerBattleOpponent_A` (0x02038BCA, the address route103_rival.py already verified) is set by the trainerbattle command and reset only by trainer_see.c, so it still names the opponent after the battle and the whiteout. Its `gTrainers` entry (ROM 0x08310030, 0x28 bytes; class at +1, `trainerName` at +4) was checked on the real ROM against opponents.h: 1 SAWYER, 265 ROXANNE, 520 BRENDAN, 529 and 535 MAY. The defeated flag is `TRAINER_FLAGS_START + id`. The readout text and the loop guard do not read it. 54a7 and sh02 predate it, so their replays use the same reading reparsed offline from each state's own raw RAM archive.

```
{"trainer_id": 535, "trainer_class": 50, "name": "MAY", "defeated": false, "battle_active": true}
```

![Wiring from recorded state events to the briefing lines](briefing-battle-outcomes-v1/fig-2.svg)

*Only the green box is new behaviour. The switch is read once, in the SupervisorBriefing constructor, from the run's FeatureSet.*

## Every supervisor note on the two runs

OFF must equal the recorded message; ON adds two lines. 22 of 22 notes reproduce byte for byte with the switch off.

| seq | turn | kind | OFF identical | story battle line | whiteout line |
|---|---|---|---|---|---|
| 2491 | T114 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 2746 | T125 | ineffective | yes | none recorded in this run | none recorded in this run |
| 3091 | T143 | map_cycle | yes | none recorded in this run | none recorded in this run |
| 5243 | T216 | ineffective | yes | none recorded in this run | none recorded in this run |
| 6785 | T277 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 8157 | T343 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 8827 | T366 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 10226 | T418 | milestone_drought | yes | you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371 | at turn 371, after losing to MAY (trainer 535) on ROUTE103 (map 0/18); the game returned you to GREE's HOUSE 2F (map 1/1) |
| 11729 | T484 | milestone_drought | yes | you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371 | at turn 371, after losing to MAY (trainer 535) on ROUTE103 (map 0/18); the game returned you to GREE's HOUSE 2F (map 1/1) |
| 12904 | T563 | milestone_drought | yes | you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371 | at turn 371, after losing to MAY (trainer 535) on ROUTE103 (map 0/18); the game returned you to GREE's HOUSE 2F (map 1/1) |
| 14273 | T609 | milestone_drought | yes | you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371 | at turn 371, after losing to MAY (trainer 535) on ROUTE103 (map 0/18); the game returned you to GREE's HOUSE 2F (map 1/1) |
| 2783 | T134 | map_cycle | yes | none recorded in this run | none recorded in this run |
| 3616 | T171 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 7272 | T307 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 11928 | T716 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 13429 | T810 | ineffective | yes | none recorded in this run | none recorded in this run |
| 13516 | T814 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 14264 | T862 | ineffective | yes | none recorded in this run | none recorded in this run |
| 15000 | T887 | milestone_drought | yes | none recorded in this run | none recorded in this run |
| 18028 | T1061 | cycle | yes | you won against MAY (trainer 535) on ROUTE103 (map 0/18) at turn 954 | none recorded in this run |
| 18599 | T1086 | milestone_drought | yes | you won against MAY (trainer 535) on ROUTE103 (map 0/18) at turn 954 | none recorded in this run |
| 18701 | T1091 | ineffective | yes | you won against MAY (trainer 535) on ROUTE103 (map 0/18) at turn 954 | none recorded in this run |

The first eleven rows are 54a7, the last eleven sh02 (which beat MAY at T954).

## Status

Gates: `just test`, `just lint`, `just build`, `just coverage` (90% floor). Replays on recorded runs 54a7 and sh02 only; no measured runs, no live probe (lane freeze until 10 AM). The pending experiment entry is registered, not queued; only the operator approves runs.
