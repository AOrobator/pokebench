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
 return {tool,walked,pressed,features};
}
const request={map_id:[0,9],target:{kind:"object",local_id:2}};
const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
describe("static-npc-template-approach-v1",()=>{
 it("approaches a requested static native template and returns without A or a presence claim",async()=>{
  const r=rig(true),out=await r.tool.execute("id",request);
  expect(r.walked).toEqual([{x:2,y:0,map_id:[0,9]}]);expect(r.pressed).toEqual([]);
  expect(text(out)).toContain("current presence and position are unverified");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
 });
 it("OFF retains the exact old refusal and does not walk",async()=>{
  const r=rig(false),out=await r.tool.execute("id",request);expect(r.walked).toEqual([]);expect(r.pressed).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
 });
 it("the schema rejects moving and unknown movement templates",()=>{
  const s=initial();expect(()=>parseGameState({...s,static_npc_templates:{...s.static_npc_templates,templates:[{local_id:2,x:3,y:0,elevation:3,movement_type:1,hide_flag:0}]}})).toThrow();
 });
 it("documents the exact approach-only exception in both tool and prompt",()=>{
  const r=rig(true);expect(r.tool.description).toContain(STATIC_NPC_APPROACH_SENTENCE);expect(playSystemPrompt(r.features,null)).toContain(STATIC_NPC_APPROACH_SENTENCE);
  expect(rig(false).tool.description).not.toContain(STATIC_NPC_APPROACH_SENTENCE);
 });
});
