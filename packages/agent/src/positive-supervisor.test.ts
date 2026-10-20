import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,type FeatureSet} from "./features.js";
import {attachLoopGuard,Governor} from "./harness.js";
import type {LoopNotice} from "./loop-detection.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {loopSupervisor,stallBriefing} from "./play-wiring.js";
import {SupervisorBriefing} from "./loop-supervisor.js";

const ID="positive-supervisor-v1";
interface Fixture {readonly source:string;readonly events:readonly RunEvent[]}
// Real events of run 2026-10-20T03-02-13_qwen36-gpu1_f28d (the fixture's source line says which).
const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/stall-gate-f28d.json.gz",import.meta.url))).toString("utf8")) as Fixture;
const RUN:FeatureSet=featuresOf(FIXTURE.events.flatMap(e=>e.type==="run_start"?e.harness_features:[]));
type Guard=Extract<RunEvent,{type:"loop_guard"}>;
type Held=Extract<RunEvent,{type:"stall_gate"}>;

// The recorder's fan-out, the real loop guard and supervisor, and the production stall factory, over the recorded stream.
function replay(features:FeatureSet){
 const subscribers:((e:RunEvent)=>void)[]=[];const guards:Guard[]=[];const held:Held[]=[];
 let current:RunEvent=FIXTURE.events[0] as RunEvent;
 const stamp=(body:Record<string,unknown>)=>({v:1,run:current.run,seq:current.seq,t:current.t,turn:current.turn,...body});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{guards.push(checkEvent(stamp({type:"loop_guard",...n,evidence:[...n.evidence]})) as Guard);},recordStallGate:(b:Omit<Held,"v"|"run"|"seq"|"t"|"turn"|"type">)=>{held.push(checkEvent(stamp({type:"stall_gate",...b})) as Held);}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder),features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],features["ineffective-loops-v1"],features["battle-menu-loop-v1"],features["clock-view-loop-v1"],features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"]);
 const t0=Date.parse(current.t);
 stallBriefing(features,recorder,detector,{pausedMs:()=>0},()=>Date.parse(current.t)-t0);
 for(const e of FIXTURE.events){
  if(e.type==="loop_guard"||e.type==="text_only_supervisor"||e.type==="stall_gate")continue;
  current=e;
  if(e.type==="turn_start")detector.context();
  for(const s of subscribers)s(e);
 }
 const briefings=guards.filter(g=>g.phase==="supervisor");
 return {briefings,held,at:(turn:number)=>briefings.filter(g=>g.turn===turn)};
}

describe("registry and presets",()=>{
 it("registers a default-off guidance switch after the stall gate, with an exact OFF",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"POSITIVE SUPERVISOR"});
  expect(featureInfo(ID).description).toContain(" Off: the supervisors' notes are byte-for-byte today's.");
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("story-character-stall-gate-v1")+1);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,[ID]:true})).not.toContain(`${ID} needs`);
 });
 it("defaults off for presets that omit it and for legacy flag presets",()=>{
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

describe("positive-supervisor-v1 on run f28d, Route 103 with MAY at (10,3)",()=>{
 it("OFF sends the recorded notes; ON sends the instruction, MAY, the untried targets and the attempts, and no drought briefing",()=>{
  const off=replay({...RUN,[ID]:false});
  expect(off.at(450)[0]?.message).toContain("SUPERVISOR: You are currently looping.");
  expect(off.at(452).map(g=>g.kind)).toEqual(["milestone_drought"]);
  const on=replay({...RUN,[ID]:true});
  expect(on.at(450)[0]?.message).toBe(`SUPERVISOR: Make one tool call based on the game state and what you observed. The game state has not changed after your recent calls (the same input with no effect).
- Where you are: ROUTE103 (map 0/18) at 21,12 facing right
- Story characters on this map you have not talked to since your last story milestone: MAY at 10,3 (out of view; where the map places this character, it may have moved)
- Shown here and not tried yet: BOY_1 at 19,11 (A); Sign text "ROUTE 103 | ↓ OLDALE TOWN" at 11,9 (A)
- Your latest attempts: A facing tile at 22,12 ×3 → no change; navigate_to 21,12 → moved to 21,12; navigate_to 20,10 → moved to 16,10`);
  for(const g of on.briefings){
   expect(g.message.startsWith("SUPERVISOR: Make one tool call based on the game state and what you observed.")).toBe(true);
   for(const banned of ["looping","stalling","do not try","Ways off","Exits to maps","Latest recorded place instruction","Story goal"])expect(g.message).not.toContain(banned);
  }
  expect(on.briefings.filter(g=>g.kind==="milestone_drought"||g.kind==="map_cycle")).toEqual([]);
 });
 it("rewrites the text-only and interface-dwell notes the same way",()=>{
  const b=new SupervisorBriefing({...RUN,[ID]:true});
  for(const e of FIXTURE.events)b.observe(e);
  const note=b.textOnly(3,1,3);
  expect(note.split("\n").slice(0,2)).toEqual(["SUPERVISOR: Make one tool call based on the game state and what you observed. Your last 3 replies called no tool.","- Where you are: ROUTE103 (map 0/18) in battle at 12,13"]);
  expect(note).not.toContain("the run ends");
  expect(b.stallText({kind:"interface_dwell",name:"party menu interface",calls:30},9).split("\n")[0]).toBe("SUPERVISOR: Make one tool call based on the game state and what you observed. You have made 30 calls in the party menu interface.");
  expect(b.textOnly(1,1,3).split("\n")[0]).toBe("SUPERVISOR: Make one tool call based on the game state and what you observed. Your last 1 reply called no tool.");
 });
});
