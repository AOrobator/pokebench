import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {withNavigation} from "./navigation.js";

const bodies=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/waypoint-7945.json.gz",import.meta.url))).toString()) as Record<string,unknown>;
const A=parseGameState(bodies["22583"]),B=parseGameState(bodies["22641"]),RETURN=parseGameState(bodies["22689"]);
const goal={x:15,y:18,map_id:[24,11] as [number,number]};
const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
function harness(enabled:boolean,v2=true,reach=true,mode:"local"|"full"|"visited"="local"){
 let state=A,presses=0;
 const result=()=>({content:[{type:"text" as const,text:"Recorded observation"}],details:{state}});
 const press={name:"press",label:"Press",description:"Offline",parameters:{},execute:()=>{presses++;throw new Error("unexpected input");},executeChecked:()=>{presses++;throw new Error("unexpected input");}} as unknown as CheckedPressTool;
 const observe={name:"observe",label:"Observe",description:"Offline",parameters:{},execute:()=>Promise.resolve(result())} as unknown as AgentTool;
 const features={...flagFeatures(flags),"bounded-navigation-v1":true,"full-map-navigation-v1":mode==="full","visited-terrain-navigation-v1":mode==="visited","ledge-hops-v1":true,"one-way-tiles-v1":true,"walkable-floor-v1":true,"elevation-transitions-v1":true,"navigation-truth-v1":true,"navigation-refusal-reasons-v1":true,"navigation-refusal-reasons-v2":v2,"exit-reachability-v1":reach,"navigation-refusal-reasons-v3":enabled};
 const tools=withNavigation([observe,press],features,{read:()=>Promise.resolve(state)});
 const tool=tools.find(t=>t.name==="navigate_to");if(tool===undefined)throw new Error("no navigation tool");
 return {set:(s:GameStateSnapshot)=>{state=s;},presses:()=>presses,call:async(target=goal)=>{const r=await tool.execute("offline",target);return r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");}};
}
const OLD_PERSON="Navigation: (15,18) is BOY_2 (person or object), which navigate_to cannot stand on; none of its free neighbouring tiles can be reached inside the 15x15 local map navigate_to plans over, but this map's walkable area reaches (15,19) next to it, so the way there leaves that local map; walk to (8,24) on its west edge first, then call navigate_to (15,18) again; 0 ordinary button attempts.\nRecorded observation";
const OLD_TILE="Navigation: no route to (15,18) lies inside the 15x15 local map navigate_to plans over, so any route leaves it; reachable tiles on its edge, nearest (15,18) first: (15,23) on the east edge, (9,31) on the south edge; walk to one, then call navigate_to (15,18) again; 0 ordinary button attempts.\nRecorded observation";

describe("navigation-refusal-reasons-v3 recorded control7945",()=>{
 it("OFF preserves both exact recorded refusal strings through the production factory",async()=>{
  const h=harness(false);expect(await h.call()).toBe(OLD_PERSON);h.set(B);expect(await h.call()).toBe(OLD_TILE);expect(h.presses()).toBe(0);
 });
 it("ON labels all person frontiers exploratory, keeps the equally near east alternative, and avoids the recorded return",async()=>{
  const h=harness(true);const first=await h.call();expect(first).toContain("Exploratory local-map edge tiles (ordered by horizontal-plus-vertical grid distance to (15,18) only; no route beyond these tiles is verified)");expect(first).toContain("(8,24) on the west edge");expect(first).toContain("(22,24) on the east edge");expect(first).toContain("no route beyond these tiles is verified");expect(first).not.toContain("edge first, then call");
  h.set(B);await h.call({x:8,y:24,map_id:[24,11]});const second=await h.call();expect(second).toContain("(9,31) on the south edge");expect(second).not.toContain("(15,23) on the east edge");expect(second).toContain("previous refusal positions withheld");expect(h.presses()).toBe(0);
 });
 it("describes the actual Manhattan ordering even when Euclidean ordering differs",async()=>{
  const h=harness(true);const text=await h.call({x:11,y:16,map_id:[24,11]});
  expect(text).toContain("ordered by horizontal-plus-vertical grid distance to (11,16) only");
  expect(text).toContain("(8,24) on the west edge, (9,30) on the south edge, (22,24) on the east edge");
  expect(h.presses()).toBe(0);
 });
 it("fixes person advice even when the existing tile-refusal-v2 switch is OFF",async()=>{
  const h=harness(true,false);expect(await h.call()).toContain("Exploratory local-map edge tiles");
 });
 it("keeps state per navigation tool instance and clears it on an observed map transition",async()=>{
  const h=harness(true);await h.call();h.set(B);expect(await h.call()).not.toContain("(15,23) on the east edge");
  const other=harness(true);other.set(B);expect(await other.call()).toContain("(15,23) on the east edge");
  h.set({...B,map_id:[0,19]});await h.call({x:8,y:24,map_id:[0,19]});h.set(B);expect(await h.call()).toContain("(15,23) on the east edge");
 });
 it("does not claim that exhausted exploration proves the destination unreachable",async()=>{
  const h=harness(true);await h.call();h.set(B);await h.call();h.set(RETURN);const text=await h.call();expect(text).toContain("Exploratory local-map edge tiles");expect(text).not.toContain("cannot be reached on foot");
 });
});

import {WaypointAdvice,WAYPOINT_HISTORY_GOALS,WAYPOINT_HISTORY_ORIGINS} from "./navigation.js";
import {ALL_ON as RAW_PROGRESS_ALL_ON,SWITCHABLE_FEATURES,playHarnessFeatures} from "./features.js";
const ALL_ON={...RAW_PROGRESS_ALL_ON,"progress-aware-cycles-v1":false};
import {parsePlayPreset,presetFeatures} from "./play-preset.js";

describe("waypoint history lifetime and bounds",()=>{
 const choices:["RIGHT",{x:number;y:number}][]=[["RIGHT",{x:15,y:23}]];
 it("states exhaustion and absence honestly instead of offering a cycle",()=>{
  const h=new WaypointAdvice();h.line(A,goal,[]);const text=h.line(B,goal,choices);expect(text).toContain("all listed local-map edge choices are previous refusal positions");expect(text).not.toContain("cannot be reached");
  expect(h.line(B,{x:9,y:9},[])).toContain("no reachable exploratory local-map edge tile is listed");
 });
 it("evicts old goals using an injected one-goal bound",()=>{
  const h=new WaypointAdvice(1,2);h.line(A,goal,[]);h.line(B,{x:9,y:9},[]);expect(h.line(B,goal,choices)).toContain("(15,23) on the east edge");
 });
 it("evicts old origins using an injected one-origin bound",()=>{
  const h=new WaypointAdvice(2,1);h.line(A,goal,[]);expect(h.line(B,goal,choices)).toContain("(15,23) on the east edge");expect(WAYPOINT_HISTORY_GOALS).toBe(16);expect(WAYPOINT_HISTORY_ORIGINS).toBe(8);
 });
 it("clears an individual completed goal and clears all goals when map identity becomes unavailable",()=>{
  const h=new WaypointAdvice();h.line(A,goal,[]);h.complete(goal);expect(h.line(B,goal,choices)).toContain("(15,23) on the east edge");h.line(A,goal,[]);h.observeMap({map_id:null});expect(h.line(B,goal,choices)).toContain("(15,23) on the east edge");
 });
 it("allows a state with an unavailable position without inventing an origin",()=>{
  const h=new WaypointAdvice();expect(h.line({...B,position:null},goal,choices)).toContain("(15,23) on the east edge");
 });
 it("production navigation completion retires the original goal",async()=>{
  const h=harness(true);await h.call();h.set({...B,position:{x:15,y:18}});expect(await h.call()).toContain("arrived at requested coordinate");h.set(B);expect(await h.call()).toContain("(15,23) on the east edge");
 });
 it("appends metadata and keeps omitted/flag defaults OFF",()=>{
  const id="navigation-refusal-reasons-v3";expect(SWITCHABLE_FEATURES.at(-21)).toBe(id);expect(playHarnessFeatures(ALL_ON,null).at(-20)).toBe(id);expect(flagFeatures(flags)[id]).toBe(false);
  const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:10,maxWallMs:1000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:1000},features:flagFeatures(flags)});expect(presetFeatures(preset)[id]).toBe(false);
 });
});

for(const mode of ["full","visited"] as const)it(`v3 leaves ${mode} navigation refusal unchanged`,async()=>{
 const on=harness(true,true,true,mode),off=harness(false,true,true,mode);const state=parseGameState(bodies["full"]);on.set(state);off.set(state);
 const baseline=await off.call();expect(await on.call()).toBe(baseline);expect(baseline).not.toContain("Exploratory local-map edge tiles");expect(on.presses()).toBe(0);
});

import {parseExperiment,experimentArms} from "./experiments.js";
it("registers an unqueued experiment with one effective flag difference",()=>{
 const e=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/navigation-refusal-reasons-v3.json",import.meta.url),"utf8")));
 expect(e.queuePosition).toBeUndefined();expect(e.activationMilestone).toBe("PLAYER_NAME_CONFIRMED");
 const {incumbent,candidate}=experimentArms(e);expect(SWITCHABLE_FEATURES.filter(id=>id!=="progress-aware-cycles-v1"&&incumbent.features[id]!==candidate.features[id])).toEqual(["navigation-refusal-reasons-v3"]);
});

import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {parseEvent} from "./events.js";
import {RUN_START_META} from "../test-support/events.js";
it("records the exact new model-visible advice in an ordinary tool_result",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"waypoint-recorder-"));
 try{
  const log=RunLog.create(dir,"waypoint-v3-recording-proof");
  const recorder=new RunRecorder({log,frames:new FrameStore(dir,1000000,()=>undefined),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(A)}});
  await recorder.start({...RUN_START_META,harness_features:[...RUN_START_META.harness_features,"navigation-refusal-reasons-v3"]});
  const h=harness(true);const text=await h.call();const result={content:[{type:"text" as const,text}],details:{state:A}};
  await recorder.emit({type:"tool_execution_start",toolCallId:"recorded-advice",toolName:"navigate_to",args:goal});
  await recorder.emit({type:"tool_execution_end",toolCallId:"recorded-advice",toolName:"navigate_to",result,isError:false});
  const events=readFileSync(join(dir,"waypoint-v3-recording-proof/events.jsonl"),"utf8").trim().split("\n").map(l=>parseEvent(l));
  const rows=events.filter(e=>e.type==="tool_result"&&e.id==="recorded-advice");expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({type:"tool_result",text,name:"navigate_to"});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
