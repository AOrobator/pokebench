import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {checkEvent,parseEvent,type RunEvent} from "./events.js";
import {attachLoopGuard,Governor} from "./harness.js";
import type {LoopNotice} from "./loop-detection.js";
import {featureInfo,playHarnessFeatures,dependencyProblems,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {loopSupervisor,stallBriefing} from "./play-wiring.js";
import {NavigationRecovery,NAVIGATION_RECOVERY_CALLS} from "./loop/navigation-recovery.js";
import {StallBriefing} from "./stall-briefing.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {CompletedCall} from "./loop/types.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {IN_GAME} from "../test-support/events.js";

const ID="map-cycle-recovery-v1";
// Run 2026-10-22T15-43-35_qwen36-gpu1_7c9f (gym-rustboro-torchic bundle arm): navigation-recovery-v1 warned at #2840
// (turn 56) and stopped the run at #3415 (turn 68) on PETALBURG CITY, every walkable exit already taken.
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/map-cycle-recovery-7c9f.json.gz",import.meta.url))).toString("utf8")) as {features:Record<string,boolean>;events:unknown[]};
const recorded=fixture.events.map(checkEvent);
const recordedStop=recorded.find((e):e is Extract<RunEvent,{type:"loop_guard"}>=>e.type==="loop_guard"&&e.kind==="map_cycle"&&e.phase==="stop");

export const BRIEFING_7C9F=[
 "NAVIGATION RECOVERY BRIEFING: The repeated map cycle was not resolved within 12 calls. The run continues instead of stopping, and the map-cycle count starts again from here. Backtracking is allowed. No destination is selected for you.",
 "Where you are: PETALBURG CITY (map 0/0) — southeast terrain section [4,5], position 17,20.",
 "Maps visited since your last native story progress (visits): PETALBURG CITY (map 0/0) 10; PETALBURG CITY (map 8/4) 3; RUSTBORO CITY GYM (map 11/3) 1; ROUTE 104 (map 0/19) 1; ROUTE 102 (map 0/17) 1; PETALBURG CITY (map 8/2) 1; PETALBURG CITY (map 8/0) 1; PETALBURG CITY (map 8/3) 1; PETALBURG CITY (map 8/6) 1; PETALBURG CITY GYM (map 8/1) 1; PETALBURG CITY (map 8/5) 1.",
 "Walking exits of this map you have not left by since your last native story progress: none (since then you have left this map by every exit you can walk to from here).",
 "If the maps cycle again before new story progress, the NAVIGATION RECOVERY note returns. Each unresolved window produces another briefing; this guard never ends the run.",
].join("\n");

function recordedFeatures(on:boolean):FeatureSet {
 return {...normalizeFeatures(fixture.features as FeatureSet),[ID]:on};
}

// The live.ts loop-guard wiring with the recorded run's own switches.
function rig(on:boolean){
 const features=recordedFeatures(on);
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:1000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard({subscribe:fn=>{subscribers.push(fn);},recordLoopGuard:n=>notices.push(n)},governor,undefined,"enforced",features["interaction-loop-detection-v1"],()=>"generic supervisor",features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],features["ineffective-loops-v1"],features["battle-menu-loop-v1"],features["clock-view-loop-v1"],features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"],features["same-target-no-progress-v1"],features);
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 // The recorded map-cycle warning came from stall-briefing-v1; it is handed to the guard the way that wiring does.
 const replay=()=>{for(const e of recorded){
  if(e.type==="loop_guard"){if(e.kind==="map_cycle"&&e.phase==="warning"){detector.stall("map_cycle",()=>e.message,e.evidence);detector.context();}continue;}
  emit(e);
  if(e.type==="tool_result")detector.context();
 }};
 return {notices,governor,detector,replay,features};
}
const mapCycle=(notices:readonly LoopNotice[])=>notices.filter(n=>n.kind==="map_cycle");

describe("map-cycle-recovery-v1 on the recorded 7c9f window",()=>{
 it("OFF keeps the simple navigation briefing instead of detailed history",()=>{
  const r=rig(false);r.replay();
  expect(mapCycle(r.notices).map(n=>n.phase)).toEqual(["warning","supervisor"]);
  expect(mapCycle(r.notices).at(-1)).toMatchObject({evidence:recordedStop?.evidence,calls:recordedStop?.calls});
  expect(r.governor.stopReason).toBe(null);expect(r.detector.stopped).toBe(false);
 });
 it("ON briefs instead of stopping, with the exact briefing the model is shown",()=>{
  const r=rig(true);r.replay();
  expect(dependencyProblems(r.features)).toEqual([]);
  expect(mapCycle(r.notices).map(n=>n.phase)).toEqual(["warning","supervisor"]);
  const note=mapCycle(r.notices).at(-1);
  expect(note).toMatchObject({mode:"enforced",phase:"supervisor",evidence:recordedStop?.evidence,calls:recordedStop?.calls});
  expect(note?.message).toBe(BRIEFING_7C9F);
  expect(r.governor.stopReason).toBe(null);expect(r.detector.stopped).toBe(false);
  // The replay's last model call after the briefing shows it; the recorded event carries the same bytes.
  expect(r.detector.context()).toBe(BRIEFING_7C9F);
  expect(()=>parseEvent(JSON.stringify({v:1,run:"r",seq:1,t:"2026-10-22T15:59:18.603-04:00",turn:68,type:"loop_guard",...note,evidence:[...(note?.evidence??[])]}))).not.toThrow();
 });
 it("ON names no unvisited place and chooses no destination",()=>{
  for(const line of BRIEFING_7C9F.split("\n").slice(2))for(const name of ["PETALBURG WOODS","RUSTBORO CITY (map 0/3)","ROUTE 116","GRANITE"])expect(line).not.toContain(name);
  expect(BRIEFING_7C9F).toContain("No destination is selected for you.");
 });
 it("ON briefs again on a second map cycle",()=>{
  const r=rig(true);r.replay();
  const field=latestField();
  r.detector.context();r.detector.complete(call(field,{seq:20000}));
  expect(r.detector.context()).toBe(null);
  expect(r.detector.stall("map_cycle",()=>"second cycle",[20001])).toBe(true);
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++){r.detector.context();r.detector.complete(call(field,{seq:20002+i}));}
  expect(mapCycle(r.notices).map(n=>n.phase)).toEqual(["warning","supervisor","warning","supervisor"]);
  expect(mapCycle(r.notices).at(-1)?.message).toContain("run continues");
  expect(r.governor.stopReason).toBe(null);
 });
 it("ON refuses a new stall note while the briefing waits for delivery",()=>{
  const r=rig(true);r.replay();
  expect(r.detector.stall("milestone_drought",()=>"drought",[20000])).toBe(false);
 });
});

const latestState=recorded.filter(e=>e.type==="state"&&"started" in e&&e.started&&e.screen==="overworld").at(-1);
const body=(event:unknown):GameStateSnapshot=>parseGameState(Object.fromEntries(Object.entries(event as Record<string,unknown>).filter(([k])=>!["v","run","seq","t","type","turn"].includes(k))));
function latestField():GameStateSnapshot {return body(latestState);}
const call=(s:GameStateSnapshot|undefined,patch:Partial<CompletedCall>={}):CompletedCall=>({name:"observe",args:{},isError:false,text:"",state:s,seq:100,...patch});
// Validate the unchanged recorded base once; each synthetic state still gets
// its own validation and object, without repeating the full base validation.
const atBase=body(latestState);
const at=(map:[number,number],extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...atBase,map_id:map,exit_reach:undefined,exit_sections:undefined,...extra});

describe("NavigationRecovery map-cycle briefing",()=>{
 function direct(on:boolean,semantic=false){
  const notices:LoopNotice[]=[];const recovery=new NavigationRecovery(n=>notices.push(n),"enforced",semantic,on);return {recovery,notices};
 }
 function exhaust(r:ReturnType<typeof direct>,s:GameStateSnapshot,from=0){
  r.recovery.cycle("cycle",[1],1);r.recovery.context();
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.recovery.complete(call(s,{seq:from+i}),from+i);
 }
 it("OFF keeps a simple nonterminal briefing at the budget",()=>{
  const r=direct(false);const s=at([0,0]);r.recovery.state(s);exhaust(r,s);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);expect(r.recovery.stopped).toBe(false);expect(r.recovery.mapCycleWindow()).toBe(0);
 });
 it("ON briefs once, shows it until one call completes, and advances the cycle window",()=>{
  const r=direct(true);const s=at([0,0]);r.recovery.state(s);exhaust(r,s);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);expect(r.recovery.stopped).toBe(false);
  expect(r.recovery.mapCycleWindow()).toBe(1);expect(r.recovery.active).toBe(true);
  const text=r.recovery.context();expect(text).toBe(r.notices[1]?.message);expect(r.recovery.context()).toBe(text);
  r.recovery.complete(call(s),50);expect(r.recovery.context()).toBe(null);expect(r.recovery.active).toBe(false);
 });
 const warpTarget=(x:number,y:number,map:[number,number])=>({kind:"warp",x,y,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[map[0],map[1],0] as [number,number,number],name:`Warp to map ${String(map[0])}/${String(map[1])}`});
 const foot={width:1,height:1,rows:["8"]};
 // TOWN 0/0, 10x10: doors (2,3) and (6,3) both lead to 8/2; doors (9,9) and (1,8) have no destination read; (4,4) is not on foot.
 function town(x:number,y:number,edges=true):GameStateSnapshot {
  return at([0,0],{position:{x,y},
   exit_reach:{warps:[{x:2,y:3,reach:"foot"},{x:4,y:4,reach:"none"},{x:6,y:3,reach:"foot"},{x:9,y:9,reach:"foot"},{x:1,y:8,reach:"foot"}],connections:[{direction:"WEST",destination:[0,19],offset:0,reach:"foot"},{direction:"EAST",destination:[0,17],offset:0,reach:"foot"}],foot},
   interaction_targets:[warpTarget(2,3,[8,2]),warpTarget(6,3,[8,2])],
   topology:{width:10,height:10,connections:[{direction:"WEST",offset:0,destination:[0,19],destination_name:"ROUTE",...(edges?{edges:[{x:0,y:5}]}:{})},{direction:"EAST",offset:0,destination:[0,17],destination_name:"ROUTE",...(edges?{edges:[{x:9,y:5}]}:{})}]},
   exit_sections:{current:"TOWN (map 0/0) — west terrain section [1,1]",warps:[],connections:[]}});
 }
 it("ON lists visits and the exact exits not left by, naming only visited maps",()=>{
  const r=direct(true,true);
  r.recovery.state(town(5,6));
  r.recovery.state(town(9,5));r.recovery.state(at([0,17],{exit_sections:{current:"ROUTE 102 (map 0/17) — east terrain section [2,2]",warps:[],connections:[]}}));
  r.recovery.state(town(5,6));r.recovery.state(town(2,3));r.recovery.state(at([8,2]));
  r.recovery.state(town(5,6));r.recovery.state(town(9,9));r.recovery.state(at([8,9]));
  const here=town(5,6);r.recovery.state(here);
  exhaust(r,here);
  const text=r.notices.at(-1)?.message??"";
  expect(text).toContain("Where you are: TOWN (map 0/0) — west terrain section [1,1], position 5,6.");
  expect(text).toContain("(visits): TOWN (map 0/0) 4; ROUTE 102 (map 0/17) 1; map 8/2 1; map 8/9 1.");
  // Two doors to 8/2, one used: the other is still listed. A used door whose destination was never read is not listed.
  expect(text).toContain(`Walking exits of this map you have not left by since your last native story progress: (6,3) -> map 8/2 [navigate_to_target {"map_id":[0,0],"target":{"kind":"warp","x":6,"y":3}}]; (1,8) -> destination not read [navigate_to_target {"map_id":[0,0],"target":{"kind":"warp","x":1,"y":8}}]; WEST edge -> map 0/19 [navigate_to_target {"map_id":[0,0],"target":{"kind":"connection","direction":"WEST"}}].\n`);
  expect(text).not.toContain("EAST edge");expect(text).not.toContain("(4,4)");expect(text).not.toContain("(2,3)");expect(text).not.toContain("(9,9)");
  expect(text).not.toContain("were not matched");
 });
 it("ON matches a border departure without edge tiles and says when a departure matched no exit",()=>{
  const r=direct(true);
  r.recovery.state(town(5,6,false));r.recovery.state(town(0,4,false));r.recovery.state(at([0,19]));
  r.recovery.state(town(5,6,false));r.recovery.state(at([7,7]));
  r.recovery.state(town(0,0,false));r.recovery.state(at([7,8]));
  for(let i=0;i<2;i++){r.recovery.state(town(5,5,false));r.recovery.state(at([7,9]));}
  const here=town(5,6,false);r.recovery.state(here);exhaust(r,here);
  const text=r.notices.at(-1)?.message??"";
  expect(text).not.toContain("WEST edge");expect(text).toContain("EAST edge -> map 0/17");
  expect(text).toContain(". 3 departures from this map since then were not matched to an exit, so an exit listed here may have been used.");
  const one=direct(true);one.recovery.state(town(5,6,false));one.recovery.state(at([7,7]));const back=town(5,6,false);one.recovery.state(back);exhaust(one,back);
  expect(one.notices.at(-1)?.message).toContain(". One departure from this map since then was not matched to an exit, so an exit listed here may have been used.");
  // One entry per map: TOWN plus the four maps returned from at a position that is not an exit there.
  expect(r.recovery.historySize()).toMatchObject({exits:1,unmatched:5});expect(r.recovery.historySize().visits).toBe(5);
 });
 it("keeps no history OFF, and ON keeps one entry per map however many states arrive",()=>{
  const ids=Array.from({length:150},(_,i)=>[Math.floor(i/50),i%50] as [number,number]);
  for(const on of [false,true]){
   const r=direct(on);
   for(let lap=0;lap<2;lap++)for(const id of ids)r.recovery.state(at(id,{position:{x:3,y:3},exit_sections:{current:`MAP (map ${id.join("/")})`,warps:[],connections:[]}}));
   const size=r.recovery.historySize();
   if(!on)expect(size).toEqual({visits:0,exits:0,unmatched:0,labels:0});
   else{expect(size.visits).toBe(150);expect(size.labels).toBe(150);expect(size.unmatched).toBeLessThanOrEqual(150);expect(size.exits).toBe(0);}
  }
 });
 it("ON without exit reachability or a map says what is unknown",()=>{
  const r=direct(true);const s=at([0,0]);r.recovery.state(s);exhaust(r,s);
  expect(r.notices.at(-1)?.message).toContain("Walking exits of this map you have not left by since your last native story progress: unknown (exit reachability was not read for this map).");
  expect(r.notices.at(-1)?.message).toContain("Where you are: map 0/0, position");
  const u=direct(true);u.recovery.state(s);u.recovery.cycle("cycle",[1],1);u.recovery.context();u.recovery.unavailable();
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)u.recovery.complete(call(undefined,{seq:i}),i);
  expect(u.notices.at(-1)?.message).toContain("Where you are: unavailable.");
 });
 it("ON briefs when the budget runs out again before new story progress",()=>{
  const r=direct(true);const s=at([0,0]);r.recovery.state(s);exhaust(r,s);r.recovery.context();r.recovery.complete(call(s),40);
  exhaust(r,s,100);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","supervisor","warning","supervisor"]);expect(r.recovery.stopped).toBe(false);
 });
 it("ON native story progress re-arms the briefing and resets the visit counts",()=>{
  const r=direct(true);const s=at([0,0]);r.recovery.state(s);exhaust(r,s);r.recovery.context();r.recovery.complete(call(s),40);
  r.recovery.progress(60,20);
  exhaust(r,s,100);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","supervisor","warning","supervisor"]);expect(r.recovery.stopped).toBe(false);
  expect(r.notices.at(-1)?.message).toContain("(visits): map 0/0 1.");
  expect(r.recovery.mapCycleWindow()).toBe(2);
 });
 it("ON story progress drops an undelivered briefing",()=>{
  const r=direct(true);const s=at([0,0]);r.recovery.state(s);exhaust(r,s);r.recovery.progress(60,20);
  expect(r.recovery.context()).toBe(null);expect(r.recovery.active).toBe(false);
 });
 it("ON leaves stale-map rejection nonterminal",()=>{
  const r=direct(true);const s=at([0,10]);r.recovery.state(s);
  const mismatch=call(s,{name:"navigate_to_target",args:{map_id:[0,16]},acted:false});
  r.recovery.complete(mismatch,1);r.recovery.complete(mismatch,2);r.recovery.context();
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.recovery.complete(call(s),10+i);
  expect(r.notices.map(n=>[n.kind,n.phase])).toEqual([["rejection","warning"],["rejection","supervisor"]]);expect(r.recovery.stopped).toBe(false);
 });
});

// A production-shaped stall run: the real loop guard plus the stall-briefing factory live.ts calls.
const HOUSE_1F={location:"HOUSE 1F",map_id:[1,0]};
const HOUSE_2F={location:"HOUSE 2F",map_id:[1,1]};
const LOADING={location:null,map_id:null};
function stallRig(on:boolean){
 const features:FeatureSet={...LEGACY_ALL_ON,"next-milestone-hint-v1":false,"same-plan-breaker-v1":false,"briefing-exits-v1":false,"loop-guard-supervisor-v1":true,"stall-briefing-v1":true,"navigation-recovery-v1":true,[ID]:on};
 const observers:((e:RunEvent)=>void)[]=[];const events:RunEvent[]=[];
 let seq=0,turn=0,clock=0,call=0,stateSeq=0,x=1;
 const emit=(b:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"mcr",t:"2026-10-22T16:30:00.000-04:00",turn,seq:++seq,...b});events.push(e);for(const o of observers)o(e);return e;};
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);},recordStallGate:()=>undefined,recordLoopGuard:(n:LoopNotice)=>{emit({type:"loop_guard",...n,evidence:[...n.evidence]});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>clock});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder),false,false,false,false,false,false,false,false,false,false,false,false,features);
 stallBriefing(features,recorder,detector,{pausedMs:()=>0},()=>clock);
 const state=(extra:Record<string,unknown>):RunEvent=>{const e=emit({type:"state",...IN_GAME,started:true,screen:"overworld",...HOUSE_1F,position:{x,y:3},facing:"up",field_controls_locked:false,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null},...extra});stateSeq=e.seq;return e;};
 const press=(after:Record<string,unknown>,before:Record<string,unknown>[]=[]):void=>{
  clock+=10_000;turn++;x++;
  emit({type:"turn_start",context:{messages:1,images:0,est_tokens:10}});
  detector.context();
  const id=`c${String(++call)}`;
  emit({type:"tool_call",id,name:"press",args:{buttons:["LEFT"]}});
  emit({type:"button_press",tool_call_id:id,buttons:["LEFT"],before_state_seq:stateSeq});
  for(const extra of before)state(extra);
  const s=state({...after,position:{x,y:3}});
  emit({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq});
 };
 const move=(to:Record<string,unknown>)=>{press(to,[LOADING]);};
 const guards=()=>events.filter((e):e is Extract<RunEvent,{type:"loop_guard"}>=>e.type==="loop_guard"&&e.kind==="map_cycle");
 return {press,move,state,guards,governor,detector};
}

describe("map-cycle-recovery-v1 through the stall-briefing wiring",()=>{
 it("ON resets the map-pair count at the briefing; OFF keeps counting",()=>{
  for(const on of [false,true]){
   const r=stallRig(on);r.state(HOUSE_1F);
   r.move(HOUSE_2F);r.move(HOUSE_1F);r.move(HOUSE_2F);r.move(HOUSE_1F);
   expect(r.guards().map(g=>g.phase)).toEqual(["warning"]);
   for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.press(HOUSE_1F);
   expect(r.guards().map(g=>g.phase)).toEqual(on?["warning","supervisor"]:["warning","supervisor"]);
   if(!on){expect(r.governor.stopReason).toBe(null);continue;}
   const brief=r.guards().at(-1);
   expect(brief?.message).toContain("(visits): map 1/0 3; map 1/1 2.");
   r.press(HOUSE_1F);
   // Three moves after the reset: below the two round trips a fresh cycle needs.
   r.move(HOUSE_2F);r.move(HOUSE_1F);r.move(HOUSE_2F);
   expect(r.guards().map(g=>g.phase)).toEqual(["warning","supervisor"]);
   r.move(HOUSE_1F);
   expect(r.guards().map(g=>g.phase)).toEqual(["warning","supervisor","warning"]);
   for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.press(HOUSE_1F);
   expect(r.guards().map(g=>g.phase)).toEqual(["warning","supervisor","warning","supervisor"]);
   expect(r.governor.stopReason).toBe(null);
  }
 });
 it("StallBriefing without the switch ignores the cycle window",()=>{
  const calls:string[]=[];let window=0;
  const detector={stall:(kind:string)=>{calls.push(kind);return true;},mapCycleWindow:()=>window};
  for(const on of [false,true]){
   calls.length=0;window=0;
   const features:FeatureSet={...LEGACY_ALL_ON,"stall-briefing-v1":true,"positive-supervisor-v1":false,"progress-aware-cycles-v1":false,"story-character-stall-gate-v1":false,[ID]:on,"navigation-recovery-v1":on};
   const b=new StallBriefing(features,()=>0,detector,()=>"note");
   let seq=0;const st=(m:typeof HOUSE_1F)=>{b.observe(checkEvent({v:1,run:"s",seq:++seq,t:"2026-10-22T16:30:00.000-04:00",turn:1,type:"state",...IN_GAME,started:true,screen:"overworld",...m,position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null}}));b.observe(checkEvent({v:1,run:"s",seq:++seq,t:"2026-10-22T16:30:00.000-04:00",turn:1,type:"tool_result",id:"x",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));};
   st(HOUSE_1F);st(HOUSE_2F);st(HOUSE_1F);st(HOUSE_2F);
   window=1;
   st(HOUSE_1F);
   expect(calls,String(on)).toEqual(on?[]:["map_cycle"]);
  }
 });
});

describe("registry, presets and experiment",()=>{
 it("is default OFF, needs navigation-recovery-v1 and appends to the harness list",()=>{
  expect(normalizeFeatures({} as FeatureSet)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"navigation-recovery-v1"});expect(featureInfo(ID).description).toContain(" Off: ");
  const base={...LEGACY_ALL_ON,"navigation-recovery-v1":true};
  expect(playHarnessFeatures({...base,[ID]:true},null)).toEqual([...playHarnessFeatures(base,null),ID]);
  expect(dependencyProblems({...LEGACY_ALL_ON,[ID]:true})).toContain(`${ID} needs navigation-recovery-v1`);
 });

 it("is on in the bundle arm of every current recipe whose bundle runs navigation-recovery-v1, and nowhere else",()=>{
  const on=[["bundle-v-control",116],["bundle-cook-1h",114],["whole-map-cook-1h",114],["whole-map-pair-2h",53],["bundle-v-control-2h",56],["gym-rustboro-torchic",49]] as const;
  for(const [name,index] of on){
   const f=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[];offInBoth:string[]};
   expect(f.base.features[ID],name).toBe(false);expect(f.switches.at(index),name).toBe(ID);expect(f.switches,name).toContain("navigation-recovery-v1");
   expect(f.onInBoth,name).not.toContain(ID);expect(f.offInBoth,name).not.toContain(ID);
  }
  const glm=JSON.parse(readFileSync(new URL("../../../experiments/fixed/glm53-flash-4h.json",import.meta.url),"utf8")) as {switches:string[]};
  expect(glm.switches).not.toContain(ID);
 });
});
