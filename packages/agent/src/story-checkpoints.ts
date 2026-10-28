// Legacy deterministic checkpoints for instruction-memory-cap-v1, from the move-in through the DEVON GOODS delivery in
// Slateport. Each closes the episodes heard, at or before its milestones, entirely within its scope: a pret map
// (data/maps/map_groups.json group/number) and the speakers of that scene there (an OBJ_EVENT_GFX_ sprite on the
// map, a "NAME:" prefix from the scene's scripts, or null for unattributed narration). Milestones come from the
// harness's existing readers (milestones.ts, story-progress.ts); flag names are pret include/constants/flags.h.
// Legacy coverage ends at DEVON_GOODS_DELIVERED; the opt-in table below adds later conservative scopes. DAD's
// Petalburg Gym advice (DadGoCollectBadges, NormanGoToRustboro) has none: it stays open until NORMAN is defeated.
// The Rusturf Tunnel scene ends with BRINEY's "find me in my cottage" (pret ThankYouLetsGoHomePeeko) before
// FLAG_RECOVERED_DEVON_GOODS is set, so it closes with briney-voyages, after both deliveries. MOM's "introduce
// yourself to PROF. BIRCH" stays open past RIVAL_MET (pret players_house.inc), so rival-first-meeting has no MOM;
// gym scopes cover the leader's own lines, not the unattributed badge/TM reward pages.
export interface CheckpointScope {readonly map:string;readonly map_id:readonly [number,number];readonly speakers:readonly (string|null)[]}
// set_on: pret maps outside the scene whose scripts set the closing flag or var (a delivery closes an errand elsewhere).
export interface StoryCheckpoint {readonly id:string;readonly closes_after:readonly string[];readonly game_fact:string;readonly set_on?:readonly string[];readonly scope:readonly CheckpointScope[]}
export const LEGACY_STORY_CHECKPOINTS:readonly StoryCheckpoint[] = [
 {"id":"mom-home-instructions","closes_after":["RUNNING_SHOES_RECEIVED","DAD_FIRST_MEETING"],"game_fact":"milestones.ts running_shoes_received (FLAG_RECEIVED_RUNNING_SHOES) and DAD_FIRST_MEETING (VAR_PETALBURG_GYM_STATE), since MOM points to DAD at the PETALBURG GYM","scope":[
  {"map":"LittlerootTown","map_id":[0,9],"speakers":["MOM"]},
  {"map":"LittlerootTown_BrendansHouse_1F","map_id":[1,0],"speakers":["MOM"]},
  {"map":"LittlerootTown_BrendansHouse_2F","map_id":[1,1],"speakers":["MOM"]},
  {"map":"LittlerootTown_MaysHouse_1F","map_id":[1,2],"speakers":["MOM"]},
  {"map":"LittlerootTown_MaysHouse_2F","map_id":[1,3],"speakers":["MOM"]}]},
 {"id":"rival-first-meeting","closes_after":["RIVAL_MET"],"game_fact":"milestones.ts rival_stage 3-4 (VAR_LITTLEROOT_RIVAL_STATE)","scope":[
  {"map":"LittlerootTown_BrendansHouse_1F","map_id":[1,0],"speakers":["RIVAL_BRENDAN_NORMAL"]},
  {"map":"LittlerootTown_BrendansHouse_2F","map_id":[1,1],"speakers":["RIVAL_BRENDAN_NORMAL"]},
  {"map":"LittlerootTown_MaysHouse_1F","map_id":[1,2],"speakers":["RIVAL_MAY_NORMAL"]},
  {"map":"LittlerootTown_MaysHouse_2F","map_id":[1,3],"speakers":["RIVAL_MAY_NORMAL"]}]},
 {"id":"birch-rescue","closes_after":["BIRCH_RESCUE_COMPLETE"],"game_fact":"milestones.ts birch_lab_stage 2-5 (VAR_BIRCH_LAB_STATE)","scope":[
  {"map":"Route101","map_id":[0,16],"speakers":["PROF. BIRCH","PROF_BIRCH",null]}]},
 {"id":"birch-lab-pokedex","closes_after":["RECEIVED_POKEDEX"],"game_fact":"milestones.ts pokedex_received (FLAG_RECEIVED_POKEDEX_FROM_BIRCH; include/constants/flags.h:1507), committed with FLAG_SYS_POKEDEX_GET","scope":[
  {"map":"LittlerootTown_ProfessorBirchsLab","map_id":[1,4],"speakers":["PROF. BIRCH","PROF_BIRCH","SCIENTIST_1",null]}]},
 {"id":"rival-route103","closes_after":["RECEIVED_POKEDEX"],"game_fact":"milestones.ts pokedex_received (FLAG_RECEIVED_POKEDEX_FROM_BIRCH; include/constants/flags.h:1507), committed with FLAG_SYS_POKEDEX_GET, after the Route 103 battle and its send-off to the lab","set_on":["LittlerootTown_ProfessorBirchsLab"],"scope":[
  {"map":"Route103","map_id":[0,18],"speakers":["MAY","BRENDAN",null]}]},
 {"id":"wally-catch-tutorial","closes_after":["WALLY_TUTORIAL_COMPLETE"],"game_fact":"milestones.ts petalburg_gym_stage 2-8 (VAR_PETALBURG_GYM_STATE)","scope":[
  {"map":"PetalburgCity_Gym","map_id":[8,1],"speakers":["WALLY",null]},
  {"map":"Route102","map_id":[0,17],"speakers":["WALLY",null]}]},
 {"id":"woods-team-aqua","closes_after":["TEAM_AQUA_WOODS_EVENT_COMPLETE"],"game_fact":"milestones.ts woods_stage 1 (VAR_PETALBURG_WOODS_STATE)","scope":[
  {"map":"PetalburgWoods","map_id":[24,11],"speakers":["MAN_2","AQUA_MEMBER_M",null]}]},
 {"id":"roxanne-gym","closes_after":["STONE_BADGE"],"game_fact":"milestones.ts badges STONE (FLAG_BADGE01_GET)","scope":[
  {"map":"RustboroCity_Gym","map_id":[11,3],"speakers":["ROXANNE"]}]},
 {"id":"devon-goods-recovery","closes_after":["DEVON_GOODS_RECOVERED"],"game_fact":"story-progress.ts flag 143 (FLAG_RECOVERED_DEVON_GOODS)","set_on":["RusturfTunnel"],"scope":[
  {"map":"RustboroCity","map_id":[0,3],"speakers":["MAN_2","AQUA_MEMBER_M",null]},
  {"map":"Route116","map_id":[0,31],"speakers":["EXPERT_M"]}]},
 {"id":"devon-president-errands","closes_after":["STEVEN_LETTER_DELIVERED","DEVON_GOODS_DELIVERED"],"game_fact":"story-progress.ts flags 189 and 149 (FLAG_DELIVERED_STEVEN_LETTER, FLAG_DELIVERED_DEVON_GOODS)","set_on":["GraniteCave_StevensRoom","SlateportCity_OceanicMuseum_2F"],"scope":[
  {"map":"RustboroCity","map_id":[0,3],"speakers":["MAN_2",null]},
  {"map":"RustboroCity_DevonCorp_3F","map_id":[11,2],"speakers":["MR. STONE","GENTLEMAN","MAN_2",null]}]},
 {"id":"pokenav-match-call","closes_after":["MATCH_CALL_TUTORIAL_COMPLETE"],"game_fact":"story-progress.ts rustboro_stage 7-8 (VAR_RUSTBORO_CITY_STATE)","scope":[
  {"map":"RustboroCity","map_id":[0,3],"speakers":["SCIENTIST_1"]}]},
 {"id":"briney-voyages","closes_after":["STEVEN_LETTER_DELIVERED","DEVON_GOODS_DELIVERED"],"game_fact":"story-progress.ts flags 189 and 149 (FLAG_DELIVERED_STEVEN_LETTER, FLAG_DELIVERED_DEVON_GOODS)","set_on":["GraniteCave_StevensRoom","SlateportCity_OceanicMuseum_2F"],"scope":[
  {"map":"Route104_MrBrineysHouse","map_id":[17,0],"speakers":["MR. BRINEY","EXPERT_M",null]},
  {"map":"RusturfTunnel","map_id":[24,4],"speakers":["AQUA_MEMBER_M","EXPERT_M","MR. BRINEY",null]},
  {"map":"Route104","map_id":[0,19],"speakers":["MR. BRINEY"]},
  {"map":"Route105","map_id":[0,20],"speakers":["MR. BRINEY",null]},
  {"map":"DewfordTown","map_id":[0,11],"speakers":["MR. BRINEY"]},
  {"map":"Route109","map_id":[0,24],"speakers":["MR. BRINEY"]}]},
 {"id":"brawly-gym","closes_after":["KNUCKLE_BADGE"],"game_fact":"story-progress.ts flag 2152 (FLAG_BADGE02_GET)","scope":[
  {"map":"DewfordTown_Gym","map_id":[3,3],"speakers":["BRAWLY"]}]},
 {"id":"steven-letter","closes_after":["STEVEN_LETTER_DELIVERED"],"game_fact":"story-progress.ts flag 189 (FLAG_DELIVERED_STEVEN_LETTER)","scope":[
  {"map":"GraniteCave_StevensRoom","map_id":[24,10],"speakers":["STEVEN",null]}]},
 {"id":"stern-devon-goods","closes_after":["DEVON_GOODS_DELIVERED"],"game_fact":"story-progress.ts flag 149 (FLAG_DELIVERED_DEVON_GOODS)","scope":[
  {"map":"SlateportCity_SternsShipyard_1F","map_id":[9,0],"speakers":["MAN_1","SCIENTIST_1",null]},
  {"map":"SlateportCity_OceanicMuseum_1F","map_id":[9,7],"speakers":["AQUA_MEMBER_M","AQUA_MEMBER_F",null]},
  {"map":"SlateportCity_OceanicMuseum_2F","map_id":[9,8],"speakers":["AQUA_MEMBER_M","ARCHIE","SCIENTIST_1","CAPT. STERN",null]}]}
];

// Scenes with reusable advice under the same map/speaker remain unscoped (notably Route 110/119 rivals).
export const STORY_CHECKPOINTS:readonly StoryCheckpoint[] = [...LEGACY_STORY_CHECKPOINTS,
 {"id":"mauville-wally","closes_after":["MAUVILLE_WALLY_DEFEATED"],"game_fact":"FLAG_DEFEATED_WALLY_MAUVILLE (include/constants/flags.h:212). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"MauvilleCity","map_id":[0,2],"speakers":["WALLY"]}]},
 {"id":"wattson-gym","closes_after":["DYNAMO_BADGE"],"game_fact":"FLAG_BADGE03_GET (include/constants/flags.h:1361). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"MauvilleCity_Gym","map_id":[10,0],"speakers":["WATTSON"]}]},
 {"id":"meteor-falls-confrontation","closes_after":["METEOR_FALLS_CONFRONTATION_RESOLVED","MT_CHIMNEY_STORY_COMPLETE"],"game_fact":"FLAG_MET_ARCHIE_METEOR_FALLS (include/constants/flags.h:229); FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY (include/constants/flags.h:161). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["MtChimney"],"scope":[
  {"map":"MeteorFalls_1F_1R","map_id":[24,0],"speakers":["AQUA_MEMBER_M","MAGMA_MEMBER_M","ARCHIE"]}]},
 {"id":"mt-chimney-magma","closes_after":["MT_CHIMNEY_STORY_COMPLETE"],"game_fact":"FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY (include/constants/flags.h:161). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"MtChimney","map_id":[24,12],"speakers":["MAXIE","MAGMA_MEMBER_M","MAGMA_MEMBER_F"]}]},
 {"id":"flannery-gym","closes_after":["HEAT_BADGE"],"game_fact":"FLAG_BADGE04_GET (include/constants/flags.h:1362). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"LavaridgeTown_Gym_1F","map_id":[4,1],"speakers":["FLANNERY"]}]},
 {"id":"norman-gym","closes_after":["BALANCE_BADGE"],"game_fact":"FLAG_BADGE05_GET (include/constants/flags.h:1363). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"PetalburgCity_Gym","map_id":[8,1],"speakers":["NORMAN"]}]},
 {"id":"weather-institute-aqua","closes_after":["WEATHER_INSTITUTE_AQUA_WITHDRAWN","MAGMA_EMBLEM_RECEIVED"],"game_fact":"VAR_WEATHER_INSTITUTE_STATE (include/constants/vars.h:199); FLAG_RECEIVED_RED_OR_BLUE_ORB (include/constants/flags.h:234). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["MtPyre_Summit"],"scope":[
  {"map":"Route119_WeatherInstitute_1F","map_id":[32,0],"speakers":["AQUA_MEMBER_M","AQUA_MEMBER_F"]},
  {"map":"Route119_WeatherInstitute_2F","map_id":[32,1],"speakers":["AQUA_MEMBER_M","AQUA_MEMBER_F"]}]},
 {"id":"winona-gym","closes_after":["FEATHER_BADGE"],"game_fact":"FLAG_BADGE06_GET (include/constants/flags.h:1364). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"FortreeCity_Gym","map_id":[12,1],"speakers":["WINONA"]}]},
 {"id":"mt-pyre-aqua","closes_after":["MAGMA_EMBLEM_RECEIVED"],"game_fact":"FLAG_RECEIVED_RED_OR_BLUE_ORB (include/constants/flags.h:234). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"MtPyre_Summit","map_id":[24,22],"speakers":["AQUA_MEMBER_M","AQUA_MEMBER_F"]}]},
 {"id":"magma-hideout","closes_after":["MAGMA_HIDEOUT_STORY_COMPLETE","SOOTOPOLIS_CRISIS_RESOLVED"],"game_fact":"FLAG_GROUDON_AWAKENED_MAGMA_HIDEOUT (include/constants/flags.h:131). Native reader predicates, not arrival or inferred dialogue completion. MAXIE pursues GROUDON: keep through VAR_SKY_PILLAR_STATE (include/constants/vars.h:222), states 2/3.","set_on":["SootopolisCity"],"scope":[
  {"map":"MagmaHideout_4F","map_id":[24,91],"speakers":["MAXIE","MAGMA_MEMBER_M"]}]},
 {"id":"slateport-submarine-theft","closes_after":["SLATEPORT_SUBMARINE_THEFT_WITNESSED","AQUA_HIDEOUT_ESCAPE_COMPLETE"],"game_fact":"FLAG_MET_TEAM_AQUA_HARBOR (include/constants/flags.h:115); FLAG_TEAM_AQUA_ESCAPED_IN_SUBMARINE (include/constants/flags.h:132). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["AquaHideout_B2F"],"scope":[
  {"map":"SlateportCity_Harbor","map_id":[9,9],"speakers":["ARCHIE","AQUA_MEMBER_M"]}]},
 {"id":"tate-liza-gym","closes_after":["MIND_BADGE"],"game_fact":"FLAG_BADGE07_GET (include/constants/flags.h:1365). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"MossdeepCity_Gym","map_id":[14,0],"speakers":["TATE","LIZA"]}]},
 {"id":"space-center-magma","closes_after":["SPACE_CENTER_STORY_COMPLETE"],"game_fact":"VAR_MOSSDEEP_SPACE_CENTER_STATE (include/constants/vars.h:179). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"MossdeepCity_SpaceCenter_1F","map_id":[14,9],"speakers":["MAGMA_MEMBER_M","MAGMA_MEMBER_F"]},
  {"map":"MossdeepCity_SpaceCenter_2F","map_id":[14,10],"speakers":["MAXIE","MAGMA_MEMBER_M"]}]},
 {"id":"space-center-steven","closes_after":["SPACE_CENTER_STORY_COMPLETE","HM_DIVE_RECEIVED"],"game_fact":"VAR_MOSSDEEP_SPACE_CENTER_STATE (include/constants/vars.h:179); FLAG_RECEIVED_HM_DIVE (include/constants/flags.h:145). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["MossdeepCity_StevensHouse"],"scope":[
  {"map":"MossdeepCity_SpaceCenter_1F","map_id":[14,9],"speakers":["STEVEN"]},
  {"map":"MossdeepCity_SpaceCenter_2F","map_id":[14,10],"speakers":["STEVEN"]}]},
 {"id":"seafloor-cavern-crisis","closes_after":["SEAFLOOR_KYOGRE_RELEASE_CONFIRMED","SOOTOPOLIS_CRISIS_RESOLVED"],"game_fact":"FLAG_KYOGRE_ESCAPED_SEAFLOOR_CAVERN (include/constants/flags.h:151); VAR_SKY_PILLAR_STATE (include/constants/vars.h:222). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["SootopolisCity"],"scope":[
  {"map":"SeafloorCavern_Room9","map_id":[24,36],"speakers":["ARCHIE","MAXIE","MAGMA_MEMBER_M","MAGMA_MEMBER_F"]}]},
 {"id":"wallace-origin-sky-pillar","closes_after":["WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE","RAYQUAZA_AWAKENED"],"game_fact":"FLAG_WALLACE_GOES_TO_SKY_PILLAR (include/constants/flags.h:337); VAR_SOOTOPOLIS_CITY_STATE (include/constants/vars.h:114). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["SkyPillar_Top"],"scope":[
  {"map":"CaveOfOrigin_B1F","map_id":[24,42],"speakers":["WALLACE",null]}]},
 {"id":"sky-pillar-wallace","closes_after":["RAYQUAZA_AWAKENED","SOOTOPOLIS_CRISIS_RESOLVED"],"game_fact":"VAR_SOOTOPOLIS_CITY_STATE (include/constants/vars.h:114); VAR_SKY_PILLAR_STATE (include/constants/vars.h:222). Native reader predicates, not arrival or inferred dialogue completion.","set_on":["SkyPillar_Top","SootopolisCity"],"scope":[
  {"map":"SkyPillar_Outside","map_id":[24,78],"speakers":["WALLACE",null]}]},
 {"id":"sootopolis-crisis","closes_after":["SOOTOPOLIS_CRISIS_RESOLVED"],"game_fact":"VAR_SKY_PILLAR_STATE (include/constants/vars.h:222), states 2 or 3 confirm the crisis resolved. No Steven/Wallace Waterfall, gym or optional Orb advice is scoped.","scope":[
  {"map":"SootopolisCity","map_id":[0,7],"speakers":["ARCHIE","MAXIE"]}]},
 {"id":"juan-gym","closes_after":["RAIN_BADGE"],"game_fact":"FLAG_BADGE08_GET (include/constants/flags.h:1366). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"SootopolisCity_Gym_1F","map_id":[15,0],"speakers":["JUAN"]}]},
 {"id":"victory-road-wally","closes_after":["VICTORY_ROAD_WALLY_DEFEATED"],"game_fact":"FLAG_DEFEATED_WALLY_VICTORY_ROAD (include/constants/flags.h:148). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"VictoryRoad_1F","map_id":[24,43],"speakers":["WALLY"]}]},
 {"id":"elite-four-sidney","closes_after":["ELITE_FOUR_SIDNEY_DEFEATED"],"game_fact":"FLAG_DEFEATED_ELITE_4_SIDNEY (include/constants/flags.h:1332). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"EverGrandeCity_SidneysRoom","map_id":[16,0],"speakers":["SIDNEY"]}]},
 {"id":"elite-four-phoebe","closes_after":["ELITE_FOUR_PHOEBE_DEFEATED"],"game_fact":"FLAG_DEFEATED_ELITE_4_PHOEBE (include/constants/flags.h:1333). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"EverGrandeCity_PhoebesRoom","map_id":[16,1],"speakers":["PHOEBE"]}]},
 {"id":"elite-four-glacia","closes_after":["ELITE_FOUR_GLACIA_DEFEATED"],"game_fact":"FLAG_DEFEATED_ELITE_4_GLACIA (include/constants/flags.h:1334). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"EverGrandeCity_GlaciasRoom","map_id":[16,2],"speakers":["GLACIA"]}]},
 {"id":"elite-four-drake","closes_after":["ELITE_FOUR_DRAKE_DEFEATED"],"game_fact":"FLAG_DEFEATED_ELITE_4_DRAKE (include/constants/flags.h:1335). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"EverGrandeCity_DrakesRoom","map_id":[16,3],"speakers":["DRAKE"]}]},
 {"id":"champion-hall-of-fame","closes_after":["GAME_CLEAR_CONFIRMED"],"game_fact":"FLAG_SYS_GAME_CLEAR (include/constants/flags.h:1354). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"EverGrandeCity_ChampionsRoom","map_id":[16,4],"speakers":["WALLACE"]},
  {"map":"EverGrandeCity_HallOfFame","map_id":[16,11],"speakers":["WALLACE",null]}]},
 {"id":"sky-pillar-optional-encounter","closes_after":["RAYQUAZA_ENCOUNTER_RETIRED"],"game_fact":"FLAG_DEFEATED_RAYQUAZA (include/constants/flags.h:486). Native reader predicates, not arrival or inferred dialogue completion.","scope":[
  {"map":"SkyPillar_Top","map_id":[24,85],"speakers":["RAYQUAZA","RAYQUAZA_STILL",null]}]}
];
