import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import type {LoopNotice} from "./loop-detection.js";

const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/navigation-recovery-loop.json.gz",import.meta.url))).toString("utf8")) as {events:unknown[];seed:unknown[]};
const recorded=fixture.events.map(checkEvent);
function rig(on:boolean,configured?:FeatureSet){
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:1000,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard({subscribe:fn=>{subscribers.push(fn);},recordLoopGuard:n=>notices.push(n)},governor,undefined,"enforced",false,()=>"generic supervisor",false,false,false,false,false,false,false,false,false,false,false,false,configured??{...LEGACY_ALL_ON,"navigation-recovery-v1":on});
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 const replay=(from:number,to:number)=>{if(from===252)for(const e of fixture.seed.map(checkEvent))emit(e);for(const e of recorded.filter(e=>e.turn>=from&&e.turn<=to)){
  if(e.type==="loop_guard"&&e.kind==="map_cycle")detector.stall("map_cycle",()=>e.message,e.evidence);
  else emit(e);
  if(e.type==="tool_result"||e.type==="loop_guard")detector.context();
 }};
 return {notices,governor,detector,emit,replay};
}
describe("navigation-recovery-v1 production recorded windows",()=>{
 it("leaves OFF map-cycle feedback as the previous one-call note",()=>{
  const r=rig(false);r.replay(252,256);expect(r.notices.filter(n=>n.kind==="map_cycle").map(n=>n.phase)).toEqual(["supervisor"]);expect(r.detector.context()).toBe(null);
 });
 it("warns after two stale-map no-input requests with the actual current map",()=>{
  const r=rig(true);r.replay(172,174);
  expect(r.notices.at(-1)).toMatchObject({kind:"rejection",phase:"warning",evidence:[4019,4030]});
  expect(r.detector.context()).toContain("Current map: 0/10");expect(r.detector.context()).toContain("NORTH");
 });
 it("bounds the recorded stale-map refusal window despite the generic supervisor",()=>{
  const r=rig(true);r.replay(172,191);expect(r.governor.stopReason).toBe("stuck");expect(r.notices.at(-1)?.phase).toBe("stop");
 });
 it("keeps cycle feedback active after the recorded south/north backtrack without blocking its inputs",()=>{
  const r=rig(true);r.replay(252,257);
  expect(r.detector.context()).toContain("NAVIGATION RECOVERY");expect(r.notices.filter(n=>n.kind==="map_cycle").map(n=>n.phase)).toEqual(["warning"]);
  expect(r.governor.stopReason).toBe(null);
 });
});

import {NavigationRecovery,NAVIGATION_RECOVERY_CALLS} from "./loop/navigation-recovery.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
const oldale=recorded.find(e=>e.type==="state"&&e.seq===6857);
const body=(event:unknown):GameStateSnapshot=>parseGameState(Object.fromEntries(Object.entries(event as Record<string,unknown>).filter(([k])=>!["v","run","seq","t","type","turn"].includes(k))));
const field=body(oldale);
const state=(patch:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...field,...patch});
function direct(mode:"enforced"|"diagnostic"="enforced"){
 const notices:LoopNotice[]=[];const recovery=new NavigationRecovery(n=>notices.push(n),mode);recovery.state(field);return {recovery,notices};
}
const call=(s:GameStateSnapshot|undefined,patch:Partial<import("./loop/types.js").CompletedCall>={})=>({name:"observe",args:{},isError:false,text:"",state:s,seq:100,...patch});
describe("navigation recovery preserves evidence-based backtracking",()=>{
 it("never starts an episode for an ordinary valid out-and-back trip",()=>{
  const r=direct();const other=state({map_id:[0,16]});
  r.recovery.complete(call(other,{name:"navigate_to_target",args:{map_id:[0,10]},beforeState:field,acted:true}),1);r.recovery.state(other);
  r.recovery.complete(call(field,{name:"navigate_to_target",args:{map_id:[0,16]},beforeState:other,acted:true}),2);
  expect(r.notices).toEqual([]);expect(r.recovery.active).toBe(false);
 });
 it("retains a cycle across visited detours, rotation and unknown readouts, then stops boundedly",()=>{
  const r=direct();r.recovery.state(state({map_id:[0,16]}));r.recovery.state(field);r.recovery.cycle("recorded cycle",[10,20],2);r.recovery.context();
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.recovery.complete(call(i%2?undefined:state({map_id:[0,16],position:{x:5,y:5}})),i+3);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","stop"]);expect(r.recovery.stopped).toBe(true);
 });
 it("does not charge battle/menu decisions to the field recovery budget",()=>{
  const r=direct();r.recovery.cycle("cycle",[1],1);r.recovery.context();
  for(let i=0;i<30;i++)r.recovery.complete(call(state({in_battle:true})),i);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);expect(r.recovery.stopped).toBe(false);
 });
 it("retires only on qualified new-map evidence, not a missing position or target selection",()=>{
  const r=direct();r.recovery.cycle("cycle",[1],1);r.recovery.context();
  r.recovery.complete(call(state({map_id:[99,2],position:null})),2);expect(r.recovery.active).toBe(true);
  r.recovery.complete(call(state({map_id:[99,2]})),3);expect(r.notices.at(-1)?.phase).toBe("recovered");expect(r.recovery.context()).toBe(null);
 });
 it("native story progress permits returning through all previously visited maps",()=>{
  const r=direct();r.recovery.cycle("cycle",[1],1);r.recovery.context();r.recovery.progress(11,3);
  expect(r.notices.at(-1)?.phase).toBe("recovered");expect(r.recovery.active).toBe(false);
 });
 it("requires feedback delivery before charging the recovery budget",()=>{
  const r=direct();r.recovery.cycle("cycle",[1],1);
  for(let i=0;i<20;i++)r.recovery.complete(call(field),i);
  expect(r.notices).toHaveLength(1);
 });
 it("retains stale-map recovery until a valid current-map navigation actually acts",()=>{
  const r=direct();const mismatch=call(field,{name:"navigate_to_target",args:{map_id:[0,16]},acted:false});
  r.recovery.complete(mismatch,1);r.recovery.complete(mismatch,2);r.recovery.context();
  r.recovery.complete(call(field),3);expect(r.recovery.active).toBe(true);
  r.recovery.complete(call(field,{name:"navigate_to_target",args:{map_id:[0,10]},beforeState:field,acted:true}),4);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
 });
 it("does not join stale requests across different qualified current maps",()=>{
  const r=direct();r.recovery.complete(call(field,{name:"navigate_to_target",args:{map_id:[0,16]},acted:false}),1);
  r.recovery.complete(call(state({map_id:[99,2]}),{name:"navigate_to_target",args:{map_id:[0,16]},acted:false}),2);expect(r.notices).toEqual([]);
 });
 it("diagnostic mode records without exposing recovery text or stopping",()=>{
  const r=direct("diagnostic");r.recovery.cycle("cycle",[1],1);expect(r.recovery.context()).toBe(null);expect(r.notices[0]?.phase).toBe("would_warn");
 });
});
it("keeps the complete second window active through the already-visited mart detour",()=>{
 const r=rig(true);r.replay(252,261);expect(r.detector.context()).toContain("NAVIGATION RECOVERY");expect(r.notices.filter(n=>n.kind==="map_cycle").map(n=>n.phase)).toEqual(["warning"]);
});

import {featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {parseExperiment,experimentArms} from "./experiments.js";
it("is default OFF, separately receipted and has a pending single-switch experiment",()=>{
 const id="navigation-recovery-v1";
 expect(normalizeFeatures({} as FeatureSet)[id]).toBe(false);expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 expect(featureInfo(id)).toMatchObject({group:"guard",needs:null});expect(featureInfo(id).description).toContain(" Off: ");
 expect(playHarnessFeatures({...LEGACY_ALL_ON,[id]:true},null)).toEqual([...playHarnessFeatures(LEGACY_ALL_ON,null),id]);
 const e=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/navigation-recovery-v1.json",import.meta.url),"utf8")));
 expect(e.queuePosition).toBeUndefined();const {incumbent,candidate}=experimentArms(e);expect(candidate.features).toEqual({...incumbent.features,[id]:true});expect(incumbent.features[id]).toBe(false);
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  const f=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(f.base.features[id]).toBe(false);expect(f.switches).toContain(id);
 }
});
it("does not suppress the menu-refusal guard while a navigation cycle is open",()=>{
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:1000,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard({subscribe:fn=>{subscribers.push(fn);},recordLoopGuard:n=>notices.push(n)},governor,undefined,"enforced",false,()=>"generic",false,false,false,false,false,false,false,false,false,false,false,false,{"navigation-recovery-v1":true,"menu-refusal-recovery-v1":true});
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 for(const e of fixture.seed.map(checkEvent))emit(e);
 for(const e of recorded.filter(e=>e.turn>=252&&e.turn<=255)){if(e.type!=="loop_guard")emit(e);}
 detector.stall("map_cycle",()=>"Recorded map cycle",[6857]);detector.context();
 const menu=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/menu-refusal-loop.json.gz",import.meta.url))).toString("utf8")) as {events:unknown[]};
 for(const e of menu.events.map(checkEvent).filter(e=>e.turn===262||e.turn===263)){emit(e);if(e.type==="tool_result")detector.context();}
 expect(notices.filter(n=>n.phase==="warning").map(n=>n.kind)).toEqual(["map_cycle","rejection"]);
 expect(detector.context()).toContain("Shop menu open");expect(governor.stopReason).toBe(null);
});
it("updates current-map feedback after backtracking and never offers unsupported exits",()=>{
 const r=direct();r.recovery.state(state({map_id:[0,16]}));r.recovery.state(field);r.recovery.cycle("cycle",[1],1);
 const reach=field.exit_reach;if(reach===undefined)throw Error("fixture has no exit reach");const next=state({map_id:[0,16],exit_reach:{...reach,connections:reach.connections.map(c=>({...c,reach:"none" as const}))}});
 r.recovery.state(next);r.recovery.complete(call(next),2);
 expect(r.recovery.context()).toContain("Current map: 0/16");expect(r.recovery.context()).toContain("none qualified");
 r.recovery.unavailable();expect(r.recovery.context()).toContain("Current map unavailable");
});
it("bounds the second recorded window if known-map decisions keep repeating after the warning",()=>{
 const r=rig(true);r.replay(252,257);
 for(let i=0;i<12;i++){r.detector.context();r.detector.complete(call(field,{seq:10000+i}));}
 expect(r.governor.stopReason).toBe("stuck");expect(r.notices.at(-1)).toMatchObject({kind:"map_cycle",phase:"stop"});
});

import {playTools} from "./play-config.js";
import {dependencyProblems} from "./features.js";
for(const [v1,v2]of [[false,false],[true,false],[false,true]]as const)it(`only suggests semantic targets when offered (${String(v1)}/${String(v2)})`,()=>{
 const e=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/navigation-recovery-v1.json",import.meta.url),"utf8")));
 const f={...experimentArms(e).candidate.features,"exit-reachability-v1":true,"semantic-navigation-v1":v1,"semantic-navigation-v2":v2};
 expect(dependencyProblems(f)).toEqual([]);const r=rig(true,f);r.replay(252,255);const feedback=r.detector.context();
 expect(feedback).toContain("NORTH");expect(feedback?.includes("navigate_to_target")).toBe(playTools(f).includes("navigate_to_target"));
});
