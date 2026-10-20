import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {navigationTool,withNavigation,type NavigationPorts} from "./navigation.js";
import {observeTool,pressTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {featureInfo,SWITCHABLE_FEATURES} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

type Goal={x:number;y:number;map_id:[number,number]};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});

// Run 4caa seq 12547 (navigate_to call), 12548 (the state it read) and 12549 (what the model received).
interface Recorded {readonly type:string;readonly args?:Goal;readonly text?:string}
const rows=gunzipSync(readFileSync(new URL("./fixtures/cross-map-goal-4caa.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as Recorded&Record<string,unknown>);
const call=rows.find(r=>r.type==="tool_call"),recordedState=rows.find(r=>r.type==="state"),received=rows.find(r=>r.type==="tool_result");
if(call?.args===undefined||recordedState===undefined||received?.text===undefined)throw new Error("fixture incomplete");
const goal=call.args,receivedFirst=received.text.split("\n")[0];
const ENVELOPE=new Set(["v","run","seq","t","type","turn"]);
const state=parseGameState(Object.fromEntries(Object.entries(recordedState).filter(([k])=>!ENVELOPE.has(k))));

async function walk(read:()=>GameStateSnapshot,target:Goal,extra:Partial<NavigationPorts>,press:()=>GameStateSnapshot=()=>{throw new Error("pressed");}):Promise<{text:string;status:string;presses:number}> {
 let presses=0;
 const tool=navigationTool({read:()=>Promise.resolve(read()),press:()=>{presses++;return Promise.resolve(result(press()));},observe:()=>Promise.resolve(result(read())),...extra});
 const outcome=await tool.execute("nav",target,new AbortController().signal);
 const text=outcome.content[0]?.type==="text"?outcome.content[0].text:"";
 return {text,status:(outcome.details as {navigation:{status:string}}).navigation.status,presses};
}

describe("cross-map-goal-v1: recorded 4caa case",()=>{
 it("is the recorded false report: on ROUTE101 (0/16), goal (8,0) on map 0/9",()=>{
  expect(state.map_id).toEqual([0,16]);expect(state.location).toBe("ROUTE101");
  expect(goal).toEqual({x:8,y:0,map_id:[0,9]});
  expect(receivedFirst).toBe("Navigation: map changed; inspect destination; 0 ordinary button attempts.");
 });
 it("OFF reproduces the bytes the model received",async()=>{
  const off=await walk(()=>state,goal,{refusalReasons:true});
  expect(off.text).toBe(receivedFirst);expect(off.presses).toBe(0);
 });
 it("ON says the target is on another map and presses nothing",async()=>{
  const on=await walk(()=>state,goal,{refusalReasons:true,crossMapGoal:true});
  expect(on.status).toBe("(8,0) on map 0/9 is on another map; you are on map 0/16 (ROUTE101) and navigate_to only walks within the current map; to walk on this map, pass map_id [0,16]; to reach map 0/9, use a listed warp or a map connection");
  expect(on.status).not.toContain("map changed");expect(on.presses).toBe(0);
 });
});

describe("cross-map-goal-v1: real map changes and unknown maps",()=>{
 const field:GameStateSnapshot={screen:"overworld",started:true,name:"A",location:"LITTLEROOT TOWN",map_id:[0,9],position:{x:0,y:0},facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(0,0),tile(1,0),tile(2,0)],objects:[],warps:[]}};
 const target:Goal={x:2,y:0,map_id:[0,9]};
 it("a map change seen in the press result still reads map changed",async()=>{
  for(const crossMapGoal of [false,true]){
   let current=field;
   const moved=await walk(()=>current,target,{crossMapGoal},()=>{current={...field,map_id:[1,0],location:"HOUSE"};return current;});
   expect(moved.status).toBe("map changed; inspect destination");expect(moved.presses).toBe(1);
  }
 });
 it("a map change seen on the next read after a press still reads map changed",async()=>{
  for(const crossMapGoal of [false,true]){
   let reads=0;const after={...field,position:{x:1,y:0}};
   const moved=await walk(()=>{reads++;return reads<=2?field:reads===3?{...after,map_id:[1,0]}:after;},target,{crossMapGoal},()=>after);
   expect(moved.status).toBe("map changed; inspect destination");expect(moved.presses).toBe(1);
  }
 });
 it("an unknown current map falls through to the readiness reason",async()=>{
  const unknown={...field,map_id:null};
  expect((await walk(()=>unknown,target,{crossMapGoal:true,refusalReasons:true})).status).toBe("this map's navigation geometry is unavailable; inspect the new state before calling navigate_to again");
  expect((await walk(()=>unknown,target,{crossMapGoal:true})).status).toBe("field input or navigation geometry unavailable");
  expect((await walk(()=>unknown,target,{})).status).toBe("map changed; inspect destination");
 });
 it("names the map without a location when the location is unknown",async()=>{
  expect((await walk(()=>({...field,location:null}),{...target,map_id:[0,10]},{crossMapGoal:true})).status).toBe("(2,0) on map 0/10 is on another map; you are on map 0/9 and navigate_to only walks within the current map; to walk on this map, pass map_id [0,9]; to reach map 0/10, use a listed warp or a map connection");
 });
 it("names the current map as the readout shows it when displayed place names are on",async()=>{
  expect((await walk(()=>({...field,location_display:"LITTLEROOT TOWN (display)"}),{...target,map_id:[0,10]},{crossMapGoal:true})).status).toContain("you are on map 0/9 (LITTLEROOT TOWN (display)) and");
 });
 it("the tool description is unchanged by the switch",()=>{
  const ports={read:()=>Promise.resolve(field),press:()=>Promise.reject(new Error("unused")),observe:()=>Promise.reject(new Error("unused"))};
  expect(navigationTool({...ports,crossMapGoal:true}).description).toBe(navigationTool(ports).description);
 });
});

describe("cross-map-goal-v1 production wiring",()=>{
 it("is a bundle-arm guidance switch, default off, that needs bounded navigation",()=>{
  const info=featureInfo("cross-map-goal-v1");
  expect(info.group).toBe("guidance");expect(info.needs).toBe("bounded-navigation-v1");
  expect(info.description).toContain(" Off: ");expect(info.description).toContain("bundle arm");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["cross-map-goal-v1"]).toBe(false);
 });
 it("withNavigation reads the switch from the FeatureSet",async()=>{
  let posts=0;
  const fetchFn:typeof fetch=(input)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;if(url.endsWith("/action"))posts++;return Promise.resolve(new Response(JSON.stringify({status:"success"})));};
  const status=async(enabled:boolean):Promise<string>=>{
   const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"cross-map-goal-v1":enabled};
   const observed={...observeTool("http://127.0.0.1",fetchFn),execute:()=>Promise.resolve(result(state))};
   const tools=withNavigation([observed,pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()})],features,{read:()=>Promise.resolve(state)});
   const nav=tools.find(t=>t.name==="navigate_to");if(!nav)throw new Error("Missing navigation");
   const outcome=await nav.execute("nav",goal);
   return (outcome.details as {navigation:{status:string}}).navigation.status;
  };
  expect(await status(true)).toMatch(/^\(8,0\) on map 0\/9 is on another map/);
  expect(await status(false)).toBe("map changed; inspect destination");
  expect(posts).toBe(0);
 });
});

describe("cross-map-goal-v1 pending experiment",()=>{
 const raw=JSON.parse(readFileSync(new URL("../../../experiments/cross-map-goal.json",import.meta.url),"utf8")) as {incumbent:{features:Record<string,boolean>}};
 it("names every switch explicitly and flips only cross-map-goal-v1",()=>{
  expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="duplicate-turn-collapse-v1"&&id!=="auto-talk-v1"&&id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="unfinished-activity-v1"&&id!=="heal-before-trainers-v2"&&id!=="gym-heal-warning-v1"&&id!=="respawn-readout-v1"&&id!=="trainer-sight-check-v1"&&id!=="context-token-budget-v1"&&id!=="original-speed-pacing-v1"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1").filter(id=>id!=="faced-interaction-history-v1").slice(0,Object.keys(raw.incumbent.features).length));
  expect(Object.keys(raw.incumbent.features)).toContain("cross-map-goal-v1");
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features["cross-map-goal-v1"]).toBe(false);expect(incumbent.features["bounded-navigation-v1"]).toBe(true);
  expect(SWITCHABLE_FEATURES.filter(id=>id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&incumbent.features[id]!==candidate.features[id])).toEqual(["cross-map-goal-v1"]);
 });
});
