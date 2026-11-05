# keepingiticy — Pokémon Emerald Any% Glitchless WR (2:29:44) — findings

Video: https://www.youtube.com/watch?v=QBrjHTzy4LU, titled "Pokemon Emerald Any% Glitchless Speedrun in 2:29:44 (2:29:55 before DS time conversion)". Uploaded 2026-01-04. The video runs 2:44:18 and the run was played on a DS. The full stream VOD is https://www.youtube.com/watch?v=vgKLUpjiMU4.

## How to read the timestamps

- **v** is video time. **run** is the LiveSplit run time. The timer reads 0.5 at video 0:00:54.5, so **run = video − 53.9 s**. I checked this against the timer at run 0:12:41, 0:45:58, 1:00:46 and 2:08:06, and it holds within ±0.1 s.
- The timer starts on NEW GAME. The options (Text FAST, Battle Scene OFF, Battle Style SHIFT; video 0:00:48) and the save clear (0:00:36) happen before it starts.
- Evidence comes from five places:
  - the 1 fps OCR of the dialogue box (`ocr_dialogue.tsv`, ±1 s);
  - his LiveSplit overlay (exact);
  - exact-seek frames;
  - 10 s contact sheets (`sheets/s10`, ±5–10 s);
  - auto-generated captions (`transcript.txt`).
- The captions are auto-generated; the video has no manual subtitles. The commentary is mostly a voice chat with a friend (BluMagma) about glitched categories, TTYD, RNG theory and "box names" (a glitched-category technique). Very little of it narrates this route, so most claims below come from the frames and the OCR, and commentary quotes are marked as such.

## Official splits (his LiveSplit, actual cumulative run times)

| Split | Run time | Δ vs his comparison | Video |
|---|---|---|---|
| Roxanne | 17:27 | −13.1 | 0:18:21 |
| Dewford (Steven letter / leave Dewford) | 26:46 | −3.5 | 0:27:40 |
| Rival 2 (Route 110) | 35:20 | −6.0 | 0:36:14 |
| Wattson | 42:20 | −4.3 | 0:43:14 |
| Maxie 1 (Mt. Chimney) | 53:23 | +7.6 | 0:54:17 |
| Flannery | 56:19 | +16.6 | 0:57:13 |
| Brawly | 59:45 | +14.9 | 1:00:39 |
| Norman | 1:05:55 | −11.2 | 1:06:49 |
| Rival 3 (Route 119) | 1:13:34 | −20.1 | 1:14:28 |
| Winona | 1:25:58 | −38.3 | 1:26:52 |
| Maxie 2 (Magma Hideout) | 1:34:03 | −31.5 | 1:34:57 |
| Tate & Liza | 1:46:55 | −24.1 | 1:47:49 |
| Archie (Seafloor Cavern) | 1:58:15 | −49.3 | 1:59:09 |
| Juan | 2:10:59 | −47.2 | 2:11:53 |
| Sidney | 2:20:32 | −49.1 | 2:21:26 |
| Phoebe | 2:22:21 | −43.2 | 2:23:15 |
| Glacia | 2:24:07 | −55.5 | 2:25:01 |
| Drake | 2:25:56 | −1:02 | 2:26:50 |
| Wallace | 2:28:39 | −48.4 | 2:29:33 |
| The End | 2:29:55 (2:29:44 after DS conversion) | −48.5 | 2:30:49 |

- The overlay has no Rayquaza split. The catch is at **v2:09:00 = run 2:08:06** (OCR: "Gotcha! RAYQUAZA was caught!").
- Badge order: **Stone → Dynamo → Heat → Knuckle → Balance → Feather → Mind → Rain**. In gym numbers that is 1, 3, 4, 2, 5, 6, 7, 8.
- Badge times (OCR "received the … BADGE"):

| Badge | Video | Run |
|---|---|---|
| Stone | 0:18:23 | 0:17:29 |
| Dynamo | 0:43:16 | 0:42:22 |
| Heat | 0:57:15 | 0:56:21 |
| Knuckle | 1:00:47 | 0:59:53 |
| Balance | 1:06:50 | 1:05:56 |
| Feather | 1:26:54 | 1:26:00 |
| Mind | 1:47:51 | 1:46:57 |
| Rain | 2:11:55 | 2:11:01 |

## Harness milestone splits

The full table is in `splits.csv`, with columns milestone, video_ts, cumulative_s, segment_s, precision, evidence and harness_order. Rows are in the order he reached them. harness_order is the index in `REQUIRED_FRONTIER_MILESTONES`, which is a linear list that his route does not follow: Dewford's gym milestones fall between Heat and Balance.

The precision column means:
- **overlay**: exact, from his split.
- **ocr**: the first dialogue frame of the event, ±1 s.
- **frame / transition**: an exact-seek frame or fade, ±2 s.
- **bracketed**: between two observed frames, ±10 s.
- **inferred**: not seen directly; placed from neighbouring evidence.

Map-entry milestones are the weakest. They are mostly bracketed or inferred, because the map-name popup is too small to OCR at 360p. Routes 129 and 130 are not identified.

| # | milestone | video | run (cum) | segment s | precision |
|---|---|---|---|---|---|
| 1 | NEW_GAME_CREATED | 0:00:54.0 | 0:00:00.1 | 0.1 | overlay |
| 2 | PLAYER_NAME_CONFIRMED | 0:01:24.0 | 0:00:30.1 | 30.0 | ocr |
| 3 | FIRST_TRUCK_EXIT | 0:01:53.0 | 0:00:59.1 | 29.0 | inferred |
| 4 | LITTLEROOT_TOWN | 0:01:53.0 | 0:00:59.1 | 0.0 | inferred |
| 5 | PLAYER_HOUSE_ENTERED | 0:02:03.0 | 0:01:09.1 | 10.0 | ocr |
| 6 | MOM_CLOCK_INSTRUCTION | 0:02:05.0 | 0:01:11.1 | 2.0 | ocr |
| 7 | PLAYER_BEDROOM | 0:02:09.0 | 0:01:15.1 | 4.0 | ocr |
| 8 | CLOCK_SET | 0:02:34.0 | 0:01:40.1 | 25.0 | ocr |
| 9 | PLAYER_BEDROOM_EXITED_AFTER_CLOCK | 0:02:40.0 | 0:01:46.1 | 6.0 | inferred |
| 10 | MOM_RIVAL_INSTRUCTION | 0:02:50.0 | 0:01:56.1 | 10.0 | ocr |
| 11 | PLAYER_HOUSE_EXITED_AFTER_CLOCK | 0:02:55.0 | 0:02:01.1 | 5.0 | inferred |
| 12 | RIVAL_HOUSE_ENTERED | 0:03:05.0 | 0:02:11.1 | 10.0 | ocr |
| 13 | RIVAL_BEDROOM_REACHED | 0:03:15.0 | 0:02:21.1 | 10.0 | inferred |
| 14 | RIVAL_MET | 0:03:19.0 | 0:02:25.1 | 4.0 | ocr |
| 15 | RIVAL_HOUSE_EXITED | 0:03:25.0 | 0:02:31.1 | 6.0 | inferred |
| 16 | BIRCH_RESCUE_REQUESTED | 0:03:33.0 | 0:02:39.1 | 8.0 | ocr |
| 17 | ROUTE_101 | 0:03:38.0 | 0:02:44.1 | 5.0 | inferred |
| 18 | STARTER_CHOSEN | 0:03:49.0 | 0:02:55.1 | 11.0 | ocr |
| 19 | BIRCH_RESCUE_COMPLETE | 0:04:10.0 | 0:03:16.1 | 21.0 | ocr |
| 20 | BIRCH_STARTER_HANDOFF_COMPLETE | 0:04:24.0 | 0:03:30.1 | 14.0 | ocr |
| 21 | ROUTE_101_AFTER_HANDOFF | 0:04:45.0 | 0:03:51.1 | 21.0 | inferred |
| 22 | OLDALE_TOWN | 0:04:55.0 | 0:04:01.1 | 10.0 | inferred |
| 23 | ROUTE_103 | 0:05:05.0 | 0:04:11.1 | 10.0 | inferred |
| 24 | RIVAL_BATTLE_STARTED | 0:05:23.0 | 0:04:29.1 | 18.0 | ocr |
| 25 | RIVAL_BATTLE_DEFEATED | 0:05:50.0 | 0:04:56.1 | 27.0 | ocr |
| 26 | RIVAL_BATTLE_WON | 0:06:00.0 | 0:05:06.1 | 10.0 | ocr |
| 27 | RIVAL_OLDALE_SEND_OFF | 0:06:20.0 | 0:05:26.1 | 20.0 | ocr |
| 28 | ROUTE_101_AFTER_RIVAL_BATTLE | 0:06:28.0 | 0:05:34.1 | 8.0 | inferred |
| 29 | LITTLEROOT_AFTER_RIVAL_BATTLE | 0:06:35.0 | 0:05:41.1 | 7.0 | inferred |
| 30 | RECEIVED_POKEDEX | 0:06:45.0 | 0:05:51.1 | 10.0 | ocr |
| 31 | STARTER_TUTORIAL_COMPLETE | 0:06:56.0 | 0:06:02.1 | 11.0 | ocr |
| 32 | RUNNING_SHOES_RECEIVED | 0:07:17.0 | 0:06:23.1 | 21.0 | ocr |
| 33 | ROUTE_102 | 0:07:35.0 | 0:06:41.1 | 18.0 | bracketed |
| 34 | PETALBURG_CITY | 0:08:48.0 | 0:07:54.1 | 73.0 | bracketed |
| 35 | DAD_FIRST_MEETING | 0:09:20.0 | 0:08:26.1 | 32.0 | ocr |
| 36 | WALLY_TUTORIAL_COMPLETE | 0:11:06.0 | 0:10:12.1 | 106.0 | ocr |
| 37 | ROUTE_104 | 0:11:34.0 | 0:10:40.1 | 28.0 | transition |
| 38 | PETALBURG_WOODS | 0:11:47.0 | 0:10:53.1 | 13.0 | bracketed |
| 39 | TEAM_AQUA_WOODS_EVENT_COMPLETE | 0:13:02.0 | 0:12:08.1 | 75.0 | ocr |
| 40 | RUSTBORO_CITY | 0:13:25.0 | 0:12:31.1 | 23.0 | bracketed |
| 41 | RUSTBORO_CITY_GYM | 0:13:37.0 | 0:12:43.1 | 12.0 | bracketed |
| 42 | RUSTBORO_GYM_TRAINER_JOSH_DEFEATED (viewer frontier) | 0:14:57.0 | 0:14:03.1 | 80.0 | ocr |
| 43 | RUSTBORO_GYM_TRAINER_MARC_DEFEATED (viewer frontier) | 0:16:22.0 | 0:15:28.1 | 85.0 | ocr |
| 44 | ROXANNE_FIRST_INTERACTION | 0:16:28.0 | 0:15:34.1 | 6.0 | ocr |
| 45 | ROXANNE_DEFEATED | 0:18:20.9 | 0:17:27.0 | 112.9 | overlay |
| 46 | RUSTBORO_GYM_COMPLETE | 0:18:23.0 | 0:17:29.1 | 2.1 | ocr |
| 47 | STONE_BADGE | 0:18:23.0 | 0:17:29.1 | 0.0 | ocr |
| 48 | ROCK_TOMB_RECEIVED | 0:18:32.0 | 0:17:38.1 | 9.0 | ocr |
| 49 | RUSTURF_AQUA_GRUNT_DEFEATED | 0:22:12.0 | 0:21:18.1 | 220.0 | frame |
| 50 | DEVON_GOODS_RECOVERED | 0:22:19.0 | 0:21:25.1 | 7.0 | ocr |
| 51 | DEVON_GOODS_RETURN_REPORTED | 0:22:57.0 | 0:22:03.1 | 38.0 | ocr |
| 52 | DEVON_CORPORATION | 0:23:01.0 | 0:22:07.1 | 4.0 | transition |
| 53 | STEVEN_LETTER_RECEIVED | 0:23:29.0 | 0:22:35.1 | 28.0 | ocr |
| 54 | POKENAV_RECEIVED | 0:23:36.0 | 0:22:42.1 | 7.0 | ocr |
| 55 | DEVON_PRESIDENT_SCENE_COMPLETE | 0:23:50.0 | 0:22:56.1 | 14.0 | ocr |
| 56 | MATCH_CALL_UNLOCKED | 0:24:17.0 | 0:23:23.1 | 27.0 | bracketed |
| 57 | MATCH_CALL_TUTORIAL_COMPLETE | 0:24:27.0 | 0:23:33.1 | 10.0 | inferred |
| 58 | DEWFORD_TOWN | 0:26:05.0 | 0:25:11.1 | 98.0 | inferred |
| 59 | ROUTE_106 | 0:26:12.0 | 0:25:18.1 | 7.0 | bracketed |
| 60 | GRANITE_CAVE | 0:26:30.0 | 0:25:36.1 | 18.0 | frame |
| 61 | GRANITE_CAVE_B1F | 0:26:36.0 | 0:25:42.1 | 6.0 | bracketed |
| 62 | GRANITE_CAVE_B2F | 0:26:43.0 | 0:25:49.1 | 7.0 | bracketed |
| 63 | STEVEN_REACHED | 0:26:58.0 | 0:26:04.1 | 15.0 | frame |
| 64 | STEVEN_LETTER_DELIVERED | 0:27:02.0 | 0:26:08.1 | 4.0 | ocr |
| 65 | STEVEN_REGISTERED | 0:27:19.0 | 0:26:25.1 | 17.0 | ocr |
| 66 | ROUTE_109_BEACH_REACHED | 0:27:50.0 | 0:26:56.1 | 31.0 | inferred |
| 67 | SLATEPORT_CITY | 0:27:56.0 | 0:27:02.1 | 6.0 | inferred |
| 68 | STERN_SHIPYARD_ENTERED | 0:28:17.0 | 0:27:23.1 | 21.0 | ocr |
| 69 | OCEANIC_MUSEUM_ENTERED | 0:28:35.0 | 0:27:41.1 | 18.0 | frame |
| 70 | STERN_MUSEUM_REACHED | 0:29:15.0 | 0:28:21.1 | 40.0 | inferred |
| 71 | MUSEUM_AQUA_GRUNT_1_DEFEATED | 0:29:29.0 | 0:28:35.1 | 14.0 | ocr |
| 72 | MUSEUM_AQUA_GRUNT_2_DEFEATED | 0:30:44.0 | 0:29:50.1 | 75.0 | ocr |
| 73 | DEVON_GOODS_DELIVERED | 0:31:12.0 | 0:30:18.1 | 28.0 | ocr |
| 74 | ROUTE_110 | 0:31:55.0 | 0:31:01.1 | 43.0 | inferred |
| 75 | ROUTE_110_RIVAL_DEFEATED | 0:36:13.9 | 0:35:20.0 | 258.9 | overlay |
| 76 | HM_ROCK_SMASH_RECEIVED | 0:37:46.0 | 0:36:52.1 | 92.1 | ocr |
| 77 | MAUVILLE_CITY | 0:37:54.5 | 0:37:00.6 | 8.5 | frame |
| 78 | MAUVILLE_WALLY_DEFEATED | 0:40:22.0 | 0:39:28.1 | 147.5 | ocr |
| 79 | MAUVILLE_GYM_ENTERED | 0:40:55.0 | 0:40:01.1 | 33.0 | frame |
| 80 | WATTSON_DEFEATED | 0:43:13.9 | 0:42:20.0 | 138.9 | overlay |
| 81 | MAUVILLE_GYM_COMPLETE | 0:43:16.0 | 0:42:22.1 | 2.1 | ocr |
| 82 | DYNAMO_BADGE | 0:43:16.0 | 0:42:22.1 | 0.0 | ocr |
| 83 | SHOCK_WAVE_RECEIVED | 0:43:25.0 | 0:42:31.1 | 9.0 | ocr |
| 84 | ROUTE_111_NORTH | 0:44:02.0 | 0:43:08.1 | 37.0 | frame |
| 85 | ROUTE_112 | 0:44:09.0 | 0:43:15.1 | 7.0 | frame |
| 86 | FIERY_PATH | 0:44:16.0 | 0:43:22.1 | 7.0 | frame |
| 87 | ROUTE_113 | 0:44:40.0 | 0:43:46.1 | 24.0 | bracketed |
| 88 | FALLARBOR_TOWN | 0:44:55.0 | 0:44:01.1 | 15.0 | bracketed |
| 89 | ROUTE_114 | 0:46:10.0 | 0:45:16.1 | 75.0 | bracketed |
| 90 | METEOR_FALLS | 0:46:50.0 | 0:45:56.1 | 40.0 | frame |
| 91 | METEOR_FALLS_CONFRONTATION_RESOLVED | 0:47:20.0 | 0:46:26.1 | 30.0 | ocr |
| 92 | RUSTURF_TUNNEL_OPENED | 0:48:04.0 | 0:47:10.1 | 44.0 | inferred |
| 93 | HM_STRENGTH_RECEIVED | 0:48:06.0 | 0:47:12.1 | 2.0 | ocr |
| 94 | MT_CHIMNEY | 0:50:20.0 | 0:49:26.1 | 134.0 | bracketed |
| 95 | MT_CHIMNEY_MAXIE_DEFEATED | 0:54:16.9 | 0:53:23.0 | 236.9 | overlay |
| 96 | MT_CHIMNEY_STORY_COMPLETE | 0:54:49.0 | 0:53:55.1 | 32.1 | ocr |
| 97 | JAGGED_PASS | 0:54:52.0 | 0:53:58.1 | 3.0 | frame |
| 98 | LAVARIDGE_TOWN | 0:55:05.0 | 0:54:11.1 | 13.0 | bracketed |
| 99 | LAVARIDGE_GYM_ENTERED | 0:55:10.0 | 0:54:16.1 | 5.0 | frame |
| 100 | FLANNERY_DEFEATED | 0:57:12.9 | 0:56:19.0 | 122.9 | overlay |
| 101 | LAVARIDGE_GYM_COMPLETE | 0:57:15.0 | 0:56:21.1 | 2.1 | ocr |
| 102 | HEAT_BADGE | 0:57:15.0 | 0:56:21.1 | 0.0 | ocr |
| 103 | OVERHEAT_RECEIVED | 0:57:26.0 | 0:56:32.1 | 11.0 | ocr |
| 104 | DEWFORD_GYM_ENTERED | 0:59:45.0 | 0:58:51.1 | 139.0 | inferred |
| 105 | BRAWLY_DEFEATED | 1:00:38.9 | 0:59:45.0 | 53.9 | overlay |
| 106 | DEWFORD_GYM_COMPLETE | 1:00:47.0 | 0:59:53.1 | 8.1 | ocr |
| 107 | KNUCKLE_BADGE | 1:00:47.0 | 0:59:53.1 | 0.0 | ocr |
| 108 | BULK_UP_RECEIVED | 1:00:57.0 | 1:00:03.1 | 10.0 | ocr |
| 109 | PETALBURG_GYM_ENTERED | 1:02:06.0 | 1:01:12.1 | 69.0 | transition |
| 110 | NORMAN_DEFEATED | 1:06:48.9 | 1:05:55.0 | 282.9 | overlay |
| 111 | PETALBURG_GYM_COMPLETE | 1:06:50.0 | 1:05:56.1 | 1.1 | ocr |
| 112 | BALANCE_BADGE | 1:06:50.0 | 1:05:56.1 | 0.0 | ocr |
| 113 | FACADE_RECEIVED | 1:07:00.0 | 1:06:06.1 | 10.0 | ocr |
| 114 | HM_SURF_RECEIVED | 1:07:38.0 | 1:06:44.1 | 38.0 | ocr |
| 115 | ROUTE_118_EAST_BANK_REACHED | 1:08:35.0 | 1:07:41.1 | 57.0 | inferred |
| 116 | ROUTE_118_STEVEN_SCENE_COMPLETE | 1:08:55.0 | 1:08:01.1 | 20.0 | inferred |
| 117 | ROUTE_119 | 1:09:05.0 | 1:08:11.1 | 10.0 | inferred |
| 118 | WEATHER_INSTITUTE_ENTERED | 1:09:40.0 | 1:08:46.1 | 35.0 | inferred |
| 119 | WEATHER_INSTITUTE_SHELLY_DEFEATED | 1:12:05.0 | 1:11:11.1 | 145.0 | ocr |
| 120 | WEATHER_INSTITUTE_AQUA_WITHDRAWN | 1:12:15.0 | 1:11:21.1 | 10.0 | inferred |
| 121 | ROUTE_119_RIVAL_DEFEATED | 1:14:27.9 | 1:13:34.0 | 132.9 | overlay |
| 122 | ROUTE_119_RIVAL_SCENE_COMPLETE | 1:14:35.0 | 1:13:41.1 | 7.1 | ocr |
| 123 | FORTREE_CITY | 1:14:45.0 | 1:13:51.1 | 10.0 | inferred |
| 124 | ROUTE_120 | 1:15:10.0 | 1:14:16.1 | 25.0 | inferred |
| 125 | DEVON_SCOPE_RECEIVED | 1:15:50.0 | 1:14:56.1 | 40.0 | ocr |
| 126 | ROUTE_121 | 1:17:10.0 | 1:16:16.1 | 80.0 | inferred |
| 127 | ROUTE_122 | 1:18:10.0 | 1:17:16.1 | 60.0 | inferred |
| 128 | MT_PYRE | 1:18:25.0 | 1:17:31.1 | 15.0 | inferred |
| 129 | MT_PYRE_SUMMIT | 1:19:50.0 | 1:18:56.1 | 85.0 | bracketed |
| 130 | MAGMA_EMBLEM_RECEIVED | 1:21:09.0 | 1:20:15.1 | 79.0 | ocr |
| 131 | FORTREE_GYM_OBSTRUCTION_CLEARED | 1:21:47.0 | 1:20:53.1 | 38.0 | ocr |
| 132 | FORTREE_GYM_ENTERED | 1:22:00.0 | 1:21:06.1 | 13.0 | inferred |
| 133 | WINONA_DEFEATED | 1:26:51.9 | 1:25:58.0 | 291.9 | overlay |
| 134 | FORTREE_GYM_COMPLETE | 1:26:54.0 | 1:26:00.1 | 2.1 | ocr |
| 135 | FEATHER_BADGE | 1:26:54.0 | 1:26:00.1 | 0.0 | ocr |
| 136 | AERIAL_ACE_RECEIVED | 1:27:04.0 | 1:26:10.1 | 10.0 | ocr |
| 137 | MAGMA_HIDEOUT | 1:28:40.0 | 1:27:46.1 | 96.0 | bracketed |
| 138 | MAGMA_HIDEOUT_MAXIE_CHAMBER | 1:33:10.0 | 1:32:16.1 | 270.0 | ocr |
| 139 | MAGMA_HIDEOUT_MAXIE_DEFEATED | 1:34:56.9 | 1:34:03.0 | 106.9 | overlay |
| 140 | MAGMA_HIDEOUT_STORY_COMPLETE | 1:35:05.0 | 1:34:11.1 | 8.1 | ocr |
| 141 | SLATEPORT_HARBOR | 1:35:25.0 | 1:34:31.1 | 20.0 | frame |
| 142 | SLATEPORT_SUBMARINE_THEFT_WITNESSED | 1:35:55.0 | 1:35:01.1 | 30.0 | ocr |
| 143 | AQUA_HIDEOUT_ACCESS_OPENED | 1:35:55.0 | 1:35:01.1 | 0.0 | inferred |
| 144 | LILYCOVE_CITY | 1:36:10.0 | 1:35:16.1 | 15.0 | bracketed |
| 145 | AQUA_HIDEOUT | 1:36:35.0 | 1:35:41.1 | 25.0 | frame |
| 146 | AQUA_HIDEOUT_SUBMARINE_CHAMBER | 1:39:10.0 | 1:38:16.1 | 155.0 | ocr |
| 147 | AQUA_HIDEOUT_MATT_DEFEATED | 1:39:50.0 | 1:38:56.1 | 40.0 | frame |
| 148 | AQUA_HIDEOUT_ESCAPE_COMPLETE | 1:40:00.0 | 1:39:06.1 | 10.0 | inferred |
| 149 | ROUTE_124 | 1:40:50.0 | 1:39:56.1 | 50.0 | bracketed |
| 150 | MOSSDEEP_CITY | 1:41:45.0 | 1:40:51.1 | 55.0 | frame |
| 151 | MOSSDEEP_GYM_ENTERED | 1:42:15.0 | 1:41:21.1 | 30.0 | bracketed |
| 152 | TATE_AND_LIZA_DEFEATED | 1:47:48.9 | 1:46:55.0 | 333.9 | overlay |
| 153 | MOSSDEEP_GYM_COMPLETE | 1:47:51.0 | 1:46:57.1 | 2.1 | ocr |
| 154 | MIND_BADGE | 1:47:51.0 | 1:46:57.1 | 0.0 | ocr |
| 155 | CALM_MIND_RECEIVED | 1:48:00.0 | 1:47:06.1 | 9.0 | ocr |
| 156 | SPACE_CENTER_OCCUPATION_ENTERED | 1:48:35.0 | 1:47:41.1 | 35.0 | frame |
| 157 | SPACE_CENTER_BATTLE_WON | 1:54:20.0 | 1:53:26.1 | 345.0 | ocr |
| 158 | SPACE_CENTER_STORY_COMPLETE | 1:54:40.0 | 1:53:46.1 | 20.0 | inferred |
| 159 | HM_DIVE_RECEIVED | 1:55:07.0 | 1:54:13.1 | 27.0 | ocr |
| 160 | ROUTE_127 | 1:55:50.0 | 1:54:56.1 | 43.0 | inferred |
| 161 | ROUTE_128 | 1:56:00.0 | 1:55:06.1 | 10.0 | inferred |
| 162 | SEAFLOOR_UNDERWATER_ENTRANCE | 1:56:05.0 | 1:55:11.1 | 5.0 | frame |
| 163 | SEAFLOOR_CAVERN | 1:56:15.0 | 1:55:21.1 | 10.0 | frame |
| 164 | SEAFLOOR_ARCHIE_CHAMBER | 1:57:40.0 | 1:56:46.1 | 85.0 | bracketed |
| 165 | SEAFLOOR_ARCHIE_DEFEATED | 1:59:08.9 | 1:58:15.0 | 88.9 | overlay |
| 166 | SEAFLOOR_KYOGRE_RELEASE_CONFIRMED | 1:59:15.0 | 1:58:21.1 | 6.1 | frame |
| 167 | ROUTE_126 | 2:01:40.0 | 2:00:46.1 | 145.0 | bracketed |
| 168 | SOOTOPOLIS_CITY | 2:02:05.0 | 2:01:11.1 | 25.0 | frame |
| 169 | CAVE_OF_ORIGIN | 2:03:15.0 | 2:02:21.1 | 70.0 | frame |
| 170 | CAVE_OF_ORIGIN_WALLACE_REACHED | 2:03:25.0 | 2:02:31.1 | 10.0 | ocr |
| 171 | WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE | 2:03:45.0 | 2:02:51.1 | 20.0 | ocr |
| 172 | ROUTE_131 | 2:04:15.0 | 2:03:21.1 | 30.0 | frame |
| 173 | SKY_PILLAR_OPENED | 2:04:45.0 | 2:03:51.1 | 30.0 | frame |
| 174 | SKY_PILLAR | 2:04:55.0 | 2:04:01.1 | 10.0 | frame |
| 175 | SKY_PILLAR_SUMMIT | 2:05:15.0 | 2:04:21.1 | 20.0 | frame |
| 176 | RAYQUAZA_AWAKENED | 2:05:45.0 | 2:04:51.1 | 30.0 | frame |
| 177 | SOOTOPOLIS_CRISIS_RESOLVED | 2:06:30.0 | 2:05:36.1 | 45.0 | frame |
| 178 | RAYQUAZA_CAUGHT (not a harness milestone) | 2:09:00.0 | 2:08:06.1 | 150.0 | ocr |
| 179 | HM_WATERFALL_RECEIVED | 2:09:41.0 | 2:08:47.1 | 41.0 | ocr |
| 180 | SOOTOPOLIS_GYM_ENTERED | 2:09:55.0 | 2:09:01.1 | 14.0 | frame |
| 181 | JUAN_DEFEATED | 2:11:52.9 | 2:10:59.0 | 117.9 | overlay |
| 182 | SOOTOPOLIS_GYM_COMPLETE | 2:11:55.0 | 2:11:01.1 | 2.1 | ocr |
| 183 | RAIN_BADGE | 2:11:55.0 | 2:11:01.1 | 0.0 | ocr |
| 184 | WATER_PULSE_RECEIVED | 2:12:06.0 | 2:11:12.1 | 11.0 | ocr |
| 185 | EVER_GRANDE_LANDING | 2:14:00.0 | 2:13:06.1 | 114.0 | bracketed |
| 186 | VICTORY_ROAD | 2:14:10.0 | 2:13:16.1 | 10.0 | bracketed |
| 187 | VICTORY_ROAD_WALLY_DEFEATED | 2:14:50.0 | 2:13:56.1 | 40.0 | bracketed |
| 188 | VICTORY_ROAD_B1F | 2:16:15.0 | 2:15:21.1 | 85.0 | bracketed |
| 189 | VICTORY_ROAD_B2F | 2:18:05.0 | 2:17:11.1 | 110.0 | bracketed |
| 190 | EVER_GRANDE_NORTH_REACHED | 2:19:20.0 | 2:18:26.1 | 75.0 | bracketed |
| 191 | POKEMON_LEAGUE_REACHED | 2:19:30.0 | 2:18:36.1 | 10.0 | bracketed |
| 192 | LEAGUE_ADMISSION_GRANTED | 2:19:37.0 | 2:18:43.1 | 7.0 | ocr |
| 193 | ELITE_FOUR_CHALLENGE_ENTERED | 2:20:05.0 | 2:19:11.1 | 28.0 | frame |
| 194 | ELITE_FOUR_SIDNEY_DEFEATED | 2:21:25.9 | 2:20:32.0 | 80.9 | overlay |
| 195 | ELITE_FOUR_PHOEBE_DEFEATED | 2:23:14.9 | 2:22:21.0 | 109.0 | overlay |
| 196 | ELITE_FOUR_GLACIA_DEFEATED | 2:25:00.9 | 2:24:07.0 | 106.0 | overlay |
| 197 | ELITE_FOUR_DRAKE_DEFEATED | 2:26:49.9 | 2:25:56.0 | 109.0 | overlay |
| 198 | CHAMPION_ROOM_REACHED | 2:27:15.0 | 2:26:21.1 | 25.1 | bracketed |
| 199 | WALLACE_DEFEATED | 2:29:32.9 | 2:28:39.0 | 137.9 | overlay |
| 200 | HALL_OF_FAME_ENTERED | 2:30:30.0 | 2:29:36.1 | 57.1 | bracketed |
| 201 | GAME_CLEAR_CONFIRMED | 2:30:48.9 | 2:29:55.0 | 18.9 | overlay |
| 202 | ROUTE_129 | — | — | — | not_identified |
| 203 | ROUTE_130 | — | — | — | not_identified |
| 204 | RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED (viewer frontier) | — | — | — | skipped |


## Route, map by map

Times are video time. Run time is 54 s less.

1. **Boot and setup.**
   - Clears the save (0:00:36), then sets options: Text FAST, Battle Scene OFF, Battle Style SHIFT (0:00:48).
   - NEW GAME at 0:00:54. Girl, named **A** (0:01:21).
2. **Littleroot.**
   - Truck to house to bedroom. **Saves in the bedroom at in-game time 0:00 (0:02:09), then soft-resets.** The © screen is at 0:02:16 and "internal battery has run dry" at 0:02:21.
   - Clock set at 0:02:34, then downstairs (TV scene), next door to Brendan's house (0:03:05–0:03:22), and out.
   - The save and reset start the RNG frame count for the target Mudkip. See the RNG section.
3. **Route 101.** Birch rescue. Mudkip chosen at 0:03:49. Zigzagoon is beaten with Tackle by 0:04:10, and he gets Mudkip at 0:04:24.
4. **Oldale → Route 103.**
   - Brendan battle 0:05:23–0:06:00: Tackle spam against Treecko. Mudkip learns Mud-Slap at Lv5→6.
   - Back through Littleroot: Pokédex at 0:06:45, Poké Balls at 0:06:56, Running Shoes at 0:07:17.
5. **Route 102.**
   - Fights Youngster **Calvin** (0:07:41–0:08:29). Mudkip Lv6 drops to **2/23 HP**, misses a Tackle, and still wins at Lv7. A top comment calls the WR "one turn away from dying to Calvin".
   - Runs from a wild Wurmple (0:08:47). Skips the other trainers.
6. **Petalburg.**
   - Mart, 5 Potions and Repels (0:08:51).
   - Pokémon Center entered without healing.
   - Gym: Dad at 0:09:20, Wally tutorial (Ralts caught 0:10:46), "Collect BADGES" at 0:11:06.
7. **Route 104 south (0:11:29–0:11:47, about 15 s).**
   - Leaves Petalburg west and is stopped briefly by a trainer at the town edge (0:11:21–0:11:29).
   - Runs north on the beach sand, left of the grass, past Briney's cottage.
   - Uses a Repel just before the Woods (0:11:41).
8. **Petalburg Woods (0:11:47–0:13:17, about 90 s).**
   - Walks the east side straight up to the Devon researcher (0:11:57).
   - Fights the Aqua grunt, about 0:12:27–0:12:54 (Mudkip Lv7→8, a crit Tackle). Gets the Great Ball at 0:13:02.
   - Leaves by the north exit.
9. **Route 104 north and Rustboro (0:13:17–0:13:35).** Straight to the gym door, at run 12:41.
10. **Rustboro Gym (0:13:36–0:18:40).**
    - Josh (0:14:57; Water Gun learned at Lv10 mid-fight), Tommy (0:15:40) and Hiker Marc (0:16:22). All three are fought. (Corrected 2026-11-04: OCR at 0:15:40 reads "Player defeated YOUNGSTER TOMMY".)
    - Roxanne at 0:16:30–0:18:15. Stone Badge at 0:18:23, TM39 at 0:18:32.
11. **Route 116 (0:18:40–0:21:41).**
    - The Devon employee is robbed (0:19:03).
    - Catches **Taillow Lv6 with the Great Ball** (0:19:52) and **Abra Lv7 with a Poké Ball** (0:20:22).
    - Repel. Fights Hiker Devan. Declines Bide at Lv15.
12. **Rusturf Tunnel (0:21:41–0:22:35).**
    - Aqua grunt fight (Water Gun, a crit) won by 0:22:12. Devon Goods at 0:22:19. Peeko returned.
13. **Rustboro / Devon (0:22:35–0:24:30).**
    - Great Ball from the employee (0:22:57). Devon at 0:23:01: Letter at 0:23:29, PokéNav at 0:23:36.
    - Mr. Stone Match Call, then **Abra Teleport to Petalburg** (about 0:24:30).
14. **Petalburg Mart (0:24:40–0:24:58).** 2 X Speed, 3 X Attack, 1 Repel.
15. **Route 104, Briney (0:25:05–0:25:35).** Briney cottage, then the boat to Dewford (0:25:33).
16. **Dewford → Route 106 → Granite Cave (about 0:26:05–0:27:26).**
    - **Dewford gym skipped.** Repel on Route 106. Picks up an Escape Rope (0:26:26).
    - Granite Cave in the dark with no Flash: 1F → B1F → B2F → Steven's room.
    - Letter handed over at 0:27:02, TM47 at 0:27:09, Steven registered at 0:27:19, Escape Rope out at 0:27:26.
17. **Dewford → Slateport by boat. Route 109 beach and Slateport (about 0:27:40–0:31:45).**
    - Soft Sand from the beach twins (0:28:00). Stern's shipyard (0:28:17).
    - Soft Sand given to Mudkip (0:28:27).
    - Museum (pays ₽50, 0:28:35). Grunt 1 at 0:29:29, where **Mudkip → Marshtomp** (0:29:53) and Mud Shot replaces Growl. Grunt 2 at 0:30:44.
    - Goods delivered at 0:31:12. Scott at 0:31:33.
18. **Route 110 (about 0:31:50–0:37:54, about 6 min).**
    - Pokéfans Isabel and Kaleb, a double Plusle/Minun fight (to 0:32:58). Full Heal found (0:34:08).
    - **Rival 2** at 0:34:52–0:36:14. Itemfinder at 0:36:17.
    - Triathlete Alyssa (0:36:52) and Psychic Edward (0:37:19). Elixir found with the Itemfinder (0:37:25).
    - Stays on the walking path, not the Cycling Road.
19. **Mauville (0:37:54–0:40:55).**
    - Rock Smash HM06 from the house (0:37:46), Mach Bike (0:38:16).
    - Rock Smash taught over Tackle (0:38:35). **Mach Bike registered to Select.**
    - Wally fight at 0:40:22.
20. **Mauville Gym (0:40:55–0:43:30).** Youngster Ben (0:41:33). Wattson. Dynamo Badge at 0:43:16, TM34 at 0:43:25.
21. **Route 111 (Rock Smash) → Route 112 → Fiery Path → Route 113 → Fallarbor (0:44:02–0:45:45).**
    - Repels. Nugget found on Route 113 (0:45:03).
    - Fallarbor Mart at 0:45:08. Sells the Nugget and TMs; see Shops.
22. **Route 114 → Meteor Falls (0:46:00–0:47:30).**
    - Hiker Lucas (0:46:38). Meteor Falls Magma/Aqua scene (0:46:52–0:47:15).
    - Out via Route 115, then Rustboro.
23. **Rusturf Tunnel again (0:48:00).** Rock Smash, HM04 Strength (0:48:06). Strength taught over Mud-Slap (0:48:31–37).
24. **Teleport → Mauville. Route 111/112 → cable car → Mt. Chimney (0:48:43–0:54:49).**
    - Aroma Lady Rose (0:49:39). Cable car at 0:50:09.
    - Magma grunt (0:51:22) and Tabitha (0:52:27). Maxie split at 0:54:17.
25. **Jagged Pass on the bike → Lavaridge (0:54:52–0:55:10).** Straight into the gym.
26. **Lavaridge Gym (0:55:10–0:57:30).**
    - Steam-vent shortcuts. Gym trainers mostly skipped (one battle, poisoned by Slugma's Smog).
    - Flannery. Heat Badge at 0:57:15, TM50.
    - May gives the Go-Goggles (0:57:49).
27. **Lavaridge Herb Shop (0:58:04).** Heal Powder, Energy Root, Energy Powder.
28. **Route 112 desert edge (0:58:38).** Rare Candy.
29. **Teleport → Mauville (0:58:44). Route 110 south on the bike (0:59:00). Slateport (0:59:12).** Briney's boat to Dewford (0:59:15–0:59:36).
30. **Dewford Gym (0:59:45–1:01:05).**
    - Brawly. Every Pokémon one-shot by Strength at Lv28 (Machop, Meditite, Makuhita).
    - Knuckle Badge at 1:00:47, TM08 at 1:00:57.
31. **Briney's boat back to Route 104 (1:01:21).** Rare Candy to Lv30 (1:01:55). Then Petalburg Gym (1:02:06).
32. **Petalburg Gym (1:02:06–1:07:10).**
    - Speed room (Cooltrainer Randall 1:02:43), Confusion room (Parker 1:03:24), Strength room (Jody 1:04:13).
    - Norman. Balance Badge at 1:06:50, TM42. Then HM03 Surf from Wally's father (1:07:38).
33. **Surf across Route 104/Petalburg water.** Rare Candy (1:08:10). Then to Mauville.
34. **Route 118 → Route 119 → Weather Institute (1:08:44–1:12:57).**
    - Steven on Route 118 (1:08:44). Route 119 trainers skipped.
    - Institute grunts at 1:09:56, 1:10:39 and 1:11:17. Shelly at 1:11:37–1:12:00.
    - Castform received at 1:12:24 (nicknamed "G"). Heals on the bed. Elixir at 1:12:57.
35. **Route 119 rival (1:13:30–1:14:28).** HM02 Fly at 1:14:32.
36. **Fortree → Route 120 (1:14:38–1:16:30).**
    - Gym skipped at first. Steven, Kecleon, Devon Scope at 1:15:50.
    - Hidden Rare Candy at 1:16:26.
37. **Route 121 (1:16:30–1:18:10).**
    - Mystic Water (1:16:54). Rare Candies to Lv36, **Marshtomp → Swampert** (1:17:36).
    - Fly taught to Taillow (1:17:49), Shock Wave to Castform (1:18:02).
38. **Route 122 surf → Mt. Pyre (1:18:10–1:21:30).**
    - Inside to the first exit and up the outside. Grunts at 1:19:05 and 1:19:31.
    - Summit double battle with Swampert + Castform (1:19:57). Magma Emblem at 1:21:09.
    - Runs from a wild Shuppet (1:21:24). Summit Rare Candy at 1:21:27.
39. **Teleport → Fortree (1:21:40).** Devon Scope on Kecleon (1:21:47). Fortree Gym (1:22:00–1:27:10).
40. **Cable car (1:27:52) → Jagged Pass → Magma Hideout (1:28:30–1:35:08).**
    - Grunts at 1:28:58, 1:29:29, 1:30:08, 1:30:38 and 1:31:11. Tabitha at 1:33:07.
    - Maxie split at 1:34:57. Escape Rope at 1:35:08.
41. **Fly → Slateport Harbor (1:35:25).** Submarine theft (1:35:55).
42. **Fly → Lilycove → surf → Aqua Hideout (1:36:10–1:40:30).**
    - Double battles at 1:37:05 and 1:38:35. Warp tiles.
    - Matt at 1:39:15–1:39:50. Max Elixir at 1:40:10.
43. **Route 124 surf → Mossdeep (1:41:45).**
    - Swimmer Declan's Gyarados on the way (1:40:55–1:41:25), beaten with 3 Strengths.
    - Mossdeep Mart.
44. **Mossdeep Gym (1:42:15–1:48:00).**
    - Rotating-switch puzzle. Psychic Maura double, Macey (1:43:47), Hex Maniac Sylvia (1:44:34), Hannah (1:45:05).
    - Tate & Liza. Mind Badge at 1:47:51, TM04.
45. **Space Center (1:48:35–1:54:40).**
    - Grunts at 1:48:56, 1:49:56, 1:50:26 and 1:50:56 (the last a 3-v-1).
    - Maxie + Tabitha double battle alongside Steven's Metang, to 1:54:20.
46. **Steven's house: HM08 Dive (1:55:07).** Dive taught over Mud Shot (1:55:40).
47. **Route 127/128 surf (1:55:45). Dive (1:56:05). Seafloor Cavern (1:56:15–1:59:20).**
    - Strength boulders and Rock Smash, all on the bike.
    - Archie at 1:58:02–1:59:06. Kyogre awakens (1:59:15).
48. **Rain. Steven. Surf (2:00:00–2:01:45) to the Route 126 dive spot. Dive → Sootopolis (2:02:05).**
    - Groudon vs Kyogre cutscene.
    - Cave of Origin, Wallace (2:03:25). Escape Rope (2:03:47).
49. **Fly → Pacifidlog (2:04:05). Route 131 surf (2:04:15). Sky Pillar (2:04:45–2:05:45).**
    - Wallace at the door. Bike up the cracked floors.
    - Rayquaza wakes and leaves (2:05:45).
50. **Fly to Sootopolis.** Rayquaza calms Groudon and Kyogre (2:06:05–2:06:35).
51. **Fly → Pacifidlog (2:06:55). Route 131. Sky Pillar again (2:07:35–2:08:20).** Max Repel. Saves at the top (in-game TIME 2:01, at 2:08:05).
52. **Rayquaza Lv70 caught with the first Poké Ball (2:08:57–2:09:00).** Rayquaza (it knows Fly) flies to Sootopolis (2:09:20).
53. **Sootopolis: HM07 Waterfall (2:09:41). Juan's gym (2:09:55–2:12:10).** Ice floor solved with no falls. Rain Badge at 2:11:55, TM03.
54. **Surf Routes 127/128 east → Ever Grande waterfall (2:12:35–2:14:00).** Teaches Aerial Ace (2:13:14) and Waterfall (2:13:27) to Rayquaza.
55. **Victory Road (2:14:00–2:19:20).**
    - Wally first at 2:14:15–2:14:50: Altaria, Delcatty, …, the rest Outrage.
    - Cooltrainers Hope (2:15:49), Shannon/Julie (2:16:35–2:17:50), Edgar (2:18:48–2:19:15).
    - **No Flash** on the dark B1F. Strength and Rock Smash. Surf plus Waterfall on B2F.
56. **Ever Grande → League (2:19:30).** Badge check at 2:19:36. Party trimmed to Rayquaza only. Then the E4 and Wallace (2:20:05–2:29:27). Hall of Fame at 2:30:38.

## Team over time

| Point (video) | Party (levels) |
|---|---|
| Rival 1 (0:05:23) | Mudkip 5→6 |
| Calvin (0:07:41) | Mudkip 6→7 |
| Woods grunt (0:12:27) | Mudkip 7→8 |
| Roxanne (0:16:30) | Mudkip 13→14 (Water Gun at 10) |
| Route 116 (0:20:22) | Mudkip 14–15, Taillow 6 (caught Route 116), Abra 7 (caught Route 116) |
| Museum (0:29:53) | **Marshtomp** 16 (evolved mid-fight), Taillow 6, Abra 7 |
| Rival 2 (0:35:00) | Marshtomp 18→20 |
| Wattson (0:42:20) | Marshtomp 22→23 |
| Maxie 1 (0:53:15) | Marshtomp 26–27 |
| Flannery (0:56:20) | Marshtomp 27→28 |
| Brawly (1:00:00) | Marshtomp 28→29, then Rare Candy to 30 |
| Norman (1:05:22) | Marshtomp 30→32 |
| Shelly / Rival 3 (1:11–1:14) | Marshtomp 33→34, Castform 26 (from 1:12:24) |
| Route 121 (1:17:36) | **Swampert** 36 (Rare Candies 35, 36), Castform 26–27, Taillow 6, Abra 7 |
| Winona (1:24:45) | Swampert 38→39 |
| Maxie 2 (1:34:00) | Swampert 40→41 |
| Tate & Liza (1:46:00) | Swampert 42→43, Castform 27, Taillow 6, Abra 7 |
| Space Center (1:54:00) | Swampert 44→45 |
| Archie (1:58:00) | Swampert 45 |
| Rayquaza caught (2:09:00) | Swampert 45, Rayquaza 70, Castform/Taillow/Abra (fainted) |
| Juan (2:10:35) | Rayquaza 70 |
| Victory Road (2:17:45) | Rayquaza 70→71 |
| Phoebe (2:22:35) | Rayquaza 71→72 |
| Drake (2:26:05) | Rayquaza 72→73 |
| Hall of Fame | Rayquaza 73, alone (the others deposited before the League) |

His notes on the starter: Mudkip RNG frame 5822, **Lonely**, IVs 25/28/31/30/22/27 (from the video description and the on-screen overlay "Frame 5822 Lonely").

## TMs/HMs and move changes

Move learns:
- Mudkip learns Mud-Slap at Lv6 (0:05:54) and Water Gun at Lv10 (0:14:53).
- Marshtomp learns Mud Shot over Growl at Lv16 (0:30:06).
- Bide declined at Lv15. Foresight declined at Lv20 (0:36:09).

TM/HM teaches:
- **HM06 Rock Smash → Marshtomp, replacing Tackle** (0:38:35).
- **HM04 Strength → Marshtomp, replacing Mud-Slap** (0:48:31–37).
- **HM03 Surf → Marshtomp, replacing Water Gun** (1:08:01).
- **HM02 Fly → Taillow** (1:17:49). This is the Fly carrier until Rayquaza; Rayquaza flies at 2:09:20.
- **TM34 Shock Wave → Castform** (1:18:02).
- **HM08 Dive → Swampert, replacing Mud Shot** (1:55:40).
- **TM40 Aerial Ace → Rayquaza** (2:13:14). The operator's notes say it replaced Extreme Speed.
- **HM07 Waterfall → Rayquaza** (2:13:27). The operator's notes say it replaced Rest.

More declines: Take Down at Lv31 (1:05:30), Muddy Water at Lv39 (1:26:42) and Mud Sport.

Rayquaza's battle moves: Outrage, Waterfall, Aerial Ace. Its Fly is a level-up move.

HM logistics:
- Swampert carries Rock Smash, Strength, Surf and Dive. Taillow carries Fly; Rayquaza takes it over later. Rayquaza carries Waterfall.
- No Cut and no Flash anywhere.
- No HM slave beyond Taillow, and no Move Deleter.

TMs sold or unused: TM39 Rock Tomb (sold), TM47 Steel Wing, TM50, TM42, TM08, TM04, TM03.

## Shops (money read from the money window)

| Where (video) | Bought / sold | ₽ before → after |
|---|---|---|
| Petalburg Mart (0:08:51) | 5 Potion, Repels | ₽3380 → ₽1880 after the Potions, then Repels |
| Petalburg Mart after Teleport (0:24:45) | 2 X Speed, 3 X Attack, 1 Repel | ₽4008 → ₽1458 |
| Fallarbor Mart (0:45:12) | **Sold** Nugget (+5000), TM39 (+1500), one more ₽1500 item. **Bought** 1 Super Potion, 2 Escape Rope, 11 Super Repel, 3 X Special, 5 X Speed, 10 X Attack, 1 Guard Spec | ₽8844 → 16844 → about ₽1044 |
| Lavaridge Herb Shop (0:58:05) | 4 Heal Powder, 4 Energy Root, 6 Energy Powder | ₽8204 → ₽204 |
| Mossdeep Mart (1:41:57) | 11 Hyper Potion, 2 Revive, 11 Max Repel, 11 X Attack | ₽34352 → ₽4952 |

Field pickups (OCR "found one"):

| Item | Where (video) |
|---|---|
| Escape Rope | Route 106 (0:26:26) |
| Full Heal | Route 110 (0:34:08) |
| Elixir | Route 110, Itemfinder (0:37:25) |
| Nugget | Route 113 (0:45:03) |
| Rare Candy | Route 112/111 desert edge (0:58:38) |
| Rare Candy | water's edge after Surf (1:08:10) |
| Elixir | Route 119 (1:12:57) |
| Rare Candy | hidden, Route 120 (1:16:26) |
| Rare Candy | Mt. Pyre summit (1:21:27) |
| Max Elixir | Aqua Hideout (1:40:10) |

He also gets the Mystic Water (1:16:54) and the Soft Sand (0:28:00).

Held items:
- Soft Sand on Mudkip/Marshtomp from 0:28:27, which boosts Mud Shot and Mud-Slap.
- Mystic Water on Swampert from about 1:17. The Soft Sand is back in the bag by 1:52 and 2:01.
- Rayquaza holds nothing (summary screen at the end: ITEM NONE).

Repel use: one at every route transition where he walks or bikes through grass, caves or water.

| Repel type | When (video) |
|---|---|
| Repel | 0:11:41, 0:20:46 and others |
| Super Repel | from 0:45:52 (0:45:52, 0:47:30, 0:48:25 and on) |
| Max Repel | from 1:42 (1:57:32, 2:04:00, 2:07:51 and on) |

Taxis:

| Kind | Trips (video) |
|---|---|
| Abra Teleport (to the last Pokémon Center) | Rustboro → Petalburg (0:24:30); Rusturf → Mauville (0:48:43); desert → Mauville (0:58:44); Mt. Pyre → Fortree (1:21:40) |
| Mr. Briney's boat | Route 104 → Dewford (0:25:33); Dewford → Slateport (0:27:30); Slateport → Dewford (0:59:15); Dewford → Route 104 (1:01:21) |
| Fly | Taillow from 1:35 (Slateport, Lilycove, Mossdeep, Pacifidlog); Rayquaza from 2:09 |
| Escape Rope | Granite Cave, Magma Hideout, Cave of Origin |
| Mach Bike | everywhere outdoors from 0:38:16, on the Select button |

## Menu, text and option tricks

- **Options before the timer:** Text FAST, Battle Scene OFF, Battle Style SHIFT.
- Name **"A"**, which needs the fewest inputs.
- Castform is nicknamed "G". Other Pokémon are not nicknamed; he declines nickname prompts (2:09:16 Rayquaza).
- Mach Bike is registered to Select.
- He mashes through dialogue.
- **Soft reset after the bedroom save.** It sets the RNG timing; see the next section.
- "Double potion" (commentary at about 1:43–1:45): "if you have to use two potions, it's just faster to use both" one after the other.
- He talks about avoiding wasted menu openings ("I don't want to waste a menu").

## RNG, catches and luck

- **Starter RNG.** He targets Mudkip **RNG frame 5822 (Lonely, 25/28/31/30/22/27)**. The description credits themathgenius, https://spo.ink/5822, and the overlay shows "Frame 5822 Lonely".
- Emerald's RNG starts from a fixed seed at boot (a dry battery). His run saves in the bedroom, soft-resets (0:02:09–0:02:21), and then times the Continue and the Birch encounter to land on the frame. This is RNG manipulation, and the exact inputs are not visible.
- **Rayquaza** Lv70 at full HP, Swampert at 17 HP, caught with the **first Poké Ball** (2:08:57–2:09:00). He saved at the summit first (2:08:05).
  - At full HP a Poké Ball has about a 2–3% chance on Rayquaza, so this is RNG-timed. The save gives him a reset point if it fails.
  - From the commentary (2:09:03): "I got bonka sky pillar" (auto-caption). It sounds like the Sky Pillar went faster than usual, not like a remark on the catch.
- Other luck he mentions:
  - "Gunner Sapphire E4 type luck" (description).
  - Glacia: "dodge every single Blizzard" with no X Special left ("I don't have an X special … quiet" Rayquaza, 2:19:58–2:26:37).
  - Wallace: Gyarados Dragon Dance set-up, and his plan was "set up two on Wailord, one on Gyarados".
  - Winona: Tropius Solar Beam left Swampert at 22 HP. His commentary: "if it can happen, it will happen on Winona … Perish Song Tropius".

## Battle plans (leads, moves, items)

- **Rival 1 (0:05:23).** Tackle ×5.
- **Calvin (0:07:57).** Tackle. Mudkip goes to 2 HP after a missed Tackle, and he still wins.
- **Roxanne (0:16:30–0:18:15).**
  - Geodude ×2: Water Gun one-shots each.
  - Nosepass: Harden, Rock Tomb, then Oran Berry and Roxanne's Potion. Water Gun ×4 plus one stray Tackle.
- **Rival 2, Route 110 (0:34:52).**
  - X Attack and X Speed first, then Slugma's Yawn puts Mudkip to sleep. Potion. Mud-Slap OHKOs Slugma.
  - Grovyle: Mud Shot, then a Tackle finish.
  - Wingull: Tackle ×2. Marshtomp ends at 13/63.
- **Wattson (0:42:05–0:43:14).**
  - X Speed and X Attack (Voltorb uses Rollout). Mud Shot OHKOs Voltorb, Electrike and Magneton.
  - Manectric: Howl, then Mud Shot.
- **Maxie 1 (0:53:12).**
  - Leads Taillow, which takes Bite and faints: a free switch.
  - **Guard Spec** (blocks Mightyena's Intimidate), then X Attack. Strength on Mightyena and Zubat, Mud Shot on Camerupt.
- **Flannery (0:56:10).**
  - X Attack. Slugma (Smog poisons him): Strength.
  - Camerupt: Mud Shot. Torkoal (Sunny Day): Mud Shot ×2.
- **Brawly (1:00:01).** Strength ×3 against Machop, Meditite, Makuhita.
- **Norman (1:05:00).**
  - X Attack ×3, X Speed, **Heal Powder ×2**. Strength on Spinda.
  - Vigoroth: Slash, Potion, Mud Shot.
  - Slaking: Strength, then Rock Smash ×2 against Facade. Mud Shot crit.
- **Shelly (1:11:37).** Mud Shot against Carvanha, then Surf against Mightyena.
- **Rival 3 (1:13:30).**
  - X Speed and X Attack. Surf on Slugma, Strength on Grovyle.
  - Pelipper Protect/Mist stall: Strength ×3.
- **Winona (1:24:45).**
  - Swablu: Strength (X Attack used).
  - Tropius: Aerial Ace, Strength, Energy Powder, then Solar Beam is super effective and leaves Swampert at 22 HP. Strength finishes it.
  - Pelipper: Protect ×4 around X Attacks, then Strength ×2.
  - Skarmory: Surf. Altaria: Strength.
- **Maxie 2 (1:33:50).**
  - Mightyena: Surf at 28 HP.
  - Crobat: Wing Attack, Energy Powder, and Maxie uses a Super Potion. Surf ×2.
  - Camerupt: Surf.
- **Matt (1:39:23).** Surf on Mightyena and Golbat.
- **Tate & Liza double (1:45:30).**
  - Uses Potions before the fight. In battle: X Speed, X Special, X Attack, and a Revive on Castform.
  - Taillow and Abra are sent in to eat Xatu's Psychic: turn fodder.
  - Surf (spread) against Claydol and Xatu (Earthquake from Claydol), then Surf against Solrock and Lunatone.
- **Space Center double with Steven (1:52:00).**
  - Guard Spec, X Special. Swampert's Mist blocks Scary Face. Metang uses Reflect and Light Screen.
  - Surf against Mightyena, Camerupt (Amnesia), Crobat and Golbat.
- **Archie (1:58:02).**
  - Surf against Mightyena. X Speed and Energy Powder against Crobat's Air Cutter.
  - At 17 HP, Surf against Crobat and Sharpedo.
- **Juan (2:10:35).**
  - Rayquaza Outrage against Kingdra, Sealeo and Whiscash.
  - Confusion from fatigue. Crawdaunt's Crabhammer, then Outrage.
- **Wally, Victory Road (2:14:15).** Aerial Ace against Altaria, Waterfall against Delcatty and Magneton, Outrage against Roselia and Gardevoir.
- **Sidney (2:20:15).** Waterfall against Mightyena and Absol, Aerial Ace against Shiftry, Outrage against Cacturne and Crawdaunt.
- **Phoebe (2:21:55).** Dusclops Protect stall: Aerial Ace. Then Outrage against Banette, Sableye and Banette.
- **Glacia (2:23:45).** One X Attack, then Aerial Ace against Sealeo, Glalie, Sealeo and Glalie, and Outrage (crit) against Walrein.
- **Drake (2:25:28).** One X Attack, Aerial Ace against Shelgon, Altaria and Flygon. Lv73. Outrage against Salamence and Kingdra.
- **Wallace (2:27:32).**
  - X Attack ×2 around Wailord (it misses twice). Aerial Ace against Wailord, Tentacruel and Milotic.
  - X Attack again at Gyarados (Intimidate, then Dragon Dance ×2). Aerial Ace against Gyarados, Ludicolo and Whiscash.

## Trainers deliberately skipped (examples)

- Route 102: all but Calvin.
- Route 104 and the Woods: all but the Aqua grunt.
- Rustboro Gym: none (Tommy was listed here in error; OCR shows he beat Tommy at 0:15:40).
- Dewford Gym: all gym trainers on the second visit.
- Route 111 and 112.
- Route 113 and 114: all but Hiker Lucas.
- Lavaridge Gym: most trainers.
- Route 118, 119 and 120.
- Fortree Gym: most trainers, until the double.
- Aqua Hideout: some.
- Mossdeep Gym: rotated switches to avoid some trainers.
- Route 124, 127 and 128 swimmers: except Declan (forced).
- Route 130/131.

He skips them with Repels, by routing around sight lines, with the bike, and by taking routes that need no trainer fights. Victory Road trainers are fought because Rayquaza one-shots them on the forced path.

## Death and reset risk, and backups he mentions

- Calvin at 2 HP (0:08:00). A death there ends the run.
- Commentary at about 0:08:25: "the last time I made it here, I died. I missed tackle and took tackle".
- Winona (about 1:20–1:30 commentary): "if it can happen, it will happen on Winona … so many … Perish Song Tropius". As a safety option he mentions "a hidden Revive you can pick up in the grass in Route 120 if you want safety for Castform".
- Archie at 17 HP.
- Glacia and Wallace: no X Special left; he needs Blizzard misses and Gyarados set-ups to go his way.
- The Rayquaza save is the reset point if the ball fails.
- Elixir skip: "I'm not doing elixir skip … too low HP to do it" (about 0:38:34 commentary).

## Per-map time and path (priority maps)

Path frames at 2 fps are in `frames/path/<map>/`; sheets are in `sheets/path/`.

| Map | Video in → out | Time | Path |
|---|---|---|---|
| Route 104 south | 0:11:29 → 0:11:47 | about 18 s | West out of Petalburg, then north along the beach sand, staying out of the grass. Past Briney's cottage, a Repel at the woods mouth. |
| Petalburg Woods | 0:11:47 → 0:13:17 | about 90 s (about 27 s is the grunt battle) | Up the east side straight to the Devon researcher, grunt fight, Great Ball, north exit. Nothing else visited. |
| Route 104 north | 0:13:17 → 0:13:25 | about 8 s | Straight north. Flower-bed trainers skipped. |
| Rustboro City (first) | 0:13:25 → 0:13:36 | about 11 s | Straight to the gym door. |
| Rustboro Gym | 0:13:36 → about 0:18:40 | about 5 min | Josh, Tommy, Marc, Roxanne. |
| Route 116 | about 0:18:50 → 0:21:41 | about 3 min | Catches Taillow and Abra in the first grass, Repel, Hiker Devan, east to the tunnel. |
| Rusturf Tunnel | 0:21:41 → 0:22:35 | about 54 s | Grunt is right inside. Goods, Peeko, out west. |
| Rustboro / Devon | 0:22:35 → 0:24:30 | about 2 min | Employee, Devon 1F → 3F president. Letter, PokéNav, Match Call. Teleport. |
| Petalburg (Mart) → Route 104 → Briney | 0:24:30 → 0:25:35 | about 65 s | Mart, then down the beach to the cottage. Briney sails. |
| Dewford → Route 106 | about 0:26:05 → 0:26:30 | about 25 s | Off the boat, west and north along the beach to the cave. Repel. Escape Rope pickup. |
| Granite Cave | 0:26:30 → 0:27:26 | about 56 s | 1F → ladder → B1F → B2F → up to Steven's room, in the dark with no Flash. Letter, TM47, Escape Rope. |
| Dewford → Slateport (boat), Route 109 beach | about 0:27:30 → 0:28:05 | about 35 s | Briney boat. Soft Sand twins on the beach. |
| Slateport | 0:28:05 → about 0:31:50 | about 3.75 min | Shipyard (Stern gone), museum (₽50), two grunts, Goods, Scott, north to Route 110. |
| Route 110 | about 0:31:50 → 0:37:54 | about 6 min | Pokéfan double, Full Heal, Rival 2, Itemfinder, Alyssa, Edward, Elixir. Lower walking path. |
| Mauville City | 0:37:54 → 0:40:55 | about 3 min | Rock Smash house, Rydel's Cycles (Mach Bike), Wally battle, gym. |
| Mauville Gym | 0:40:55 → 0:43:30 | about 2.5 min | Youngster Ben, one switch on the left, Wattson. |

## Likely missed by the operator's notes

1. **Exact splits and the timer offset.** His 20 LiveSplit splits are listed above. The operator's draft quoted "2:24:44 vs 2:29:44"; the title is 2:29:44, which is 2:29:55 before DS conversion. "Dewford" is a split for the Steven letter and leaving Dewford, not for Brawly.
2. **The starter is RNG-manipulated.** Frame 5822, Lonely, 25/28/31/30/22/27. He saves in the bedroom at in-game 0:00 and soft-resets (0:02:09–0:02:21) before the clock. The notes treat the opening as plain options and naming.
3. **Battle Style SHIFT and Battle Scene OFF** are set alongside Text FAST.
4. **Calvin at 2 HP.** The run was nearly over on Route 102.
5. **Taillow was caught with the Great Ball** from the Woods researcher. He has Poké Balls ×4, Great Ball ×1 at the Rayquaza catch: 4 Poké Balls left.
6. **Route correction for the Knuckle Badge.** After Flannery he Teleports to Mauville, bikes Route 110 to Slateport and takes **Mr. Briney's boat** to Dewford. He then sails back to **Route 104** and walks into Petalburg. The notes say Route 109 on foot and an Abra to Petalburg.
7. **Briney's boat is used four times as a taxi**, and Teleport four times. Teleport targets the last Pokémon Center used.
8. **Shop totals with prices**, including **selling the Nugget and TMs in Fallarbor** for about ₽8000 to fund 10 X Attacks, 11 Super Repels and more. The Herb Shop buys come to Heal Powder ×4, Energy Root ×4, Energy Powder ×6 (₽8000). Mossdeep comes to 11 Hyper Potions, 2 Revives, 11 Max Repels and 11 X Attacks.
9. **Item pickups** with times: Full Heal, two Elixirs, a Max Elixir, four Rare Candies besides the desert one, the Nugget, and the Escape Rope on Route 106.
10. **Castform is nicknamed "G"**, and both Castform and Swampert carry move changes; the full move table is above.
11. **Swampert's Mist** blocks Scary Face at the Space Center. Steven's Metang sets up Reflect and Light Screen.
12. **Pelipper Protect stalls** (Rival 3, Winona) and **Dusclops Protect** (Phoebe) cost turns. A commenter notes the run was "almost perfect except one protect".
13. **Rayquaza knows Fly** and becomes the Fly taxi after the catch. The catch used the **first** Poké Ball after a save at the summit (in-game 2:01).
14. **No X Special for the endgame**, so Glacia and Wallace depend on Blizzard misses. His plan was to set up X Attacks on Wailord and Gyarados.
15. **He mentions safety options:** a hidden Revive in Route 120 grass for Castform, and an "Elixir skip" he dropped because his HP was too low.
16. **Rotating-switch trainer avoidance** in the Mossdeep Gym, and **steam-vent shortcuts** in the Lavaridge Gym.
17. **Victory Road trainers are fought, not skipped**, because Rayquaza one-shots them on the forced path. That includes Wally's whole team.
18. **Commentary content is mostly off-route**: glitched-category "box names", ACE, TTYD, IV/trainer-ID combinatorics. Little of it is route instruction, so the frames and OCR are the evidence base.

## Files

Everything is in `~/dev/pokebench/runs/keepingiticy-video/`:
- `splits.csv`, `transitions.csv` (996 fades and cuts; the `map_after` labels were cleared because they were unreliable), `ocr_dialogue.tsv`, `boss_logs.txt`, `transcript.txt`.
- `yt/` holds the info JSON, description, auto-captions .vtt and comments.
- `sheets/` holds the 10 s, burst, shop, path and transition contact sheets.
- `frames/` holds the 10 s frames, 1 fps OCR crops, 2 fps path frames and transition thumbnails.
- `operator-notes/`.
