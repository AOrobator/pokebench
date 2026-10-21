import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {Value} from "typebox/value";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {navigationTool,type CheckedNavigationTool} from "./navigation.js";
import {flagFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {withSemanticNavigation} from "./semantic-navigation.js";

const tile=(x:number,y:number,collision=0,behavior=0)=>({x,y,collision,behavior,elevation:3});
const target=(local_id:number,x:number,y:number)=>({kind:"object",x,y,elevation:3,activation:"A",availability:"conditional",facing:null,local_id,native_slot:local_id,destination:null,name:`PERSON_${String(local_id)}`});
const uncontrollable={permitted:false,controllable:false,reason:"forced_or_transitioning",shoes:true,allow_running:true,avatar_flags:0x41,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
const baseFeatures=():FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true});
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
const field=(targets:NonNullable<GameStateSnapshot["interaction_targets"]>=[target(2,3,0)]):GameStateSnapshot=>({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,interaction_targets:targets,interaction_object_slots:targets.filter(t=>t.kind==="object"&&t.local_id!==null&&t.native_slot!==undefined).map(t=>({slot:t.native_slot??0,x:t.x,y:t.y,elevation:t.elevation,local_id:t.local_id??0,map_id:[0,9] as [number,number],is_player:false})).sort((a,b)=>a.slot-b.slot),navigation_grid:{elevation:3,tiles:[0,1,2,3,4].flatMap(x=>[tile(x,0),tile(x,1)]),objects:targets.filter(t=>t.kind==="object").map(t=>({x:t.x,y:t.y})),warps:targets.filter(t=>t.kind==="warp").map(t=>({x:t.x,y:t.y}))}});

function fixture(afterNavigation?:(state:GameStateSnapshot,attempt:number)=>GameStateSnapshot,features:FeatureSet=baseFeatures(),beforeCheckedPress?:(state:GameStateSnapshot,button:string|undefined)=>GameStateSnapshot,initial:GameStateSnapshot=field(),activationStartsBattle=true){
 let current=initial;const navigations:unknown[]=[],buttons:string[][]=[];
 const navigateExecute=(args:unknown,check?:(state:GameStateSnapshot)=>string|null)=>{const stopped=check?.(current)??null;if(stopped!==null)return Promise.resolve({...result(current),details:{state:current,navigation:{status:stopped,commands:0,stop_requested:true,goal_entry_attempted:false}}});navigations.push(args);const goal=args as {x:number;y:number},start=current.position,commands=start?.x===goal.x&&start.y===goal.y?0:1;current={...current,position:{x:goal.x,y:goal.y}};current=afterNavigation?.(current,navigations.length)??current;const afterStop=check?.(current)??null,arrived=current.position?.x===goal.x&&current.position.y===goal.y;return Promise.resolve({...result(current),details:{state:current,navigation:{status:afterStop??(arrived?"arrived at requested coordinate":"command limit"),commands,stop_requested:afterStop!==null,goal_entry_attempted:commands>0}}});};
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:(_id:string,args:unknown)=>navigateExecute(args),executeChecked:(_id:string,args:unknown,check:(state:GameStateSnapshot)=>string|null)=>navigateExecute(args,check)} as unknown as CheckedNavigationTool;
 const rawPress={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id: string,args:{buttons:("A"|"B"|"START"|"SELECT"|"UP"|"DOWN"|"LEFT"|"RIGHT")[]},signal?:AbortSignal)=>press.executeChecked(id,args,()=>undefined,signal),executeChecked:(_id:string,args:{buttons:("A"|"B"|"START"|"SELECT"|"UP"|"DOWN"|"LEFT"|"RIGHT")[]},check:(state:GameStateSnapshot)=>void)=>{current=beforeCheckedPress?.(current,args.buttons[0])??current;check(current);buttons.push([...args.buttons]);const button=args.buttons[0];if(button!==undefined&&button!=="A")current={...current,facing:button.toLowerCase()};if(button==="A"&&activationStartsBattle)current={...current,in_battle:true,screen:"battle",field_controls_locked:true};return Promise.resolve(result(current));}};
 const press=rawPress as unknown as CheckedPressTool;
 const tools=withSemanticNavigation([navigate,press],features,{read:()=>Promise.resolve(current)});
 return {tools,state:()=>current,setState:(state:GameStateSnapshot)=>{current=state;},navigations,buttons};
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

it("does not claim or consume a movement warp when already standing on it",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"},initial={...field([warp]),position:{x:2,y:0}};
 const f=fixture(undefined,{...baseFeatures(),"deterministic-exploration-v1":true},undefined,initial),explore=f.tools.find(t=>t.name==="explore_map");if(explore===undefined)throw new Error("missing explorer");
 const first=await explore.execute("e1",{}),second=await explore.execute("e2",{});
 expect(first.details).toMatchObject({semantic_navigation:{activation_attempted:false}});expect(second.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
 expect(f.navigations).toHaveLength(2);expect(f.buttons).toEqual([]);
});

it("records a selected movement warp when travel transitions to its declared map",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 const f=fixture(state=>({...state,map_id:[1,2]}),baseFeatures(),undefined,field([warp])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("records selected warp entry before destination-side field control takes over",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 const f=fixture(state=>({...state,map_id:[1,2],field_controls_locked:true}),baseFeatures(),undefined,field([warp])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(out.details).toMatchObject({state:{field_controls_locked:true},semantic_navigation:{activation_attempted:true}});
});

it("records a selected same-map movement warp from the submitted final entry step",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[0,9,1],name:"Same-map warp"};
 let current:GameStateSnapshot=field([warp]),posts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);posts++;current=posts===1?{...current,position:{x:1,y:0}}:{...current,position:{x:4,y:0}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>Promise.resolve(result(current))} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(posts).toBe(2);expect(current.position).toEqual({x:4,y:0});expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("records a selected step trigger before its script takes field control",async()=>{
 const trigger:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"coordinate_trigger",x:2,y:0,elevation:3,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null};
 let current:GameStateSnapshot=field([trigger]),posts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);posts++;current=posts===1?{...current,position:{x:1,y:0}}:{...current,position:{x:2,y:0},field_controls_locked:true};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>Promise.resolve(result(current))} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"coordinate_trigger",x:2,y:0}});
 expect(posts).toBe(2);expect(out.details).toMatchObject({state:{field_controls_locked:true},semantic_navigation:{activation_attempted:true}});
});

it("submits the game-owned direction when already standing on a directional warp",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Arrow warp"};
 const base=field([warp]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,position:{x:2,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x62}:t)}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(f.buttons).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it.each([
 [0x62,1,true],
 [0x67,0,false],
] as const)("classifies a distant initially unseen warp from its final-entry snapshot (behavior %#x)",async(behavior,expectedSemanticPresses,staysOnSource)=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:20,y:0,elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Distant warp"};
 const grid=(x:number)=>({elevation:3,tiles:Array.from({length:Math.min(29,x+7)-Math.max(0,x-7)+1},(_,i)=>{const at=Math.max(0,x-7)+i;return tile(at,0,0,at===20?behavior:0);}),objects:[],warps:[{x:20,y:0}]});
 let current:GameStateSnapshot={...field([warp]),topology:{width:30,height:1,connections:[]},navigation_grid:grid(0)},travelPosts=0,semanticPosts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{check?.(current);expect(params.buttons).toEqual(["RIGHT"]);travelPosts++;const x=(current.position?.x??0)+1;current={...current,position:{x,y:0},navigation_grid:grid(x)};if(x===20&&!staysOnSource)current={...current,map_id:[1,2]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,args:{buttons:string[]},check:(state:GameStateSnapshot)=>void)=>{check(current);expect(args.buttons).toEqual(["RIGHT"]);semanticPosts++;current={...current,map_id:[1,2]};return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:20,y:0}});
 expect(travelPosts).toBe(20);expect(semanticPosts).toBe(expectedSemanticPresses);expect(current.map_id).toEqual([1,2]);
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("submits no entry step when a distant warp changes from step-on to directional in the checked state",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:20,y:0,elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Distant warp"};
 const grid=(x:number,behavior=0x67)=>({elevation:3,tiles:Array.from({length:Math.min(29,x+7)-Math.max(0,x-7)+1},(_,i)=>{const at=Math.max(0,x-7)+i;return tile(at,0,0,at===20?behavior:0);}),objects:[],warps:[{x:20,y:0}]});
 let current:GameStateSnapshot={...field([warp]),topology:{width:30,height:1,connections:[]},navigation_grid:grid(0)},travelPosts=0,semanticPosts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{if(current.position?.x===19)current={...current,navigation_grid:grid(19,0x62)};check?.(current);expect(params.buttons).toEqual(["RIGHT"]);travelPosts++;const x=(current.position?.x??0)+1;current={...current,position:{x,y:0},navigation_grid:grid(x)};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{semanticPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:20,y:0}});
 expect(travelPosts).toBe(19);expect(semanticPosts).toBe(0);expect(current.position).toEqual({x:19,y:0});
 expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("route ended before the selected approach");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("does not consume a distant movement target after only reaching a blocked local frontier",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:20,y:0,elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Unreached warp"};
 let current:GameStateSnapshot={...field([warp]),topology:{width:30,height:1,connections:[]},navigation_grid:{elevation:3,tiles:Array.from({length:8},(_,x)=>tile(x,0,x>=2?1:0,x===1?2:0)),objects:[],warps:[]}},travelPosts=0,semanticPosts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{check?.(current);expect(params.buttons).toEqual(["RIGHT"]);travelPosts++;current={...current,position:{x:1,y:0}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{semanticPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:20,y:0}});
 expect(travelPosts).toBe(1);expect(semanticPosts).toBe(0);expect(current.position).toEqual({x:1,y:0});
 expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("route ended before the selected approach");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("chooses a reachable native connection edge and submits one outward step",async()=>{
 const initial={...field([]),topology:{width:5,height:2,connections:[{direction:"EAST" as const,offset:0,destination:[0,10] as [number,number],destination_name:"ROUTE",edges:[{x:4,y:0}]}]}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"connection",direction:"EAST"}});
 expect(f.navigations).toEqual([{x:4,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([["RIGHT"]]);
});

it("records a connection crossed by the outward facing press",async()=>{
 let current:GameStateSnapshot={...field([]),position:{x:4,y:0},facing:"left",topology:{width:5,height:2,connections:[{direction:"EAST" as const,offset:0,destination:[0,10] as [number,number],destination_name:"ROUTE",edges:[{x:4,y:0}]}]}};const buttons:string[][]=[];
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>Promise.resolve({...result(current),details:{state:current,navigation:{status:"arrived at requested coordinate",commands:0}}})} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,args:{buttons:string[]},check:(state:GameStateSnapshot)=>void)=>{check(current);buttons.push([...args.buttons]);current={...current,map_id:[0,10],field_controls_locked:true};return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([navigate,press],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"connection",direction:"EAST"}});
 expect(buttons).toEqual([["RIGHT"]]);expect(out.details).toMatchObject({state:{field_controls_locked:true},semantic_navigation:{activation_attempted:true}});
});

it("continues capped navigation segments until the semantic approach is reached",async()=>{
 const f=fixture((state,attempt)=>attempt===1?{...state,position:{x:1,y:0}}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]},{x:2,y:0,map_id:[0,9]}]);
 expect(f.buttons).toEqual([["A"]]);
});

it("composes semantic travel with native-validated safe strides",async()=>{
 const initial=field([target(2,12,0)]),navigationGrid=initial.navigation_grid;if(navigationGrid===null||navigationGrid===undefined)throw new Error("missing grid");
 let current:GameStateSnapshot={...initial,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:0x41,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null},navigation_grid:{...navigationGrid,tiles:Array.from({length:13},(_,x)=>tile(x,0))}},activationPosts=0;const strides:unknown[]=[];
 const travel=navigationTool({safeStrides:true,automaticRunning:true,read:()=>Promise.resolve(current),press:(id,_params,_signal,check,options)=>{check?.(current);const stride=options?.stride;if(stride===undefined)throw new Error("expected stride");strides.push(stride);const end=stride.path.at(-1);if(end===undefined)throw new Error("empty stride");current={...current,position:{x:end.x,y:end.y}};return Promise.resolve({content:[{type:"text",text:"Navigation stride receipt: completed"}],details:{state:current,stride:{id,...stride,automatic_running:true,completed:stride.path.length,frames:12,reason:"completed",stopped:false}}});},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,_args:unknown,check:(state:GameStateSnapshot)=>void)=>{check(current);activationPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],{...baseFeatures(),"safe-navigation-strides-v1":true},{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(strides).toMatchObject([{origin:{x:0,y:0},path:Array.from({length:8},(_,i)=>({x:i+1,y:0}))},{origin:{x:8,y:0},path:[{x:9,y:0},{x:10,y:0},{x:11,y:0}]}]);expect(activationPosts).toBe(1);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("rejects movement beyond the exact native-validated stride corridor",async()=>{
 const initial=field([target(2,4,0)]),navigationGrid=initial.navigation_grid;if(navigationGrid===null||navigationGrid===undefined)throw new Error("missing grid");
 let current:GameStateSnapshot={...initial,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:0x41,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null},navigation_grid:{...navigationGrid,tiles:[0,1,2,3,4].map(x=>tile(x,0,x===2?0:0,x===2?2:0))}},activationPosts=0;
 const travel=navigationTool({safeStrides:true,automaticRunning:true,read:()=>Promise.resolve(current),press:(id,_params,_signal,check,options)=>{check?.(current);const stride=options?.stride;if(stride===undefined)throw new Error("expected stride");current={...current,position:{x:2,y:0}};return Promise.resolve({content:[{type:"text",text:"Navigation stride receipt: completed"}],details:{state:current,stride:{id,...stride,automatic_running:true,completed:stride.path.length,frames:12,reason:"completed",stopped:false}}});},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{activationPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],{...baseFeatures(),"safe-navigation-strides-v1":true},{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(activationPosts).toBe(0);expect(out.details).toMatchObject({navigation:{status:"planned stride interrupted; inspect new state"},semantic_navigation:{activation_attempted:false}});
});

it("walks the final semantic entry when automatic running could cross two tiles",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 let current:GameStateSnapshot={...field([warp]),running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:0x41,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null}},posts=0;const modifiers:(boolean|undefined)[]=[];
 const travel=navigationTool({automaticRunning:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check,options)=>{check?.(current);posts++;modifiers.push(options?.automaticRunning);current=posts===1?{...current,position:{x:1,y:0}}:{...current,map_id:[1,2]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>Promise.resolve(result(current))} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(posts).toBe(2);expect(modifiers).toEqual([false,false]);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("does not activate when unexpected movement happens to land on the selected approach",async()=>{
 let current:GameStateSnapshot={...field([target(2,6,0)]),navigation_grid:{elevation:3,tiles:[0,1,2,3,4,5,6].flatMap(x=>[tile(x,0),tile(x,1)]),objects:[{x:6,y:0}],warps:[]}},travelPosts=0,activationPosts=0;
 const travel=navigationTool({read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);travelPosts++;current={...current,position:{x:5,y:0}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{activationPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(travelPosts).toBe(1);expect(activationPosts).toBe(0);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("unexpected movement");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("does not let a transient checked-input lock recover into directional warp activation",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Arrow warp"};
 const base=field([warp]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 let current:GameStateSnapshot={...base,position:{x:2,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x62}:t)}},travelPosts=0,semanticPosts=0;
 const travel=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);travelPosts++;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,_args:unknown,check:(state:GameStateSnapshot)=>void)=>{current={...current,field_controls_locked:true};check(current);semanticPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([travel,activation],{...baseFeatures(),"deterministic-warp-navigation-v1":true},{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(travelPosts).toBe(0);expect(semanticPosts).toBe(0);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("script or forced field action took control");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("rejects object identity through the fixed-interaction alias",async()=>{
 const f=fixture(),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 expect(Value.Check(tool.parameters,{map_id:[0,9],target:{kind:"interaction",interaction_kind:"background",x:3,y:0}})).toBe(true);
 expect(Value.Check(tool.parameters,{map_id:[0,9],target:{kind:"interaction",interaction_kind:"object",x:3,y:0}})).toBe(false);
 expect(Value.Check(tool.parameters,{map_id:[0,9],target:{kind:"interaction",interaction_kind:"warp",x:3,y:0}})).toBe(false);
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"object",x:3,y:0}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("not listed");
});

it("stops when a warp's native destination identity changes during travel",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 const f=fixture(state=>({...state,interaction_targets:[{...warp,destination:[1,3,0]}]}),baseFeatures(),undefined,field([warp])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(f.buttons).toEqual([]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("target changed");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
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

it("does not erase target drift returned by the facing input before activation",async()=>{
 const original={...field(),facing:"left"};let current:GameStateSnapshot=original,activationPosts=0;
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,args:{x:number;y:number},check:(state:GameStateSnapshot)=>string|null)=>{expect(check(current)).toBeNull();current={...current,position:{x:args.x,y:args.y}};return Promise.resolve({...result(current),details:{state:current,navigation:{status:"arrived at requested coordinate"}}});}} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,args:{buttons:string[]},check:(state:GameStateSnapshot)=>void)=>{check(current);if(args.buttons[0]==="A")activationPosts++;const returned={...current,facing:"right",interaction_targets:[target(2,4,0)]};return Promise.resolve(result(returned));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([navigate,press],baseFeatures(),{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(activationPosts).toBe(0);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("target moved during facing input");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("allows visited-map travel while the raw checked state cannot yet see the distant approach",async()=>{
 const far=target(2,20,0),stitched:GameStateSnapshot={...field([far]),navigation_grid:{elevation:3,tiles:Array.from({length:22},(_,x)=>tile(x,0)),objects:[{x:20,y:0}],warps:[]}},raw:GameStateSnapshot={...stitched,navigation_grid:{elevation:3,tiles:Array.from({length:8},(_,x)=>tile(x,0)),objects:[],warps:[]}};let current=stitched,navigations=0,activations=0;
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,args:{x:number;y:number},check:(state:GameStateSnapshot)=>string|null)=>{expect(check(raw)).toBeNull();navigations++;current={...stitched,position:{x:args.x,y:args.y}};return Promise.resolve({...result(current),details:{state:current,navigation:{status:"arrived at requested coordinate"}}});}} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,_args:unknown,check:(state:GameStateSnapshot)=>void)=>{check(current);activations++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([navigate,press],{...baseFeatures(),"visited-terrain-navigation-v1":true},{read:()=>Promise.resolve(stitched)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(navigations).toBe(1);expect(activations).toBe(1);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("activates an exact directional warp once through the semantic checked input",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Arrow warp"};
 const base=field([warp]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const current:GameStateSnapshot={...base,position:{x:2,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x62}:t)}};let travelPosts=0,semanticPosts=0;
 const travel=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(current);travelPosts++;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,_args:unknown,check:(state:GameStateSnapshot)=>void)=>{check(current);semanticPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const features={...baseFeatures(),"deterministic-warp-navigation-v1":true};
 const tool=withSemanticNavigation([travel,activation],features,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(travelPosts).toBe(0);expect(semanticPosts).toBe(1);expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
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

it("keeps an explicitly requested semantic warp exact when deterministic warp selection is also on",async()=>{
 const near:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:1,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Near equivalent"};
 const requested:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={...near,x:4,name:"Requested warp"};
 const raw=field([near,requested]),grid=raw.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const base={...raw,navigation_grid:{...grid,tiles:grid.tiles.map(t=>(t.x===1||t.x===4)&&t.y===0?{...t,behavior:0x62}:t)}};let current:GameStateSnapshot={...base,position:{x:0,y:0}},activationPosts=0;
 const visited:{x:number;y:number}[]=[];
 const travel=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{check?.(current);const direction=params.buttons[0];if(direction===undefined)throw new Error("missing direction");const facing=direction.toLowerCase();if(current.facing!==facing)current={...current,facing};else {const delta:readonly [number,number]=direction==="UP"?[0,-1]:direction==="DOWN"?[0,1]:direction==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:(current.position?.x??0)+delta[0],y:(current.position?.y??0)+delta[1]}};visited.push(current.position as {x:number;y:number});}return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
 const activation={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(current)),executeChecked:(_id:string,_args:unknown,check:(state:GameStateSnapshot)=>void)=>{check(current);activationPosts++;return Promise.resolve(result(current));}} as unknown as CheckedPressTool;
 const features={...baseFeatures(),"deterministic-warp-navigation-v1":true};
 const tool=withSemanticNavigation([travel,activation],features,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:4,y:0}});
 expect(visited).not.toContainEqual({x:1,y:0});expect(current.position).toEqual({x:4,y:0});expect(activationPosts).toBe(1);
 expect(out.details).toMatchObject({semantic_navigation:{selected:"warp at (4,0)",activation_attempted:true}});
});

it("refuses an object whose reachable approach is on a different elevation",async()=>{
 const high={...target(2,3,0),elevation:4};
 const f=fixture(undefined,baseFeatures(),undefined,field([high])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);
 expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route to a valid approach");
});

it("does not activate a stacked object when the selected object's elevation changes before input",async()=>{
 const f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?{...state,interaction_targets:[{...target(2,3,0),elevation:4},target(3,3,0)]}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("target changed");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("refuses a selected object when an earlier wildcard-elevation object is the native recipient",async()=>{
 const selected=target(2,3,0),earlier={...target(1,3,0),elevation:0};
 const f=fixture(undefined,baseFeatures(),undefined,field([earlier,selected])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("refuses an object when native slot evidence is unavailable",async()=>{
 const initial={...field()};Reflect.deleteProperty(initial,"interaction_object_slots");
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("refuses a visible object intercepted by an earlier invisible native slot",async()=>{
 const initial={...field(),interaction_object_slots:[{slot:1,x:3,y:0,elevation:3,local_id:7,map_id:[0,9] as [number,number],is_player:false},{slot:2,x:3,y:0,elevation:3,local_id:2,map_id:[0,9] as [number,number],is_player:false}]};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("enters the first elevation-compatible warp when an earlier event is on another elevation",async()=>{
 const first:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:4,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"High"};
 const eligible={...first,elevation:3,destination:[1,3,0] as [number,number,number],name:"Low"};
 const initial=field([first,eligible]);
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([]);
 expect(out.details).toMatchObject({semantic_navigation:{selected:"warp at (2,0)",activation_attempted:true}});
 const explore=fixture(undefined,{...baseFeatures(),"deterministic-exploration-v1":true},undefined,initial).tools.find(t=>t.name==="explore_map");if(explore===undefined)throw new Error("missing explorer");
 const explored=await explore.execute("e",{});
 expect(explored.details).toMatchObject({semantic_navigation:{activation_attempted:true}});
});

it("refuses a background when a scripted object would receive A first",async()=>{
 const object=target(1,3,0),background:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"background",x:3,y:0,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:null,destination:null,name:"Sign"};
 const f=fixture(undefined,baseFeatures(),undefined,field([object,background])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"background",x:3,y:0}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("refuses a counter background when a native object behind it would receive A",async()=>{
 const background:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"background",x:2,y:0,elevation:3,activation:"A",availability:"conditional",facing:"right",local_id:null,destination:null,name:"Counter"};
 const base=field([background]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,interaction_object_slots:[{slot:3,x:3,y:0,elevation:3,local_id:3,map_id:[0,9] as [number,number],is_player:false}],navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,collision:1,behavior:0x80}:t)}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"background",x:2,y:0}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("approaches an object through a counter using the native two-tile interaction rule",async()=>{
 const selected=target(3,3,0),base=field([selected]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,collision:1,behavior:0x80}:t.x===4&&t.y===0||t.x===3&&t.y===1?{...t,collision:1}:t)}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:3}});
 expect(f.navigations).toEqual([{x:1,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([["A"]]);
});

it("uses the whole-map counter receipt when selecting a two-tile object approach",async()=>{
 const selected=target(3,3,0),base=field([selected]);
 const initial={...base,navigation_grid:null,map_grid:{width:5,height:2,elevation:3,rows:["03000300138003001300","03000300030013000300"],objects:[{x:3,y:0}],warps:[]}};
 const f=fixture(undefined,{...baseFeatures(),"full-map-navigation-v1":true},undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:3}});
 expect(f.navigations).toEqual([{x:1,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([["A"]]);
});

it("does not skip a first player-sentinel slot behind a counter to select a later object",async()=>{
 const selected=target(3,3,0),base=field([selected]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,interaction_object_slots:[{slot:1,x:3,y:0,elevation:3,local_id:0xff,map_id:[0,9] as [number,number],is_player:true},{slot:3,x:3,y:0,elevation:3,local_id:3,map_id:[0,9] as [number,number],is_player:false}],navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,collision:1,behavior:0x80}:t.x===4&&t.y===0||t.x===3&&t.y===1?{...t,collision:1}:t)}};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:3}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("submits no A when a counter recipient appears in the fresh checked state",async()=>{
 const background:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"background",x:2,y:0,elevation:3,activation:"A",availability:"conditional",facing:"right",local_id:null,destination:null,name:"Counter"};
 const base=field([background]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,collision:1,behavior:0x80}:t)}};
 const f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?{...state,interaction_object_slots:[{slot:3,x:3,y:0,elevation:3,local_id:3,map_id:[0,9],is_player:false}]}:state,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"background",x:2,y:0}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("interaction recipient changed");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("refuses an ambiguous fixed interaction instead of skipping an earlier wrong-facing background",async()=>{
 const background:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"background",x:3,y:0,elevation:3,activation:"A",availability:"conditional",facing:"up",local_id:null,destination:null,name:"North sign"};
 const television:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={...background,kind:"metatile_television",facing:null,name:"television"};
 const f=fixture(undefined,baseFeatures(),undefined,field([background,television])),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"interaction",interaction_kind:"metatile_television",x:3,y:0}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("no supported route");
});

it("submits no A when a different native recipient appears in the fresh checked state",async()=>{
 const selected=target(2,3,0),f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?{...state,interaction_targets:[{...target(1,3,0),elevation:0},selected],interaction_object_slots:[{slot:1,x:3,y:0,elevation:0,local_id:1,map_id:[0,9],is_player:false},{slot:2,x:3,y:0,elevation:3,local_id:2,map_id:[0,9],is_player:false}]}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("interaction recipient changed");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("submits no activation when native avatar control becomes forced before input",async()=>{
 const f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?{...state,running:uncontrollable}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("native field input is not controllable");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("submits no activation when native avatar control ownership is unavailable",async()=>{
 const unavailable={...uncontrollable,permitted:null,controllable:null,reason:"unavailable"};
 const f=fixture(undefined,baseFeatures(),(state,button)=>button==="A"?{...state,running:unavailable}:state),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("native field input ownership is unavailable");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("starts no travel when native avatar control ownership is unavailable",async()=>{
 const unavailable={...uncontrollable,permitted:null,controllable:null,reason:"unavailable"},initial={...field(),running:unavailable};
 const f=fixture(undefined,baseFeatures(),undefined,initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("native field input ownership is unavailable");expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});

it("does not submit a stale directional-warp input when its live behavior changes",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Arrow warp"};
 const base=field([warp]),grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing grid");
 const initial={...base,position:{x:2,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x62}:t)}};
 const f=fixture(undefined,baseFeatures(),(state,button)=>{if(button!=="RIGHT")return state;const live=state.navigation_grid;if(live===null||live===undefined)throw new Error("missing live grid");return {...state,navigation_grid:{...live,tiles:live.tiles.map(t=>t.x===2&&t.y===0?{...t,behavior:0x63}:t)}};},initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"warp",x:2,y:0}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("directional warp activation changed");
});

it("does not submit an outward connection input after its destination changes",async()=>{
 const initial={...field([]),topology:{width:5,height:2,connections:[{direction:"EAST" as const,offset:0,destination:[0,10] as [number,number],destination_name:"ROUTE",edges:[{x:4,y:0}]}]}};
 const f=fixture(undefined,baseFeatures(),(state,button)=>{if(button!=="RIGHT")return state;const topology=state.topology,connection=topology?.connections[0];if(topology===null||topology===undefined||connection===undefined)throw new Error("missing live connection");return {...state,topology:{...topology,connections:[{...connection,destination:[0,11]}]}};},initial),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"connection",direction:"EAST"}});
 expect(f.buttons).toEqual([]);expect(out.content[0]?.type==="text"?out.content[0].text:"").toContain("connection changed");
});

it("production play wiring exposes and executes semantic navigation only when the switch is on",async()=>{
 let current=field(),presses=0;
 const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current))};
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(id:string,args:{buttons:("A"|"B"|"START"|"SELECT"|"UP"|"DOWN"|"LEFT"|"RIGHT")[]},signal?:AbortSignal)=>checked.executeChecked(id,args,()=>undefined,signal),executeChecked:(_id:string,args:{buttons:("A"|"B"|"START"|"SELECT"|"UP"|"DOWN"|"LEFT"|"RIGHT")[]},check:(state:GameStateSnapshot)=>void)=>{check(current);presses++;const button=args.buttons[0];if(button==="A")current={...current,in_battle:true,screen:"battle",field_controls_locked:true};else if(button!==undefined){const facing=button.toLowerCase();if(current.facing!==facing)current={...current,facing};else {const delta:readonly [number,number]=button==="UP"?[0,-1]:button==="DOWN"?[0,1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:(current.position?.x??0)+delta[0],y:(current.position?.y??0)+delta[1]}};}}return Promise.resolve(result(current));}};
 const checked=press as unknown as CheckedPressTool;
 const recorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
 const reader={read:()=>Promise.resolve(current)};
 const off=playGameTools([observe,checked],{...baseFeatures(),"semantic-navigation-v1":false},reader,recorder);
 expect(off.some(t=>t.name==="navigate_to_target")).toBe(false);
 const on=playGameTools([observe,checked],baseFeatures(),reader,recorder),tool=on.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("production semantic tool missing");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(presses).toBeGreaterThan(0);expect(out.details).toMatchObject({state:{in_battle:true},semantic_navigation:{activation_attempted:true}});
});

it("deterministic exploration orders objects, warps and exits once each before reporting exhaustion",async()=>{
 const object=target(2,1,0),warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 const initial={...field([object,warp]),topology:{width:5,height:2,connections:[{direction:"EAST" as const,offset:0,destination:[0,10] as [number,number],destination_name:"ROUTE",edges:[{x:4,y:0}]}]}};
 const f=fixture(undefined,{...baseFeatures(),"deterministic-exploration-v1":true},undefined,initial,false),explore=f.tools.find(t=>t.name==="explore_map");if(explore===undefined)throw new Error("missing explorer");
 await explore.execute("e1",{});await explore.execute("e2",{});await explore.execute("e3",{});const exhausted=await explore.execute("e4",{});
 expect(f.navigations).toEqual([{x:0,y:0,map_id:[0,9]},{x:2,y:0,map_id:[0,9]},{x:4,y:0,map_id:[0,9]}]);
 expect(f.buttons).toEqual([["A"],["RIGHT"]]);
 expect(exhausted.content[0]?.type==="text"?exhausted.content[0].text:"").toContain("no untried listed interaction or walking connection");
});

it("does not mark an exploration target tried when travel is interrupted before activation",async()=>{
 const f=fixture((state,attempt)=>attempt===1?{...state,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"A confirms",diagnostic:null}}:state,{...baseFeatures(),"deterministic-exploration-v1":true},undefined,field(),false),explore=f.tools.find(t=>t.name==="explore_map");if(explore===undefined)throw new Error("missing explorer");
 await explore.execute("e1",{});f.setState({...f.state(),position:{x:0,y:0},active_ui:null});await explore.execute("e2",{});
 expect(f.navigations).toEqual([{x:2,y:0,map_id:[0,9]},{x:2,y:0,map_id:[0,9]}]);expect(f.buttons).toEqual([["A"]]);
});

it("does not mark a selected warp tried when an earlier transition reaches the same destination map",async()=>{
 const warp:NonNullable<GameStateSnapshot["interaction_targets"]>[number]={kind:"warp",x:2,y:0,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,0],name:"Door"};
 const original=field([warp]);let current=original,calls=0;
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>{calls++;current={...current,map_id:[1,2],position:{x:1,y:0}};return Promise.resolve({...result(current),details:{state:current,navigation:{status:"map changed; inspect destination",commands:1,stop_requested:false,goal_entry_attempted:false}}});}} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>Promise.resolve(result(current)),executeChecked:()=>Promise.resolve(result(current))} as unknown as CheckedPressTool;
 const explore=withSemanticNavigation([navigate,press],{...baseFeatures(),"deterministic-exploration-v1":true},{read:()=>Promise.resolve(current)}).find(t=>t.name==="explore_map");if(explore===undefined)throw new Error("missing explorer");
 const first=await explore.execute("e1",{});current={...original,position:{x:0,y:0}};await explore.execute("e2",{});
 expect(first.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
 expect(calls).toBe(2);
});

it("stops when route segments cycle back to an earlier end tile instead of looping",async()=>{
 const f=fixture((state,attempt)=>attempt>=10?state:{...state,position:attempt%2===1?{x:1,y:0}:{x:0,y:1}}),tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
 const out=await tool.execute("s",{map_id:[0,9],target:{kind:"object",local_id:2}});
 expect(f.navigations).toHaveLength(3);expect(f.buttons).toEqual([]);
 const message=out.content[0];expect(message?.type==="text"?message.text:"").toContain("route returned to an earlier segment end before the selected approach");
 expect(out.details).toMatchObject({semantic_navigation:{activation_attempted:false}});
});


describe("semantic current-map feedback switch",()=>{
 for(const on of [false,true])it(`wrong-map refusal ON=${String(on)} sends no input and preserves the selected target`,async()=>{
  const f=fixture(undefined,{...baseFeatures(),"semantic-current-map-feedback-v1":on});
  const tool=f.tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw Error("missing semantic tool");
  const result=await tool.execute("wrong-map",{map_id:[0,10],target:{kind:"connection",direction:"WEST"}});
  expect(f.buttons).toEqual([]);expect(f.navigations).toEqual([]);
  const text=result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
  expect(text).toContain("refused because the requested map is not current");
  if(on){expect(text).toContain("map 0/9");expect(text).toContain("Position: (0,0)");expect(text).toContain("No input was sent");}
  else expect(text).toBe("Semantic navigation: refused because the requested map is not current. Selected WEST map connection.");
 });
});
