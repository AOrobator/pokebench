import {describe,expect,it} from "vitest";
import {ALL_ON,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {BattleOutcomes} from "./battle-outcomes.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {recorded,recordedFeatures} from "../test-support/battle-facts.js";

const ID="briefing-battle-outcomes-v1";
const LIVE="battle-facts-54a7.jsonl.gz",SH02="battle-facts-sh02.jsonl.gz";
const LOST="- Latest battle against a story character: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 371";
const WHITEOUT="- Latest whiteout: at turn 371, after losing to MAY (trainer 535) on ROUTE103 (map 0/18); the game returned you to GREE's HOUSE 2F (map 1/1)";
const NONE="- Latest battle against a story character: none recorded in this run\n- Latest whiteout: none recorded in this run";
const PROGRESS=/^- Last story progress: .*$/m;

type Guard=Extract<RunEvent,{type:"loop_guard"}>;
// The stall briefing at a recorded milestone-drought note, replayed with this switch set as given.
function replay(seq:number,on:boolean):{text:string;recorded:string}{
 const events=recorded(LIVE);
 const b=new SupervisorBriefing(recordedFeatures(events,{[ID]:on}));
 for(const e of events){
  if(e.type==="loop_guard"){
   if(e.seq!==seq||e.phase!=="supervisor")continue;
   const g:Guard=e;const minutes=/no new story milestone for (\d+) minutes/.exec(g.message);
   if(minutes===null)throw new Error("not a drought note");
   return {text:b.stallText({kind:"milestone_drought",minutes:Number(minutes[1])},g.calls),recorded:g.message};
  }
  b.observe(e);
 }
 throw new Error(`no supervisor note at ${String(seq)}`);
}

describe("briefing-battle-outcomes-v1 on live run 54a7 (lost to MAY on ROUTE103 at T371, whited out)",()=>{
 it("OFF reproduces the recorded stall briefings at T418 (seq 10226) and T484 (seq 11729) byte for byte",()=>{
  for(const seq of [10226,11729]){const {text,recorded:message}=replay(seq,false);expect(text).toBe(message);}
 });
 it("ON states the lost rival battle and the whiteout right after the last story progress, and nothing else changes",()=>{
  for(const seq of [10226,11729]){
   const off=replay(seq,false).text,on=replay(seq,true).text;
   const progress=PROGRESS.exec(off)?.[0]??"";
   expect(progress).toContain("route 103 at turn 347");
   expect(on).toBe(off.replace(progress,`${progress}\n${LOST}\n${WHITEOUT}`));
  }
 });
 it("ON before any battle with a story character says none were recorded (T277, seq 6785)",()=>{
  const off=replay(6785,false).text,on=replay(6785,true).text;
  const progress=PROGRESS.exec(off)?.[0]??"";
  expect(on).toBe(off.replace(progress,`${progress}\n${NONE}`));
 });
});

describe("briefing-battle-outcomes-v1 on sh02 (beat MAY on ROUTE103 at T954)",()=>{
 it("states the win and no whiteout",()=>{
  const events=recorded(SH02);
  const outcomes=new BattleOutcomes(recordedFeatures(events));
  for(const e of events)outcomes.observe(e);
  expect(outcomes.briefingLines()).toBe("- Latest battle against a story character: you won against MAY (trainer 535) on ROUTE103 (map 0/18) at turn 954\n- Latest whiteout: none recorded in this run\n");
 });
});

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
 it("a trainer battle without the opponent reading names the battle by its kind",()=>{
  const o=fold([state(80,battle("lost",8)),state(81,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2]})]);
  expect(o.briefingLines()).toContain("after losing to a trainer on ROUTE101 (map 0/16)");
 });
});

describe("briefing-battle-outcomes-v1 reaches every briefing through the production factories",()=>{
 function feed(on:boolean):{loop:string;textOnly:string}{
  const events=recorded(LIVE);
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},textOnlySupervisor:()=>undefined};
  const features=recordedFeatures(events,{[ID]:on});
  const loop=loopSupervisor(features,recorder),textOnly=textOnlySupervisor(features,recorder);
  for(const e of events){if(e.seq>10226)break;for(const o of observers)o(e);}
  if(loop===undefined||textOnly===undefined)throw new Error("supervisors are on in 54a7");
  return {loop:loop("cycle",418),textOnly:textOnly(3,1)};
 }
 it("ON: the loop-guard and text-only supervisors state the loss and the whiteout; OFF: they do not",()=>{
  const on=feed(true),off=feed(false);
  for(const text of [on.loop,on.textOnly])expect(text).toContain(`${LOST}\n${WHITEOUT}\n`);
  for(const text of [off.loop,off.textOnly])expect(text).not.toContain("Latest battle against a story character");
 });
});

describe("briefing-battle-outcomes-v1 registry",()=>{
 it("is a guard switch with no dependency, recorded when on, default off in presets",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
