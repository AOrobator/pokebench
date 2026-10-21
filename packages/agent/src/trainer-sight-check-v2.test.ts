// trainer-sight-check-v2: navigate_to_target routes get trainer-sight-check-v1's check. GLM runs walked into Route 102
// trainers with navigate_to_target WEST (2026-10-21T01-16-23_glm53-mac_e9ee seq 8193, 10444, 10997; acfa again).
// The stand-in game uses b300's gym state (turn 501, map 11/3) and its game-server sight reply.
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {describe,expect,it} from "vitest";
import {featuresOf,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {withNavigation,type NavigationPorts} from "./navigation.js";
import {withSemanticNavigation} from "./semantic-navigation.js";
import {playGameTools} from "./play-wiring.js";
import {parseTrainerSight,SIGHT_STATUS,type TrainerSightCheck,type TrainerSightReply} from "./trainer-sight.js";

const ID="trainer-sight-check-v2" as const;
type Fixture={harness_features:string[];states:{seq:number;state:unknown}[];replies:Record<"turn501",{reply:unknown}>};
const B300=JSON.parse(readFileSync(new URL("../test-support/trainer-sight-b300.json",import.meta.url),"utf8")) as Fixture;
const START=parseGameState(B300.states.find(s=>s.seq===15233)?.state);
const TURN501=parseTrainerSight(B300.replies.turn501.reply);
if(!TURN501.available)throw new Error("fixture");
// Only YOUNGSTER (object 3) sees the route: the trainer the call is going to talk to.
const ONLY_TARGET:TrainerSightReply={...TURN501,sightings:TURN501.sightings.filter(s=>s.local_id===3)};
const BASE:FeatureSet={...featuresOf(B300.harness_features),"semantic-navigation-v2":true,"trainer-sight-check-v1":true,"safe-navigation-strides-v1":false,"story-battle-heal-gate-v1":false};
const ON:FeatureSet={...BASE,[ID]:true};
const OFF:FeatureSet={...BASE,[ID]:false};
const MAP=[11,3] as [number,number];
const EXIT_WARP={map_id:MAP,target:{kind:"warp" as const,x:5,y:19}};
const TALK_YOUNGSTER={map_id:MAP,target:{kind:"object" as const,local_id:3}};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"readout"}],details:{state}});
const texts=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");

function game(reply:TrainerSightReply,features:FeatureSet){
 let current=START;const pressed:string[][]=[],asked:number[]=[],records:TrainerSightCheck[]=[];
 const step=(button:string):void=>{const p=current.position;if(p===null)return;const [dx,dy]:[number,number]=button==="UP"?[0,-1]:button==="DOWN"?[0,1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:p.x+dx,y:p.y+dy},facing:button.toLowerCase() as GameStateSnapshot["facing"]};};
 const press={name:"press",label:"press",description:"press",parameters:{} as never,execute:()=>Promise.reject(new Error("unchecked press")),
  executeChecked:(_id:string,params:{buttons:string[]},check:(s:GameStateSnapshot)=>void)=>{check(current);pressed.push([...params.buttons]);step(params.buttons[0]??"");return Promise.resolve({content:[{type:"text" as const,text:"pressed"}],details:{state:current}});}} as unknown as AgentTool;
 const observe={name:"observe",label:"observe",description:"observe",parameters:{} as never,execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const sight:NavigationPorts["trainerSight"]={check:(_map,tiles)=>{asked.push(tiles.length);return Promise.resolve(reply);},record:check=>{records.push(check);}};
 const state={read:()=>Promise.resolve(current)};
 const tools=withSemanticNavigation(withNavigation([press,observe],features,state,undefined,sight),features,state);
 const target=tools.find(t=>t.name==="navigate_to_target");if(target===undefined)throw new Error("no navigate_to_target");
 return {target,pressed,asked,records};
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
  const only=game(ONLY_TARGET,ON);
  await only.target.execute("t",TALK_YOUNGSTER);
  expect(only.records.map(r=>r.outcome)).toEqual(["clear"]);
  expect(only.pressed.length).toBeGreaterThan(0);
  const both=game(TURN501,ON);
  const out=await both.target.execute("t",TALK_YOUNGSTER);
  expect(both.records.map(r=>r.outcome)).toEqual(["refused"]);
  expect(texts(out)).toContain("- object 5, sprite HIKER");
  expect(texts(out)).not.toContain("- object 3, sprite YOUNGSTER");
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
