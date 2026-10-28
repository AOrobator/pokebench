// Deterministic story checkpoints for instruction-memory-cap-v1, from the move-in through the DEVON GOODS delivery in
// Slateport. Each closes the episodes heard, at or before its milestones, entirely within its scope: a pret map
// (data/maps/map_groups.json group/number) and the speakers of that scene there (an OBJ_EVENT_GFX_ sprite on the
// map, a "NAME:" prefix from the scene's scripts, or null for unattributed narration). Milestones come from the
// harness's existing readers (milestones.ts, story-progress.ts); flag names are pret include/constants/flags.h.
// Coverage ends at DEVON_GOODS_DELIVERED: the Route 110 rival, Mauville and later scenes have no checkpoint yet. DAD's
// Petalburg Gym advice (DadGoCollectBadges, NormanGoToRustboro) has none: it stays open until NORMAN is defeated.
export interface CheckpointScope {readonly map:string;readonly map_id:readonly [number,number];readonly speakers:readonly (string|null)[]}
export interface StoryCheckpoint {readonly id:string;readonly closes_after:readonly string[];readonly game_fact:string;readonly scope:readonly CheckpointScope[]}
export const STORY_CHECKPOINTS:readonly StoryCheckpoint[] = [
 {"id":"mom-home-instructions","closes_after":["RUNNING_SHOES_RECEIVED","DAD_FIRST_MEETING"],"game_fact":"milestones.ts running_shoes_received (FLAG_RECEIVED_RUNNING_SHOES) and DAD_FIRST_MEETING (VAR_PETALBURG_GYM_STATE), since MOM points to DAD at the PETALBURG GYM","scope":[
  {"map":"LittlerootTown","map_id":[0,9],"speakers":["MOM"]},
  {"map":"LittlerootTown_BrendansHouse_1F","map_id":[1,0],"speakers":["MOM"]},
  {"map":"LittlerootTown_BrendansHouse_2F","map_id":[1,1],"speakers":["MOM"]},
  {"map":"LittlerootTown_MaysHouse_1F","map_id":[1,2],"speakers":["MOM"]},
  {"map":"LittlerootTown_MaysHouse_2F","map_id":[1,3],"speakers":["MOM"]}]},
 {"id":"rival-first-meeting","closes_after":["RIVAL_MET"],"game_fact":"milestones.ts rival_stage 3-4 (VAR_LITTLEROOT_RIVAL_STATE)","scope":[
  {"map":"LittlerootTown_BrendansHouse_1F","map_id":[1,0],"speakers":["MOM","RIVAL_BRENDAN_NORMAL"]},
  {"map":"LittlerootTown_BrendansHouse_2F","map_id":[1,1],"speakers":["MOM","RIVAL_BRENDAN_NORMAL"]},
  {"map":"LittlerootTown_MaysHouse_1F","map_id":[1,2],"speakers":["MOM","RIVAL_MAY_NORMAL"]},
  {"map":"LittlerootTown_MaysHouse_2F","map_id":[1,3],"speakers":["MOM","RIVAL_MAY_NORMAL"]}]},
 {"id":"birch-rescue","closes_after":["BIRCH_RESCUE_COMPLETE"],"game_fact":"milestones.ts birch_lab_stage 2-5 (VAR_BIRCH_LAB_STATE)","scope":[
  {"map":"Route101","map_id":[0,16],"speakers":["PROF. BIRCH","PROF_BIRCH",null]}]},
 {"id":"birch-lab-pokedex","closes_after":["RECEIVED_POKEDEX"],"game_fact":"milestones.ts pokedex_received (FLAG_SYS_POKEDEX_GET)","scope":[
  {"map":"LittlerootTown_ProfessorBirchsLab","map_id":[1,4],"speakers":["PROF. BIRCH","PROF_BIRCH","SCIENTIST_1",null]}]},
 {"id":"rival-route103","closes_after":["RECEIVED_POKEDEX"],"game_fact":"milestones.ts pokedex_received (FLAG_SYS_POKEDEX_GET), after the Route 103 battle and its send-off to the lab","scope":[
  {"map":"Route103","map_id":[0,18],"speakers":["MAY","BRENDAN",null]}]},
 {"id":"wally-catch-tutorial","closes_after":["WALLY_TUTORIAL_COMPLETE"],"game_fact":"milestones.ts petalburg_gym_stage 2-8 (VAR_PETALBURG_GYM_STATE)","scope":[
  {"map":"PetalburgCity_Gym","map_id":[8,1],"speakers":["WALLY",null]},
  {"map":"Route102","map_id":[0,17],"speakers":["WALLY",null]}]},
 {"id":"woods-team-aqua","closes_after":["TEAM_AQUA_WOODS_EVENT_COMPLETE"],"game_fact":"milestones.ts woods_stage 1 (VAR_PETALBURG_WOODS_STATE)","scope":[
  {"map":"PetalburgWoods","map_id":[24,11],"speakers":["MAN_2","AQUA_MEMBER_M",null]}]},
 {"id":"roxanne-gym","closes_after":["STONE_BADGE"],"game_fact":"milestones.ts badges STONE (FLAG_BADGE01_GET)","scope":[
  {"map":"RustboroCity_Gym","map_id":[11,3],"speakers":["ROXANNE",null]}]},
 {"id":"devon-goods-recovery","closes_after":["DEVON_GOODS_RECOVERED"],"game_fact":"story-progress.ts flag 143 (FLAG_RECOVERED_DEVON_GOODS)","scope":[
  {"map":"RustboroCity","map_id":[0,3],"speakers":["MAN_2","AQUA_MEMBER_M",null]},
  {"map":"Route116","map_id":[0,31],"speakers":["EXPERT_M"]},
  {"map":"RusturfTunnel","map_id":[24,4],"speakers":["AQUA_MEMBER_M","EXPERT_M",null]}]},
 {"id":"devon-president-errands","closes_after":["STEVEN_LETTER_DELIVERED","DEVON_GOODS_DELIVERED"],"game_fact":"story-progress.ts flags 189 and 149 (FLAG_DELIVERED_STEVEN_LETTER, FLAG_DELIVERED_DEVON_GOODS)","scope":[
  {"map":"RustboroCity","map_id":[0,3],"speakers":["MAN_2",null]},
  {"map":"RustboroCity_DevonCorp_3F","map_id":[11,2],"speakers":["MR. STONE","GENTLEMAN","MAN_2",null]}]},
 {"id":"pokenav-match-call","closes_after":["MATCH_CALL_TUTORIAL_COMPLETE"],"game_fact":"story-progress.ts rustboro_stage 7-8 (VAR_RUSTBORO_CITY_STATE)","scope":[
  {"map":"RustboroCity","map_id":[0,3],"speakers":["SCIENTIST_1"]}]},
 {"id":"briney-voyages","closes_after":["STEVEN_LETTER_DELIVERED","DEVON_GOODS_DELIVERED"],"game_fact":"story-progress.ts flags 189 and 149 (FLAG_DELIVERED_STEVEN_LETTER, FLAG_DELIVERED_DEVON_GOODS)","scope":[
  {"map":"Route104_MrBrineysHouse","map_id":[17,0],"speakers":["MR. BRINEY","EXPERT_M",null]},
  {"map":"Route104","map_id":[0,19],"speakers":["MR. BRINEY"]},
  {"map":"Route105","map_id":[0,20],"speakers":["MR. BRINEY",null]},
  {"map":"DewfordTown","map_id":[0,11],"speakers":["MR. BRINEY"]},
  {"map":"Route109","map_id":[0,24],"speakers":["MR. BRINEY"]}]},
 {"id":"brawly-gym","closes_after":["KNUCKLE_BADGE"],"game_fact":"story-progress.ts flag 2152 (FLAG_BADGE02_GET)","scope":[
  {"map":"DewfordTown_Gym","map_id":[3,3],"speakers":["BRAWLY",null]}]},
 {"id":"steven-letter","closes_after":["STEVEN_LETTER_DELIVERED"],"game_fact":"story-progress.ts flag 189 (FLAG_DELIVERED_STEVEN_LETTER)","scope":[
  {"map":"GraniteCave_StevensRoom","map_id":[24,10],"speakers":["STEVEN",null]}]},
 {"id":"stern-devon-goods","closes_after":["DEVON_GOODS_DELIVERED"],"game_fact":"story-progress.ts flag 149 (FLAG_DELIVERED_DEVON_GOODS)","scope":[
  {"map":"SlateportCity_SternsShipyard_1F","map_id":[9,0],"speakers":["MAN_1","SCIENTIST_1",null]},
  {"map":"SlateportCity_OceanicMuseum_1F","map_id":[9,7],"speakers":["AQUA_MEMBER_M","AQUA_MEMBER_F",null]},
  {"map":"SlateportCity_OceanicMuseum_2F","map_id":[9,8],"speakers":["AQUA_MEMBER_M","ARCHIE","SCIENTIST_1","CAPT. STERN",null]}]}
];
