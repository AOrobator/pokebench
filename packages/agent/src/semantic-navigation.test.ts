import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {navigationTool,type CheckedNavigationTool} from "./navigation.js";
import {flagFeatures} from "./play-preset.js";
import {withSemanticNavigation} from "./semantic-navigation.js";

const tile=(x:number,y:number,collision=0,behavior=0)=>({x,y,collision,behavior,elevation:3});
const target=(local_id:number,x:number,y:number)=>({kind:"object",x,y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id,destination:null,name:`PERSON_${String(local_id)}`});
const baseFeatures=():FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true});
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
const field=(targets:NonNullable<GameStateSnapshot["interaction_targets"]>=[target(2,3,0)]):GameStateSnapshot=>({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,interaction_targets:targets,navigation_grid:{elevation:3,tiles:[0,1,2,3,4].flatMap(x=>[tile(x,0),tile(x,1)]),objects:targets.filter(t=>t.kind==="object").map(t=>({x:t.x,y:t.y})),warps:targets.filter(t=>t.kind==="warp").map(t=>({x:t.x,y:t.y}))}});

function fixture(afterNavigation?:(state:GameStateSnapshot,attempt:number)=>GameStateSnapshot,features:FeatureSet=baseFeatures(),beforeCheckedPress?:(state:GameStateSnapshot,button:string|undefined)=>GameStateSnapshot,initial:GameStateSnapshot=field()){
 let current=initial;const navigations:unknown[]=[],buttons:string[][]=[];
 const navigateExecute=(args:unknown,check?:(state:GameStateSnapshot)=>string|null)=>{const stopped=check?.(current)??null;if(stopped!==null)return Promise.resolve({...result(current),details:{state:current,navigation:{status:stopped}}});navigations.push(args);const goal=args as {x:number;y:number};current={...current,position:{x:goal.x,y:goal.y}};current=afterNavigation?.(current,navigations.length)??current;const afterStop=check?.(current)??null,arrived=current.position?.x===goal.x&&current.position.y===goal.y;return Promise.resolve({...result(current),details:{state:current,navigation:{status:afterStop??(arrived?"arrived at requested coordinate":"command limit")}}});};
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:(_id:string,args:unknown)=>navigateExecute(args),executeChecked:(_id:string,args:unknown,check:(state:GameStateSnapshot)=>string|null)=>navigateExecute(args,check)} as unknown as CheckedNavigationTool;
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

it("submits the game-owned direction when already standing on a directional warp",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Arrow warp"};
 const base=field([warp]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,position:{x:2,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x62}:t)}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(f.buttons).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
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

it.each([
 ["position",(state:GameStateSnapshot):GameStateSnapshot=>({...state,position:{x:1,y:0}}),"approach changed"],
 ["battle",(state:GameStateSnapshot):GameStateSnapshot=>({...state,in_battle:true,screen:"battle",field_controls_locked:true}),"battle began"],
 ["menu",(state:GameStateSnapshot):GameStateSnapshot=>({...state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A confirms",diagnostic:null}}),"interface field_yes_no opened"],
 ["dialogue",(state:GameStateSnapshot):GameStateSnapshot=>({...state,world_context:{objects:[],triggers:[],dialogue:"Wait!"}}),"dialogue or a field message opened"],
 ["script ownership",(state:GameStateSnapshot):GameStateSnapshot=>({...state,field_controls_locked:true}),"a script or forced field action took control"],
 ["missing target",(state:GameStateSnapshot):GameStateSnapshot=>({...state,interaction_targets:[]}),"semantic target disappeared"],
 ["moved target",(state:GameStateSnapshot):GameStateSnapshot=>({...state,interaction_targets:[target(2,4,0)]}),"semantic target moved"],
 ["facing",(state:GameStateSnapshot):GameStateSnapshot=>({...state,facing:"down"}),"player facing changed"],
] as const)("submits no activation when checked %s changes immediately before the press",async(_name,drift,expected)=>{
 const f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?drift(state):state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain(expected);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it.each([
 ["target disappears",(state:GameStateSnapshot):GameStateSnapshot=>({...state,interaction_targets:[]}),"target disappeared"],
 ["target moves",(state:GameStateSnapshot):GameStateSnapshot=>({...state,interaction_targets:[target(2,6,1)]}),"target moved"],
 ["menu opens",(state:GameStateSnapshot):GameStateSnapshot=>({...state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A confirms",diagnostic:null}}),"interface field_yes_no opened"],
] as const)("checks semantic %s against the navigator's fresh pre-press state",async(_name,drift,expected)=>{
 let current:GameStateSnapshot={...field([target(2,6,0)]),navigation_grid:{elevation:3,tiles:[0,1,2,3,4,5,6].flatMap(x=>[tile(x,0),tile(x,1)]),objects:[{x:6,y:0}],warps:[]}},posts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{current=drift(current);check?.(current);posts++;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{throw new Error("activation must not run");}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(posts).toBe(0);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain(expected);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("preserves a semantic travel stop when the final observation no longer shows the transient drift",async()=>{
 const original=field([target(2,2,0)]);let current=original,travelPosts=0,activationPosts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);travelPosts++;current={...current,position:{x:1,y:0},interaction_targets:[target(2,3,0)]};return Promise.resolve(result(current));},observe:()=>{current={...original,position:{x:1,y:0}};return Promise.resolve(result(current));}});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{activationPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(travelPosts).toBe(1);expect(activationPosts).toBe(0);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("target moved");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("does not repeat a directional warp activation already attempted by coordinate navigation",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Arrow warp"};
 const base=field([warp]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const current:GameStateSnapshot={...base,position:{x:2,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x62}:t)}};let travelPosts=0,semanticPosts=0;
 const travel=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);travelPosts++;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{semanticPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const features={...baseFeatures(),"deterministic-warp-navigation-v1":true};
 const tool=withSemanticNavigation([travel,activation],features,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(travelPosts).toBe(1);expect(semanticPosts).toBe(0);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it.each([
 ["disappears",(state:GameStateSnapshot):GameStateSnapshot=>({...state,interaction_targets:[]}),"target disappeared"],
 ["moves",(state:GameStateSnapshot):GameStateSnapshot=>({...state,interaction_targets:[target(2,6,1)]}),"target moved"],
 ["a menu opens",(state:GameStateSnapshot):GameStateSnapshot=>({...state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A confirms",diagnostic:null}}),"interface field_yes_no opened"],
] as const)("interrupts production navigation after one press when %s during travel",async(_name,drift,expected)=>{
 let current:GameStateSnapshot={...field([target(2,6,0)]),navigation_grid:{elevation:3,tiles:[0,1,2,3,4,5,6].flatMap(x=>[tile(x,0),tile(x,1)]),objects:[{x:6,y:0}],warps:[]}},presses=0;
 const travel= navigationTool({read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{check?.(current);presses++;const button=params.buttons[0];if(button!=="RIGHT")throw new Error("unexpected direction");current={...current,position:{x:(current.position?.x??0)+1,y:0}};if(presses===1)current=drift(current);return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,_args:unknown,check:(state:GameStateSnapshot)=>void)=>{check(current);throw new Error("activation must not run");}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(presses).toBe(1);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain(expected);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
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
