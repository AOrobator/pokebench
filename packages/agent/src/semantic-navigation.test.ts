import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures} from "./play-preset.js";
import {withSemanticNavigation} from "./semantic-navigation.js";

const tile=(x:number,y:number,collision=0)=>({x,y,collision,behavior:0,elevation:3});
const target=(local_id:number,x:number,y:number)=>({kind:"object",x,y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id,destination:null,name:`PERSON_${String(local_id)}`});
const baseFeatures=():FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true});
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
const field=(targets:NonNullable<GameStateSnapshot["interaction_targets"]>=[target(2,3,0)]):GameStateSnapshot=>({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,interaction_targets:targets,navigation_grid:{elevation:3,tiles:[0,1,2,3,4].flatMap(x=>[tile(x,0),tile(x,1)]),objects:targets.filter(t=>t.kind==="object").map(t=>({x:t.x,y:t.y})),warps:targets.filter(t=>t.kind==="warp").map(t=>({x:t.x,y:t.y}))}});

function fixture(afterNavigation?:(state:GameStateSnapshot,attempt:number)=>GameStateSnapshot,features:FeatureSet=baseFeatures(),beforeCheckedPress?:(state:GameStateSnapshot,button:string|undefined)=>GameStateSnapshot,initial:GameStateSnapshot=field()){
 let current=initial;const navigations:unknown[]=[],buttons:string[][]=[];
 const navigate:AgentTool={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:(_id,args)=>{navigations.push(args);const goal=args as {x:number;y:number};current={...current,position:{x:goal.x,y:goal.y}};current=afterNavigation?.(current,navigations.length)??current;const arrived=current.position?.x===goal.x&&current.position.y===goal.y;return Promise.resolve({...result(current),details:{state:current,navigation:{status:arrived?"arrived at requested coordinate":"command limit"}}});}};
 const rawPress={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id: string,args:{buttons:("A"|"B"|"START"|"SELECT"|"UP"|"DOWN"|"LEFT"|"RIGHT")[]},signal?:AbortSignal)=>press.executeChecked(id,args,()=>undefined,signal),executeChecked:(_id:string,args:{buttons:("A"|"B"|"START"|"SELECT"|"UP"|"DOWN"|"LEFT"|"RIGHT")[]},check:(state:GameStateSnapshot)=>void)=>{current=beforeCheckedPress?.(current,args.buttons[0])??current;check(current);buttons.push([...args.buttons]);const button=args.buttons[0];if(button!==undefined&&button!=="A")current={...current,facing:button.toLowerCase()};if(button==="A")current={...current,in_battle:true,screen:"battle",field_controls_locked:true};return Promise.resolve(result(current));}};
 const press=rawPress as unknown as CheckedPressTool;
 const tools=withSemanticNavigation([navigate,press],features,{read:()=>Promise.resolve(current)});
 return {tools,state:()=>current,navigations,buttons};
}

it("resolves a native object id, chooses its approach and returns immediately when activation starts battle",async()=>{
 const f=fixture(),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]}]);
 expect(f.buttons).toEqual([["A"]]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("activation handed control back: battle began");
 expect(out.details).toMatchObject({state:{in_battle:true},semantic_navigation:{activation_attempted:true}});
});

it("resolves fixed interactions by native kind and coordinates",async()=>{
 const sign:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"background",x:3,y:0,elevation:3,activation:"A",availability:"always",facing:null,local_id:null,destination:null,name:"Town sign"};
 const f=fixture(undefined,baseFeatures(),undefined,field([sign])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"background",x:3,y:0}});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([["A"]]);
});

it("walks directly onto a movement-activated warp without an extra press",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 const f=fixture(undefined,baseFeatures(),undefined,field([warp])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([]);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("chooses a reachable native connection edge and submits one outward step",async()=>{
 const initial={...field([]),topology:{width:5,height:2,connections:[{direction:"EAST" as const,offset:0,destination:[0,10] as [number,number],destination_name:"ROUTE",edges:[{x:4,y:0}]}]}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"connection",direction:"EAST"}});
 expect(f.navigations).toEqual([{x:4,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([["RIGHT"]]);
});

it("continues capped navigation segments until the semantic approach is reached",async()=>{
 const f=fixture((state,attempt)=>attempt===1?{...state,position:{x:1,y:0}}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]},{x:2,y:0,map_id:[0,9]}]);
 expect(f.buttons).toEqual([["A"]]);
});

it("submits no activation when the checked state changes immediately before the press",async()=>{
 const f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?{...state,position:{x:1,y:0}}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("semantic target changed before activation");
 expect(out.details).toMatchObject({state:{position:{x:1,y:0}},semantic_navigation:{activation_attempted:false}});
});

it.each([
 ["wild battle",(state:GameStateSnapshot):GameStateSnapshot=>({...state,in_battle:true,screen:"battle",field_controls_locked:true}),"battle began"],
 ["dialogue",(state:GameStateSnapshot):GameStateSnapshot=>({...state,field_controls_locked:true,world_context:{objects:[],triggers:[],dialogue:"Stop right there!"}}),"dialogue or a field message opened"],
 ["menu",(state:GameStateSnapshot):GameStateSnapshot=>({...state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A confirms",diagnostic:null}}),"interface field_yes_no opened"],
 ["script lock",(state:GameStateSnapshot):GameStateSnapshot=>({...state,field_controls_locked:true}),"a script or forced field action took control"],
 ["unavailable ownership",(state:GameStateSnapshot):GameStateSnapshot=>({...state,field_controls_locked:null}),"field-control ownership became unavailable"],
 ["map transition",(state:GameStateSnapshot):GameStateSnapshot=>({...state,map_id:[0,10]}),"interrupted by a map transition"],
] as const)("does not face or activate after navigation is interrupted by %s",async(_name,interrupt,expected)=>{
 const f=fixture(interrupt),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain(expected);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("keeps both switches absent with OFF and makes exploration choose only one target per call",async()=>{
 const off=fixture(undefined,{...baseFeatures(),"semantic-navigation-v1":false,"deterministic-exploration-v1":false});
 expect(off.tools.map(t=>t.name)).toEqual(["navigate_to","press"]);
 const on=fixture(undefined,{...baseFeatures(),"deterministic-exploration-v1":true});
 const explore=on.tools.find(t=>t.name==="explore_map");if(explore===undefined)throw new Error("missing explorer");
 await explore.execute("e",{});
 expect(on.navigations).toHaveLength(1);expect(on.buttons).toEqual([["A"]]);
});
