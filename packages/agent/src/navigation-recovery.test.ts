import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import type {LoopNotice} from "./loop-detection.js";

const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/navigation-recovery-loop.json.gz",import.meta.url))).toString("utf8")) as {events:unknown[]};
const recorded=fixture.events.map(checkEvent);
function rig(on:boolean){
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:1000,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard({subscribe:fn=>{subscribers.push(fn);},recordLoopGuard:n=>notices.push(n)},governor,undefined,"enforced",false,()=>"generic supervisor",false,false,false,false,false,false,false,false,false,false,false,false,{...LEGACY_ALL_ON,"navigation-recovery-v1":on});
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 const replay=(from:number,to:number)=>{for(const e of recorded.filter(e=>e.turn>=from&&e.turn<=to)){
  if(e.type==="loop_guard"&&e.kind==="map_cycle")detector.stall("map_cycle",()=>e.message,e.evidence??[]);
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
