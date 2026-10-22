import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf} from "./features.js";
import {stallBriefing} from "./play-wiring.js";
import {STALL_DROUGHT_MS} from "./stall-briefing.js";
import type {LoopNotice} from "./loop-detection.js";
// 47c3 source events 18000..22000 plus run_start. Optional state keys unrelated to
// map/training facts removed; native identities, levels, EXP, flags and seq retained.
const recorded=gunzipSync(readFileSync(new URL("../test-support/frontier-training-47c3.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line) as unknown));
describe("October 22 productive-training audit on current source",()=>{
 it("current milestone reset already prevents the cited 47c3 stale map-cycle warning",()=>{
  const start=recorded[0];if(start?.type!=="run_start")throw new Error("fixture start");
  const features=featuresOf(start.harness_features),subscribers:((e:RunEvent)=>void)[]=[],sent:{at:number;kind:string}[]=[];let at=0,now=0;
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:()=>undefined,recordStallGate:()=>undefined};
  // Stub only delivery: exercise the production stallBriefing factory and its native-event observer.
  stallBriefing(features,recorder,{stall:(kind)=>{sent.push({at,kind});return true;}},{pausedMs:()=>0},()=>now);
  for(const e of recorded){at=e.seq;now=Date.parse(e.t)-Date.parse(start.t);for(const fn of subscribers)fn(e);}
  expect(recorded.find(e=>e.seq===21974)).toMatchObject({type:"loop_guard",kind:"map_cycle",phase:"supervisor"});
  expect(recorded.find(e=>e.seq===20481)).toMatchObject({type:"milestone",name:"RUSTBORO_GYM_TRAINER_MARC_DEFEATED"});
  expect(sent.filter(n=>n.kind==="map_cycle")).toEqual([]);
 });
});

const droughts=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/frontier-training-droughts.json.gz",import.meta.url))).toString("utf8")) as {source:string;start:unknown;state:unknown;result:unknown;warning:unknown}[];
for(const row of droughts)it(`${row.source}: existing drought suppression keeps the cited native observation without a drought instruction`,()=>{
 const start=checkEvent(row.start);if(start.type!=="run_start")throw new Error("fixture start");
 const state=checkEvent(row.state),result=checkEvent(row.result),warning=checkEvent(row.warning);
 expect(warning).toMatchObject({type:"loop_guard",kind:"milestone_drought",phase:"supervisor"});
 const run=(on:boolean)=>{
  const observers:((e:RunEvent)=>void)[]=[],sent:string[]=[],notes:LoopNotice[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notes.push(n);},recordStallGate:()=>undefined};
  // Due-timer rehearsal isolates suppression using actual recorded native state and result.
  const features={...featuresOf(start.harness_features),"milestone-drought-suppression-v1":on,"positive-supervisor-v1":false,"drought-battle-heal-hold-v1":false};
  stallBriefing(features,recorder,{stall:(kind)=>{sent.push(kind);return true;}},{pausedMs:()=>0},()=>STALL_DROUGHT_MS+1);
  for(const e of [state,result])for(const observer of observers)observer(e);
  return {sent,notes};
 };
 expect(run(false).sent).toContain("milestone_drought");
 expect(run(true).sent).not.toContain("milestone_drought");
 expect(run(true).notes.some(n=>n.mode==="diagnostic"&&n.message.includes("milestone-drought-suppression-v1"))).toBe(true);
});
