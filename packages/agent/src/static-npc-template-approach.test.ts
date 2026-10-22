import {withDialogueAutoAdvance,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {describe,it,expect} from "vitest";
import {Type} from "typebox";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {IN_GAME} from "../test-support/events.js";
import {flagFeatures} from "./play-preset.js";
import {withSemanticNavigation,STATIC_NPC_APPROACH_SENTENCE} from "./semantic-navigation.js";
import type {CheckedNavigationTool} from "./navigation.js";
import type {CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {playSystemPrompt} from "./play-config.js";
const tile=(x:number,y:number)=>({x,y,collision:0,elevation:3,behavior:0});
const base=()=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"semantic-navigation-v1":true,"walkable-floor-v1":true});
const initial=():GameStateSnapshot=>({...IN_GAME,screen:"overworld",in_battle:false,map_id:[0,9],position:{x:0,y:0},field_controls_locked:false,active_ui:null,world_context:null,interaction_targets:[],navigation_grid:{elevation:3,tiles:[0,1,2,3,4].flatMap(x=>[tile(x,0),tile(x,1)]),objects:[],warps:[]},static_npc_templates:{map_id:[0,9],source:"saveblock1_templates",templates:[{local_id:2,x:3,y:0,elevation:3,movement_type:7,hide_flag:0}]}});
function rig(on:boolean,after?:(s:GameStateSnapshot)=>GameStateSnapshot,provided=initial()){
 let current=provided;const walked:unknown[]=[],pressed:unknown[]=[];
 const result=(status="state"):AgentToolResult<unknown>=>({content:[{type:"text",text:"native state"}],details:{state:current,navigation:{status,commands:1}}});
 const nav={name:"navigate_to",label:"nav",description:"",parameters:Type.Object({}),execute:()=>Promise.resolve(result()),executeChecked:(_id:string,args:{x:number;y:number},check:(s:GameStateSnapshot)=>string|null)=>{const before=check(current);if(before!==null)return Promise.resolve(result(before));walked.push(args);current={...current,position:{x:args.x,y:args.y}};current=after?.(current)??current;return Promise.resolve(result(check(current)??"arrived at requested coordinate"));}} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"",parameters:Type.Object({}),execute:()=>{pressed.push("execute");return Promise.resolve(result());},executeChecked:()=>{pressed.push("checked");return Promise.resolve(result());}} as unknown as CheckedPressTool;
 const features={...base(),"static-npc-template-approach-v1":on};
 const tools=withSemanticNavigation([nav,press],features,{read:()=>Promise.resolve(current)}),tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("tool");
 return {tool,walked,pressed,features,press};
}
const request={map_id:[0,9],target:{kind:"static_object",local_id:2}};
const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
describe("static-npc-template-approach-v1",()=>{
 it("approaches a requested static native template and returns without A or a presence claim",async()=>{
  const r=rig(true),out=await r.tool.execute("id",request);
  expect(r.walked).toEqual([{x:2,y:0,map_id:[0,9]}]);expect(r.pressed).toEqual([]);
  expect(text(out)).toContain("current presence and position are unverified");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
 });
 it("OFF retains the exact old refusal and does not walk",async()=>{
  const r=rig(false),out=await r.tool.execute("id",{...request,target:{kind:"object",local_id:2}});expect(r.walked).toEqual([]);expect(r.pressed).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
  expect(Value.Check(r.tool.parameters,request)).toBe(false);
 });
 it("never converts a loaded-on-entry template request into live object activation",async()=>{
  const s=initial();const r=rig(true,undefined,{...s,static_npc_templates:{map_id:[0,9],source:"saveblock1_templates",templates:[]},interaction_targets:[{kind:"object",local_id:2,x:3,y:0,elevation:3,activation:"A",availability:"always",facing:null,destination:null,name:null}]});
  await r.tool.execute("id",request);expect(r.walked).toEqual([]);expect(r.pressed).toEqual([]);
 });
 it("returns immediately after a load or evidence change without pressing A",async()=>{
  for(const after of [
   (s:GameStateSnapshot)=>{const {static_npc_templates:old,...rest}=s;expect(old).toBeDefined();return rest;},
   (s:GameStateSnapshot)=>({...s,interaction_object_slots:[{slot:1,x:3,y:0,elevation:3,local_id:2,map_id:[0,9] as [number,number],is_player:false}]}),
   (s:GameStateSnapshot)=>({...s,static_npc_templates:{map_id:[0,9] as [number,number],source:"saveblock1_templates" as const,templates:[{local_id:2,x:4,y:0,elevation:3,movement_type:7 as const,hide_flag:0}]}}),
  ]){
   const r=rig(true,after),out=await r.tool.execute("id",request);expect(r.pressed).toEqual([]);expect(text(out)).toMatch(/no longer verified|object loaded|evidence changed/);
  }
 });
 it("refuses wrong-map evidence and unreachable elevations without input",async()=>{
  for(const patch of [{map_id:[0,8] as [number,number]},{map_id:[0,9] as [number,number],templates:[{local_id:2,x:3,y:0,elevation:5,movement_type:7 as const,hide_flag:0}]}]){
   const s=initial();if(s.static_npc_templates===undefined)throw new Error("fixture");
   const r=rig(true,undefined,{...s,static_npc_templates:{...s.static_npc_templates,...patch}});await r.tool.execute("id",request);expect(r.walked).toEqual([]);expect(r.pressed).toEqual([]);
  }
 });
 it("the schema rejects moving and unknown movement templates",()=>{
  const s=initial();expect(()=>parseGameState({...s,static_npc_templates:{...s.static_npc_templates,templates:[{local_id:2,x:3,y:0,elevation:3,movement_type:1,hide_flag:0}]}})).toThrow();
 });
 it("documents the exact approach-only exception in both tool and prompt",()=>{
  const r=rig(true);expect(r.tool.description).toContain(STATIC_NPC_APPROACH_SENTENCE);expect(playSystemPrompt(r.features,null)).toContain(STATIC_NPC_APPROACH_SENTENCE);
  expect(rig(false).tool.description).not.toContain(STATIC_NPC_APPROACH_SENTENCE);
 });
});

it("the production dialogue wrapper preserves the static request boundary instead of auto-talking",async()=>{
 const r=rig(true,s=>({...s,world_context:{objects:[],triggers:[],dialogue:"Unrelated field text",message:null}}));
 const features={...r.features,"semantic-navigation-v2":true,"dialogue-auto-advance-v1":true};
 const observe:AgentTool={name:"observe",label:"Observe",description:"",parameters:{},execute:()=>Promise.reject(new Error("no automatic observation or dialogue"))};
 const recorder={recordState:()=>{throw new Error("no automatic state recording");},recordDialogueAutoAdvance:()=>{throw new Error("no dialogue advancement");},subscribe:()=>undefined} as unknown as AutoAdvanceRecorder;
 const tools=withDialogueAutoAdvance([observe,r.press,r.tool],features,{state:{read:()=>Promise.resolve(initial())},recorder});
 const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("tool");
 const out=await tool.execute("id",request);expect(r.pressed).toEqual([]);expect(text(out)).toContain("dialogue or a field message opened");
});
