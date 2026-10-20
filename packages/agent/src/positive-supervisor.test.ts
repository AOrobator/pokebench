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
import {SupervisorBriefing,navigationSaid} from "./loop-supervisor.js";

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
 return {guards,briefings,held,at:(turn:number)=>briefings.filter(g=>g.turn===turn)};
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
- Your latest attempts: A facing tile at 22,12 ×3 → no change; navigate_to 21,12 → moved to 21,12; navigate_to 20,10 → moved to 16,10
- Choose a call other than A facing tile at 22,12: it gave the same result (no change) 3 times in a row.`);
  for(const g of on.briefings){
   expect(g.message.startsWith("SUPERVISOR: Make one tool call based on the game state and what you observed.")).toBe(true);
   for(const banned of ["looping","stalling","do not try","Ways off","Exits to maps","Latest recorded place instruction","Story goal"])expect(g.message).not.toContain(banned);
  }
  expect(on.briefings.filter(g=>g.kind==="milestone_drought"||g.kind==="map_cycle")).toEqual([]);
  // The retired drought briefing stays in the record as a diagnostic the model is not sent.
  expect(on.guards.filter(g=>g.turn===452).map(g=>[g.kind,"mode"in g?g.mode:null,g.phase,g.message])).toEqual([["milestone_drought","diagnostic","would_warn","Not sent (positive-supervisor-v1): No new story milestone for 5 minutes of play."]]);
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
 it("quotes navigate_to's own answer for a repeated walk",()=>{
  const on=replay({...RUN,[ID]:true});
  const note=on.at(417)[0]?.message??"";
  expect(note.split("\n").at(-1)).toMatch(/^- Choose a call other than navigate_to 10,4: it answered "no route to \(10,4\) lies inside the 15x15 local map navigate_to plans over.*" [0-9]+ times in a row\.$/);
  expect(navigationSaid("Screen\nNavigation: no supported local path; choose a reachable local waypoint; 0 ordinary button attempts.\nX")).toBe("no supported local path; choose a reachable local waypoint");
  expect(navigationSaid("Navigation: arrived at requested coordinate; 1 bounded movement actions.")).toBe("arrived at requested coordinate");
  expect(navigationSaid("pressed A")).toBeUndefined();
 });
 it("never lists a warp, whatever the readout names it",()=>{
  const b=new SupervisorBriefing({...RUN,[ID]:true});
  let state:Extract<RunEvent,{type:"state";started:boolean}>|undefined;
  for(const e of FIXTURE.events)if(e.type==="state"&&"started"in e&&e.started&&e.screen==="overworld"&&e.position!==null)state=e;
  if(state===undefined)throw new Error("fixture has no overworld state");
  const warp=(name:string|null,x:number)=>({kind:"warp",name,x,y:20,elevation:3,activation:"movement",availability:"live",facing:null,local_id:null,destination:[0,10,0] as [number,number,number]});
  const s1={...state,seq:900001,interaction_targets:[warp("Dynamic warp",1),warp("Warp to map 0/10",2),warp(null,3),...(state.interaction_targets??[]).filter(t=>t.kind!=="warp")]};
  for(const e of FIXTURE.events)b.observe(e);
  b.observe(s1);
  b.observe(checkEvent({v:1,run:state.run,seq:900002,t:state.t,turn:state.turn,type:"tool_result",id:"w",name:"observe",is_error:false,duration_ms:1,text:"Location: ROUTE103",frames:[],state_seq:s1.seq}));
  const note=b.text("ineffective",1);
  expect(note).toContain("- Shown here and not tried yet: ");
  for(const name of ["Dynamic warp","Warp to","warp at"])expect(note).not.toContain(name);
 });
 it("names a repeated attempt only when it repeated in a row with one result",()=>{
  let state:Extract<RunEvent,{type:"state";started:boolean}>|undefined;
  for(const e of FIXTURE.events)if(e.type==="state"&&"started"in e&&e.started&&e.screen==="overworld"&&e.position!==null&&!e.in_battle)state=e;
  if(state===undefined)throw new Error("fixture has no overworld state");
  const base=state;
  // The pending experiment's arm has briefing-exits-v1 off, so opening and closing a menu both read "no change".
  const b=new SupervisorBriefing({...RUN,[ID]:true,"briefing-exits-v1":false});
  let seq=900100;
  const stamp=(body:Record<string,unknown>)=>checkEvent({v:1,run:base.run,t:base.t,turn:base.turn,seq:++seq,...body});
  const press=(button:string)=>{
   const id=`p${String(seq)}`;
   b.observe(stamp({type:"tool_call",id,name:"press",args:{buttons:[button]}}));
   const before=stamp({...base,type:"state"});b.observe(before);
   b.observe(stamp({type:"button_press",tool_call_id:id,buttons:[button],before_state_seq:before.seq}));
   const after=stamp({...base,type:"state"});b.observe(after);
   b.observe(stamp({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[],state_seq:after.seq}));
  };
  const last=()=>b.text("ineffective",1).split("\n").at(-1)??"";
  press("A");press("B");press("A");
  expect(last()).not.toContain("Choose a call other than");
  press("A");
  expect(last()).toMatch(/^- Choose a call other than .*: it gave the same result \(no change\) 2 times in a row\.$/);
  // A press that opened or closed a field menu, or a battle in between, starts the count again.
  const menu={phase:"start_menu",ready:true,diagnostic:null,selected:"POKéDEX",value:null,controls:"A choose, B close",details:{}};
  const step=(button:string,before:Record<string,unknown>,after:Record<string,unknown>)=>{
   const id=`m${String(seq)}`;
   b.observe(stamp({type:"tool_call",id,name:"press",args:{buttons:[button]}}));
   const s0=stamp({...base,...before,type:"state"});b.observe(s0);
   b.observe(stamp({type:"button_press",tool_call_id:id,buttons:[button],before_state_seq:s0.seq}));
   const s1=stamp({...base,...after,type:"state"});b.observe(s1);
   b.observe(stamp({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"pressed",frames:[],state_seq:s1.seq}));
  };
  press("B");step("START",{},{active_ui:menu});step("START",{active_ui:menu},{});
  expect(last()).not.toContain("Choose a call other than");
  press("A");press("A");step("A",{},{screen:"battle",in_battle:true});press("A");
  expect(last()).not.toContain("Choose a call other than");
 });
});
