import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type EventBody,type RunEvent} from "./events.js";
import {SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {NUDGE,TEXT_ONLY_REMINDER} from "./harness.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {BREAKER_NOTE,FIXED_POINT_NOTE_TURNS,FIXED_POINT_TURNS,fixedPointNote,noToolNote} from "./fixed-point-breaker.js";

const ID="fixed-point-breaker-v1";
const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const ON:FeatureSet={...NONE,[ID]:true};
type Breaker=Extract<RunEvent,{type:"loop_breaker"}>;

function rig(features:FeatureSet){
 const subscribers:((e:RunEvent)=>void)[]=[];const recorded:Omit<Breaker,"v"|"run"|"seq"|"t"|"turn"|"type">[]=[];
 let seq=0;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:(b:(typeof recorded)[number])=>{recorded.push(b);}};
 const wiring=contextTools(features,recorder,m=>Promise.resolve(m));
 const emit=(body:EventBody):RunEvent=>{const e=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T07:04:40.000-04:00",...body});for(const s of subscribers)s(e);return e;};
 const messages:AgentMessage[]=[userText("Play.")];
 let n=0;
 // One completed turn: the reply, its tool call and a result that left the player at `x`.
 const turn=(thinking:string,args:Record<string,unknown>,x:number):void=>{
  const id=`c${String(++n)}`;
  emit({type:"assistant",turn:n,thinking,text:"",tool_calls:[{id,name:"navigate_to",args}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"});
  emit({type:"tool_call",turn:n,id,name:"navigate_to",args});
  const state=emit({type:"state",turn:n,...IN_GAME,position:{x,y:5}});
  emit({type:"tool_result",turn:n,id,name:"navigate_to",is_error:false,duration_ms:1,text:`Navigation: arrived. turn ${String(n)}`,frames:[],state_seq:state.seq});
  messages.push({...assistant({thinking,toolCalls:[toolCall(id,"navigate_to",args)]}),timestamp:n});
  messages.push({role:"toolResult",toolCallId:id,toolName:"navigate_to",content:[{type:"text",text:`Navigation: arrived. turn ${String(n)}`}],isError:false,timestamp:n});
 };
 const silent=(thinking:string,nudge:string=NUDGE):void=>{
  n++;
  emit({type:"assistant",turn:n,thinking,text:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"stop"});
  messages.push({...assistant({thinking}),timestamp:n});
  messages.push(userText(nudge));
 };
 return {turn,silent,messages,recorded,send:()=>wiring.transformContext([...messages])};
}
const SAME="I am at (10,12). I will navigate to (10,5) to search that grass.";
const TARGET={x:10,y:5};
const texts=(out:readonly AgentMessage[]):string[]=>out.flatMap(m=>m.role==="user"?[typeof m.content==="string"?m.content:"(parts)"]:m.role==="toolResult"?[m.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("")]:[`assistant ${String(m.timestamp)}`]);

describe("registry and presets",()=>{
 it("registers a default-off guard switch, recorded after original-speed-pacing-v1, with an exact OFF",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"FIXED-POINT BREAKER"});
  expect(featureInfo(ID).description).toContain(" Off: every turn stays in the request and the nudge and notes are unchanged. Stage 3 (auto-talk) is its own switch, auto-talk-v1, and acts only while this one is on.");
  expect(featureInfo(ID).description).toContain(BREAKER_NOTE);
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("original-speed-pacing-v1")+1);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true,"story-character-stall-gate-v1":true},null).slice(-2)).toEqual([ID,"story-character-stall-gate-v1"]);
  expect(featuresOf(playHarnessFeatures({...ALL_ON,[ID]:false},null))[ID]).toBe(false);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false})).not.toContain(`${ID} needs`);
 });
 it("defaults off for presets that omit it and for legacy flag presets",()=>{
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

describe("OFF",()=>{
 it("sends every duplicate turn and the plain nudge, and records nothing",async()=>{
  const r=rig(NONE);
  for(let i=0;i<6;i++)r.turn(SAME,TARGET,10);
  r.silent("I will navigate to (10,10).");
  const out=await r.send();
  expect(out).toEqual(r.messages);
  expect(r.recorded).toEqual([]);
 });
});

describe("stage 1: duplicate turns collapse to the newest copy",()=>{
 it("keeps only the newest of 3 or more identical turns that left the same state, byte for byte",async()=>{
  const r=rig(ON);
  r.turn("Walk north.",{x:10,y:6},11);
  for(let i=0;i<4;i++)r.turn(SAME,TARGET,10);
  const out=await r.send();
  expect(texts(out)).toEqual(["Play.","assistant 1","Navigation: arrived. turn 1","assistant 5","Navigation: arrived. turn 5",fixedPointNote(4,["navigate_to"])]);
  expect(out[3]).toBe(r.messages[9]);
  expect(out[4]).toBe(r.messages[10]);
  expect(r.recorded[0]).toEqual({stage:1,trigger:"fixed_point",repeats:4,collapsed:3,text:null});
 });
 it("keeps two identical turns, and turns whose thinking differs by one character or that left another state",async()=>{
  const two=rig(ON);two.turn(SAME,TARGET,10);two.turn(SAME,TARGET,10);
  expect(await two.send()).toEqual(two.messages);
  const thought=rig(ON);thought.turn(SAME,TARGET,10);thought.turn(`${SAME} `,TARGET,10);thought.turn(SAME,TARGET,10);
  expect(await thought.send()).toEqual(thought.messages);
  const moved=rig(ON);moved.turn(SAME,TARGET,10);moved.turn(SAME,TARGET,11);moved.turn(SAME,TARGET,10);
  expect(await moved.send()).toEqual(moved.messages);
  expect([...two.recorded,...thought.recorded,...moved.recorded]).toEqual([]);
 });
 it("records a collapse once, and again only when new turns join it",async()=>{
  const r=rig(ON);
  for(let i=0;i<FIXED_POINT_TURNS;i++)r.turn(SAME,TARGET,10);
  await r.send();await r.send();
  expect(r.recorded.filter(b=>b.stage===1)).toEqual([{stage:1,trigger:"fixed_point",repeats:3,collapsed:2,text:null}]);
 });
 it("leaves every reply with no tool call out of the request, keeping its nudge or supervisor note (probe f28d T2862: 0/16 to 16/16 tool calls)",async()=>{
  const r=rig(ON);
  r.turn("Walk north.",{x:10,y:6},11);
  r.silent("I am at (10,10). I will navigate to (10,10).");
  r.silent("I am at (10,10). I will navigate to (10,10)..","SUPERVISOR: Your last 2 replies called no tool (text-only supervisor, note 1 of 3).");
  r.silent("I am at (10,10). I will navigate to (10,10)...");
  const out=await r.send();
  expect(texts(out)).toEqual(["Play.","assistant 1","Navigation: arrived. turn 1",NUDGE,"SUPERVISOR: Your last 2 replies called no tool (text-only supervisor, note 1 of 3).",noToolNote(3)]);
  expect(r.recorded[0]).toEqual({stage:1,trigger:"no_tool_call",repeats:3,collapsed:3,text:null});
  r.turn("Walk south.",{x:10,y:12},12);
  await r.send();
  expect(r.recorded.filter(b=>b.stage===1)).toHaveLength(1);
 });
});

describe("stage 2: the positive note with the count",()=>{
 it("ends the request with the note from the 4th identical turn on, counting every turn",async()=>{
  const r=rig(ON);
  for(let i=0;i<FIXED_POINT_NOTE_TURNS-1;i++)r.turn(SAME,TARGET,10);
  const before=(await r.send()).at(-1);
  expect(before?.role==="user"&&typeof before.content==="string"&&before.content.startsWith(BREAKER_NOTE)).toBe(false);
  r.turn(SAME,TARGET,10);
  expect((await r.send()).at(-1)).toMatchObject({role:"user",content:"SUPERVISOR: Make one tool call based on the game state and what you observed. Your last 4 turns made the same navigate_to call and the game state stayed the same after each one."});
  for(let i=0;i<6;i++)r.turn(SAME,TARGET,10);
  expect((await r.send()).at(-1)).toMatchObject({content:fixedPointNote(10,["navigate_to"])});
  expect(r.recorded.filter(b=>b.stage===2).map(b=>b.repeats)).toEqual([4,10]);
 });
 it("counts the same call to a new state as a fresh start",async()=>{
  const r=rig(ON);
  for(let i=0;i<4;i++)r.turn(SAME,TARGET,10);
  r.turn(SAME,TARGET,11);
  const out=await r.send();
  expect(out.some(m=>m.role==="user"&&typeof m.content==="string"&&m.content.startsWith(BREAKER_NOTE))).toBe(false);
 });
 it("replaces the nudge after a reply with no tool call, counting the replies in a row",async()=>{
  const r=rig(ON);
  r.turn("Walk north.",{x:10,y:6},11);
  r.silent("I will navigate to (10,10).");
  expect((await r.send()).at(-1)).toMatchObject({role:"user",content:"SUPERVISOR: Make one tool call based on the game state and what you observed. Your last 1 reply called no tool."});
  r.silent("I will walk to (10,9).",TEXT_ONLY_REMINDER);
  const out=await r.send();
  expect(texts(out).slice(-3)).toEqual(["Navigation: arrived. turn 1",NUDGE,noToolNote(2)]);
  expect(r.recorded.map(b=>[b.stage,b.trigger,b.repeats])).toEqual([[1,"no_tool_call",1],[2,"no_tool_call",1],[1,"no_tool_call",2],[2,"no_tool_call",2]]);
 });
 it("still replaces the newest nudge when fresh-retry-v1 leaves the reply out",async()=>{
  const r=rig({...ON,"fresh-retry-v1":true});
  r.turn("Walk north.",{x:10,y:6},11);
  r.silent("I will navigate to (10,10).");
  r.silent("I will walk to (10,9).");
  const out=await r.send();
  expect(texts(out)).toEqual(["Play.","assistant 1","Navigation: arrived. turn 1",NUDGE,noToolNote(2)]);
 });
 it("appends the note when no nudge follows the reply, and leaves an empty request alone",async()=>{
  const r=rig(ON);
  r.silent("Thinking.");
  r.messages.pop();
  expect((await r.send()).at(-1)).toMatchObject({content:noToolNote(1)});
  const empty=rig(ON);empty.silent("x");
  expect(await rig(ON).send()).toHaveLength(1);
 });
});

describe("duplicate-turn-collapse-v1: stage 1 alone",()=>{
 const COLLAPSE:FeatureSet={...NONE,"duplicate-turn-collapse-v1":true};
 it("is a default-off guard after auto-talk-v1 with an exact OFF",()=>{
  expect(featureInfo("duplicate-turn-collapse-v1")).toMatchObject({group:"guard",needs:null,switchable:true,title:"DUPLICATE-TURN COLLAPSE"});
  expect(featureInfo("duplicate-turn-collapse-v1").description).toContain(" Off: every turn stays in the request.");
  expect(SWITCHABLE_FEATURES.indexOf("duplicate-turn-collapse-v1")).toBe(SWITCHABLE_FEATURES.indexOf("auto-talk-v1")+1);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!=="duplicate-turn-collapse-v1")) as Omit<FeatureSet,"duplicate-turn-collapse-v1">;
  expect(normalizeFeatures(older)["duplicate-turn-collapse-v1"]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["duplicate-turn-collapse-v1"]).toBe(false);
 });
 it("collapses identical turns and leaves out replies with no tool call, but adds no note and keeps the plain nudge",async()=>{
  const r=rig(COLLAPSE);
  r.turn("Walk north.",{x:10,y:6},11);
  for(let i=0;i<6;i++)r.turn(SAME,TARGET,10);
  let out=await r.send();
  expect(texts(out)).toEqual(["Play.","assistant 1","Navigation: arrived. turn 1","assistant 7","Navigation: arrived. turn 7"]);
  r.silent("I will navigate to (10,10).");
  out=await r.send();
  expect(texts(out).slice(-2)).toEqual(["Navigation: arrived. turn 7",NUDGE]);
  expect(r.recorded.every(b=>b.stage===1)).toBe(true);
 });
});

