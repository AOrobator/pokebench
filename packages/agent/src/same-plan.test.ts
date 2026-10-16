import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {checkEvent,parseEvent,type RunEvent} from "./events.js";
import type {LoopNotice} from "./loop-detection.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {loopSupervisor,stallBriefing} from "./play-wiring.js";
import {decisionContext} from "./decision-probe.js";
import {SAME_PLAN_SIMILARITY,SamePlanBreaker,planSimilarity,planState,planTokens} from "./same-plan.js";
import {IN_GAME} from "../test-support/events.js";

const ID="same-plan-breaker-v1";
interface Fixture {readonly source:string;readonly events:readonly RunEvent[]}
// Real events of run 2026-10-16T02-23-17_qwen36-gpu1_sh02 (see the fixture's source line for the turns kept).
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/beliefs-sh02.json",import.meta.url),"utf8")) as Fixture;
const RUN:FeatureSet=featuresOf(FIXTURE.events.flatMap(e=>e.type==="run_start"?e.harness_features:[]));
const ON:FeatureSet={...RUN,[ID]:true};
const OFF:FeatureSet={...RUN,[ID]:false};
type Guard=Extract<RunEvent,{type:"loop_guard"}>;

// The recorder's synchronous fan-out, the real loop guard and the production factory live.ts and the probe call.
function rig(features:FeatureSet,events:readonly RunEvent[]=FIXTURE.events){
 const subscribers:((e:RunEvent)=>void)[]=[];const guards:Guard[]=[];const contexts=new Map<number,string|null>();
 let current:RunEvent|undefined;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{guards.push(checkEvent({v:1,run:"r",t:current?.t??"2026-10-16T03:00:00.000-04:00",seq:current?.seq??0,turn:current?.turn??0,type:"loop_guard",...n,evidence:[...n.evidence]}) as Guard);}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder),features["transition-loop-detection-v1"]);
 stallBriefing(features,recorder,detector,{pausedMs:()=>0},()=>0);
 for(const e of events){
  if(e.type==="loop_guard"||e.type==="text_only_supervisor"||e.type==="belief_ledger")continue;
  current=e;
  if(e.type==="turn_start")contexts.set(e.turn,detector.context());
  for(const s of subscribers)s(e);
 }
 return {guards,plans:guards.filter(g=>g.kind==="same_plan"),contexts};
}

describe("registry and presets",()=>{
 it("registers a default-off guard switch, recorded last, that needs the deterministic loop guard",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"deterministic-loop-guard-v1",switchable:true,title:"SAME-PLAN BREAKER"});
  expect(featureInfo(ID).description).toContain(" Off: no such note.");
  expect(featureInfo(ID).description).toContain("Your last 3 plans (turns a, b, c) were the same and the game state did not change");
  expect(SWITCHABLE_FEATURES.at(-25)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-25)).toBe(ID);
  expect(featuresOf(playHarnessFeatures({...ALL_ON,[ID]:false},null))[ID]).toBe(false);
  expect(dependencyProblems({...ALL_ON,"deterministic-loop-guard-v1":false})).toContain(`${ID} needs deterministic-loop-guard-v1`);
 });
 it("defaults off for presets that omit it and for legacy flag presets",()=>{
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

describe("plan similarity",()=>{
 it("is 2·LCS/(|a|+|b|) over lowercase words, numbers and symbols",()=>{
  expect(planTokens("I am at (11,1). Press UP!")).toEqual(["i","am","at","(","11",",","1",")",".","press","up","!"]);
  expect(planSimilarity(planTokens("press up"),planTokens("PRESS UP"))).toBe(1);
  expect(planSimilarity(planTokens("a b"),planTokens("c d"))).toBe(0);
  expect(planSimilarity([],[])).toBe(1);
  expect(planTokens("")).toEqual([]);
  expect(planSimilarity(planTokens(""),planTokens("press"))).toBe(0);
  expect(planSimilarity(planTokens("a b c d"),planTokens("a x c d"))).toBe(0.75);
  // The twin turns differ only in the tile they start from.
  const t145="I am at (11,2). I need to go to Route 101. The map connection says \"- NORTH -> ROUTE101 (map 0/16)\". I will press UP to go to Route 101.";
  const t146="I am at (11,1). I need to go to Route 101. The map connection says \"- NORTH -> ROUTE101 (map 0/16)\". I will press UP to go to Route 101.";
  expect(planSimilarity(planTokens(t145),planTokens(t146))).toBeGreaterThan(0.95);
  expect(SAME_PLAN_SIMILARITY).toBe(0.8);
 });
});

describe("same-plan-breaker-v1 on run sh02",()=>{
 it("posts a factual note on the twin's bounce (T144, again at T147) naming the two states and quoting the plan whole",()=>{
  const {plans,contexts}=rig(ON);
  const twin=plans.filter(g=>g.turn>=140&&g.turn<=148);
  expect(twin.map(g=>g.turn)).toEqual([144,147]);
  const plan=FIXTURE.events.find((e):e is Extract<RunEvent,{type:"assistant"}>=>e.type==="assistant"&&e.turn===144);
  expect(twin[0]).toMatchObject({kind:"same_plan",phase:"supervisor",mode:"enforced"});
  expect(twin[0]?.message).toBe(`SUPERVISOR: Your last 3 plans (turns 142, 143, 144) were the same and the game state did not change beyond going back and forth between LITTLEROOT TOWN (map 0/9) at (11,2) facing up and LITTLEROOT TOWN (map 0/9) at (11,1) facing up, field controls locked: ${plan?.thinking.trim()??""}`);
  // Delivered as the loop guard's context note at the next model call, once.
  expect(contexts.get(145)).toBe(twin[0]?.message);
  expect(contexts.get(146)).toBeNull();
  const first=FIXTURE.events.find(e=>e.type==="assistant"&&e.turn===142)?.seq;
  const last=FIXTURE.events.find(e=>e.type==="tool_result"&&e.turn===144)?.seq;
  expect(twin[0]?.evidence).toEqual([first,last]);
 });

 it("posts on Birch's Route 101 stall (T264): one state, so the game state did not change",()=>{
  const {plans}=rig(ON);
  const route=plans.filter(g=>g.turn>=257&&g.turn<=266);
  expect(route.map(g=>g.turn)).toEqual([264]);
  expect(route[0]?.message.startsWith("SUPERVISOR: Your last 3 plans (turns 262, 263, 264) were the same and the game state did not change: I am at (7,15). I am facing right.")).toBe(true);
 });

 it("stays silent in the truck, the lab, walking on Route 103 and the Route 101 battle",()=>{
  const {plans}=rig(ON);
  // 169 is the twin's bounce again, counted across the fixture's gap (turns 149-167 are not kept).
  expect(plans.map(g=>g.turn)).toEqual([144,147,169,264]);
 });

 it("OFF posts nothing and leaves every other guard event as it was",()=>{
  const off=rig(OFF);
  expect(off.plans).toEqual([]);
  const on=rig(ON);
  expect(on.guards.filter(g=>g.kind!=="same_plan").map(g=>[g.turn,g.kind,g.phase,g.message])).toEqual(off.guards.map(g=>[g.turn,g.kind,g.phase,g.message]));
 });
});

describe("states that qualify",()=>{
 let seq=0;
 const ev=(body:Record<string,unknown>,turn=1):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-16T03:00:00.000-04:00",seq:++seq,turn,...body});
 const state=(extra:Record<string,unknown>)=>ev({type:"state",...IN_GAME,location:"TOWN",map_id:[0,9],position:{x:3,y:3},facing:"up",field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null},...extra}) as Extract<RunEvent,{type:"state";started:boolean}>;
 it("withholds an overworld interface the readout cannot qualify (review round 4)",()=>{
  expect(planState(state({active_ui:{phase:"unknown_menu",selected:null,ready:null,controls:"x",diagnostic:"unsupported owner"}}),ALL_ON)).toBeNull();
  expect(planState(state({active_ui:{phase:"start_menu",selected:"BAG",ready:false,controls:"x",diagnostic:null}}),ALL_ON)).toBeNull();
  expect(planState(state({active_ui:{phase:"start_menu",selected:"BAG",ready:true,controls:"x",diagnostic:null}}),ALL_ON)).not.toBeNull();
 });
 it("withholds unknown screens and transitions and labels battle and locked states",()=>{
  expect(planState(state({screen:"naming"}),ALL_ON)).toBeNull();
  expect(planState(state({started:false}),ALL_ON)).toBeNull();
  expect(planState(state({position:null}),ALL_ON)).toBeNull();
  expect(planState(state({in_battle:true,active_ui:null}),ALL_ON)).toBeNull();
  expect(planState(state({in_battle:true,active_ui:{phase:"battle_action",selected:"FIGHT",ready:true,controls:"x",diagnostic:null}}),ALL_ON)).toMatchObject({free:true,label:"in battle (battle_action, FIGHT selected)"});
  expect(planState(state({field_controls_locked:true}),ALL_ON)).toMatchObject({free:false,label:"TOWN (map 0/9) at (3,3) facing up, field controls locked"});
 });

 // A synthetic stream: the same plan five times while the state behaves as given.
 function run(states:Record<string,unknown>[],plans:string[]):string[] {
  const notes:string[]=[];
  const breaker=new SamePlanBreaker(ALL_ON,{stall:(_k,text)=>{notes.push(text(0));return true;}});
  states.forEach((extra,i)=>{
   const turn=i+1;
   breaker.observe(ev({type:"assistant",thinking:plans[i]??"",text:"",tool_calls:[{id:`c${String(turn)}`,name:"press",args:{buttons:["UP"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},turn));
   const s=state(extra);breaker.observe(s);
   breaker.observe(ev({type:"tool_result",id:`c${String(turn)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq},turn));
  });
  return notes;
 }
 const same=Array<string>(9).fill("I will press UP to go north.");
 it("fires when nothing changes, never while walking, never while locked throughout, and re-arms after 3 decisions",()=>{
  expect(run(Array.from({length:5},()=>({})),same)).toEqual(["SUPERVISOR: Your last 3 plans (turns 3, 4, 5) were the same and the game state did not change: I will press UP to go north."]);
  expect(run(Array.from({length:8},(_,i)=>({position:{x:3,y:3+i}})),same)).toEqual([]);
  expect(run(Array.from({length:5},()=>({field_controls_locked:true})),same)).toEqual([]);
  expect(run(Array.from({length:8},()=>({})),same)).toHaveLength(2);
  expect(run(Array.from({length:5},()=>({})),["a b c d","e f g h","i j k l","m n o p","q r s t"])).toEqual([]);
  // Replies that state no plan are not "the same plan" (review round 1).
  expect(run(Array.from({length:5},()=>({})),["","","","",""])).toEqual([]);
 });
 it("names only the states the 3 decisions ended in (review round 3)",()=>{
  // A, B, A, A, A: the three decisions all ended in A, so nothing went back and forth.
  const a={},b={position:{x:3,y:4}};
  expect(run([a,b,a,a,a],same)).toEqual(["SUPERVISOR: Your last 3 plans (turns 3, 4, 5) were the same and the game state did not change: I will press UP to go north."]);
  // B, A, B, A, B: they did.
  expect(run([b,a,b,a,b],same)).toEqual(["SUPERVISOR: Your last 3 plans (turns 3, 4, 5) were the same and the game state did not change beyond going back and forth between TOWN (map 0/9) at (3,4) facing up and TOWN (map 0/9) at (3,3) facing up: I will press UP to go north."]);
 });
 it("never clips the plan",()=>{
  const long=`I will press UP. ${"The path north is open and I keep going. ".repeat(500)}`.trim();
  const [note]=run(Array.from({length:5},()=>({})),Array<string>(5).fill(long));
  expect(note?.endsWith(long)).toBe(true);
 });
 it("an error result or a refused note withholds or retries",()=>{
  const notes:string[]=[];let refuse=true;
  const breaker=new SamePlanBreaker(ALL_ON,{stall:(_k,text)=>{if(refuse){refuse=false;return false;}notes.push(text(0));return true;}});
  for(let turn=1;turn<=6;turn++){
   breaker.observe(ev({type:"assistant",thinking:"same",text:"",tool_calls:[{id:`d${String(turn)}`,name:"press",args:{buttons:["UP"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},turn));
   const s=state({});breaker.observe(s);
   breaker.observe(ev({type:"tool_result",id:`d${String(turn)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq},turn));
  }
  // Refused at turn 5 (another note was open), posted at turn 6.
  expect(notes).toEqual(["SUPERVISOR: Your last 3 plans (turns 4, 5, 6) were the same and the game state did not change: same"]);
 });
 it("waits for every tool call of a reply, ignores other results, and withholds after an error",()=>{
  const notes:string[]=[];
  const breaker=new SamePlanBreaker(ALL_ON,{stall:(_k,text)=>{notes.push(text(0));return true;}});
  for(let i=0;i<40;i++)breaker.observe(state({}));
  for(let turn=1;turn<=5;turn++){
   breaker.observe(ev({type:"tool_result",id:"stray",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]},turn));
   breaker.observe(ev({type:"assistant",thinking:"same",text:"",tool_calls:[{id:`e${String(turn)}`,name:"press",args:{buttons:["UP"]}},{id:`f${String(turn)}`,name:"observe",args:{}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},turn));
   const s=state({});breaker.observe(s);
   breaker.observe(ev({type:"tool_result",id:`e${String(turn)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq},turn));
   expect(notes).toEqual([]);
   breaker.observe(ev({type:"tool_result",id:`f${String(turn)}`,name:"observe",is_error:turn===4,duration_ms:1,text:"ok",frames:[],state_seq:s.seq},turn));
  }
  // Turn 4's last result was an error, so no window holding it qualifies.
  expect(notes).toEqual([]);
 });
 it("needs every decision of the window answered",()=>{
  const notes:string[]=[];
  const breaker=new SamePlanBreaker(ALL_ON,{stall:(_k,text)=>{notes.push(text(0));return true;}});
  for(let turn=1;turn<=6;turn++){
   breaker.observe(ev({type:"assistant",thinking:"same",text:"",tool_calls:[{id:`g${String(turn)}`,name:"press",args:{buttons:["UP"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},turn));
   if(turn===5)continue;
   const s=state({});breaker.observe(s);
   breaker.observe(ev({type:"tool_result",id:`g${String(turn)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq},turn));
  }
  expect(notes).toEqual([]);
 });
});

it("the decision probe replays the note into the T145 context with the switch on, and not with it off",async()=>{
 const start=FIXTURE.events.find((e):e is Extract<RunEvent,{type:"run_start"}>=>e.type==="run_start");
 if(start===undefined)throw new Error("fixture has no run_start");
 const ports={frame:()=>"",rerender:()=>Promise.reject(new Error("no rerender")),thinkingSignature:"reasoning_content"};
 const notes=(messages:readonly {role:string;content:unknown}[])=>messages.flatMap(m=>m.role==="user"&&typeof m.content==="string"&&m.content.startsWith("SUPERVISOR: Your last 3 plans")?[m.content]:[]);
 const on=await decisionContext({start,events:FIXTURE.events},145,ON,ports,"replayed");
 const off=await decisionContext({start,events:FIXTURE.events},145,OFF,ports,"replayed");
 expect(notes(on.messages)).toHaveLength(1);
 expect(notes(on.messages)[0]).toMatch(/^SUPERVISOR: Your last 3 plans \(turns 142, 143, 144\) were the same/);
 expect(notes(off.messages)).toEqual([]);
});

it("parses as a loop_guard event with the same_plan kind",()=>{
 expect(()=>parseEvent(JSON.stringify({v:1,run:"r",t:"2026-10-16T03:00:00.000-04:00",seq:1,turn:1,type:"loop_guard",kind:"same_plan",message:"SUPERVISOR: x",calls:3,evidence:[1,2],mode:"enforced",phase:"supervisor"}))).not.toThrow();
});
