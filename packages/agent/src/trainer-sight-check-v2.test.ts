// trainer-sight-check-v2: navigate_to_target routes get trainer-sight-check-v1's check. GLM runs walked into Route 102
// trainers with navigate_to_target WEST (2026-10-21T01-16-23_glm53-mac_e9ee seq 8193, 10444, 10997; acfa again).
// The stand-in game uses b300's gym state (turn 501, map 11/3) and its game-server sight reply.
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {describe,expect,it} from "vitest";
import {featuresOf,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {isCheckedNavigation,withNavigation,type NavigationPorts} from "./navigation.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {playGameTools} from "./play-wiring.js";
import {flagFeatures} from "./play-preset.js";
import {parseTrainerSight,SIGHT_STATUS,type TrainerSightCheck,type TrainerSightReply} from "./trainer-sight.js";

const ID="trainer-sight-check-v2" as const;
type Fixture={harness_features:string[];states:{seq:number;state:unknown}[];replies:Record<"turn501",{reply:unknown}>};
const B300=JSON.parse(readFileSync(new URL("../test-support/trainer-sight-b300.json",import.meta.url),"utf8")) as Fixture;
const START=parseGameState(B300.states.find(s=>s.seq===15233)?.state);
const TURN501=parseTrainerSight(B300.replies.turn501.reply);
if(!TURN501.available)throw new Error("fixture");
// Only YOUNGSTER (object 3) sees the route.
const ONLY_TARGET:TrainerSightReply={...TURN501,sightings:TURN501.sightings.filter(s=>s.local_id===3)};
const BASE:FeatureSet={...featuresOf(B300.harness_features),"semantic-navigation-v2":true,"trainer-sight-check-v1":true,"safe-navigation-strides-v1":false,"story-battle-heal-gate-v1":false};
const ON:FeatureSet={...BASE,[ID]:true};
const OFF:FeatureSet={...BASE,[ID]:false};
const MAP=[11,3] as [number,number];
const EXIT_WARP={map_id:MAP,target:{kind:"warp" as const,x:5,y:19}};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"readout"}],details:{state}});
const texts=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

function game(reply:TrainerSightReply,features:FeatureSet){
 let current=START;const pressed:string[][]=[],asked:number[]=[],records:TrainerSightCheck[]=[];
 const step=(button:string):void=>{const p=current.position;if(p===null)return;const [dx,dy]:[number,number]=button==="UP"?[0,-1]:button==="DOWN"?[0,1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:p.x+dx,y:p.y+dy},facing:button.toLowerCase()};};
 const press={name:"press",label:"press",description:"press",parameters:{} as never,execute:()=>Promise.reject(new Error("unchecked press")),
  executeChecked:(_id:string,params:{buttons:string[]},check:(s:GameStateSnapshot)=>void)=>{check(current);pressed.push([...params.buttons]);step(params.buttons[0]??"");return Promise.resolve({content:[{type:"text" as const,text:"pressed"}],details:{state:current}});}} as unknown as AgentTool;
 const observe={name:"observe",label:"observe",description:"observe",parameters:{} as never,execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const sight:NavigationPorts["trainerSight"]={check:(_map,tiles)=>{asked.push(tiles.length);return Promise.resolve(reply);},record:check=>{records.push(check);}};
 const state={read:()=>Promise.resolve(current)};
 const tools=withSemanticNavigation(withNavigation([press,observe],features,state,undefined,sight),features,state);
 const target=tools.find(t=>t.name==="navigate_to_target");if(target===undefined)throw new Error("no navigate_to_target");
 return {target,pressed,asked,records,press,observe};
}

describe("navigate_to_target with trainer-sight-check-v2",()=>{
 it("OFF: walks without asking the game server, as before",async()=>{
  const g=game(TURN501,OFF);
  await g.target.execute("t",EXIT_WARP);
  expect(g.asked).toEqual([]);
  expect(g.pressed.length).toBeGreaterThan(0);
 });
 it("ON: a route an unbeaten trainer can see is not walked; the result names the trainer and how to walk anyway",async()=>{
  const g=game(TURN501,ON);
  const out=await g.target.execute("t",EXIT_WARP);
  expect(g.pressed).toEqual([]);
  expect(g.asked).toHaveLength(1);
  expect(g.records.map(r=>r.outcome)).toEqual(["refused"]);
  const text=texts(out);
  expect(text).toContain(`Semantic navigation: ${SIGHT_STATUS}.`);
  expect(text).toMatch(/^Trainer sight: the route navigate_to_target planned from \(5,15\) to /m);
  expect(text).toContain("- object 3, sprite YOUNGSTER at (3,9)");
  expect(text).toContain("- object 5, sprite HIKER at (1,6)");
  expect(text).toContain("To walk this route anyway, call navigate_to_target again with the same map_id and target and confirm_trainer_sight: true.");
  expect(text).not.toContain("call navigate_to again");
 });
 it("ON: confirm_trainer_sight: true walks the route and records the check as confirmed",async()=>{
  const g=game(TURN501,ON);
  await g.target.execute("t",{...EXIT_WARP,confirm_trainer_sight:true});
  expect(g.records.map(r=>r.outcome)).toEqual(["confirmed"]);
  expect(g.pressed.length).toBeGreaterThan(0);
 });
 it("ON: the trainer the call goes to talk to is not a reason to refuse; another trainer's sight still is",async()=>{
  // navigate_to's checked walk with navigate_to_target's request: object 3 (YOUNGSTER) is the one it goes to talk to.
  const run=async(reply:TrainerSightReply)=>{
   const g=game(reply,ON),records=g.records;
   const navigate=withNavigation([g.press,g.observe],ON,{read:()=>Promise.resolve(START)},undefined,{check:()=>Promise.resolve(reply),record:c=>{records.push(c);}}).find(t=>t.name==="navigate_to");
   if(navigate===undefined||!isCheckedNavigation(navigate))throw new Error("no navigate_to");
   const out=await navigate.executeChecked("t",{x:5,y:2,map_id:MAP},()=>null,undefined,{exactTarget:true,sightCheck:{confirm:false,exclude:3}}).catch(()=>null);
   return {records,out};
  };
  const only=await run(ONLY_TARGET);
  expect(only.records.map(r=>r.outcome)).toEqual(["clear"]);
  const both=await run(TURN501);
  expect(both.records.map(r=>r.outcome)).toEqual(["refused"]);
  expect(both.records[0]?.sightings.map(s=>s.local_id)).toEqual([5]);
  expect(texts(both.out ?? {content:[],details:undefined})).not.toContain("- object 3, sprite YOUNGSTER");
 });
 it("ON: navigate_to_target passes the object it goes to talk to, and nothing for a warp or connection",async()=>{
  // A small field (semantic-navigation.test.ts's shape): object 2 at (3,0), a warp at (4,1), the player at (0,0).
  const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});
  const person={kind:"object",x:3,y:0,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:2,native_slot:2,destination:null,name:"PERSON_2"};
  const door={kind:"warp",x:4,y:1,elevation:3,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,0,0],name:"DOOR"};
  const state={...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:0,y:0},facing:"right",field_controls_locked:false,interaction_targets:[person,door],interaction_object_slots:[{slot:2,x:3,y:0,elevation:3,local_id:2,map_id:[0,9],is_player:false}],navigation_grid:{elevation:3,tiles:[0,1,2,3,4].flatMap(x=>[tile(x,0),tile(x,1)]),objects:[{x:3,y:0}],warps:[{x:4,y:1}]}} as unknown as GameStateSnapshot;
  const asked:unknown[]=[];
  const navigate={name:"navigate_to",label:"nav",description:"nav",parameters:{} as never,execute:()=>Promise.reject(new Error("unchecked")),
   executeChecked:(_id:string,_goal:unknown,_check:unknown,_signal:unknown,options:unknown)=>{asked.push(options);return Promise.resolve({content:[{type:"text" as const,text:"Navigation: not walked"}],details:{state,navigation:{status:SIGHT_STATUS,commands:0}}});}} as unknown as AgentTool;
  const press={name:"press",label:"press",description:"press",parameters:{} as never,execute:()=>Promise.reject(new Error("no")),executeChecked:()=>Promise.reject(new Error("no"))} as unknown as AgentTool;
  const features:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"walkable-floor-v1":true,"semantic-navigation-v1":true,"trainer-sight-check-v1":true,[ID]:true};
  const tool=withSemanticNavigation([navigate,press],features,{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to_target");
  if(tool===undefined)throw new Error("no navigate_to_target");
  const talk=await tool.execute("t",{map_id:[0,9],target:{kind:"object",local_id:2},confirm_trainer_sight:true});
  const walk=await tool.execute("t",{map_id:[0,9],target:{kind:"warp",x:4,y:1}});
  expect(asked).toEqual([expect.objectContaining({sightCheck:{confirm:true,exclude:2}}),expect.objectContaining({sightCheck:{confirm:false,exclude:null}})]);
  for(const r of [talk,walk])expect(texts(r)).toContain(`Semantic navigation: ${SIGHT_STATUS}.`);
  // OFF: no sight request rides along.
  const offAsked=asked.length;
  const off=withSemanticNavigation([navigate,press],{...features,[ID]:false},{read:()=>Promise.resolve(state)}).find(t=>t.name==="navigate_to_target");
  await off?.execute("t",{map_id:[0,9],target:{kind:"warp",x:4,y:1}});
  expect(asked.slice(offAsked)).toEqual([{exactTarget:true,multiTileRunning:true}]);
 });
 it("ON: the confirm argument and one description sentence exist only with the switch",()=>{
  const on=game(TURN501,ON).target,off=game(TURN501,OFF).target;
  expect(Value.Check(on.parameters,{...EXIT_WARP,confirm_trainer_sight:true})).toBe(true);
  expect(Value.Check(off.parameters,{...EXIT_WARP,confirm_trainer_sight:true})).toBe(false);
  expect(on.description).toContain("Before it walks, it checks the route it plans against the sight of every trainer on this map you have not beaten");
  expect(off.description).not.toContain("Before it walks, it checks the route");
  expect(off.description).toBe(game(TURN501,{...OFF,"trainer-sight-check-v1":false}).target.description);
 });
});

describe("production factory",()=>{
 it("playGameTools gives navigate_to_target the check only with the switch",async()=>{
  const run=async(features:FeatureSet)=>{
   const asked:unknown[]=[];
   const press={name:"press",label:"press",description:"press",parameters:{} as never,executeChecked:()=>Promise.reject(new Error("no press expected")),execute:()=>Promise.reject(new Error("no press expected"))} as unknown as AgentTool;
   const observe={name:"observe",label:"observe",description:"observe",parameters:{} as never,execute:()=>Promise.resolve(result(START))} as unknown as AgentTool;
   const recorder=new Proxy({},{get:(_t,key)=>key==="then"?undefined:()=>{}}) as unknown as Parameters<typeof playGameTools>[3];
   const tools=playGameTools([press,observe],{...features,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"cited-destination-v1":false,"harness-trust-v1":false},{read:()=>Promise.resolve(START),trainerSight:(map,tiles)=>{asked.push([map,tiles.length]);return Promise.resolve(TURN501);}},recorder);
   const out=await tools.find(t=>t.name==="navigate_to_target")?.execute("t",EXIT_WARP).catch((e:unknown)=>e);
   return {asked,out};
  };
  const on=await run(ON);
  expect(on.asked).toHaveLength(1);
  expect(texts(on.out as AgentToolResult<unknown>)).toContain("call navigate_to_target again with the same map_id and target and confirm_trainer_sight: true.");
  const off=await run(OFF);
  expect(off.asked).toEqual([]);
 });
});
