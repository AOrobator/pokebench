import {expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {IN_GAME} from "../test-support/events.js";
import {featuresOf} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {navigationTool} from "./navigation.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {pressTool,type CheckedPressTool} from "./game-tools.js";
import type {TrainerSightCheck,TrainerSightPorts} from "./trainer-sight.js";

// Real navigation + semantic factories; only native state/sight/input ports are in-memory.
function rig(kind:"object"|"static_object",options:{v1?:boolean;v2?:boolean;seen?:number|null}={}){
 let state:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,map_id:[0,9],position:{x:0,y:0},field_controls_locked:false,world_context:null,interaction_targets:[],navigation_grid:{elevation:3,tiles:[0,1,2,3,4].map(x=>({x,y:0,collision:0,elevation:3,behavior:0})),objects:[],warps:[]},static_npc_templates:{map_id:[0,9],source:"saveblock1_templates",templates:[{local_id:2,x:3,y:0,elevation:3,movement_type:7,hide_flag:0}]},heal_before_trainers:{trainers:[{local_id:2,x:3,y:0,graphics_id:0,sprite_kind:"PERSON",trainer_id:1,defeated:false,loaded:false}],move_power:[],last_heal:null,home:null,mom_heals:false}};
 const records:TrainerSightCheck[]=[],checks:unknown[]=[],movement:unknown[]=[],interactions:unknown[]=[];
 const result=():AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
 const local=options.seen===undefined?9:options.seen;
 const sight:TrainerSightPorts={check:(map,tiles)=>{checks.push({map,tiles});return Promise.resolve({available:true,map_id:[0,9],trainers:local===null?[]:[{local_id:local,graphics_id:0,sprite_kind:"PERSON",trainer_id:99,double:false,x:1,y:1,facing:"UP",sight:4,loaded:true}],sightings:local===null?[]:[{local_id:local,step:1,tile:[1,0],from:[1,1],facing:"UP"}]});},record:check=>{records.push(check);}};
 const v1=options.v1??true,v2=options.v2??true;
 const nav=navigationTool({floor:true,...(v1?{trainerSight:sight}:{}),read:()=>Promise.resolve(state),observe:()=>Promise.resolve(result()),press:(_id,args,_signal,check)=>{check?.(state);movement.push(args);state={...state,position:{x:(state.position?.x??0)+1,y:0}};return Promise.resolve(result());}});
 const press:CheckedPressTool={...pressTool("http://fixture",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},()=>Promise.reject(new Error("unexpected native request"))),execute:()=>{interactions.push("execute");return Promise.resolve(result());},executeChecked:()=>{interactions.push("checked");return Promise.resolve(result());}};
 const features={...featuresOf([]),"bounded-navigation-v1":true,"semantic-navigation-v1":true,"walkable-floor-v1":true,"trainer-sight-check-v1":v1,"trainer-sight-check-v2":v2,"static-npc-template-approach-v1":true,"npc-approach-feedback-v1":true};
 const tool=withSemanticNavigation([nav,press],features,{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 return {records,checks,movement,interactions,position:()=>state.position,call:(confirm?:boolean)=>tool.execute("template-sight",{map_id:[0,9],target:{kind,local_id:2},...(confirm===undefined?{}:{confirm_trainer_sight:confirm})})};
}
const text=(result:AgentToolResult<unknown>)=>result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
it.each(["object","static_object"] as const)("%s template refuses unrelated sight without movement",async kind=>{
 const r=rig(kind),out=await r.call();expect(r.checks).toHaveLength(1);expect(r.records).toMatchObject([{outcome:"refused",confirmed:false,sightings:[{local_id:9}]}]);expect(r.movement).toEqual([]);expect(r.interactions).toEqual([]);expect(r.position()).toEqual({x:0,y:0});expect(text(out)).toContain("call navigate_to_target again");expect(text(out)).toContain("not walked");
});
it.each(["object","static_object"] as const)("%s template explicit confirmation records and walks only the bounded approach",async kind=>{
 const r=rig(kind),out=await r.call(true);expect(r.checks).toHaveLength(1);expect(r.records).toMatchObject([{outcome:"confirmed",confirmed:true}]);expect(r.movement).toEqual([{buttons:["RIGHT"]},{buttons:["RIGHT"]}]);expect(r.position()).toEqual({x:2,y:0});expect(r.interactions).toEqual([]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});
it.each(["object","static_object"] as const)("%s clear template remains approach-only with no facing or A",async kind=>{
 const r=rig(kind,{seen:null}),out=await r.call();expect(r.records).toMatchObject([{outcome:"clear",confirmed:false,sightings:[]}]);expect(r.movement).toEqual([{buttons:["RIGHT"]},{buttons:["RIGHT"]}]);expect(r.interactions).toEqual([]);expect(text(out)).toContain("No interaction is attempted");
});
it.each(["object","static_object"] as const)("%s requested trainer is not exempt when only approaching its template",async kind=>{
 const r=rig(kind,{seen:2});await r.call();expect(r.records).toMatchObject([{outcome:"refused",sightings:[{local_id:2}]}]);expect(r.movement).toEqual([]);expect(r.interactions).toEqual([]);
});
it.each(["object","static_object"] as const)("%s retains legacy approach when either sight flag is OFF",async kind=>{
 for(const [v1,v2]of [[false,false],[false,true],[true,false]] as const){const r=rig(kind,{v1,v2});await r.call();expect(r.checks).toEqual([]);expect(r.records).toEqual([]);expect(r.movement).toEqual([{buttons:["RIGHT"]},{buttons:["RIGHT"]}]);expect(r.interactions).toEqual([]);}
});
