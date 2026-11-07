import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {featureInfo,type FeatureSet} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import type {CheckedPressTool} from "./game-tools.js";
import {plannedWarpElevation,type CheckedNavigationTool} from "./navigation.js";
import {navigatorTakesWarp,withSemanticNavigation} from "./semantic-navigation.js";

const ID="navigator-elevation-zero-pads-v1";
const features=(on:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,[ID]:on});
const tile=(x:number,elevation:number)=>({x,y:0,collision:0,behavior:0,elevation});
const warp=(x:number,elevation:number)=>({kind:"warp",x,y:0,elevation,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[4,2,0] as [number,number,number],name:"Warp to map 4/2"});
// Shape of Lavaridge Gym 1F: walking at elevation 3 onto a pad whose tile is elevation 0, with the warp event at 3.
function gym(tiles:readonly {x:number;y:number;collision:number;behavior:number;elevation:number}[],targets=[warp(2,3)],at=0,elevation=3):GameStateSnapshot {
 return {...IN_GAME,screen:"overworld",started:true,location:"GYM",map_id:[4,1],position:{x:at,y:0},facing:"right",field_controls_locked:false,in_battle:false,interaction_targets:targets,interaction_object_slots:[],navigation_grid:{elevation,tiles:[...tiles],objects:[],warps:[]}};
}
const options={mode:"local",floor:true,elevation:"game"} as const;

// The real navigate_to_target over checked fakes, so every step after the lookup runs.
async function target(on:boolean,state:GameStateSnapshot):Promise<{text:string;walked:{x:number;y:number}[]}> {
 const walked:{x:number;y:number}[]=[];
 const result=(s:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state:s}});
 const go=(args:unknown)=>{const g=args as {x:number;y:number};walked.push({x:g.x,y:g.y});return Promise.resolve({...result(state),details:{state:{...state,position:{x:g.x,y:g.y}},navigation:{status:"arrived at requested coordinate",commands:1,stop_requested:false,goal_entry_attempted:true}}});};
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:(_id:string,a:unknown)=>go(a),executeChecked:(_id:string,a:unknown)=>go(a)} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(state)),executeChecked:()=>Promise.resolve(result(state))} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([navigate,press],features(on),{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to_target");
 if(tool===undefined)throw new Error("no tool");
 const out=await tool.execute("t",{map_id:[4,1],target:{kind:"warp",x:2,y:0}});
 return {text:out.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"),walked};
}

describe(ID,()=>{
 it("on: navigate_to_target walks to the pad through every later check",async()=>{
  const out=await target(true,gym([tile(0,3),tile(1,3),tile(2,0)]));
  expect(out.text).not.toContain("not listed");
  expect(out.text).not.toContain("no supported route");
  expect(out.walked).toContainEqual({x:2,y:0});
 });
 it("off: navigate_to_target refuses the pad, as today",async()=>{
  expect((await target(false,gym([tile(0,3),tile(1,3),tile(2,0)]))).text).toContain("target is not listed in the current verified state");
 });
 it("off: an elevation-3 warp on an elevation-0 tile is refused, as today",()=>{
  expect(navigatorTakesWarp(gym([tile(0,3),tile(1,3),tile(2,0)]),2,0,features(false))).toBe(false);
 });
 it("on: the same warp is taken, because the game keeps the previous elevation on an elevation-0 tile",()=>{
  expect(navigatorTakesWarp(gym([tile(0,3),tile(1,3),tile(2,0)]),2,0,features(true))).toBe(true);
 });
 it("on: a warp at another real elevation stays refused",()=>{
  expect(navigatorTakesWarp(gym([tile(0,3),tile(1,3),tile(2,0)],[warp(2,4)]),2,0,features(true))).toBe(false);
 });
 it("ObjectEventUpdateElevation: elevation-0 tiles leave the previous elevation, real ones replace it",()=>{
  expect(plannedWarpElevation(gym([tile(0,3),tile(1,0),tile(2,0)]),{x:2,y:0},options)).toBe(3);
  expect(plannedWarpElevation(gym([tile(0,3),tile(1,0),tile(2,4)]),{x:2,y:0},options)).toBe(4);
 });
 it("ObjectEventUpdateElevation: a step onto or off a multi-level tile leaves it unchanged",()=>{
  expect(plannedWarpElevation(gym([tile(0,0),tile(1,15),tile(2,4)],[],0,0),{x:2,y:0},options)).toBe(0);
 });
 it("on: from an elevation-0 tile the previous elevation is unknown, so the warp is not refused",()=>{
  expect(navigatorTakesWarp(gym([tile(0,0),tile(1,0),tile(2,0)],[warp(2,3)],0,0),2,0,features(true))).toBe(true);
 });
 it("registers with an Off clause",()=>{
  expect(featureInfo(ID).description).toContain(" Off: ");
 });
});
