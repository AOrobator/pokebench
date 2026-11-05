# Rayquaza lane guide: truck to the third badge

Draft for the operator's review, 2026-11-05. Format: [guide-format.md](guide-format.md). Route: keepingiticy's speedrun order, so Stone, Dynamo, Heat, with Dewford's Gym left alone. Starter: Mudkip. No RNG manipulation.

Each row is one step. Its note stays the final message of every request until the next step is earned. `CHECK` marks a note not yet confirmed against ROM data or a recorded state; the fact check clears those.

Sources: **KI** route step or section in `keepingiticy-video/findings.md`; **WT** private notes walkthrough part; **GR** gold run; **PATH** `runs/keepingiticy-video/paths/`; **ROM** pokeemerald data; **TR** recorded trace; **The operator**. Trace evidence: `runs/reviews/2026-11-05-rayquaza-confusion-spots.md`.

## Littleroot to the starter

| After | Map | Note | Source |
|---|---|---|---|
| RUN_START | - | Choose NEW GAME, choose Girl and confirm a one-letter name. | KI 1, GR, fact check |
| PLAYER_NAME_CONFIRMED | InsideOfTruck | You are in the moving truck. Press RIGHT to walk out of the open back. The boxes do nothing, so do not press A on them. | The operator, ROM, TR 07a7:29 |
| FIRST_TRUCK_EXIT | LittlerootTown | Mom leads you into your house. Follow her, then go upstairs to your bedroom. | KI 2, GR |
| PLAYER_BEDROOM | - | Set the wall clock: face it, press A, accept the time and confirm. Then go back downstairs. | KI 2, GR |
| CLOCK_SET | - | Go downstairs and talk to Mom. The TV scene is automatic, so wait for it to end. | KI 2 |
| MOM_RIVAL_INSTRUCTION | LittlerootTown | Mom told you to visit next door. That is Professor Birch's house, not his lab. Leave by the door, walk to the other house and enter it. | The operator, ROM, TR 07a7:40 |
| RIVAL_HOUSE_ENTERED | - | Talk to the mom downstairs, then go upstairs and talk to your rival in the bedroom. | KI 2, GR |
| RIVAL_MET | LittlerootTown | Leave the house and walk to Littleroot's north exit at about (11,1). A child there tells you someone needs help on Route 101. | ROM, TR 07a7:78 |
| BIRCH_RESCUE_REQUESTED | LittlerootTown | Go north out of Littleroot onto Route 101. | KI 3 |
| ROUTE_101 | Route101 | Professor Birch is under attack. Go to his bag on the ground, press A on it and choose MUDKIP. | The operator, KI 3, GR |
| STARTER_CHOSEN | Route101 | Beat the wild Pokémon with Tackle. Birch then takes you to his lab. | KI 3 |
| BIRCH_STARTER_HANDOFF_COMPLETE | Route101 | Birch asks you to find your rival. Go north through Route 101 and Oldale Town to Route 103. | KI 4 |
| OLDALE_TOWN | OldaleTown | Keep going north out of Oldale onto Route 103. Your rival is near (10,3). Talk to them. | KI 4, ROM, TR 828b:98 |
| RIVAL_BATTLE_WON | Route103 | Go back to Birch's lab in Littleroot, south through Oldale and Route 101. He gives you the Pokédex. | KI 4 |
| RECEIVED_POKEDEX | LittlerootTown | Your rival gives you Poké Balls. Then talk to Mom outside for the Running Shoes. | KI 4 |
| RUNNING_SHOES_RECEIVED | Route102 | Go to Petalburg City: north to Oldale, then west on Route 102. Heal first if Mudkip is hurt. | KI 5 |

## Petalburg to the Stone Badge

| After | Map | Note | Source |
|---|---|---|---|
| ROUTE_102 | Route102 | Do not start a trainer fight below half HP. Heal at Oldale if you must. Keep going west to Petalburg City. | KI 5 |
| PETALBURG_CITY | PetalburgCity | Buy Potions at the Mart, then enter the Gym to meet your dad, Norman. | KI 6 |
| DAD_FIRST_MEETING | - | Agree to help Wally catch a Pokémon. Follow the scene to the end, then return with him to the Gym. | KI 6, GR |
| WALLY_TUTORIAL_COMPLETE | PetalburgCity | Your dad tells you to collect badges. Leave Petalburg by the west exit. Rustboro is north of Route 104, through Petalburg Woods. | KI 7 |
| ROUTE_104 | Route104 | Walk north on the beach sand, past the cottage, to the Petalburg Woods entrance. No Surf is needed. | KI 7 |
| PETALBURG_WOODS | PetalburgWoods | Go north up the east side. A Devon researcher is being robbed. Help him and beat the Team Aqua grunt. | KI 8 |
| TEAM_AQUA_WOODS_EVENT_COMPLETE | PetalburgWoods | Leave Petalburg Woods by the north exit, then go north on Route 104 to Rustboro City. | KI 8, 9 |
| RUSTBORO_CITY | RustboroCity | Train Mudkip to level 10 for Water Gun before the Gym. Rock types take big damage from it. | KI 10, GR |
| RUSTBORO_CITY_GYM | RustboroCity_Gym | Beat Josh, Tommy and Marc with Water Gun on the way. Roxanne is at the back. | KI 10, GR |
| ROXANNE_FIRST_INTERACTION | RustboroCity_Gym | Use Water Gun on both Geodude and Nosepass. Check the damage after each hit, and heal if the next attack could knock you out. | KI battle plans, fact check |

## Devon Goods, Dewford and Slateport

| After | Map | Note | Source |
|---|---|---|---|
| ROCK_TOMB_RECEIVED | RustboroCity | Walk east through Rustboro past about x=23, y=20-24 to trigger a theft scene, then go east on Route 116 to Rusturf Tunnel and beat the Team Aqua grunt. Catch Taillow and Abra on the way. Mr. Briney's boat is not available until this story is done. | KI 11, 12, ROM, TR 7da5:560 |
| RUSTURF_AQUA_GRUNT_DEFEATED | RusturfTunnel | Finish the dialogue to receive the Devon Goods. Return to Rustboro, report to the Devon employee outside the building, and follow him inside. | KI 12, 13, fact check |
| DEVON_CORPORATION | - | Go to the top floor and talk to the president, Mr. Stone. He gives you a letter for Steven in Dewford. | KI 13 |
| POKENAV_RECEIVED | Route104 | Finish Mr. Stone's talk and the Match Call tutorial. Buy X Attack and X Speed at Petalburg Mart if you can afford them. On Route 104 south, enter Mr. Briney's house by the pier and talk to him inside. You cannot board the boat from the pier. | KI 15, tested 2026-11-05, fact check |
| DEWFORD_TOWN | DewfordTown | Skip the Gym for now. Go north to Route 106 and into Granite Cave. Steven is in the deepest room. | KI 16 |
| GRANITE_CAVE | GraniteCave_1F | Steven is in the cave, not in Dewford. Route: 1F (17,11), B1F (28,21), B2F (29,13), back up B1F, 1F (35,3), then the door at (5,10). You do not need Flash. | KI 16, TR 429f:684 |
| STEVEN_REGISTERED | DewfordTown | Leave the cave and talk to Mr. Briney at the Dewford dock, about (12,9). Sail to Slateport. | KI 17, ROM, TR 0517:2830 |
| ROUTE_109_BEACH_REACHED | Route109 | Get the Soft Sand from the kids on the beach and give it to Mudkip. Then go north to Slateport City. | KI 17, ROM, fact check |
| SLATEPORT_CITY | SlateportCity | Visit Stern's shipyard, then the Oceanic Museum. Captain Stern is upstairs in the museum. | KI 17, TR d41e:4130, fact check |
| OCEANIC_MUSEUM_ENTERED | - | Pay the ₽50 fee, go upstairs and talk to Captain Stern. Beat both Team Aqua grunts and finish the dialogue to hand over the Devon Goods. | KI 17, fact check |
| DEVON_GOODS_DELIVERED | Route110 | Go north out of Slateport onto Route 110 and stay on the walking path, not the Cycling Road. Mauville is at the north end. | KI 18 |

## Mauville and the Dynamo Badge

| After | Map | Note | Source |
|---|---|---|---|
| ROUTE_110 | Route110 | Your rival waits on this route and is a hard fight, so heal first. Use X Attack and X Speed when safe. Use Mud Shot on Grovyle, then finish with a neutral move, healing when needed. | KI battle plans, GR, TR 274b:730, fact check |
| ROUTE_110_RIVAL_DEFEATED | Route110 | Continue north to Mauville City. | KI 18 |
| MAUVILLE_CITY | MauvilleCity | Get HM06 Rock Smash from the scientist in the house with the door at (32,14). | KI 19, ROM, WT 03, fact check |
| HM_ROCK_SMASH_RECEIVED | MauvilleCity | Get the Mach Bike from the shop east of the Pokémon Center. Teach Rock Smash in place of Tackle. Talk to Wally outside the Gym, beat him, then enter. | KI 19, WT 03, fact check |
| MAUVILLE_GYM_ENTERED | MauvilleCity_Gym | Step on the floor switch at (3,9) to open the way, then walk up to Wattson at (5,2). Use X Speed and X Attack first, then Mud Shot. Electric moves cannot hit Marshtomp. | KI 20, ROM, TR d41e:4880 |

## Fallarbor, Meteor Falls and the Heat Badge

| After | Map | Note | Source |
|---|---|---|---|
| DYNAMO_BADGE | Route111 | Go north on Route 111 and use Rock Smash on the rocks at (19,100) and (18,101). Then west on Route 112. The cable car is blocked for now, so take Fiery Path. | KI 21, ROM, TR 429f:1519 |
| FIERY_PATH | FieryPath | Go through Fiery Path to Route 112's north part, then east to Route 111 north, then leave west near y=7-10 onto Route 113. | PATH 3, ROM, TR ol4h:931 |
| ROUTE_113 | Route113 | Pick up the Nugget on Route 113 on your way west to Fallarbor Town. | KI 21, ROM, fact check |
| FALLARBOR_TOWN | FallarborTown | At the Mart, sell the Nugget and spare TMs, then buy Super Repels, X Attacks, X Speeds, a Guard Spec and an Escape Rope as funds allow. Then go west onto Route 114. | KI shops, fact check |
| ROUTE_114 | Route114 | Follow Route 114 into Meteor Falls. Walk west on 1F to about (14,18) to start the Team Magma scene, and wait for it to end. | KI 22, ROM, TR l24h:2470 |
| METEOR_FALLS_CONFRONTATION_RESOLVED | MeteorFalls_1F_1R | Leave through Route 115 south to Rustboro, then go east to Rusturf Tunnel. Use Rock Smash inside to reach the man who gives HM04 Strength. | KI 22, 23, WT 04 |
| HM_STRENGTH_RECEIVED | Route112 | Teach Strength in place of Mud-Slap. Return to Mauville, then go north on Route 111 and west on Route 112 to the Cable Car. Use Abra's Teleport only if Mauville is your last healing stop. | KI 23, 24, fact check |
| MT_CHIMNEY | MtChimney | Beat the Team Magma grunt and Tabitha, then Maxie at the machine. Against Maxie, use Guard Spec and X Attack first. | KI 24, battle plans |
| MT_CHIMNEY_STORY_COMPLETE | JaggedPass | Walk south past the Cable Car to Jagged Pass and go down it to Lavaridge Town. | KI 25, WT 05 |
| LAVARIDGE_TOWN | LavaridgeTown | Heal at the Pokémon Center, then enter the Gym. | KI 25 |
| LAVARIDGE_GYM_ENTERED | LavaridgeTown_Gym_1F | Each vent swaps floors. Step on these in order: 1F (8,9), B1F (5,14), 1F (0,10) after the ledge at (6,15), B1F (0,6), 1F (2,3), B1F (7,2), 1F (10,6), B1F (12,12) after the ledge at (10,10). Then walk to Flannery at (13,9). Other listed warps may not work. | KI 26, PATH 3, ROM, TR ol4h:1670 |
| FLANNERY_DEFEATED | - | Finish Flannery's dialogue to collect the Heat Badge and TM50 Overheat. | KI route, fact check |

## Needs

- Every After id must exist in `packages/agent/src/milestones.ts`.
- `CHECK` count: 0.
