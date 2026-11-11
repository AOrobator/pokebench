Harness switch · guidance · hint arm · `next-milestone-hint-v1`

# Next-milestone hint

> Markdown twin of [next-milestone-hint-v1.html](../next-milestone-hint-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Tells the model the next main-story milestone to pursue. It is a hint: it says where to go, so a run with it on measures hinted play, not whether the model can work out the story itself. Off by default, and tested as its own experiment.

## Two ways the hint reaches the model

![Tool and pinned message paths](next-milestone-hint-v1/fig-1.svg)

***Always available, not tied to loops.** The system prompt names the tool. When a main-path milestone is earned, a message like "MILESTONE REACHED: You set the clock. Next milestone: Go back downstairs and listen to Mom." is pinned before each decision until the next one replaces it, and is recorded as a `milestone_hint` event. Milestones already present at a checkpoint start count as done but send no message. The next milestone is the one after the furthest earned, so a checkpoint start that does not re-report early milestones (like the truck exit) still gets the right hint. When the loop supervisor is also on, its briefing adds a "Next milestone (hint)" line.*

## The ladder

Native milestone names, in the order the recorded human run 2026-10-13T23-50-13_human_1848 earned them. Optional events (trainers, captures, heals) are not on it.

| # | Milestone | Goal text the model gets |
|---|---|---|
| 1 | `NEW_GAME_CREATED` | Start a new game from the title menu. |
| 2 | `PLAYER_NAME_CONFIRMED` | Choose a name and confirm it with Professor Birch. |
| 3 | `FIRST_TRUCK_EXIT` | Get out of the moving truck. |
| 4 | `PLAYER_HOUSE_ENTERED` | Go into your new house. |
| 5 | `MOM_CLOCK_INSTRUCTION` | Listen to Mom inside the house. |
| 6 | `PLAYER_BEDROOM` | Go upstairs to your bedroom. |
| 7 | `CLOCK_SET` | Set the clock on the wall of your bedroom. |
| 8 | `MOM_RIVAL_INSTRUCTION` | Go back downstairs and listen to Mom. |
| 9 | `PLAYER_HOUSE_EXITED_AFTER_CLOCK` | Leave your house. |
| 10 | `RIVAL_HOUSE_ENTERED` | Enter the house next door, where Professor Birch's family lives. |
| 11 | `RIVAL_BEDROOM_REACHED` | Go upstairs in the house next door. |
| 12 | `RIVAL_MET` | Meet Professor Birch's child in that upstairs bedroom. |
| 13 | `STARTER_CHOSEN` | Go north out of Littleroot to Route 101, help Professor Birch, and choose a Pokémon from his bag. |
| 14 | `BIRCH_RESCUE_COMPLETE` | Win the battle to rescue Professor Birch. |
| 15 | `BIRCH_STARTER_HANDOFF_COMPLETE` | Go with Professor Birch to his lab and accept the Pokémon. |
| 16 | `OLDALE_TOWN` | Go north through Route 101 to Oldale Town. |
| 17 | `RIVAL_BATTLE_WON` | Find your rival on Route 103, north of Oldale Town, and win the battle. |
| 18 | `RECEIVED_POKEDEX` | Return to Professor Birch's lab in Littleroot and get the Pokédex. |
| 19 | `STARTER_TUTORIAL_COMPLETE` | Finish the conversation in Professor Birch's lab after getting the Pokédex. |
| 20 | `RUNNING_SHOES_RECEIVED` | Talk to Mom outside Professor Birch's lab to get the Running Shoes. |
| 21 | `PETALBURG_CITY` | Travel west from Oldale Town along Route 102 to Petalburg City. |
| 22 | `DAD_FIRST_MEETING` | Visit the Petalburg Gym and meet your dad. |
| 23 | `WALLY_TUTORIAL_COMPLETE` | Help Wally catch a Pokémon. |
| 24 | `PETALBURG_WOODS` | Go west and north along Route 104 into Petalburg Woods. |
| 25 | `TEAM_AQUA_WOODS_EVENT_COMPLETE` | Help the researcher against Team Aqua in Petalburg Woods. |
| 26 | `RUSTBORO_CITY` | Continue north to Rustboro City. |
| 27 | `RUSTBORO_CITY_GYM` | Enter the Rustboro Gym. |
| 28 | `STONE_BADGE` | Beat Roxanne, the Rustboro Gym Leader, to earn the Stone Badge. |

## Status

| Item | State |
|---|---|
| Default | OFF in v1 flag presets, v2 presets that omit it and the viewer next-run draft. Rejected in state-only mode. |
| Measured runs | none yet Its own experiment, after the whole-map × memory batch |
