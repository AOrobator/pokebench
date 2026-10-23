import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import type {LoopNotice} from "./loop-detection.js";
import {featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";

const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/menu-refusal-loop.json.gz",import.meta.url))).toString("utf8")) as {source:{run:string};events:unknown[]};
const recorded=fixture.events.map(checkEvent);
const features=(on:boolean):FeatureSet=>({...LEGACY_ALL_ON,"menu-refusal-recovery-v1":on});
function rig(on:boolean,mode:"enforced"|"diagnostic"="enforced",oldBattle=true){
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>notices.push(n)};
 const detector=attachLoopGuard(recorder,governor,undefined,mode,false,()=>"SUPERVISOR: generic briefing",false,false,false,false,false,false,false,false,false,oldBattle,false,false,features(on));
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 const replay=(from:number,to:number)=>{for(const e of recorded.filter(e=>e.turn>=from&&e.turn<=to)){emit(e);if(e.type==="tool_result")detector.context();}};
 return {notices,governor,detector,emit,replay};
}
describe("menu-refusal-recovery-v1 recorded Pokemart loop",()=>{
 it("keeps the old OFF behavior byte-for-byte with the historical refusal switch on",()=>{
  const r=rig(false);r.replay(262,287);expect(r.notices).toEqual([]);expect(r.governor.stopReason).toBe(null);
 });
 it("warns after two no-button calls with current menu controls and exact evidence, even without the battle guard",()=>{
  const r=rig(true,"enforced",false);r.replay(262,263);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);
  expect(r.notices[0]).toMatchObject({kind:"rejection",evidence:[7072,7086]});
  expect(r.detector.context()).toContain("No battle is active. Shop menu open; selected BUY. B quits this menu.");
  expect(r.detector.context()).not.toContain("generic briefing");
 });
 it("stops after six delivered recovery calls instead of rebriefing forever",()=>{
  const r=rig(true);r.replay(262,287);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","stop"]);
  expect(r.notices[1]).toMatchObject({calls:8});
  expect(r.governor.stopReason).toBe("stuck");expect(r.detector.stopped).toBe(true);
 });
 it("retires on the recorded B close, without injecting any game input",()=>{
  const r=rig(true);r.replay(262,263);r.replay(288,288);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
  expect(r.detector.context()).toBe(null);expect(r.governor.stopReason).toBe(null);
 });
 it("diagnoses without stopping or delivering a recovery instruction in diagnostic mode",()=>{
  const r=rig(true,"diagnostic");r.replay(262,287);
  expect(r.notices[0]).toMatchObject({phase:"would_warn",mode:"diagnostic"});
  expect(r.detector.context()).toBe(null);expect(r.governor.stopReason).toBe(null);
 });
});

it("registers an omitted/default OFF switch and includes only enabled run receipts",()=>{
 expect(featureInfo("menu-refusal-recovery-v1")).toMatchObject({group:"guard",needs:null});
 const { ["menu-refusal-recovery-v1"]: _omitted,...old}=features(false);
 expect(_omitted).toBe(false);
 const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...old,"state-only-decisions-v1":false}});
 expect(presetFeatures(preset)["menu-refusal-recovery-v1"]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["menu-refusal-recovery-v1"]).toBe(false);
 expect(playHarnessFeatures(features(false),null)).not.toContain("menu-refusal-recovery-v1");
 expect(playHarnessFeatures(features(true),null)).toContain("menu-refusal-recovery-v1");
 for(const file of ["live.ts","decision-probe.ts"]){
  const source=readFileSync(new URL(`./${file}`,import.meta.url),"utf8");
  expect(source.slice(source.indexOf("attachLoopGuard("),source.indexOf("attachLoopGuard(")+1200)).toContain('features["same-target-no-progress-v1"],features)');
 }
});

const shop=recorded.find((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started"in e&&e.turn===262);

function changed(e:RunEvent,patch:Record<string,unknown>):RunEvent{return checkEvent({...e,...patch});}
for(const [name,patch] of [
 ["not ready",{active_ui:{...shop?.active_ui,ready:false}}],
 ["unqualified owner",{active_ui:{...shop?.active_ui,diagnostic:"owner unavailable"}}],
 ["missing UI",{active_ui:null}],
 ["battle mismatch",{in_battle:true}],
 ["not started",{started:false}],
] as const)it(`does not warn from ${name}`,()=>{
 const r=rig(true);for(const e of recorded.filter(e=>e.turn===262||e.turn===263))r.emit(e.type==="state"?changed(e,patch):e);
 expect(r.notices).toEqual([]);
});
for(const [name,patch] of [
 ["stale state reference",{state_seq:7057}],
 ["infrastructure error",{is_error:true}],
 ["successful action",{text:"Battle action: selected RUN."}],
] as const)it(`does not warn from ${name}`,()=>{
 const r=rig(true);for(const e of recorded.filter(e=>e.turn===262||e.turn===263))r.emit(e.type==="tool_result"?changed(e,patch):e);
 expect(r.notices).toEqual([]);
});
it("does not retire a menu warning on an unknown lock or unchanged observation",()=>{
 const r=rig(true);r.replay(262,263);
 for(const e of recorded.filter(e=>e.turn===264)){
  r.emit(e.type==="state"?changed(e,{active_ui:null,field_controls_locked:true}):e.type==="tool_call"||e.type==="tool_result"?changed(e,{name:"observe"}):e);
 }
 expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);
 r.replay(265,265);expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);
});
it("a native selection change is new menu information, not another identical refusal",()=>{
 const r=rig(true);r.replay(262,263);for(const e of recorded.filter(e=>e.turn===264))r.emit(e.type==="state"?changed(e,{active_ui:{...shop?.active_ui,selected:"SELL"}}):e);
 expect(r.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
});
it("does not classify a battle refusal that actually sent a button",()=>{
 const r=rig(true);const button=recorded.find(e=>e.type==="button_press");if(button===undefined)throw Error("missing recorded button");
 for(const e of recorded.filter(e=>e.turn===262||e.turn===263)){r.emit(changed(e,{seq:e.seq*2,...(e.type==="tool_result"?{state_seq:(e.state_seq??0)*2}:{})}));if(e.type==="tool_call")r.emit(changed(button,{seq:e.seq*2+1,tool_call_id:e.id}));}
 expect(r.notices).toEqual([]);
});
