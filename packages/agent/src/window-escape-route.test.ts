// window-escape-route-v1: when the bounded planner finds no route inside its 15x15 window, navigate_to plans over the
// whole current map (map_grid, sent by the server without changing the readout) for the rest of the call.
// Fixture test-support/window-escape-f3b2.json: the state of GLM run 2026-10-21T18-34-04_glm53-mac_f3b2 at seq 3216
// (ROUTE101, player at (7,7) under the ledges; tool result 3217 stopped there with "no route to (9,0) lies inside the
// 15x15 local map navigate_to plans over"), its run_start harness_features, and ROUTE101's whole-map rows from run
// 2026-10-22T14-29-43_qwen36-gpu1_5e6e seq 2448 (identical to f3b2's 225 window tiles; objects and elevation from f3b2).
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {FEATURES,SERVER_FEATURES,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {MAX_NAVIGATION_COMMANDS,navigationTool,routeTiles,withNavigation,type NavigationOptions} from "./navigation.js";
import type {CheckedPressOptions,CheckedPressTool} from "./game-tools.js";
import type {Direction} from "./navigation.js";

const ID="window-escape-route-v1";
interface Fixture {readonly state:unknown;readonly map_grid:NonNullable<GameStateSnapshot["map_grid"]>;readonly harness_features:string[];readonly result_3217:string[]}
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/window-escape-f3b2.json",import.meta.url),"utf8")) as Fixture;
const POCKET=parseGameState(FIXTURE.state);
const GRID=FIXTURE.map_grid;
// f3b2's own switches, minus the two whose ports this harness does not build.
const RUN:FeatureSet={...featuresOf(FIXTURE.harness_features),"trainer-sight-check-v1":false,"story-battle-heal-gate-v1":false};
const recordedStatus=(FIXTURE.result_3217.find(l=>l.startsWith("Navigation: "))??"").replace(/^Navigation: walked from \(7,14\) to \(7,7\), then stopped: /,"").replace(/; 3 bounded movement actions\.$/,"");

const cellAt=(x:number,y:number)=>{const c=Number.parseInt(GRID.rows[y]?.slice(x*4,x*4+4)??"",16);return {collision:c>>12,elevation:(c>>8)&15,behavior:c&0xff};};
// The 15x15 local window the server sends around a position, cut from the whole-map rows.
function windowAt(p:{x:number;y:number}):NonNullable<GameStateSnapshot["navigation_grid"]> {
 const tiles=[];
 for(let y=p.y-7;y<=p.y+7;y++)for(let x=p.x-7;x<=p.x+7;x++)if(x>=0&&y>=0&&x<GRID.width&&y<GRID.height)tiles.push({x,y,...cellAt(x,y)});
 const near=(o:{x:number;y:number})=>Math.abs(o.x-p.x)<=7&&Math.abs(o.y-p.y)<=7;
 const base=POCKET.navigation_grid;if(base==null)throw new Error("fixture has no navigation_grid");
 return {elevation:base.elevation,tiles,objects:GRID.objects.filter(near),warps:GRID.warps.filter(near)};
}
const at=(p:{x:number;y:number},full:boolean):GameStateSnapshot=>({...POCKET,position:p,navigation_grid:windowAt(p),...(full?{map_grid:GRID}:{})});
const result=(state:GameStateSnapshot,stride?:unknown):AgentToolResult<unknown>=>({content:[{type:"text",text:"observed"}],details:{state,...(stride===undefined?{}:{stride})}});
const WALK:NavigationOptions={mode:"full",ledges:true,oneWay:true,floor:true,elevation:"game"};

// The production factory over fake ordinary tools that move the player as the game would on ROUTE101's tiles.
async function navigate(features:FeatureSet,start:GameStateSnapshot,goal:{x:number;y:number},full:boolean):Promise<{status:string;commands:number;presses:Direction[][];end:{x:number;y:number}|null;description:string}> {
 let current=start;const presses:Direction[][]=[];
 const press=(_id:string,params:{buttons:string[]},_signal?:AbortSignal,check?:(s:GameStateSnapshot|undefined)=>void,_update?:unknown,options?:CheckedPressOptions):Promise<AgentToolResult<unknown>>=>{
  check?.(current);
  const buttons=params.buttons as Direction[];presses.push(buttons);
  const stride=options?.stride;
  if(stride!==undefined){
   const end=stride.path.at(-1);if(end===undefined)throw new Error("empty stride");
   current=at(end,full);
   return Promise.resolve(result(current,{id:"s",...stride,automatic_running:false,completed:stride.path.length,frames:1,reason:"completed",stopped:true}));
  }
  const land=routeTiles({...current,map_grid:GRID},buttons,WALK)?.at(-1);
  if(land!==undefined)current=at(land,full);
  return Promise.resolve(result(current));
 };
 const observe={name:"observe",label:"observe",description:"observe",parameters:{},execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const pressTool={name:"press",label:"press",description:"press",parameters:{},execute:press,executeChecked:press} as unknown as CheckedPressTool;
 const nav=withNavigation([observe,pressTool],features,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");
 if(nav===undefined)throw new Error("no navigate_to");
 const out=await nav.execute("nav",{...goal,map_id:[0,16]});
 const details=out.details as {navigation:{status:string;commands:number};state:GameStateSnapshot};
 return {status:details.navigation.status,commands:details.navigation.commands,presses,end:details.state.position,description:nav.description};
}

describe("window-escape-route-v1 registry",()=>{
 it("is a default-off server switch that needs bounded navigation and says what OFF does",()=>{
  expect(featureInfo(ID)).toMatchObject({switchable:true,needs:"bounded-navigation-v1",group:"guidance"});
  expect(featureInfo(ID).description).toContain(" Off: no map_grid in the state, the local planner's refusal and today's description.");
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverFeatureEnv({...RUN,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...RUN,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  const {[ID]:_omitted,...older}=RUN;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(playHarnessFeatures({...RUN,[ID]:true},null)).toContain(ID);
  expect(playHarnessFeatures({...RUN,[ID]:false},null)).not.toContain(ID);
  expect(FEATURES.filter(f=>f.id===ID)).toHaveLength(1);
 });
});

describe("window-escape-route-v1 at f3b2's ROUTE101 ledge pocket (seq 3216)",()=>{
 it("OFF: the recorded refusal, no press",async()=>{
  const off=await navigate({...RUN,[ID]:false},at({x:7,y:7},false),{x:9,y:0},false);
  expect(off.commands).toBe(0);
  expect(off.status).toBe(recordedStatus);
  expect(off.status).toContain("no route to (9,0) lies inside the 15x15 local map navigate_to plans over");
 });
 it("ON without map_grid in the state: the same refusal",async()=>{
  const missing=await navigate({...RUN,[ID]:true},at({x:7,y:7},false),{x:9,y:0},false);
  expect(missing.status).toBe(recordedStatus);
 });
 it("ON: walks out of the pocket over the whole map, at most 8 attempts, never back the way it came",async()=>{
  const on=await navigate({...RUN,[ID]:true},at({x:7,y:7},true),{x:9,y:0},true);
  expect(on.commands).toBeGreaterThan(0);
  expect(on.commands).toBeLessThanOrEqual(MAX_NAVIGATION_COMMANDS);
  expect(on.status).not.toContain("15x15");
  // The pocket opens to the east (f3b2 later walked out by (14,9)); the escape heads that way first.
  expect(on.presses[0]).toEqual(["RIGHT"]);
  expect(on.end?.x).toBeGreaterThan(7);
 });
 it("ON: repeated calls reach the north edge, (9,0)",async()=>{
  let state=at({x:7,y:7},true);let calls=0;
  let last={status:"",end:state.position as {x:number;y:number}|null};
  while(calls<10){
   const r=await navigate({...RUN,[ID]:true},state,{x:9,y:0},true);calls++;last=r;
   if(r.end===null)throw new Error("lost position");
   state=at(r.end,true);
   if(r.status.startsWith("arrived"))break;
  }
  expect(last.status).toBe("arrived at requested coordinate");
  expect(last.end).toEqual({x:9,y:0});
 });
 it("the description gains one sentence only when ON",async()=>{
  const SENTENCE="When no route lies inside the local map, it plans over the whole current map instead.";
  const on=await navigate({...RUN,[ID]:true},at({x:7,y:7},true),{x:7,y:7},true);
  const off=await navigate({...RUN,[ID]:false},at({x:7,y:7},false),{x:7,y:7},false);
  expect(on.description).toContain(SENTENCE);
  expect(off.description).not.toContain(SENTENCE);
  expect(on.description.replace(` ${SENTENCE}`,"")).toBe(off.description);
 });
 it("a goal the local window already reaches walks the local route, ON as OFF",async()=>{
  const on=await navigate({...RUN,[ID]:true},at({x:7,y:7},true),{x:7,y:12},true);
  const off=await navigate({...RUN,[ID]:false},at({x:7,y:7},false),{x:7,y:12},false);
  expect(on.presses).toEqual(off.presses);
  expect(on.status).toBe(off.status);
 });
 it("with full-map-navigation-v1 on, nothing changes",async()=>{
  const full:FeatureSet={...RUN,"full-map-navigation-v1":true};
  const on=await navigate({...full,[ID]:true},at({x:7,y:7},true),{x:9,y:0},true);
  const off=await navigate({...full,[ID]:false},at({x:7,y:7},true),{x:9,y:0},true);
  expect(on).toEqual(off);
 });
 it("navigationTool alone: the escape port with no map_grid route keeps the local refusal",async()=>{
  // A goal walled off on the whole map too: (0,0) is solid on ROUTE101.
  expect(cellAt(0,0).collision).not.toBe(0);
  const current=at({x:7,y:7},true);
  const tool=navigationTool({windowEscape:true,read:()=>Promise.resolve(current),observe:()=>Promise.resolve(result(current)),press:()=>{throw new Error("no press expected");}});
  const out=await tool.execute("x",{x:0,y:0,map_id:[0,16]});
  expect((out.details as {navigation:{commands:number;status:string}}).navigation).toEqual(expect.objectContaining({commands:0,status:"no supported local path; choose a reachable local waypoint"}));
 });
});

describe("window-escape-route-v1 production wiring",()=>{
 it("withNavigation (the play factory's navigation step) hands the switch to navigate_to, and only with map_grid sent",async()=>{
  // Deleting features[ID] from withNavigation's ports turns the ON escape back into the refusal.
  const on=await navigate({...RUN,[ID]:true},at({x:7,y:7},true),{x:9,y:0},true);
  expect(on.status).not.toBe(recordedStatus);
  expect(serverFeatureEnv({...RUN,[ID]:true,"full-map-navigation-v1":false}).POKEBENCH_FEATURES_OFF.split(",")).toContain("full-map-navigation-v1");
 });
});
