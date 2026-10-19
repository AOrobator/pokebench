import {describe,expect,it} from "vitest";
import {attachLoopGuard,Governor} from "./harness.js";
import type {RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {LoopNotice} from "./loop-detection.js";

const GYM="See? This is PETALBURG CITY's GYM.";
const SIGN="This is the GYM's sign. Look for it whenever you're looking for a GYM.";
const story={name_confirmed:true,intro_stage:7,rival_stage:4,birch_lab_stage:5,petalburg_gym_stage:0,woods_stage:0,clock_set:true,rival_battle_won:true,pokedex_received:true,running_shoes_received:true,starter_tutorial_complete:true,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
const triggers=(y:number,script_pointer:number)=>[{x:8,y,elevation:3,variable:0x4057,required_value:0,current_value:0,condition_met:true,script_pointer}];
const field=(x:number,y:number,extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({screen:"overworld",started:true,name:"RAED",location:"PETALBURG CITY",map_id:[0,0],position:{x,y},facing:"left",field_controls_locked:false,in_battle:false,party:[],money:3556,badges:[],play_time_s:2000,story,world_context:{objects:[],triggers:triggers(y,0x08100000+y),dialogue:null,message:null},...extra});

function rig(on:boolean){
 const notices:LoopNotice[]=[];const observers:((event:RunEvent)=>void)[]=[];
 const recorder={subscribe:(fn:(event:RunEvent)=>void)=>{observers.push(fn);},recordLoopGuard:(notice:LoopNotice)=>{notices.push(notice);}};
 const governor=new Governor({limits:{maxTurns:500,maxWallMs:600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 attachLoopGuard(recorder,governor,undefined,"enforced",true,()=>"SUPERVISOR",false,true,false,true,true,false,false,true,on);
 let seq=0;
 const emit=(body:Record<string,unknown>)=>{const event={v:1,run:"petalburg-trigger",seq:++seq,t:"2026-10-18T22:23:00.000-04:00",turn:seq,...body} as RunEvent;for(const fn of observers)fn(event);};
 const trip=(y:number,script_pointer:number)=>{
  const start=field(9,y,{world_context:{objects:[],triggers:triggers(y,script_pointer),dialogue:null,message:null}});
  const id=`trip-${String(y)}-${String(seq)}`;
  emit({type:"state",...start});
  emit({type:"tool_call",id,name:"navigate_to",args:{map_id:[0,0],x:0,y}});
  emit({type:"button_press",tool_call_id:id,before_state_seq:seq-1,buttons:["LEFT"]});
  for(const dialogue of [GYM,SIGN])emit({type:"state",...field(8,y,{field_controls_locked:true,resources:{script_pc:script_pointer,script_mode:1,script_status:0,selected_tree_id:null,berry_script_owner:null},world_context:{objects:[],triggers:triggers(y,script_pointer),dialogue,message:{phase:"page_wait",cursor:dialogue.length,ready:true}}})});
  emit({type:"state",...field(15,10)});
  emit({type:"tool_result",id,name:"navigate_to",is_error:false,duration_ms:100,text:"conversation closed",state_seq:seq});
 };
 return {notices,trip,emit};
}

describe("trigger-script-loop-v1",()=>{
 it("OFF leaves two repeated condition-matching coordinate scripts silent",()=>{
  const r=rig(false);r.trip(12,0x08100100);r.trip(13,0x08100120);
  expect(r.notices.filter(n=>n.kind==="trigger_script")).toEqual([]);
 });
 it("ON warns on the second shared-condition script despite a different row, pointer and action episode",()=>{
  const r=rig(true);r.trip(12,0x08100100);r.trip(13,0x08100120);
  expect(r.notices.map(n=>({kind:n.kind,phase:n.phase,evidence:n.evidence}))).toEqual([
   {kind:"trigger_script",phase:"warning",evidence:expect.any(Array)},
   {kind:"trigger_script",phase:"supervisor",evidence:expect.any(Array)},
  ]);
  expect(r.notices[0]?.message).toContain(GYM);
  expect(r.notices[0]?.evidence).toHaveLength(2);
 });
 it("ON does not warn for one execution, a different condition, or after native story progress",()=>{
  const once=rig(true);once.trip(12,0x08100100);expect(once.notices).toEqual([]);
  const different=rig(true);different.trip(12,0x08100100);different.emit({type:"state",...field(9,13,{world_context:{objects:[],triggers:[{...triggers(13,0x08100120)[0],variable:0x4058}],dialogue:null,message:null}})});different.trip(13,0x08100120);expect(different.notices).toEqual([]);
  const progressed=rig(true);progressed.trip(12,0x08100100);progressed.emit({type:"state",...field(15,10,{story:{...story,petalburg_gym_stage:1}})});progressed.trip(13,0x08100120);expect(progressed.notices).toEqual([]);
 });
});
