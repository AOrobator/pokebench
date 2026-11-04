import {describe,expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {navigationTool,withNavigation,planNavigation,planStride,routeTiles,surfLaunch,gatedState,type NavigationOptions} from "./navigation.js";
import {exitsLine} from "./harness-trust.js";
import {Type} from "typebox";
import type {GameStateSnapshot} from "./game-state.js";
import type {FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {CheckedNavigationTool} from "./navigation.js";
import {playSystemPrompt} from "./play-config.js";
import {flagFeatures} from "./play-preset.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {IN_GAME} from "../test-support/events.js";

const POND=0x10,OCEAN=0x15,CURRENT_EAST=0x50,CURRENT_SOUTH=0x53,WATERFALL=0x13,WATER_DOOR=0x6c;
type Cell={behavior?:number;elevation?:number;collision?:number};
// One row: land at 0-1, water at 2-5, land at 6-7 unless a test overrides a tile.
const row=(overrides:Readonly<Record<number,Cell>>={},length=8,y=0)=>Array.from({length},(_,x)=>({x,y,collision:0,behavior:x>=2&&x<=5?OCEAN:0,elevation:x>=2&&x<=5?1:3,...overrides[x]}));
const native={shoes:true,allow_running:true,metatile:21,elevation:1,map_type:3,callback1:1,callback2:1,diagnostic:null,raw_hex:null};
const SURF={running:{...native,permitted:false,controllable:true,reason:"not_on_foot",avatar_flags:8}} as const;
const FOOT={running:{...native,permitted:true,controllable:true,reason:"permitted",avatar_flags:1}} as const;
const field=(x:number,surfing:boolean,tiles=row(),extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,field_controls_locked:false,active_ui:null,map_id:[0,33],position:{x,y:0},facing:"right",navigation_grid:{elevation:surfing?1:3,tiles,objects:[],warps:[]},...(surfing?SURF:FOOT),surf_gate:{can_surf:true,balance_badge:true,party_surf:true,surfing,warps:[],connections:[]},...extra} as GameStateSnapshot);
const ON:NavigationOptions={mode:"local",floor:true,elevation:"game",surf:true};
const OFF:NavigationOptions={mode:"local",floor:true,elevation:"game"};

describe("planner",()=>{
 it("keeps water a wall with the switch off, surfing or not",()=>{
  expect(planNavigation(field(2,true),{x:6,y:0},OFF)).toBeNull();
  expect(planNavigation(field(1,false),{x:6,y:0},OFF)).toBeNull();
 });
 it("crosses water and lands on elevation-3 ground while surfing",()=>{
  expect(planNavigation(field(2,true),{x:7,y:0},ON)).toEqual(["RIGHT","RIGHT","RIGHT","RIGHT","RIGHT"]);
  expect(planNavigation(field(2,true),{x:4,y:0},ON)).toEqual(["RIGHT","RIGHT"]);
 });
 it("never launches on its own: on foot water stays a wall",()=>{
  expect(planNavigation(field(1,false),{x:6,y:0},ON)).toBeNull();
 });
 it("cannot land on a shore at another elevation or a solid tile",()=>{
  expect(planNavigation(field(5,true,row({6:{elevation:4}})),{x:6,y:0},ON)).toBeNull();
  expect(planNavigation(field(5,true,row({6:{collision:1}})),{x:6,y:0},ON)).toBeNull();
 });
 it("cannot land where an object stands at elevation 3, and a swimmer on water blocks",()=>{
  const objects=[{x:6,y:0,elevation:3}];
  const s=field(5,true);
  expect(planNavigation({...s,navigation_grid:{...s.navigation_grid!,objects}},{x:7,y:0},{...ON,actorElevation:true})).toBeNull();
  const w=field(2,true);
  expect(planNavigation({...w,navigation_grid:{...w.navigation_grid!,objects:[{x:4,y:0,elevation:1}]}},{x:5,y:0},{...ON,actorElevation:true})).toBeNull();
 });
 it("after landing the route cannot re-enter water",()=>{
  const tiles=row({6:{},7:{behavior:POND,elevation:1}},9);
  expect(planNavigation(field(5,true,tiles),{x:8,y:0},ON)).toBeNull();
 });
 it("enters a water door only as the goal",()=>{
  const tiles=row({4:{behavior:WATER_DOOR}});
  const s=field(3,true,tiles);const warped={...s,navigation_grid:{...s.navigation_grid!,warps:[{x:4,y:0}]}};
  expect(planNavigation(warped,{x:4,y:0},ON)).toEqual(["RIGHT"]);
  expect(planNavigation(warped,{x:5,y:0},ON)).toBeNull();
 });
});

describe("forced water",()=>{
 const east=row({3:{behavior:CURRENT_EAST},4:{behavior:CURRENT_EAST}});
 it("rides a current to where it ends, in one step",()=>{
  expect(planNavigation(field(2,true,east),{x:5,y:0},ON)).toEqual(["RIGHT"]);
  expect(routeTiles(field(2,true,east),["RIGHT"],ON)).toEqual([{x:3,y:0},{x:4,y:0},{x:5,y:0}]);
 });
 it("cannot stop on a current or go against it",()=>{
  expect(planNavigation(field(2,true,east),{x:4,y:0},ON)).toBeNull();
  expect(planNavigation(field(5,true,east),{x:2,y:0},ON)).toBeNull();
 });
 it("refuses a current that runs into the shore, which the game would turn into a dismount",()=>{
  expect(planNavigation(field(4,true,row({5:{behavior:CURRENT_EAST}})),{x:7,y:0},ON)).toBeNull();
 });
 it("follows a current that changes direction",()=>{
  const tiles=[...row({2:{behavior:OCEAN},3:{behavior:CURRENT_EAST},4:{behavior:CURRENT_SOUTH}}),{x:4,y:1,collision:0,behavior:OCEAN,elevation:1}];
  expect(routeTiles(field(2,true,tiles),["RIGHT"],ON)?.at(-1)).toEqual({x:4,y:1});
 });
 it("slides down a waterfall but cannot climb one",()=>{
  const fall=[{x:0,y:0,collision:0,behavior:OCEAN,elevation:1},{x:0,y:1,collision:0,behavior:WATERFALL,elevation:1},{x:0,y:2,collision:0,behavior:OCEAN,elevation:1}];
  const top={...field(0,true,fall),position:{x:0,y:0}},foot={...field(0,true,fall),position:{x:0,y:2}};
  expect(planNavigation(top,{x:0,y:2},ON)).toEqual(["DOWN"]);
  expect(planNavigation(foot,{x:0,y:0},ON)).toBeNull();
 });
 it("a closed waterfall stays an obstacle on foot and opens to the planner while surfing",()=>{
  const obstacle={kind:"terrain",gate:"waterfall",name:"waterfall tiles",open:false,only:[0,1],tiles:[{x:3,y:0}],needs:"a field move",text:null,past:[]};
  const s={...field(2,true),field_obstacles:{capabilities:{},obstacles:[obstacle]}} as unknown as GameStateSnapshot;
  expect(gatedState(s).navigation_grid?.objects).toEqual([{x:3,y:0}]);
  expect(gatedState(s,true).navigation_grid?.objects).toEqual([]);
  expect(gatedState({...s,...FOOT} as GameStateSnapshot,true).navigation_grid?.objects).toEqual([{x:3,y:0}]);
 });
});

describe("strides",()=>{
 it("plans plain water as a surfing corridor and stops before the shore",()=>{
  expect(planStride(field(2,true),["RIGHT","RIGHT","RIGHT","RIGHT"],ON)).toEqual({map_id:[0,33],origin:{x:2,y:0},path:[{x:3,y:0},{x:4,y:0},{x:5,y:0}],elevation:1,surfing:true});
 });
 it("has no water corridor with the switch off, and none onto a current",()=>{
  expect(planStride(field(2,true),["RIGHT"],OFF)).toBeNull();
  expect(planStride(field(2,true,row({3:{behavior:CURRENT_EAST}})),["RIGHT"],ON)).toBeNull();
 });
});

describe("launch point",()=>{
 it("names the shore tile, the water tile and the facing",()=>{
  expect(surfLaunch(field(0,false),[{x:7,y:0}],ON)).toMatchObject({at:{x:1,y:0},water:{x:2,y:0},facing:"RIGHT"});
 });
 it("finds nothing when no water leads there or the shore is not at elevation 3",()=>{
  expect(surfLaunch(field(0,false,row({2:{collision:1}})),[{x:7,y:0}],ON)).toBeNull();
  expect(surfLaunch(field(0,false,row({1:{elevation:4}})),[{x:7,y:0}],ON)).toBeNull();
 });
 it("takes the first launch of a route with two crossings",()=>{
  const tiles=row({6:{},7:{behavior:POND,elevation:1}},10);
  expect(surfLaunch(field(0,false,tiles),[{x:9,y:0}],ON)).toMatchObject({at:{x:1,y:0}});
 });
});

type Press={buttons:string[];stride?:unknown};
function walker(start:GameStateSnapshot,moved:(state:GameStateSnapshot,press:Press)=>GameStateSnapshot){
 let state=start;const presses:Press[]=[];
 const result=(extra:Record<string,unknown>={}):AgentToolResult<unknown>=>({content:[{type:"text",text:"state"}],details:{state,...extra}});
 const tool=navigationTool({surfNavigation:true,safeStrides:true,floor:true,truth:true,fullMap:false,read:()=>Promise.resolve(state),observe:()=>Promise.resolve(result()),
  press:(_id,params,_signal,check,options)=>{check?.(state);const press:Press={buttons:params.buttons,...(options?.stride===undefined?{}:{stride:options.stride})};presses.push(press);state=moved(state,press);
   return Promise.resolve(result(options?.stride===undefined?{}:{stride:{id:"s",...options.stride,automatic_running:false,completed:options.stride.path.length,frames:8,reason:"completed",stopped:true}}));}});
 return {tool,presses,now:()=>state};
}
const stepWith=(tiles:ReturnType<typeof row>)=>(state:GameStateSnapshot,press:Press):GameStateSnapshot=>{
 const x=state.position?.x??0;
 if(press.stride!==undefined)return {...state,position:{x:(press.stride as {path:{x:number}[]}).path.at(-1)?.x??x,y:0}};
 const button=press.buttons[0];
 if(button==="RIGHT"&&state.facing!=="right")return {...state,facing:"right"};
 const next=x+1,land=(tiles[next]?.elevation??0)===3;
 return land&&state.running?.avatar_flags===8?{...field(next,false,tiles)}:{...state,position:{x:next,y:0}};
};

describe("walker",()=>{
 it("crosses water in a stride, then one press lands",async()=>{
  const tiles=row();const w=walker(field(2,true,tiles),stepWith(tiles));
  const out=await w.tool.execute("n",{x:7,y:0,map_id:[0,33]});
  expect(w.presses.map(p=>p.stride===undefined?p.buttons:"stride")).toEqual(["stride",["RIGHT"],"stride"]);
  expect(w.now().position).toEqual({x:7,y:0});
  expect(out.details).toMatchObject({navigation:{status:"arrived at requested coordinate"}});
 });
 it("on foot walks to the shore, faces the water and says to press A, without pressing it",async()=>{
  const tiles=row();const w=walker({...field(0,false,tiles),facing:"down"},stepWith(tiles));
  const out=await w.tool.execute("n",{x:7,y:0,map_id:[0,33]});
  expect(w.now().position).toEqual({x:1,y:0});expect(w.now().facing).toBe("right");
  expect(w.presses.flatMap(p=>p.buttons)).not.toContain("A");
  const text=(out.content[0] as {text:string}).text;
  expect(text).toContain("(2,0)");expect(text).toContain("press A");
 });
 it("explains a water route it cannot finish and never says on foot",async()=>{
  const tiles=row({6:{elevation:4}});const w=walker(field(5,true,tiles),stepWith(tiles));
  const out=await w.tool.execute("n",{x:6,y:0,map_id:[0,33]});
  const text=(out.content[0] as {text:string}).text;
  expect(text).toContain("from the water");expect(text).not.toContain("on foot");
  expect(w.presses).toEqual([]);
 });
 it("with the switch off a surfer still gets the old refusal",async()=>{
  const tiles=row();let pressed=0;
  const s=field(2,true,tiles);
  const tool=navigationTool({safeStrides:true,floor:true,read:()=>Promise.resolve(s),observe:()=>Promise.resolve({content:[],details:{state:s}}),press:()=>{pressed++;return Promise.resolve({content:[],details:{state:s}});}});
  const out=await tool.execute("n",{x:7,y:0,map_id:[0,33]});
  expect(pressed).toBe(0);expect((out.content[0] as {text:string}).text).toContain("no supported");
 });
});

describe("exit line",()=>{
 const places=[{map_id:[0,33] as [number,number],display:"ROUTE 118",warps:[]},{map_id:[0,34] as [number,number],display:"ROUTE 119",warps:[]},{map_id:[0,2] as [number,number],display:"MAUVILLE CITY",warps:[]}];
 const reach=(north:"foot"|"water")=>({warps:[],connections:[{direction:"NORTH",destination:[0,34] as [number,number],offset:40,reach:north},{direction:"WEST",destination:[0,2] as [number,number],offset:0,reach:"foot" as const}],foot:{width:4,height:1,rows:["f"]}});
 const state=(surfing:boolean,can:boolean)=>({map_id:[0,33] as [number,number],exit_reach:reach("water"),topology:{width:4,height:1,connections:[]},surf_gate:{can_surf:can,balance_badge:can,party_surf:can,surfing,warps:[],connections:[]},interaction_targets:[],running:{avatar_flags:surfing?8:1}}) as unknown as GameStateSnapshot;
 it("adds what lies across water once Surf can be used",()=>{
  const line=exitsLine(state(false,true),places as never,false,false,true);
  expect(line).toContain("Exits you can walk to from where you stand: WEST edge -> MAUVILLE CITY");
  expect(line).toContain("Across water: NORTH edge -> ROUTE 119");
 });
 it("keeps the old line before Surf can be used and with the switch off",()=>{
  expect(exitsLine(state(false,false),places as never,false,false,true)).not.toContain("Across water");
  expect(exitsLine(state(false,true),places as never,false,false,false)).not.toContain("Across water");
 });
 it("says you are surfing and lists every exit the water reaches",()=>{
  const line=exitsLine(state(true,true),places as never,false,false,true);
  expect(line).toContain("You are surfing");expect(line).toContain("NORTH edge -> ROUTE 119");expect(line).toContain("WEST edge -> MAUVILLE CITY");
  expect(line).not.toContain("on foot");
 });
});

describe("semantic navigation",()=>{
 const features=(on:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,"surf-navigation-v1":on});
 const north={direction:"NORTH",offset:0,destination:[0,34],destination_name:"ROUTE 119",edges:[],water_edges:[{x:4,y:0}]};
 const start=(x:number,surfing:boolean):GameStateSnapshot=>({...field(x,surfing),topology:{width:8,height:1,connections:[north]},interaction_targets:[]} as unknown as GameStateSnapshot);
 function fixture(initial:GameStateSnapshot,on=true){
  let current=initial;const navigations:unknown[]=[],buttons:string[][]=[];
  const done=(status:string):AgentToolResult<unknown>=>({content:[{type:"text",text:`Navigation: ${status}`}],details:{state:current,navigation:{status,commands:1}}});
  const go=(args:{x:number;y:number}):Promise<AgentToolResult<unknown>>=>{navigations.push(args);current={...current,position:{x:args.x,y:args.y}};return Promise.resolve(done("arrived at requested coordinate"));};
  const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:(_id:string,args:{x:number;y:number})=>go(args),executeChecked:(_id:string,args:{x:number;y:number})=>go(args)} as unknown as CheckedNavigationTool;
  const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(_id:string,args:{buttons:string[]})=>{buttons.push(args.buttons);return Promise.resolve({content:[],details:{state:current}});},executeChecked:(_id:string,args:{buttons:string[]})=>{buttons.push(args.buttons);current={...current,map_id:[0,34]};return Promise.resolve({content:[],details:{state:current}});}} as unknown as CheckedPressTool;
  const tools=withSemanticNavigation([navigate,press],features(on),{read:()=>Promise.resolve(current)});
  const tool=tools.find(t=>t.name==="navigate_to_target");if(tool===undefined)throw new Error("missing semantic tool");
  return {tool,navigations,buttons};
 }
 it("takes a map exit from a water edge tile while surfing",async()=>{
  const f=fixture(start(2,true));
  await f.tool.execute("s",{map_id:[0,33],target:{kind:"connection",direction:"NORTH"}});
  expect(f.navigations).toEqual([{x:4,y:0,map_id:[0,33]}]);expect(f.buttons).toEqual([["UP"]]);
 });
 it("on foot sends the walk toward the exit across water and presses nothing itself",async()=>{
  const f=fixture(start(0,false));
  await f.tool.execute("s",{map_id:[0,33],target:{kind:"connection",direction:"NORTH"}});
  expect(f.navigations).toEqual([{x:4,y:0,map_id:[0,33]}]);expect(f.buttons).toEqual([]);
 });
 it("with the switch off the water edge is not an approach",async()=>{
  const f=fixture(start(2,true),false);
  await f.tool.execute("s",{map_id:[0,33],target:{kind:"connection",direction:"NORTH"}});
  expect(f.navigations).toEqual([]);expect(f.buttons).toEqual([]);
 });
});

describe("system prompt",()=>{
 const on=(value:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"surf-navigation-v1":value});
 it("says who starts Surf only with the switch",()=>{
  expect(playSystemPrompt(on(true),null)).toContain("never start Surf");
  expect(playSystemPrompt(on(false),null)).not.toContain("never start Surf");
 });
});

describe("production wiring",()=>{
 const features=(on:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"safe-navigation-strides-v1":true,"surf-navigation-v1":on});
 const walk=async(on:boolean):Promise<number>=>{
  let state=field(2,true);let strides=0;
  const answer=():Promise<AgentToolResult<unknown>>=>Promise.resolve({content:[],details:{state}});
  const press={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:answer,executeChecked:(_id:string,_args:unknown,_check:unknown,_signal:unknown,_update:unknown,options?:{stride?:{path:{x:number}[]}}):Promise<AgentToolResult<unknown>>=>{if(options?.stride===undefined)return answer();strides++;state={...state,position:{x:options.stride.path.at(-1)?.x??0,y:0}};return Promise.resolve({content:[],details:{state,stride:{id:"s",...options.stride,automatic_running:false,completed:options.stride.path.length,frames:8,reason:"completed",stopped:true}}});}};
  const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:answer};
  const tool=withNavigation([press,observe] as never,features(on),{read:()=>Promise.resolve(state)} as never).find(t=>t.name==="navigate_to");
  if(tool===undefined)throw new Error("missing navigate_to");
  await tool.execute("n",{x:5,y:0,map_id:[0,33]} as never);
  return strides;
 };
 it("the feature set reaches the walker",async()=>{
  expect(await walk(false)).toBe(0);
  expect(await walk(true)).toBeGreaterThan(0);
 });
});
