import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {featureInfo,type FeatureSet} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import type {CheckedPressTool} from "./game-tools.js";
import {planNavigation,plannedArrivalElevation,requestedStep,withNavigation,type CheckedNavigationTool} from "./navigation.js";
import {navigatorTakesWarp,withSemanticNavigation} from "./semantic-navigation.js";

const LEDGE_ID="navigator-ledge-drops-v1",SURF_ID="navigator-surf-start-warps-v1";
const JUMP_EAST=0x38,OCEAN=0x15;
const features=(ledge:boolean,surf=false):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v2":true,"ledge-hops-v1":true,"surf-navigation-v1":true,"elevation-transitions-v1":true,[LEDGE_ID]:ledge,[SURF_ID]:surf});
const tile=(x:number,elevation:number,behavior=0,collision=0)=>({x,y:0,collision,behavior,elevation});
const warp=(x:number,elevation:number)=>({kind:"warp",x,y:0,elevation,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[4,2,0] as [number,number,number],name:"Warp"});
function row(tiles:readonly ReturnType<typeof tile>[],elevation:number,extra:Partial<GameStateSnapshot>={}):GameStateSnapshot {
 return {...IN_GAME,screen:"overworld",started:true,location:"TOWN",map_id:[0,5],position:{x:0,y:0},facing:"right",field_controls_locked:false,in_battle:false,interaction_targets:[],interaction_object_slots:[],navigation_grid:{elevation,tiles:[...tiles],objects:[],warps:[]},...extra};
}
// Lilycove's shape: a walk at elevation 5, a ledge tile, and a landing at elevation 3.
const drop=row([tile(0,5),tile(1,0,JUMP_EAST,1),tile(2,3),tile(3,3)],5);
const options={mode:"local",floor:true,ledges:true,elevation:"game"} as const;
const rules={ledges:true,oneWay:false,floor:true,elevation:"game",fieldMoveGates:false} as const;
const surfGate={can_surf:true,balance_badge:true,party_surf:true,surfing:false,warps:[],connections:[]};
// A shore at elevation 3 and a cave mouth on water at elevation 1, as at Lilycove (70,5).
const cove=(can=true):GameStateSnapshot=>row([tile(0,3),tile(1,3),tile(2,1,OCEAN),tile(3,1,OCEAN)],3,{interaction_targets:[warp(3,1)],surf_gate:{...surfGate,can_surf:can}});

async function target(on:boolean,state:GameStateSnapshot):Promise<{text:string;walked:{x:number;y:number}[]}> {
 const walked:{x:number;y:number}[]=[];
 const result=(s:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"state"}],details:{state:s}});
 const go=(args:unknown)=>{const g=args as {x:number;y:number};walked.push({x:g.x,y:g.y});return Promise.resolve({...result(state),details:{state,navigation:{status:"stopped at the water"}}});};
 const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:Type.Object({}),execute:(_id:string,a:unknown)=>go(a),executeChecked:(_id:string,a:unknown)=>go(a)} as unknown as CheckedNavigationTool;
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(state)),executeChecked:()=>Promise.resolve(result(state))} as unknown as CheckedPressTool;
 const tool=withSemanticNavigation([navigate,press],features(false,on),{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to_target");
 if(tool===undefined)throw new Error("no tool");
 const out=await tool.execute("t",{map_id:[0,5],target:{kind:"warp",x:3,y:0}});
 return {text:out.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"),walked};
}

describe(LEDGE_ID,()=>{
 it("off: a hop that lands at another elevation is no route, as before",()=>{
  expect(planNavigation(drop,{x:3,y:0},options)).toBeNull();
 });
 it("on: ShouldJumpLedge reads no elevation, so the hop is taken and the player lands at the landing's elevation",()=>{
  const on={...options,ledgeDrops:true};
  expect(planNavigation(drop,{x:3,y:0},on)).toEqual(["RIGHT","RIGHT"]);
  expect(plannedArrivalElevation(drop,{x:3,y:0},on)).toBe(3);
 });
 it("on: a landing tile that is solid still stops the hop",()=>{
  expect(planNavigation(row([tile(0,5),tile(1,0,JUMP_EAST,1),tile(2,3,0,1)],5),{x:2,y:0},{...options,ledgeDrops:true})).toBeNull();
 });
 it("on: past the landing the walker holds the landing's elevation, so a higher tile is still refused",()=>{
  expect(planNavigation(row([tile(0,5),tile(1,0,JUMP_EAST,1),tile(2,3),tile(3,5)],5),{x:3,y:0},{...options,ledgeDrops:true})).toBeNull();
 });
 it("a press batch uses the same rule",()=>{
  expect(requestedStep(drop,"RIGHT",rules).ok).toBe(false);
  expect(requestedStep(drop,"RIGHT",{...rules,ledgeDrops:true})).toEqual({ok:true,landing:{x:2,y:0},warp:false});
 });
 it("registers with an Off clause",()=>{
  expect(featureInfo(LEDGE_ID).description).toContain(" Off: ");
 });
 it("the production navigate_to honors the switch",async()=>{
  const go=async(on:boolean):Promise<string>=>{
   const result=(s:GameStateSnapshot)=>({content:[{type:"text" as const,text:"state"}],details:{state:s}});
   const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(drop)),executeChecked:()=>Promise.resolve(result(drop))};
   const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(drop))};
   const nav=withNavigation([press,observe] as never,features(on),{read:()=>Promise.resolve(drop)}).find(t=>t.name==="navigate_to");
   if(nav===undefined)throw new Error("no tool");
   const out=await nav.execute("t",{x:3,y:0,map_id:[0,5]});
   return out.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
  };
  expect(await go(false)).toMatch(/no route|no supported|not reachable|cannot/i);
  expect(await go(true)).not.toMatch(/no route|no supported|not reachable/i);
 });
});

describe(SURF_ID,()=>{
 it("off: a warp on the water is not listed from the shore, as before",async()=>{
  const out=await target(false,cove());
  expect(out.text).toContain("not listed");
  expect(out.walked).toEqual([]);
 });
 it("on: with Surf usable the lookup finds it and the surf start runs",async()=>{
  const out=await target(true,cove());
  expect(out.text).not.toContain("not listed");
  expect(out.walked).toEqual([{x:3,y:0}]);
 });
 it("on: without usable Surf it stays refused",async()=>{
  const out=await target(true,cove(false));
  expect(out.walked).toEqual([]);
 });
 it("on: a warp the player can walk to resolves as before",()=>{
  const state=row([tile(0,3),tile(1,3)],3,{interaction_targets:[warp(1,3)]});
  expect(navigatorTakesWarp(state,1,0,features(false,true))).toBe(true);
 });
 it("registers with an Off clause",()=>{
  expect(featureInfo(SURF_ID).description).toContain(" Off: ");
 });
});
