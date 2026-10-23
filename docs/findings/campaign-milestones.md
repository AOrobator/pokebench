# Campaign arrivals, story milestones and earned drought resets

Reference: clean pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`; US Emerald ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

## Contract

94 campaign additions and eight optional capability/reward additions extend the existing shared catalog. Existing milestones retain their IDs and predicates. Catalog order is a display order, not a compulsory route. Each event is observed once in a run; checkpoint predicates already true are present_at_start, unknown data supplies no negative baseline. First-observation timestamps are upper bounds. Arrival means newly observed in this run, not proof that a resumed save never visited elsewhere before its checkpoint.

Measurement-only `campaign-story-milestones-v1` adds the locked 512-byte saved-variable block (save1+0x139c) and avatar flags (gPlayerAvatar at 0x02037590) to story_progress. Existing flags use save1+0x1270. No raw measurement bytes enter the model readout. Native recording rejects missing nonnull modern payload fields. Historical sparse memory may lack the avatar byte: unknown is omitted, never replaced by on-foot. Exact short native reads still raise.

Behavior switch `campaign-progress-clock-v1` is default OFF. ON: an observed non-optional extended campaign milestone resets wall/action drought once; present_at_start, duplicates and optional achievements do not. Its supervisor last-progress label and the map history described as since that progress reset together. First catch, first Pokémon Center heal and first evolution remain optional activities and do not reset the campaign clock. Map-cycle policy and future-goal hints are unchanged. OFF: prior extended-measurement exclusion and briefing bytes remain. No active preset or measured run is altered.

Optional acquisitions are recorded, excluded from REQUIRED_FRONTIER_MILESTONES and both agent/viewer depth orders, and shown after an Optional achievements separator in splits.

## Arrival boundaries

- All new arrivals require a started known stable map. Surface-route arrivals additionally require no battle and explicitly unlocked field controls; missing lock state is unknown. Interior arrivals can count during their automatic entry scripts, so Champion/Hall of Fame arrival does not wait for the scene to finish.
- Route109 beach additionally requires land avatar flags (on foot/bike, not Surf/underwater) and y<=25. The source boat landing is at (21,26), followed by three walk-up steps; boat transit holds field controls. See DewfordTown_EventScript_SailToSlateport and DewfordTown_Movement_ExitBoatSlateport.
- Route111 northern split is land at y<=99, beyond source breakable rocks (18,101)/(19,100).
- Route118 east-bank split is land at x>=39, a conservative eastern region containing the east fisherman (39,15) and Steven triggers x43..45. It cannot be earned from the western Mauville approach.
- Ever Grande landing is land y40..57, above the source visited triggers y58 and containing the southern Pokémon Center / cave entrance. Northern approach is land y<=27 containing the northern Victory Road exit. The latter is deliberately an arrival label, not a claim that the player traversed the cave in that run.
- Cave/Hideout chamber labels identify maps or levels, not successful conversations. Aqua B2F is labeled submarine level because reaching that map does not prove approaching Matt.

## Story semantics and reset traps

- Native trainer victory flags are TRAINER_FLAGS_START (0x500) + exact initial trainer ID; Route119 uses all six gender/starter variants. Wins and following story handoffs remain separate.
- Space Center uses VAR_MOSSDEEP_SPACE_CENTER_STATE=3 as an upper-bound confirmation of the paired battle win and occupation resolution. The special partner battle does not use the ordinary trainer callback; do not invent two trainer-bit receipts. FLAG_DEFEATED_MAGMA_SPACE_CENTER is notification state and later clears. See MossdeepCity_SpaceCenter_2F_EventScript_DefeatedMaxieTabitha and RivalRayquazaCall.
- Weather Institute uses saved state 1 or 2; receiving Castform is a separate optional reward.
- In Emerald, MtPyre_Summit gives ITEM_MAGMA_EMBLEM and sets FLAG_RECEIVED_RED_OR_BLUE_ORB. Never label it an Orb receipt.
- MagmaHideout_4F sets its awakening flag after the Maxie battle and closing dialogue; this is story completion, not the earlier animation start.
- Sky Pillar opened uses Sootopolis stage 4/5/6, awakened uses 5/6, crisis resolved uses Sky Pillar stage 2/3. All relevant source writers were audited; Rayquaza capture/defeat is optional and not a completion proxy.
- League admission is the guard flag, challenge entry is first stable Sidney-room arrival. Individual Elite Four wins retain first earned evidence even when game flags clear on whiteout or Hall of Fame. They do not imply one successful attempt or Champion completion.
- Champion Wallace victory, Hall of Fame room arrival and GameClear FLAG_SYS_GAME_CLEAR are distinct. GameClear is not a claim of a successful durable Hall of Fame disk save.

## Shared consumers and historical compatibility

Production reader -> typed state/events -> StateMilestones -> recorder -> native evidence qualifier -> replay/native comparison reader -> split table/frontier. Each modern measurement version prevents missing-event repair for its own entries; an older all-gym marker does not imply new campaign coverage. Hash-verified old sidecars retain validation of every supplied field; newly decoded raw variable/avatar fields are separately declared recovered campaign coverage. Original events/frames remain immutable.

## Predicate catalog

| ID | Predicate | Classification |
|---|---|---|
| `ROUTE_106` | `{"map":[0,21],"settled":true}` | campaign |
| `GRANITE_CAVE_B1F` | `{"map":[24,8],"settled":false}` | campaign |
| `GRANITE_CAVE_B2F` | `{"map":[24,9],"settled":false}` | campaign |
| `ROUTE_109_BEACH_REACHED` | `{"map":[0,24],"settled":true,"land":true,"bounds":[0,0,39,25]}` | campaign |
| `HM_ROCK_SMASH_RECEIVED` | `{"flag":107}` | campaign |
| `RUSTURF_TUNNEL_OPENED` | `{"flag":199}` | campaign |
| `HM_STRENGTH_RECEIVED` | `{"flag":106}` | campaign |
| `ROUTE_111_NORTH` | `{"map":[0,26],"settled":true,"land":true,"bounds":[0,0,39,99]}` | campaign |
| `ROUTE_112` | `{"map":[0,27],"settled":true}` | campaign |
| `FIERY_PATH` | `{"map":[24,14],"settled":false}` | campaign |
| `ROUTE_113` | `{"map":[0,28],"settled":true}` | campaign |
| `FALLARBOR_TOWN` | `{"map":[0,13],"settled":true}` | campaign |
| `ROUTE_114` | `{"map":[0,29],"settled":true}` | campaign |
| `METEOR_FALLS` | `{"map":[24,0],"settled":false}` | campaign |
| `METEOR_FALLS_CONFRONTATION_RESOLVED` | `{"flag":207}` | campaign |
| `MT_CHIMNEY` | `{"map":[24,12],"settled":false}` | campaign |
| `MT_CHIMNEY_MAXIE_DEFEATED` | `{"flag":1882}` | campaign |
| `MT_CHIMNEY_STORY_COMPLETE` | `{"flag":139}` | campaign |
| `JAGGED_PASS` | `{"map":[24,13],"settled":false}` | campaign |
| `LAVARIDGE_TOWN` | `{"map":[0,12],"settled":true}` | campaign |
| `HM_SURF_RECEIVED` | `{"flag":122}` | campaign |
| `ROUTE_118_EAST_BANK_REACHED` | `{"map":[0,33],"settled":true,"land":true,"bounds":[39,0,69,19]}` | campaign |
| `ROUTE_118_STEVEN_SCENE_COMPLETE` | `{"variable":16497,"values":[1],"maximum":1}` | campaign |
| `ROUTE_119` | `{"map":[0,34],"settled":true}` | campaign |
| `WEATHER_INSTITUTE_ENTERED` | `{"map":[32,0],"settled":false}` | campaign |
| `WEATHER_INSTITUTE_SHELLY_DEFEATED` | `{"flag":1312}` | campaign |
| `WEATHER_INSTITUTE_AQUA_WITHDRAWN` | `{"variable":16563,"values":[1,2],"maximum":2}` | campaign |
| `ROUTE_119_RIVAL_DEFEATED` | `{"anyFlags":[1802,1805,1808,1811,1814,1817]}` | campaign |
| `ROUTE_119_RIVAL_SCENE_COMPLETE` | `{"variable":16498,"values":[1],"maximum":1}` | campaign |
| `FORTREE_CITY` | `{"map":[0,4],"settled":true}` | campaign |
| `ROUTE_120` | `{"map":[0,35],"settled":true}` | campaign |
| `DEVON_SCOPE_RECEIVED` | `{"flag":285}` | campaign |
| `FORTREE_GYM_OBSTRUCTION_CLEARED` | `{"flag":295}` | campaign |
| `ROUTE_121` | `{"map":[0,36],"settled":true}` | campaign |
| `LILYCOVE_CITY` | `{"map":[0,5],"settled":true}` | campaign |
| `ROUTE_122` | `{"map":[0,37],"settled":true}` | campaign |
| `MT_PYRE` | `{"map":[24,15],"settled":false}` | campaign |
| `MT_PYRE_SUMMIT` | `{"map":[24,22],"settled":false}` | campaign |
| `MAGMA_EMBLEM_RECEIVED` | `{"flag":212}` | campaign |
| `MAGMA_HIDEOUT` | `{"map":[24,86],"settled":false}` | campaign |
| `MAGMA_HIDEOUT_MAXIE_CHAMBER` | `{"map":[24,91],"settled":false}` | campaign |
| `MAGMA_HIDEOUT_MAXIE_DEFEATED` | `{"flag":1881}` | campaign |
| `MAGMA_HIDEOUT_STORY_COMPLETE` | `{"flag":111}` | campaign |
| `SLATEPORT_HARBOR` | `{"map":[9,9],"settled":false}` | campaign |
| `SLATEPORT_SUBMARINE_THEFT_WITNESSED` | `{"flag":97}` | campaign |
| `AQUA_HIDEOUT_ACCESS_OPENED` | `{"allFlags":[821,822]}` | campaign |
| `AQUA_HIDEOUT` | `{"map":[24,23],"settled":false}` | campaign |
| `AQUA_HIDEOUT_SUBMARINE_CHAMBER` | `{"map":[24,25],"settled":false}` | campaign |
| `AQUA_HIDEOUT_MATT_DEFEATED` | `{"flag":1310}` | campaign |
| `AQUA_HIDEOUT_ESCAPE_COMPLETE` | `{"flag":112}` | campaign |
| `ROUTE_124` | `{"map":[0,39],"settled":true}` | campaign |
| `MOSSDEEP_CITY` | `{"map":[0,6],"settled":true}` | campaign |
| `SPACE_CENTER_OCCUPATION_ENTERED` | `{"map":[14,9],"settled":false,"requireVariable":16543,"requireValues":[1,2],"requireMaximum":3}` | campaign |
| `SPACE_CENTER_BATTLE_WON` | `{"variable":16543,"values":[3],"maximum":3}` | campaign |
| `SPACE_CENTER_STORY_COMPLETE` | `{"variable":16543,"values":[3],"maximum":3}` | campaign |
| `HM_DIVE_RECEIVED` | `{"flag":123}` | campaign |
| `ROUTE_127` | `{"map":[0,42],"settled":true}` | campaign |
| `ROUTE_128` | `{"map":[0,43],"settled":true}` | campaign |
| `SEAFLOOR_UNDERWATER_ENTRANCE` | `{"map":[24,26],"settled":false}` | campaign |
| `SEAFLOOR_CAVERN` | `{"map":[24,27],"settled":false}` | campaign |
| `SEAFLOOR_ARCHIE_CHAMBER` | `{"map":[24,36],"settled":false}` | campaign |
| `SEAFLOOR_ARCHIE_DEFEATED` | `{"flag":1314}` | campaign |
| `SEAFLOOR_KYOGRE_RELEASE_CONFIRMED` | `{"flag":129}` | campaign |
| `ROUTE_126` | `{"map":[0,41],"settled":true}` | campaign |
| `SOOTOPOLIS_CITY` | `{"map":[0,7],"settled":true}` | campaign |
| `CAVE_OF_ORIGIN` | `{"map":[24,37],"settled":false}` | campaign |
| `CAVE_OF_ORIGIN_WALLACE_REACHED` | `{"map":[24,42],"settled":false}` | campaign |
| `WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE` | `{"flag":311}` | campaign |
| `ROUTE_129` | `{"map":[0,44],"settled":true}` | campaign |
| `ROUTE_130` | `{"map":[0,45],"settled":true}` | campaign |
| `ROUTE_131` | `{"map":[0,46],"settled":true}` | campaign |
| `SKY_PILLAR_OPENED` | `{"variable":16478,"values":[4,5,6],"maximum":6}` | campaign |
| `SKY_PILLAR` | `{"map":[24,79],"settled":false}` | campaign |
| `SKY_PILLAR_SUMMIT` | `{"map":[24,85],"settled":false}` | campaign |
| `RAYQUAZA_AWAKENED` | `{"variable":16478,"values":[5,6],"maximum":6}` | campaign |
| `SOOTOPOLIS_CRISIS_RESOLVED` | `{"variable":16586,"values":[2,3],"maximum":3}` | campaign |
| `HM_WATERFALL_RECEIVED` | `{"flag":312}` | campaign |
| `EVER_GRANDE_LANDING` | `{"map":[0,8],"settled":true,"land":true,"bounds":[0,40,39,57]}` | campaign |
| `VICTORY_ROAD` | `{"map":[24,43],"settled":false}` | campaign |
| `VICTORY_ROAD_B1F` | `{"map":[24,44],"settled":false}` | campaign |
| `VICTORY_ROAD_B2F` | `{"map":[24,45],"settled":false}` | campaign |
| `VICTORY_ROAD_WALLY_DEFEATED` | `{"flag":126}` | campaign |
| `EVER_GRANDE_NORTH_REACHED` | `{"map":[0,8],"settled":true,"land":true,"bounds":[0,0,39,27]}` | campaign |
| `POKEMON_LEAGUE_REACHED` | `{"map":[16,10],"settled":false}` | campaign |
| `LEAGUE_ADMISSION_GRANTED` | `{"flag":263}` | campaign |
| `ELITE_FOUR_CHALLENGE_ENTERED` | `{"map":[16,0],"settled":false}` | campaign |
| `ELITE_FOUR_SIDNEY_DEFEATED` | `{"flag":1275}` | campaign |
| `ELITE_FOUR_PHOEBE_DEFEATED` | `{"flag":1276}` | campaign |
| `ELITE_FOUR_GLACIA_DEFEATED` | `{"flag":1277}` | campaign |
| `ELITE_FOUR_DRAKE_DEFEATED` | `{"flag":1278}` | campaign |
| `CHAMPION_ROOM_REACHED` | `{"map":[16,4],"settled":false}` | campaign |
| `WALLACE_DEFEATED` | `{"flag":1615}` | campaign |
| `HALL_OF_FAME_ENTERED` | `{"map":[16,11],"settled":false}` | campaign |
| `GAME_CLEAR_CONFIRMED` | `{"flag":2148}` | campaign |
| `HM_CUT_RECEIVED` | `{"flag":137}` | optional |
| `HM_FLASH_RECEIVED` | `{"flag":109}` | optional |
| `HM_FLY_RECEIVED` | `{"flag":110}` | optional |
| `BICYCLE_RECEIVED` | `{"flag":90}` | optional |
| `GO_GOGGLES_RECEIVED` | `{"flag":221}` | optional |
| `CASTFORM_RECEIVED` | `{"flag":151}` | optional |
| `METEORITE_RECEIVED` | `{"flag":115}` | optional |
| `EXP_SHARE_RECEIVED` | `{"flag":272}` | optional |

## Proof limits

Later campaign predicates are source-grounded and exercised synthetically through production consumers. Historical raw-RAM replay provides native proof only for states actually retained; no new emulator/gameplay/GPU run is authorized or launched. Native proof does not establish full-campaign gameplay benefit.
