import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {contextTools} from "./play-wiring.js";

const EVENTS=gunzipSync(readFileSync(new URL("./fixtures/battle-history-7030.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
const before:AgentMessage[]=[{role:"user",content:"Play the game.",timestamp:0}];
const features=(over:Partial<FeatureSet>={}):FeatureSet=>({...featuresOf([]),"leader-loss-comparison-v1":true,...over});
const setup=(on:Partial<FeatureSet>)=>{
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordLedgerContext:(n:{text:string;evidence:number[]})=>notes.push(n),recordNavigationContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:()=>undefined};
 const wired=contextTools(features(on),recorder,m=>Promise.resolve(m));
 const feed=(upto:number)=>{for(const e of EVENTS)if(e.seq<=upto)for(const f of listeners)f(e);};
 return {wired,feed,notes,listeners};
};
const last=(m:AgentMessage[])=>m.at(-1)?.content;
describe("native battle history delivery",()=>{
 it("OFF preserves the original request reference and has no extra subscription",async()=>{
  const s=setup({});s.feed(1744);expect(await s.wired.transformContext(before)).toBe(before);expect(s.listeners).toHaveLength(0);
 });
 it("delivers the last-loss comparison outside the gym before the next post-loss choice",async()=>{
  const s=setup({"leader-loss-immediate-v1":true});s.feed(1744);
  const out=await s.wired.transformContext(before);
  expect(last(out)).toContain("Last observed loss to GYM LEADER ROXANNE");
  expect(last(out)).toContain("EXP: unchanged");expect(last(out)).toContain("moves: unchanged");
  expect(before).toHaveLength(1);expect(s.notes).toHaveLength(1);expect(s.notes[0]?.evidence).toContain(1744);
 });
 it("retains separate player/foe actions and observed net HP changes, not model damage guesses",async()=>{
  const s=setup({"battle-action-history-v1":true});s.feed(2171);
  const out=await s.wired.transformContext(before);
  expect(last(out)).toContain("Player TORCHIC used SCRATCH");
  expect(last(out)).toContain("Foe GEODUDE used DEFENSE CURL");
  expect(last(out)).toContain("33/33 → 31/33 (net -2)");
  expect(last(out)).toContain("31/33 → 30/33 (net -1)");
  expect(last(out)).toContain("Foe GEODUDE used ROCK TOMB");
  expect(last(out)).not.toContain("Scratch base damage is around 12");
 });
 it("compact comparison labels the last completed attempt and distinguishes unchanged EXP from full HP",async()=>{
  const s=setup({"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true});s.feed(1744);
  const out=await s.wired.transformContext(before);
  expect(last(out)).toContain("Preparation since last completed ROXANNE attempt");
  expect(last(out)).toContain("EXP unchanged");expect(last(out)).toContain("HP");
  expect(last(out)).not.toContain("Moves at battle start:");
 });
});
