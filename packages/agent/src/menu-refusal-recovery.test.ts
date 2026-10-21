import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import type {LoopNotice} from "./loop-detection.js";
import type {FeatureSet} from "./features.js";

const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/menu-refusal-loop.json.gz",import.meta.url))).toString("utf8")) as {source:{run:string};events:unknown[]};
const recorded=fixture.events.map(checkEvent);
const features=(on:boolean):FeatureSet=>({...LEGACY_ALL_ON,"menu-refusal-recovery-v1":on});
function rig(on:boolean,mode:"enforced"|"diagnostic"="enforced"){
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>notices.push(n)};
 const detector=attachLoopGuard(recorder,governor,undefined,mode,false,()=>"SUPERVISOR: generic briefing",false,false,false,false,false,false,false,false,false,false,false,false,features(on));
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 const replay=(from:number,to:number)=>{for(const e of recorded.filter(e=>e.turn>=from&&e.turn<=to)){emit(e);if(e.type==="tool_result")detector.context();}};
 return {notices,governor,detector,emit,replay};
}
describe("menu-refusal-recovery-v1 recorded Pokemart loop",()=>{
 it("keeps the old OFF behavior byte-for-byte with the historical refusal switch on",()=>{
  const r=rig(false);r.replay(262,287);expect(r.notices).toEqual([]);expect(r.governor.stopReason).toBe(null);
 });
 it("warns after two no-button calls with current menu controls and exact evidence, even without the battle guard",()=>{
  const r=rig(true);r.replay(262,263);
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
