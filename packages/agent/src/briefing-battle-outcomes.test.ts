import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {BattleOutcomes} from "./battle-outcomes.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {recorded,recordedFeatures} from "../test-support/battle-facts.js";
import {IN_GAME} from "../test-support/events.js";
import {parseGameState} from "./game-state.js";
import {checkEvent} from "./events.js";
import {semanticState} from "./loop-detection.js";

const ID="briefing-battle-outcomes-v1";
const NONE="- Latest battle against a story character: none recorded in this run\n- Latest whiteout: none recorded in this run";

// The stall briefing at a recorded milestone-drought note, replayed with this switch set as given.

// Synthetic states: only the fields BattleOutcomes reads.
let seq=0;
function state(turn:number,fields:Record<string,unknown>):RunEvent{
 seq++;
 return {v:1,run:"r",seq,t:"2026-10-16T05:00:00.000-04:00",type:"state",turn,started:true,screen:"overworld",in_battle:false,location:"ROUTE101",map_id:[0,16],position:{x:5,y:5},facing:"up",battle:null,...fields} as unknown as RunEvent;
}
const battle=(outcome:string,type:number,species="POOCHYENA")=>({screen:"battle",in_battle:true,battle:{active:true,outcome,outcome_code:0,battle_type:type,battlers:[{battler:0,species:"TORCHIC"},{battler:1,species}]}});
const opponent=(id:number,name:string|null,defeated:boolean,active:boolean)=>({trainer_opponent:{trainer_id:id,trainer_class:5,name,defeated,battle_active:active}});
const FEATURES:FeatureSet={...ALL_ON,"bounded-navigation-v1":true,"displayed-place-names-v1":false};
function fold(events:readonly RunEvent[]):BattleOutcomes{const o=new BattleOutcomes(FEATURES);for(const e of events)o.observe(e);return o;}

describe("BattleOutcomes rules",()=>{
 it("a lost wild battle followed by another map is a whiteout; no story character",()=>{
  const o=fold([state(10,battle("ongoing",4)),state(11,battle("lost",4)),state(11,{screen:"field_transition",started:true,location:null,map_id:null}),state(12,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2]})]);
  expect(o.briefingLines()).toBe("- Latest battle against a story character: none recorded in this run\n- Latest whiteout: at turn 11, after losing to a wild POOCHYENA on ROUTE101 (map 0/16); the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2)\n");
 });
 it("a trainer battle whose outcome was never sampled is a win once that trainer's flag reads set afterwards",()=>{
  const o=fold([state(20,{...battle("ongoing",8),...opponent(265,"ROXANNE",false,true)}),state(21,{location:"RUSTBORO CITY GYM",map_id:[11,3],...opponent(265,"ROXANNE",true,false)})]);
  expect(o.briefingLines()).toContain("- Latest battle against a story character: you won against ROXANNE (trainer 265) on ROUTE101 (map 0/16) at turn 20");
 });
 it("a trainer battle whose outcome was never read and whose flag stays unset says so",()=>{
  const o=fold([state(20,{...battle("ongoing",8),...opponent(535,"MAY",false,true)}),state(21,opponent(535,"MAY",false,false))]);
  expect(o.briefingLines()).toContain("- Latest battle against a story character: you battled MAY (trainer 535) on ROUTE101 (map 0/16) at turn 20; the game's outcome was not read");
 });
 it("a trainer who is not a story character is not the story line, and the last story battle stays",()=>{
  const o=fold([
   state(20,{...battle("won",8),...opponent(535,"MAY",false,true)}),state(21,opponent(535,"MAY",true,false)),
   state(30,{...battle("lost",8),...opponent(1,"SAWYER",false,true)}),state(31,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],...opponent(1,"SAWYER",false,false)}),
  ]);
  expect(o.briefingLines()).toBe("- Latest battle against a story character: you won against MAY (trainer 535) on ROUTE101 (map 0/16) at turn 20\n- Latest whiteout: at turn 30, after losing to SAWYER (trainer 1) on ROUTE101 (map 0/16); the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2)\n");
 });
 it("a draw counts as a whiteout; a trainer with no readable name is named by id; a battle that is still on is not finished",()=>{
  const o=fold([state(40,{...battle("drew",8),...opponent(77,null,false,true)}),state(41,{location:"PETALBURG CITY",map_id:[0,0]}),state(50,battle("ongoing",4))]);
  expect(o.briefingLines()).toBe("- Latest battle against a story character: none recorded in this run\n- Latest whiteout: at turn 40, after a draw with trainer 77 on ROUTE101 (map 0/16); the game returned you to PETALBURG CITY (map 0/0)\n");
 });
 it("running from a wild battle or a loss that stays on the same map is no whiteout",()=>{
  const o=fold([state(60,battle("ran",4)),state(61,{}),state(70,battle("lost",4)),state(71,{})]);
  expect(o.briefingLines()).toBe(`${NONE}\n`);
 });
 it("a story battle that ended another way names the game's outcome; a draw says drew with",()=>{
  expect(fold([state(90,{...battle("forfeited",8),...opponent(535,"MAY",false,true)}),state(91,{})]).briefingLines()).toContain("you battled MAY (trainer 535) on ROUTE101 (map 0/16) at turn 90; the game's outcome: forfeited");
  expect(fold([state(92,{...battle("drew",8),...opponent(535,"MAY",false,true)}),state(93,{})]).briefingLines()).toContain("you drew with MAY (trainer 535) on ROUTE101 (map 0/16) at turn 92");
 });
 it("a win is the trainer's flag turning set: a flag already set before the battle, or a blackout, is never a win (review round 1)",()=>{
  const pre=fold([state(100,{...battle("ongoing",8),...opponent(535,"MAY",true,true)}),state(101,{location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1],blackout_active:true,...opponent(535,"MAY",true,false)})]);
  expect(pre.briefingLines()).toContain("you lost to MAY (trainer 535) on ROUTE101 (map 0/16) at turn 100");
  const set=fold([state(110,{...battle("ongoing",8),...opponent(535,"MAY",true,true)}),state(111,opponent(535,"MAY",true,false))]);
  expect(set.briefingLines()).toContain("you battled MAY (trainer 535) on ROUTE101 (map 0/16) at turn 110; the game's outcome was not read");
  const flip=fold([state(120,{...battle("ongoing",8),...opponent(535,"MAY",false,true)}),state(121,{blackout_active:true,...opponent(535,"MAY",true,false)})]);
  expect(flip.briefingLines()).toContain("you lost to MAY (trainer 535)");
 });
 it("a trainer battle without the opponent reading names the battle by its kind",()=>{
  const o=fold([state(80,battle("lost",8)),state(81,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2]})]);
  expect(o.briefingLines()).toContain("after losing to a trainer on ROUTE101 (map 0/16)");
 });
});

describe("briefing-battle-outcomes-v1 registry",()=>{
 it("is a guard switch with no dependency, recorded when on, default off in presets",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  // The catalog states the reviewed win rule (review round 6).
  expect(featureInfo(ID).description).toContain("a win when the trainer's defeated flag, unset during the battle, reads set once it is over with no blackout seen");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

describe("trainer-opponent-v1 through the production schema (review round 1)",()=>{
 const opponent={trainer_id:535,trainer_class:50,name:"MAY",defeated:false,battle_active:false};
 it("a state with the field parses through parseGameState and the state event schema, and an out-of-range id is refused",()=>{
  expect(parseGameState({...IN_GAME,trainer_opponent:opponent}).trainer_opponent).toEqual(opponent);
  expect(parseGameState({...IN_GAME,trainer_opponent:null}).trainer_opponent).toBeNull();
  expect(()=>parseGameState({...IN_GAME,trainer_opponent:{...opponent,trainer_id:855}})).toThrow();
  expect(()=>parseGameState({...IN_GAME,trainer_opponent:{...opponent,extra:1}})).toThrow();
  const outcomes=new BattleOutcomes(FEATURES);
  outcomes.observe(checkEvent({v:1,run:"r",seq:2,t:"2026-10-16T05:00:00.000-04:00",type:"state",turn:2,...IN_GAME,screen:"battle",in_battle:true,trainer_opponent:{...opponent,battle_active:true}}));
  outcomes.observe(checkEvent({v:1,run:"r",seq:3,t:"2026-10-16T05:00:00.000-04:00",type:"state",turn:3,...IN_GAME,trainer_opponent:opponent}));
  expect(outcomes.briefingLines()).toContain("you battled MAY (trainer 535) on LITTLEROOT TOWN (map 0/9) at turn 2");
 });
 it("the loop guard's fingerprint is the same with and without the field",()=>{
  // Free field controls, so the fingerprint is a real value, not null (review round 2).
  const free={...IN_GAME,field_controls_locked:false};
  for(const interactions of [false,true]){
   const plain=semanticState(free,interactions);
   expect(plain).not.toBeNull();
   expect(semanticState({...free,trainer_opponent:opponent},interactions)).toBe(plain);
   expect(semanticState({...free,trainer_opponent:{...opponent,defeated:true}},interactions)).toBe(plain);
   expect(semanticState({...free,money:1},interactions)).not.toBe(plain);
  }
 });
});
