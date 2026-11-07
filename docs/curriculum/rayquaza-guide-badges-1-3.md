# Rayquaza lane guide: truck to the third badge

Draft for the operator's review, 2026-11-05. Format: [guide-format.md](guide-format.md). Route: keepingiticy's speedrun order, so Stone, Dynamo, Heat, with Dewford's Gym left alone. Starter: Mudkip. No RNG manipulation.

Each row is one step. Its note ends every request until the next step is earned; during a battle the short battle note follows it. `CHECK` marks a note not yet confirmed against ROM data or a recorded state; the fact check clears those.

Sources: **KI** route step or section in `keepingiticy-video/findings.md`; **WT** private notes walkthrough part; **GR** gold run; **PATH** `runs/keepingiticy-video/paths/`; **ROM** pokeemerald data; **TR** recorded trace; **The operator**. Trace evidence: `runs/reviews/2026-11-05-rayquaza-confusion-spots.md`.

## Littleroot to the starter

| After | Map | Note | Source |
|---|---|---|---|
| RUN_START | - | Press START at the title screen. In the main menu, choose OPTION before NEW GAME. | KI 0:00:47, ROM |
| OPTIONS_OPENED | - | UP and DOWN move the cursor; LEFT and RIGHT change the value. Set TEXT SPEED to FAST, BATTLE SCENE to OFF and BATTLE STYLE to SET. Leave the rest. Then press B to save and leave. | KI 0:00:48 frame, ROM |
| OPTIONS_SET | - | Choose NEW GAME, choose Girl and confirm a one-letter name. | KI 1, GR, fact check |
| PLAYER_NAME_CONFIRMED | InsideOfTruck | Finish Birch's speech. You then start in the moving truck. Press RIGHT to walk out of the open back. The boxes do nothing, so do not press A on them. | The operator, ROM, TR 07a7:29 |
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
| RUNNING_SHOES_RECEIVED | Route102 | Go to Petalburg City: north to Oldale, then west on Route 102. | KI 5 |

## Petalburg to the Stone Badge

| After | Map | Note | Source |
|---|---|---|---|
| ROUTE_102 | Route102 | Beat Youngster Calvin at (33,14) and skip the other trainers. Keep going west to Petalburg City. | KI 5, ROM, OCR 0:07:59, audit U11 |
| PETALBURG_CITY | PetalburgCity | Buy in this order as funds allow: 4 Potions, 1 Repel, a second Repel, then a fifth Potion. Step into the Pokémon Center and straight back out, which sets your respawn there. Then enter the Gym to meet your dad, Norman. | KI 6, frame 0:09:12, ROM, audit U2, NEEDS:POTION+REPEL |
| DAD_FIRST_MEETING | - | Agree to help Wally catch a Pokémon. Follow the scene to the end, then return with him to the Gym. | KI 6, GR |
| WALLY_TUTORIAL_COMPLETE | PetalburgCity | Your dad tells you to collect badges. Leave Petalburg by the west exit. Rustboro is north of Route 104, through Petalburg Woods. | KI 7 |
| ROUTE_104 | Route104 | Walk north on the beach sand, past the cottage, to the Petalburg Woods entrance. No Surf is needed. Use a Repel before the Woods. | KI 7 |
| PETALBURG_WOODS | PetalburgWoods | Go north up the east side. A Devon researcher is being robbed. Help him and beat the Team Aqua grunt. | KI 8 |
| TEAM_AQUA_WOODS_EVENT_COMPLETE | PetalburgWoods | Leave Petalburg Woods by the north exit, then go north on Route 104 to Rustboro City. | KI 8, 9 |
| RUSTBORO_CITY | RustboroCity | Go straight into the Gym. Do not grind first. | KI 10, 0:13:37, audit U4 |
| RUSTBORO_CITY_GYM | RustboroCity_Gym | Beat Josh, Tommy and Marc for experience. Use Mud-Slap until your starter learns Water Gun at level 10, then use Water Gun. Roxanne is at the back; use Potions before her. | KI 10, OCR 0:14:53, ROM, audit U4 |
| ROXANNE_FIRST_INTERACTION | RustboroCity_Gym | Use Water Gun on both Geodude and Nosepass, or Mud-Slap if you do not have it yet. Check the damage after each hit, and heal if the next attack could knock you out. If offered, decline Bide and teach Mud Shot over Growl. | KI battle plans, fact check |

## Devon Goods, Dewford and Slateport

| After | Map | Note | Source |
|---|---|---|---|
| ROCK_TOMB_RECEIVED | RustboroCity | West of the Gym door, cross x=23, y=20-24 for a theft, then go to Route 116. No Repel yet. If you meet Taillow or Abra on your way, throw a Ball at once, Great Ball first. Never search for them; keep moving east. Repel at about x=35, beat Hiker Devan at (42,13), decline Bide, beat the Rusturf grunt. | KI 11, 12, ROM, TR 7da5:560, frame 0:19:52, aeb8:302, audit I5, e09e:274-285 |
| RUSTURF_AQUA_GRUNT_DEFEATED | RusturfTunnel | Finish the dialogue to receive the Devon Goods. Return to Rustboro, report to the Devon employee outside the building, and follow him inside. | KI 12, 13, fact check |
| DEVON_CORPORATION | - | You are on 3F. Talk to the president, Mr. Stone. He gives you a letter for Steven in Dewford. | KI 13 |
| POKENAV_RECEIVED | RustboroCity_DevonCorp_3F | Finish Mr. Stone's talk and the Match Call tutorial. | KI 15, tested 2026-11-05, fact check |
| MATCH_CALL_TUTORIAL_COMPLETE | RustboroCity | Go into the Rustboro Mart before leaving town. | The operator, audit U1 |
| MAP:RustboroCity_Mart | RustboroCity_Mart | Buy as funds allow: 3 X Attacks, 2 X Speeds, then a Repel. Then head south. If your rival offers a battle, always say NO. On Route 104 south, enter Mr. Briney's house by the pier and talk to him inside. You cannot board from the pier. | KI 15, shops, ROM, TR 5f0f:296, 80c8:295, tested 2026-11-05, the operator, TO:PetalburgCity, NEEDS:X_ATTACK+X_SPEED |
| DEWFORD_TOWN | DewfordTown | Skip the Gym for now. Go north to Route 106, use a Repel, and go into Granite Cave. Steven is in the deepest room. | KI 16 |
| GRANITE_CAVE | GraniteCave_1F | Steven is in the cave, not in Dewford. On 1F, first take the Escape Rope ball at (17,7) from (18,7), facing west. Route: 1F (17,11), B1F (28,21), B2F (29,13), back up B1F, 1F (35,3), then the door at (5,10). You do not need Flash. | KI 16, TR 429f:684 |
| STEVEN_REGISTERED | DewfordTown | Use the Escape Rope from your Bag to leave the cave, or walk out without one. Then talk to Mr. Briney at the Dewford dock, about (12,9). Sail to Slateport. | KI 17, ROM, TR 0517:2830 |
| ROUTE_109_BEACH_REACHED | Route109 | Get the Soft Sand from the kids on the beach and give it to your starter. Then go north to Slateport City. | KI 17, ROM, fact check |
| SLATEPORT_CITY | SlateportCity | Step into the Pokémon Center and straight back out, which sets your respawn here. Visit Stern's shipyard, then the Oceanic Museum. Captain Stern is upstairs in the museum. | KI 17, TR d41e:4130, fact check |
| OCEANIC_MUSEUM_ENTERED | - | Pay the ₽50 fee, go upstairs and talk to Captain Stern. Beat both Team Aqua grunts and finish the dialogue to hand over the Devon Goods. If Mud Shot is offered now, teach it over Growl. | KI 17, fact check |
| DEVON_GOODS_DELIVERED | Route110 | Teach TM39 Rock Tomb in place of Tackle, or Growl if Tackle is gone. Then go north out of Slateport onto Route 110 and stay on the walking path, not the Cycling Road. Mauville is at the north end. | KI 18, TR 5f0f:760 |

## Mauville and the Dynamo Badge

| After | Map | Note | Source |
|---|---|---|---|
| ROUTE_110 | Route110 | At (8,76), trigger Isabel and Kaleb. At (36,67), face east, press A: Full Heal (status only, not HP). Rival north: Potions first. X Attack and X Speed against Slugma if you have them. Grovyle's Absorb took a Level 22 Marshtomp out in two hits. Decline Foresight. | KI battle plans, GR, TR 274b:730, fact check, ROM, TR 5f0f:760, 274b:868, 7442:663-669, aeb8:590-671, KI battle plans 0:34:24-0:35:52, ROM, TR 5f0f:764, 274b:873 |
| ROUTE_110_RIVAL_DEFEATED | Route110 | Beat Alyssa at (10,39) and Edward at (3,39). Take the Elixir ball at (6,38) from (5,38), facing east, then continue north to Mauville City. | KI 18, ROM, OCR 0:36:39, audit U11 |
| MAUVILLE_CITY | MauvilleCity | Get HM06 Rock Smash from the scientist in the house with the door at (32,14). | KI 19, ROM, WT 03, fact check |
| HM_ROCK_SMASH_RECEIVED | MauvilleCity | Get the Mach Bike from the shop east of the Pokémon Center. Teach Rock Smash in place of Rock Tomb, or Tackle if you still have it. Bike east on Route 118, beat Youngster Deandre at (7,7), then heal at the Mauville Pokémon Center. Beat Wally outside the Gym, then enter. | KI 19, WT 03, fact check, ROM, OCR 0:38:49, 0:39:45, audit U2, U10 |
| MAUVILLE_GYM_ENTERED | MauvilleCity_Gym | Beat Ben at (5,10). Step on the floor switch at (3,9) to open the way, then walk up to Wattson at (5,2). Use X Speed and X Attack first if you have them, then your Ground move. Electric moves cannot hit Ground types. | KI 20, ROM, TR d41e:4880 |

## Fallarbor, Meteor Falls and the Heat Badge

| After | Map | Note | Source |
|---|---|---|---|
| DYNAMO_BADGE | Route111 | Go north on Route 111. From (19,101), facing north, Rock Smash (19,100); that one rock opens the way. Keep north, then leave west at (0,66-71) onto Route 112, not y=28-31. The cable car is blocked for now, so take Fiery Path. | KI 21, ROM, TR 429f:1519 |
| ROUTE_111_NORTH | Route111 | Go west at (0,66-71) onto Route 112 and take Fiery Path; after a whiteout or leaving the map the rocks are back, so smash (19,100) again. As Marshtomp, respect Grass foes: Mega Drain hits x4 and heals them, so use a neutral move and skip optional Grass battles. | ROM, TR 5f0f:865, TR 6056:1090 |
| FIERY_PATH | FieryPath | Go through Fiery Path to Route 112's north part, then east to Route 111 north, then leave west near y=7-10 onto Route 113. After a whiteout or leaving the map, Route 111's rocks are back, so smash (19,100) again. | PATH 3, ROM, TR ol4h:931, TR 6056:1090 |
| ROUTE_113 | Route113 | Go west to Fallarbor Town. | KI 21, ROM, fact check |
| FALLARBOR_TOWN | FallarborTown | At (3,15), face west and press A for a hidden Nugget. At the Mart, sell it and TM47 Steel Wing, keep TM34, then buy in this order as funds allow: 2 Guard Specs, 2 Escape Ropes, a Super Potion, 10 X Attacks, 5 X Speeds, 3 X Specials, 11 Super Repels. Then go west onto Route 114. | KI shops, fact check, NEEDS:GUARD_SPEC+SUPER_REPEL+X_ATTACK+X_SPEED |
| ROUTE_114 | Route114 | Use a Super Repel if you have one, beat Hiker Lucas at (30,72), and follow Route 114 into Meteor Falls. Walk west on 1F to about (14,18) to start the Team Magma scene, and wait for it to end. | KI 22, ROM, TR l24h:2470 |
| METEOR_FALLS_CONFRONTATION_RESOLVED | MeteorFalls_1F_1R | Leave through Route 115 south to Rustboro, then go east to Rusturf Tunnel. Use Rock Smash inside to reach the man who gives HM04 Strength. | KI 22, 23, WT 04 |
| HM_STRENGTH_RECEIVED | Route112 | Teach Strength over Mud-Slap or Growl, as known. Return to Mauville: walk east through the opened tunnel to Verdanturf, then Route 117. Heal at the Center. Beat Aroma Lady Rose at (7,12) on Route 118. On Route 111, Rock Smash (19,100), then west at (0,66-71) to Route 112 and the Cable Car. | KI 23, 24, fact check, TO:MauvilleCity |
| MT_CHIMNEY | MtChimney | Beat the Team Magma grunt and Tabitha, then Maxie at the machine. For Maxie, lead a spare Pokémon if you have one and use Guard Spec if safe; send your starter if it faints. Use X Attack if you have it. Mud Shot and Strength on Mightyena, Strength on Zubat, Mud Shot on Camerupt, as known. | KI 24, battle plans, frame 0:53:06, OCR 0:53:13, audit U18 |
| MT_CHIMNEY_STORY_COMPLETE | JaggedPass | Bike south past the Cable Car to Jagged Pass and go down it to Lavaridge Town. | KI 25, WT 05 |
| LAVARIDGE_TOWN | LavaridgeTown | Use Potions now if you are hurt, then go straight into the Gym. Do not use the Center; it moves your respawn. | KI 25, ROM, seg 3 #29, audit U20, the operator |
| LAVARIDGE_GYM_ENTERED | LavaridgeTown_Gym_1F | From (13,18): U L5 U8 to vent (8,9), which drops you to B1F at the same x,y. Then D7 L2 U2 L to vent (5,14), which lifts you to 1F. One press per vent. If off this route, trust the map. | KI 26, PATH 3, ROM, TR ol4h:1670, OCR 0:56:47, audit U19, sim 2026-11-07 |
| AT:LavaridgeTown_Gym_1F:5:14 | LavaridgeTown_Gym_1F | From (5,14): R, D over the ledge, D L5 U L U6 to vent (0,10). On B1F: U4 to vent (0,6). One press per vent. If off this route, trust the map. Vents never change; after a loss or leaving, from (13,18): U L5 U8, B1F D7 L2 U2 L. | KI 26, PATH 3, ROM, TR ol4h:1670, OCR 0:56:47, audit U19, sim 2026-11-07 |
| AT:LavaridgeTown_Gym_1F:0:6 | LavaridgeTown_Gym_1F | From (0,6): R2 U3 to vent (2,3). On B1F: R5 U to vent (7,2). One press per vent. If off this route, trust the map. Vents never change; after a loss or leaving, from (13,18): U L5 U8, B1F D7 L2 U2 L, 1F R D D L5 U L U6, B1F U4. | KI 26, PATH 3, ROM, TR ol4h:1670, OCR 0:56:47, audit U19, sim 2026-11-07 |
| AT:LavaridgeTown_Gym_1F:7:2 | LavaridgeTown_Gym_1F | From (7,2): R3 D4 to vent (10,6). On B1F: D3, D over the ledge, D R2 to vent (12,12). One press per vent. If off this route, trust the map. Vents never change; after a loss or leaving, from (13,18): U L5 U8, B1F D7 L2 U2 L, 1F R D D L5 U L U6, B1F U4, 1F R2 U3, B1F R5 U. | KI 26, PATH 3, ROM, TR ol4h:1670, OCR 0:56:47, audit U19, sim 2026-11-07 |
| AT:LavaridgeTown_Gym_1F:12:12 | LavaridgeTown_Gym_1F | From (12,12): R U2. Bag items before Flannery. X Attack if safe, Strength on Slugma, Mud Shot on the rest as known; Sunny Day weakens Water. If off this route, trust the map. After a loss, from (13,18): U L5 U8, B1F D7 L2 U2 L, 1F R D D L5 U L U6, B1F U4, 1F R2 U3, B1F R5 U, 1F R3 D4, B1F D3 D D R2. | KI 26, PATH 3, ROM, TR ol4h:1670, OCR 0:56:47, audit U19, sim 2026-11-07 |
| FLANNERY_DEFEATED | - | Finish Flannery's dialogue to collect the Heat Badge and TM50 Overheat. | KI route, fact check |

## Needs

- Every After id must exist in `packages/agent/src/milestones.ts`.
- `CHECK` count: 0.
