import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {GOAL_ONLY_BEHAVIORS,planNavigation,withNavigation,type CheckedNavigationTool} from "./navigation.js";
import {SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import {withSemanticNavigation} from "./semantic-navigation.js";

type Step="UP"|"DOWN"|"LEFT"|"RIGHT";
const PAD=0x29;
const HOLE=0x68;
const BESIDE:readonly (readonly [number,number])[]=[[0,1],[0,-1],[1,0],[-1,0]];
const MAP:[number,number]=[4,2];
const tile=(x:number,y:number,behavior=0,elevation=3)=>({x,y,collision:0,behavior,elevation});
const baseFeatures=():FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:false,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true});
const on=()=>({...baseFeatures(),"warp-target-navigation-v1":true});
// The record the server publishes for a metatile warp. Its known destination is exactly what a
// target resolved from the map's warp records cannot know.
const listedPad=(x:number,y:number)=>({name:"Warp to map 4/1",kind:"warp",x,y,elevation:3,activation:"movement; activation depends on metatile (see local map)",availability:"conditional",facing:null,local_id:null,destination:[25,4,1] as [number,number,number]});

// A 5x3 gym floor with one step-on pad. The pad is in the grid's warp records — the same source
// the untried-exits line is built from — and deliberately absent from interaction_targets, which is
// the state that produced "target is not listed in the current verified state" seven times in
// run 2026-11-01T09-10-00_deepseek-v4.1-flash_control24h.
function gym(over:Partial<GameStateSnapshot>={},padBehavior=PAD,walled=false):GameStateSnapshot{
 const tiles=[0,1,2].flatMap(y=>[0,1,2,3,4].map(x=>{
  const cell=tile(x,y,x===2&&y===1?padBehavior:0);
  const beside=BESIDE.some(([dx,dy])=>x===2+dx&&y===1+dy);
  return walled&&beside?{...cell,collision:3}:cell;
 }));
 return {...IN_GAME,screen:"overworld",started:true,location:"LAVARIDGE TOWN GYM B1F",map_id:MAP,position:{x:0,y:1},facing:"right",
  field_controls_locked:false,in_battle:false,interaction_targets:[],interaction_object_slots:[],
  navigation_grid:{elevation:3,tiles,objects:[],warps:[{x:2,y:1}]},...over};
}
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state}});
function fixture(initial:GameStateSnapshot,features:FeatureSet=baseFeatures(),{listsAfterStep=false}={}){
 let current=initial;const navigations:{x:number;y:number}[]=[];
 const navigateExecute=(args:unknown,check?:(state:GameStateSnapshot)=>string|null)=>{
  const stopped=check?.(current)??null;
  if(stopped!==null)return Promise.resolve({...result(current),details:{state:current,navigation:{status:stopped,commands:0,stop_requested:true,goal_entry_attempted:false}}});
  const goal=args as {x:number;y:number};navigations.push({x:goal.x,y:goal.y});
  current={...current,position:{x:goal.x,y:goal.y},...(listsAfterStep?{interaction_targets:[listedPad(goal.x,goal.y)]}:{})};
  // navigate re-runs the stop check on the observation after every press, not only before the first.
  const after=check?.(current)??null;
  if(after!==null)return Promise.resolve({...result(current),details:{state:current,navigation:{status:after,commands:1,stop_requested:true,goal_entry_attempted:true}}});
  return Promise.resolve({...result(current),details:{state:current,navigation:{status:"arrived at requested coordinate",commands:1,stop_requested:false,goal_entry_attempted:true}}});
 };
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),
  execute:(_id:string,args:unknown)=>navigateExecute(args),
  executeChecked:(_id:string,args:unknown,check:(state:GameStateSnapshot)=>string|null)=>navigateExecute(args,check)} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),
  execute:()=>Promise.resolve(result(current)),executeChecked:()=>Promise.resolve(result(current))} as unknown as CheckedPressTool;
 const tools=withSemanticNavigation([navigate,press],features,{read:()=>Promise.resolve(current)});
 const tool=tools.find(item=>item.name==="navigate_to_target");
 if(tool===undefined)throw new Error("missing semantic tool");
 return {tool,navigations,state:()=>current};
}
const text=(out:AgentToolResult<unknown>):string=>out.content.filter(part=>part.type==="text").map(part=>part.text).join("\n");
const walk=(from:{x:number;y:number},path:readonly Step[]):{x:number;y:number}[]=>{
 const delta:Record<Step,readonly [number,number]>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
 const seen:[number,number][]=[];let point=from;
 for(const direction of path){const [dx,dy]=delta[direction];point={x:point.x+dx,y:point.y+dy};seen.push([point.x,point.y]);}
 return seen.map(([x,y])=>({x,y}));
};

describe("warp-target-navigation-v1",()=>{
 it("OFF keeps the recorded refusal for a warp the exits line advertises",async()=>{
  const f=fixture(gym()),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:2,y:1}});
  expect(f.navigations).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
 });

 it("ON walks onto an advertised step-on pad that is absent from interaction_targets",async()=>{
  const f=fixture(gym(),on()),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:2,y:1}});
  expect(f.navigations).toEqual([{x:2,y:1}]);
  expect(text(out)).not.toContain("target is not listed in the current verified state");
 });

 it("ON finishes the walk when the pad turns up in a later read",async()=>{
  // The read without the pad is the one this switch exists for; the next read usually has it. A
  // target re-resolved from whichever source lists it reads as "changed during travel" mid-walk.
  const f=fixture(gym(),on(),{listsAfterStep:true}),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:2,y:1}});
  expect(text(out)).not.toContain("changed during travel");
  expect(f.navigations).toEqual([{x:2,y:1}]);
 });

 it("ON still refuses a warp record whose tile is not a step-on pad",async()=>{
  const f=fixture(gym({},0x10),on()),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:2,y:1}});
  expect(f.navigations).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
 });

 it("ON does not resolve a coordinate that carries no warp record",async()=>{
  const f=fixture(gym(),on()),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:3,y:2}});
  expect(f.navigations).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
 });

 it("ON refuses a floor-down hole, which stays outside the enrolled set",async()=>{
  const f=fixture(gym({},HOLE),on()),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:2,y:1}});
  expect(f.navigations).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
 });

 it("ON names the pad when it cannot be reached, instead of denying it exists",async()=>{
  const f=fixture(gym({},PAD,true),on()),out=await f.tool.execute("s",{map_id:MAP,target:{kind:"warp",x:2,y:1}});
  expect(f.navigations).toEqual([]);
  expect(text(out)).toContain("no supported route to the step-on warp at (2,1)");
 });

 it("ON never picks a pad as the tile to stand on for another target",async()=>{
  // A sign at (2,0) is pressed from directly below — the pad at (2,1). Under the switch a pad is a
  // legal goal, so an unfiltered approach search would walk onto it and teleport mid-command.
  const sign={name:"sign",kind:"background",x:2,y:0,elevation:3,activation:"none",availability:"always",facing:null,local_id:null,destination:null};
  // Standing directly under the pad makes it the shortest approach, so an unfiltered search picks it.
  const f=fixture(gym({interaction_targets:[sign],position:{x:2,y:2}}),on());
  await f.tool.execute("s",{map_id:MAP,target:{kind:"interaction",interaction_kind:"background",x:2,y:0}});
  expect(f.navigations.length).toBeGreaterThan(0);
  expect(f.navigations).not.toContainEqual({x:2,y:1});
 });

 it("plans onto a goal-only pad, and never routes through one",()=>{
  // No warp record here: with one, the pre-existing "never step on a warp that is not the goal" rule
  // would block the tile on its own and the test would pass with the goal-only condition deleted.
  const bare=gym();
  const grid=bare.navigation_grid as NonNullable<typeof bare.navigation_grid>;
  const state=gym({navigation_grid:{elevation:grid.elevation,tiles:grid.tiles,objects:grid.objects,warps:[]}}),options={mode:"local" as const,floor:true,goalOnly:true};
  const pad=planNavigation(state,{x:2,y:1},options);
  expect(pad).not.toBeNull();
  expect(walk({x:0,y:1},pad??[]).at(-1)).toEqual({x:2,y:1});
  const beyond=planNavigation(state,{x:4,y:1},options);
  expect(beyond).not.toBeNull();
  expect(walk({x:0,y:1},beyond??[])).not.toContainEqual({x:2,y:1});
 });

 // The stub navigate above accepts any goal it is handed, which is exactly how the executor's own
 // planner went unwired: the semantic layer planned a route the walker refused one layer down.
 function realTools(features: FeatureSet) {
  let current = gym();
  const presses: string[] = [];
  const read = () => Promise.resolve(current);
  const move = (params: {buttons: readonly string[]}) => {
   const button = params.buttons[0] ?? "A";
   presses.push(button);
   const [dx, dy] = button === "UP" ? [0, -1] : button === "DOWN" ? [0, 1] : button === "LEFT" ? [-1, 0] : [1, 0];
   const point = current.position ?? {x: 0, y: 1};
   current = {...current, position: {x: point.x + dx, y: point.y + dy}};
   return result(current);
  };
  const press = {name: "press", label: "press", description: "press", parameters: Type.Object({buttons: Type.Array(Type.String())}),
   execute: (_id: string, params: {buttons: readonly string[]}) => Promise.resolve(move(params)),
   executeChecked: (_id: string, params: {buttons: readonly string[]}) => Promise.resolve(move(params))} as unknown as CheckedPressTool;
  const observe = {name: "observe", label: "observe", description: "observe", parameters: Type.Object({}), execute: () => Promise.resolve(result(current))};
  const tools = withSemanticNavigation(withNavigation([press, observe], features, {read}), features, {read});
  const tool = tools.find(item => item.name === "navigate_to_target");
  if (tool === undefined) throw new Error("missing semantic tool");
  return {tool, presses, position: () => current.position};
 }

 it("walks the last step onto the pad through the real navigate_to, not only past the chooser", async () => {
  const f = realTools(on());
  const out = await f.tool.execute("s", {map_id: MAP, target: {kind: "warp", x: 2, y: 1}});
  expect(text(out)).not.toContain("not listed in the current verified state");
  expect(text(out)).not.toContain("no supported path");
  expect(f.presses.length).toBeGreaterThan(0);
  expect(f.position()).toEqual({x: 2, y: 1});
 });

 it("still refuses the pad through the real navigate_to when the switch is off", async () => {
  const f = realTools(baseFeatures());
  const out = await f.tool.execute("s", {map_id: MAP, target: {kind: "warp", x: 2, y: 1}});
  expect(f.presses).toEqual([]);
  expect(text(out)).toContain("target is not listed in the current verified state");
 });

 it("never uses a pad as the tile to stand on for an unloaded trainer template",async () => {
  // The only route-level guard for this arm: the warp-record filter beside it is staticRequest-only,
  // so without it the trainer approach walks onto the pad and the floor changes mid-command.
  const state={...gym({position:{x: 2, y: 0}}),heal_before_trainers:{trainers:[{local_id: 7,x: 2,y: 2,graphics_id: 0,sprite_kind: "PERSON",trainer_id: 1,defeated: false,loaded: false}],move_power: [],last_heal: null,home: null,mom_heals: false}};
  const f=fixture(state,{...on(),"npc-approach-feedback-v1": true});
  await f.tool.execute("s",{map_id: MAP,target: {kind: "object",local_id: 7}});
  expect(f.navigations.length).toBeGreaterThan(0);
  expect(f.navigations).not.toContainEqual({x: 2,y: 1});
 });

 it("enrols exactly the gym pad behaviour",()=>{
  expect([...GOAL_ONLY_BEHAVIORS]).toEqual([PAD]);
  // Append-only: the switch sits last, so no predecessor index moved.
  expect(SWITCHABLE_FEATURES.indexOf("warp-target-navigation-v1")).toBe(SWITCHABLE_FEATURES.length-1);
 });

 it("keeps the pad unreachable as a goal when goal-only routing is off",()=>{
  const state=gym();
  expect(planNavigation(state,{x:2,y:1},{mode:"local",floor:true})).toBeNull();
 });

 it("is promoted into both arms, and the older warp switch with it",()=>{
  const source=JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/feature-configs/current.json",import.meta.url)),"utf8")) as {features:Record<string,boolean>;switches:string[];onInBoth:string[]};
  for(const id of ["warp-target-navigation-v1","active-warp-exits-v1"]){
   expect(source.features[id],id).toBe(true);
   expect(source.onInBoth,id).toContain(id);
   expect(source.switches,id).not.toContain(id);
  }
 });
});
