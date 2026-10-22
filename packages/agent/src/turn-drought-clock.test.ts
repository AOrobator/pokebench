// turn-drought-clock-v1 (the operator 2026-10-22): the milestone-drought clock counts model actions, not wall time.
// Qwen makes 25-30 actions per 5 minutes and GLM 5-8 (8 recent 2h runs), so a 5-minute clock nudged GLM
// every 5-8 actions, and its "what you have been trying is not working" was false during heal-and-grind.
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {stallBriefing} from "./play-wiring.js";
import {STALL_DROUGHT_ACTIONS,STALL_DROUGHT_MS,StallBriefing} from "./stall-briefing.js";
import type {LoopNotice} from "./loop-detection.js";

const ID="turn-drought-clock-v1" as const;
const BASE:FeatureSet={...LEGACY_ALL_ON,"stall-briefing-v1":true,"positive-supervisor-v1":false,"progress-aware-cycles-v1":false,"story-character-stall-gate-v1":false,"same-plan-breaker-v1":false,"drought-battle-heal-hold-v1":false,"milestone-drought-suppression-v1":false,[ID]:false};
const MON=(hp:number,level=9,identity="0000abcd:00001234")=>({species:"TORCHIC",identity,level,hp,max_hp:21});
const HEADLINE=(n:number)=>`No new story milestone, level-up, trainer win or full heal in the last ${String(n)} actions`;

type Sent={kind:string;text:string;evidence:readonly number[]};
// Production wiring: play-wiring's stallBriefing with a recorder and a detector that accepts every stall.
function rig(features:FeatureSet,gateHold=false){
 const subscribers:((e:RunEvent)=>void)[]=[];const notes:LoopNotice[]=[];const sent:Sent[]=[];const gates:unknown[]=[];
 let now=0,seq=0;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notes.push(n);},recordStallGate:(g:unknown)=>{gates.push(g);}};
 const stall=gateHold?null:stallBriefing(features,recorder,{stall:(kind,text,evidence)=>{sent.push({kind,text:text(311),evidence});return true;}},{pausedMs:()=>0},()=>now);
 const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"t",t:"2026-10-22T08:00:00.000-04:00",turn:seq,seq:++seq,...body});for(const fn of subscribers)fn(e);};
 const state=(extra:Record<string,unknown>={})=>{emit({type:"state",...IN_GAME,location:"ROUTE 103",map_id:[0,18],position:{x:1,y:1},field_controls_locked:false,interaction_targets:[],party:[MON(21)],...extra});};
 const call=(error=false)=>{emit({type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:error,duration_ms:1,text:error?"refused":"pressed",frames:[]});};
 // One model action: the state it left, then its tool result.
 const act=(extra:Record<string,unknown>={},ms=0,error=false)=>{now+=ms;state(extra);call(error);};
 const acts=(n:number,extra:Record<string,unknown>={},ms=0)=>{for(let i=0;i<n;i++)act(extra,ms);};
 return {stall,notes,sent,gates,emit,state,call,act,acts,advance:(ms:number)=>{now+=ms;},droughts:()=>sent.filter(s=>s.kind==="milestone_drought")};
}
// The class itself with a story-character gate that always holds.
function gated(features:FeatureSet){
 let seq=0;const kinds:string[]=[];const held:unknown[][]=[];
 const hold={reason:"untalked" as const,character:"MAY",map_id:[0,18] as [number,number]};
 const b=new StallBriefing(features,()=>0,{stall:(kind)=>{kinds.push(kind);return true;}},()=>"",{holds:()=>hold,held:(...a:unknown[])=>{held.push(a);}});
 const emit=(body:Record<string,unknown>)=>{b.observe(checkEvent({v:1,run:"g",t:"2026-10-22T08:00:00.000-04:00",turn:seq,seq:++seq,...body}));};
 const act=()=>{emit({type:"state",...IN_GAME,party:[MON(21)],interaction_targets:[]});emit({type:"tool_result",id:"c",name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[]});};
 return {kinds,held,act,emit};
}

describe(`${ID} registry`,()=>{
 it("is the last switch: a default-off guard that needs stall-briefing-v1, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-1)?.id).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(LEGACY_ALL_ON,null)).not.toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"stall-briefing-v1",switchable:true,title:"TURN DROUGHT CLOCK"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("30 actions");
  const omitted=Object.fromEntries(Object.entries(BASE).filter(([k])=>k!==ID)) as Parameters<typeof normalizeFeatures>[0];
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(STALL_DROUGHT_ACTIONS).toBe(30);
 });
});

describe(`${ID} OFF`,()=>{
 it("keeps the wall clock: no briefing after 60 quick actions, the minutes text after 5 minutes",()=>{
  const r=rig(BASE);
  r.acts(60);
  expect(r.droughts()).toEqual([]);
  r.act({},STALL_DROUGHT_MS);
  expect(r.droughts()).toHaveLength(1);
  expect(r.droughts()[0]?.text).toContain("SUPERVISOR: You are stalling. There has been no new story milestone for 5 minutes of play, and the game is not moving forward (stall briefing, 311 calls into the run). What you have been trying is not working");
  expect(r.droughts()[0]?.evidence[0]).toBe(r.droughts()[0]?.evidence[1]);
 });
 it("does not restart on a level-up, trainer win or full heal",()=>{
  const r=rig(BASE);
  r.act({party:[MON(10)]},STALL_DROUGHT_MS-1000);
  r.act({party:[MON(21,10)],trainer_opponent:{trainer_id:300,trainer_class:5,name:"CALVIN",defeated:true,battle_active:false}},2000);
  expect(r.droughts()).toHaveLength(1);
  expect(r.droughts()[0]?.text).toContain("no new story milestone for 5 minutes of play");
 });
 it("keeps milestone-drought-suppression-v1's diagnostic bytes",()=>{
  const r=rig({...BASE,"milestone-drought-suppression-v1":true});
  r.act({},STALL_DROUGHT_MS+1);
  expect(r.sent).toEqual([]);
  expect(r.notes.map(n=>n.message)).toEqual(["Not sent (milestone-drought-suppression-v1): No new story milestone for 5 minutes of play."]);
 });
});

describe(`${ID} ON`,()=>{
 const ON={...BASE,[ID]:true};
 it("counts actions, not wall time: the first briefing at 30 actions, the next at 60",()=>{
  const r=rig(ON);
  r.acts(5,{},STALL_DROUGHT_MS*4);
  expect(r.droughts()).toEqual([]);
  r.acts(24);
  expect(r.droughts()).toEqual([]);
  r.act();
  expect(r.droughts()).toHaveLength(1);
  expect(r.droughts()[0]?.text.split("\n")[0]).toBe(`SUPERVISOR: ${HEADLINE(30)} (stall briefing, 311 calls into the run).`);
  r.acts(29);
  expect(r.droughts()).toHaveLength(1);
  r.act();
  expect(r.droughts()).toHaveLength(2);
  expect(r.droughts()[1]?.text.split("\n")[0]).toBe(`SUPERVISOR: ${HEADLINE(60)} (stall briefing, 311 calls into the run).`);
 });
 it("says only the facts: no stalling, not-working or new-plan wording, and the last story progress line",()=>{
  const r=rig(ON);
  r.acts(30);
  const text=r.droughts()[0]?.text??"";
  expect(text).toContain("\n- Last story progress: none earned in this run yet");
  expect(text).toContain("\n- Where you are: ");
  for(const phrase of ["not working","stalling","not moving forward","different from what you have been trying","do not try it again"])expect(text).not.toContain(phrase);
 });
 it("walking and failed actions are actions, not progress",()=>{
  const r=rig(ON);
  for(let i=0;i<15;i++)r.act({position:{x:1+i,y:1}});
  for(let i=0;i<15;i++)r.act({},0,true);
  expect(r.droughts()).toHaveLength(1);
 });
 it("a story milestone restarts the clock",()=>{
  const r=rig(ON);
  r.acts(20);
  r.emit({type:"milestone",name:"ROUTE_103_REACHED",server_timestamp:0,kind:"story",origin:"observed"});
  r.acts(29);
  expect(r.droughts()).toEqual([]);
  r.act();
  expect(r.droughts()).toHaveLength(1);
 });
 it("a party member's level going up restarts the clock",()=>{
  const r=rig(ON);
  r.acts(20,{party:[MON(21,9)]});
  r.act({party:[MON(21,10)]});
  r.acts(29,{party:[MON(21,10)]});
  expect(r.droughts()).toEqual([]);
  r.act({party:[MON(21,10)]});
  expect(r.droughts()).toHaveLength(1);
 });
 it("a new party member, a party slot swap and an unknown level are not level-ups",()=>{
  const r=rig(ON);
  r.acts(10,{party:[MON(21,9)]});
  r.acts(10,{party:[MON(21,9),MON(15,12,"0000beef:00001234")]});
  r.acts(9,{party:[MON(15,12,"0000beef:00001234"),{...MON(21,9),level:null}]});
  r.act({party:[MON(15,12,"0000beef:00001234"),MON(21,9)]});
  expect(r.droughts()).toHaveLength(1);
 });
 it("a trainer battle won (the trainer seen undefeated, then defeated) restarts the clock",()=>{
  const r=rig(ON);
  const trainer=(defeated:boolean,battle_active:boolean)=>({trainer_id:300,trainer_class:5,name:"CALVIN",defeated,battle_active});
  r.acts(20);
  r.acts(5,{in_battle:true,screen:"battle",trainer_opponent:trainer(false,true)});
  r.act({trainer_opponent:trainer(true,false)});
  r.acts(29);
  expect(r.droughts()).toEqual([]);
  r.act();
  expect(r.droughts()).toHaveLength(1);
 });
 it("an already-defeated trainer is not a win",()=>{
  const r=rig(ON);
  r.acts(30,{trainer_opponent:{trainer_id:300,trainer_class:5,name:"CALVIN",defeated:true,battle_active:false}});
  expect(r.droughts()).toHaveLength(1);
 });
 it("the party reaching full HP after being below full restarts the clock; staying full or hurt does not",()=>{
  const r=rig(ON);
  r.acts(10,{party:[MON(21)]});
  r.acts(10,{party:[MON(12)]});
  r.act({party:[MON(21)]});
  r.acts(29,{party:[MON(21)]});
  expect(r.droughts()).toEqual([]);
  r.act({party:[MON(21)]});
  expect(r.droughts()).toHaveLength(1);
  const hurt=rig(ON);
  hurt.acts(30,{party:[MON(12)]});
  expect(hurt.droughts()).toHaveLength(1);
 });
 it("is sent even with milestone-drought-suppression-v1 on, which keeps no diagnostic",()=>{
  const r=rig({...ON,"milestone-drought-suppression-v1":true});
  r.acts(30);
  expect(r.droughts()).toHaveLength(1);
  expect(r.droughts()[0]?.text.split("\n")[0]).toContain(HEADLINE(30));
  expect(r.notes).toEqual([]);
 });
 it("leaves positive-supervisor-v1's retired drought diagnostic as it was",()=>{
  const off=rig({...BASE,"positive-supervisor-v1":true}),on=rig({...ON,"positive-supervisor-v1":true});
  for(const r of [off,on]){r.acts(40);r.act({},STALL_DROUGHT_MS+1);}
  expect(on.sent).toEqual(off.sent);
  expect(on.notes).toEqual(off.notes);
  expect(on.notes.map(n=>n.message)).toEqual(["Not sent (positive-supervisor-v1): No new story milestone for 5 minutes of play."]);
 });
 it("drought-battle-heal-hold-v1 still holds it in battle, in action wording, and the clock restarts after",()=>{
  const r=rig({...ON,"drought-battle-heal-hold-v1":true});
  r.acts(29);
  r.acts(3,{in_battle:true,screen:"battle"});
  expect(r.droughts()).toEqual([]);
  expect(r.notes.map(n=>n.message)).toEqual([`Not sent (drought-battle-heal-hold-v1): no new story milestone, level-up, trainer win or full heal in the last 30 actions, but a battle is on screen.`]);
  r.acts(29);
  expect(r.droughts()).toEqual([]);
  r.act();
  expect(r.droughts()).toHaveLength(1);
 });
 it("story-character-stall-gate-v1 still holds the due briefing at its level",()=>{
  const g=gated({...ON,"story-character-stall-gate-v1":true});
  for(let i=0;i<30;i++)g.act();
  expect(g.kinds).toEqual([]);
  expect(g.held).toHaveLength(1);
  expect(g.held[0]?.slice(0,2)).toEqual(["milestone_drought",1]);
 });
});
