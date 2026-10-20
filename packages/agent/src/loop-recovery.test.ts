import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type EventBody,type RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {FIXED_POINT_LOOKBACK,RECOVERY_TURNS,loopRecoveries,loopType,factsOf,recoveryLines} from "./loop-recovery.js";
import {loopRecoveryCli} from "./loop-recovery-cli.js";

interface Fixture {readonly events:readonly RunEvent[]}
const F28D=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/stall-gate-f28d.json.gz",import.meta.url))).toString("utf8")) as Fixture;

function log(){
 const events:RunEvent[]=[];let seq=0;
 const add=(body:EventBody):RunEvent=>{const e=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T03:40:00.000-04:00",...body});events.push(e);return e;};
 const state=(turn:number,over:Partial<GameStateSnapshot>={}):RunEvent=>add({type:"state",turn,...IN_GAME,field_controls_locked:false,...over});
 const guard=(turn:number,kind:"ineffective"|"cycle"|"milestone_drought",phase:"warning"|"supervisor"="warning"):RunEvent=>add({type:"loop_guard",turn,kind,message:"m",calls:1,evidence:[1],mode:"enforced",phase});
 return {events,add,state,guard};
}

describe("loop types",()=>{
 it("is battle, then dialogue, then an open interface, then a map with a story character, else navigation",()=>{
  const s=(over:Partial<GameStateSnapshot>)=>factsOf({...IN_GAME,...over} as Extract<RunEvent,{type:"state";started:boolean}>);
  expect(loopType(s({in_battle:true,world_context:{objects:[],triggers:[],dialogue:"Hi"}}),["MAY"])).toBe("battle_menu");
  expect(loopType(s({world_context:{objects:[],triggers:[],dialogue:"Hi"}}),["MAY"])).toBe("dialogue");
  expect(loopType(s({screen:"naming"}),[])).toBe("interface");
  expect(loopType(s({}),["MAY"])).toBe("story_character");
  expect(loopType(s({}),[])).toBe("navigation");
 });
});

describe("recovery tests per loop type",()=>{
 it("navigation: recovered on a tile the fixed point did not use, not by moving between its own tiles",()=>{
  const l=log();
  for(let t=1;t<=10;t++)l.state(t,{position:{x:10,y:5+(t%2)}});
  l.guard(10,"ineffective");
  for(let t=11;t<=20;t++)l.state(t,{position:{x:10,y:5+(t%2)}});
  expect(loopRecoveries(l.events).interventions.map(i=>[i.type,i.recovered,i.detail])).toEqual([["navigation",false,"stayed on the tiles of the fixed point"]]);
  l.state(21,{position:{x:11,y:5}});
  expect(loopRecoveries(l.events).interventions[0]?.recovered).toBe(true);
  expect(FIXED_POINT_LOOKBACK).toBe(20);
 });
 it("battle menu: recovered when the battle ends (a battle turn executing also counts)",()=>{
  const l=log();
  l.state(1,{in_battle:true,screen:"battle"});l.guard(1,"cycle");l.state(2,{in_battle:true,screen:"battle"});
  expect(loopRecoveries(l.events).interventions[0]).toMatchObject({type:"battle_menu",recovered:false,detail:"no battle turn executed"});
  l.state(3,{});
  expect(loopRecoveries(l.events).interventions[0]).toMatchObject({recovered:true,detail:"a battle turn executed or the battle ended"});
 });
 it("dialogue and interface: recovered when it closes with the field free",()=>{
  const l=log();
  l.state(1,{world_context:{objects:[],triggers:[],dialogue:"Go next door."}});l.guard(1,"cycle");
  l.state(2,{world_context:{objects:[],triggers:[],dialogue:""},field_controls_locked:true});
  expect(loopRecoveries(l.events).interventions[0]).toMatchObject({type:"dialogue",recovered:false});
  l.state(3,{world_context:{objects:[],triggers:[],dialogue:""}});
  expect(loopRecoveries(l.events).interventions[0]?.recovered).toBe(true);
  const m=log();
  m.state(1,{screen:"naming"});m.guard(1,"cycle");m.state(2,{screen:"naming"});
  expect(loopRecoveries(m.events).interventions[0]).toMatchObject({type:"interface",recovered:false});
  m.state(3,{});
  expect(loopRecoveries(m.events).interventions[0]?.recovered).toBe(true);
 });
 it("story character: recovered by talking to the character or a story milestone; safety and relapse are counted",()=>{
  const l=log();
  const s=l.state(1,{map_id:[0,18]});
  l.add({type:"tool_result",turn:1,id:"c",name:"observe",is_error:false,duration_ms:1,text:"Story characters here: MAY at 10,3. Not on this map: MOM.",frames:[],state_seq:s.seq});
  l.state(2,{map_id:[0,18]});l.guard(2,"milestone_drought","supervisor");
  l.state(3,{map_id:[0,18],blackout_active:true});
  l.guard(4,"milestone_drought","supervisor");
  const first=loopRecoveries(l.events).interventions[0];
  expect(first).toMatchObject({type:"story_character",recovered:false,safe:false,relapsed:true});
  l.add({type:"dialogue_auto_advance",turn:5,tool_call_id:"d",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"ROUTE103",map_id:[0,18],position:null,speaker:"MAY",speaker_source:"name_prefix",text:"MAY: Hi!"}],stop:"field_free",detail:"",duration_ms:1});
  expect(loopRecoveries(l.events).interventions[0]).toMatchObject({recovered:true,detail:"talked to the story character"});
 });
 it("counts only intervention events: episode starts, stall briefings, held and retired briefings, breaker notes and auto-talk",()=>{
  const l=log();
  l.state(1);
  l.guard(1,"cycle","supervisor");
  l.add({type:"loop_guard",turn:1,kind:"milestone_drought",message:"Not sent",calls:0,evidence:[1],mode:"diagnostic",phase:"would_warn"});
  l.add({type:"stall_gate",turn:1,kind:"map_cycle",level:1,reason:"untalked",character:"MAY",map_id:[0,18]});
  l.add({type:"loop_breaker",turn:1,stage:1,trigger:"fixed_point",repeats:3,collapsed:2,text:null});
  l.add({type:"loop_breaker",turn:1,stage:2,trigger:"fixed_point",repeats:4,collapsed:0,text:"x"});
  l.add({type:"auto_talk",turn:1,trigger:"fixed_point",repeats:8,outcome:"not_free",target:null,walks:0,tried:0,text:null});
  l.add({type:"auto_talk",turn:1,trigger:"fixed_point",repeats:8,outcome:"none",target:null,walks:0,tried:0,text:null});
  l.add({type:"run_end",turn:2,reason:"stuck",furthest_milestone:null,turns:2,wall_ms:1,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
  const {interventions,rates}=loopRecoveries(l.events);
  expect(interventions.map(i=>i.source)).toEqual(["loop_guard:milestone_drought","stall_gate:map_cycle","loop_breaker:fixed_point","auto_talk:none"]);
  expect(interventions.every(i=>!i.safe)).toBe(true);
  expect(recoveryLines(rates)[0]).toContain("recovered  base  safe  relapsed");
  expect(RECOVERY_TURNS).toBe(30);
 });
});

describe("story-character typing in the recorder's order",()=>{
 it("uses the Story characters line of the result that came right before the fire",()=>{
  const l=log();
  const s=l.state(1,{map_id:[0,18]});
  l.add({type:"tool_result",turn:1,id:"c",name:"observe",is_error:false,duration_ms:1,text:"Story characters here: MAY at 10,3. Not on this map: MOM.",frames:[],state_seq:s.seq});
  l.add({type:"stall_gate",turn:1,kind:"milestone_drought",level:1,reason:"untalked",character:"MAY",map_id:[0,18]});
  const s2=l.state(2,{map_id:[0,18]});
  l.add({type:"tool_result",turn:2,id:"d",name:"observe",is_error:false,duration_ms:1,text:"Story characters here: none. Not on this map: MAY.",frames:[],state_seq:s2.seq});
  l.guard(2,"milestone_drought","supervisor");
  expect(loopRecoveries(l.events).interventions.map(i=>i.type)).toEqual(["story_character","navigation"]);
 });
});

describe("relapse",()=>{
 it("is the same source firing again, never the fire itself, with breaker and auto-talk events stamped a turn past the latest state",()=>{
  const l=log();
  for(let t=1;t<=10;t++)l.state(t,{position:{x:t,y:5}});
  l.add({type:"loop_breaker",turn:11,stage:2,trigger:"fixed_point",repeats:4,collapsed:0,text:"x"});
  l.add({type:"auto_talk",turn:11,trigger:"fixed_point",repeats:8,outcome:"none",target:null,walks:0,tried:0,text:null});
  for(let t=11;t<=50;t++)l.state(t,{position:{x:t,y:5}});
  expect(loopRecoveries(l.events).interventions.map(i=>i.relapsed)).toEqual([false,false]);
  l.add({type:"loop_breaker",turn:51,stage:2,trigger:"fixed_point",repeats:4,collapsed:0,text:"x"});
  expect(loopRecoveries(l.events).interventions.map(i=>i.relapsed)).toEqual([false,false,false]);
  l.add({type:"loop_breaker",turn:52,stage:2,trigger:"fixed_point",repeats:5,collapsed:0,text:"x"});
  expect(loopRecoveries(l.events).interventions.map(i=>i.relapsed)).toEqual([false,false,true,false]);
 });
});

describe("on run f28d (turns 383-455)",()=>{
 it("the turn 450 loop with MAY on Route 103 is a story-character loop that did not recover",()=>{
  const {interventions}=loopRecoveries(F28D.events);
  const at450=interventions.find(i=>i.turn===450);
  expect(at450).toMatchObject({source:"loop_guard:ineffective",type:"story_character",recovered:false});
 });
});

describe("the CLI",()=>{
 it("streams a run's log and prints its table, and refuses bad ids and missing logs",async()=>{
  const root=mkdtempSync(join(tmpdir(),"loop-recovery-"));
  const id="2026-10-20T03-02-13_qwen36-gpu1_f28d";
  mkdirSync(join(root,id));
  writeFileSync(join(root,id,"events.jsonl"),`${F28D.events.map(e=>JSON.stringify(e)).join("\n")}\n\n`);
  const lines:string[]=[];
  expect(await loopRecoveryCli(["--runs-root",root,id],"/nowhere",l=>{lines.push(l);})).toBe(0);
  expect(lines[0]).toMatch(new RegExp(`^${id}: \\d+ interventions$`));
  expect(lines.some(l=>l.startsWith("story_character"))).toBe(true);
  const bad:string[]=[];
  expect(await loopRecoveryCli(["--runs-root",root,"../nope"],"/nowhere",l=>{bad.push(l);})).toBe(2);
  expect(await loopRecoveryCli(["--runs-root",root,"2026-10-20T03-02-13_qwen36-gpu1_aaaa"],"/nowhere",l=>{bad.push(l);})).toBe(2);
  expect(await loopRecoveryCli([],root,l=>{bad.push(l);})).toBe(2);
  expect(bad).toEqual(["invalid run id: ../nope","no event log for run: 2026-10-20T03-02-13_qwen36-gpu1_aaaa","usage: loop-recovery [--runs-root DIR] <run_id> [...]"]);
  const broken="2026-10-20T03-02-13_qwen36-gpu1_bbbb";mkdirSync(join(root,broken));writeFileSync(join(root,broken,"events.jsonl"),"{not json\n");
  const out:string[]=[];
  expect(await loopRecoveryCli(["--runs-root",root,broken],"/nowhere",l=>{out.push(l);})).toBe(2);
  expect(out[0]).toMatch(new RegExp(`^${broken}: line 1 is not a valid event: `));
 });
});
