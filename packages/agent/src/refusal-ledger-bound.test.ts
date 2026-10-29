import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,featuresOf,playHarnessFeatures,dependencyProblems,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {contextTools} from "./play-wiring.js";
import {REFUSAL_LEDGER_CHARS,REFUSAL_TURNS_SHOWN,RefusalLedger} from "./refusal-ledger.js";

const ID="refusal-ledger-bound-v1";
const BASE:FeatureSet={...featuresOf([]),"story-state-v1":true,"disproved-beliefs-v1":true,"refusal-ledger-v1":true};
const OFF:FeatureSet={...BASE,[ID]:false};
const ON:FeatureSet={...BASE,[ID]:true};
const ROUTE={location:"ROUTE104",map_id:[0,19]};
// About 3,000 chars, like 9e33's water and wall refusals with their departure alternatives.
const reason=(x:number,y:number)=>`Navigation: (${String(x)},${String(y)}) is water, not a walkable tile; the nearest walkable tile navigate_to can reach is (15,58); Reachable departure alternatives (terrain facts; do not establish a route to (${String(x)},${String(y)})): ${"(10,38) -> PETALBURG WOODS (map 24/11) — southwest terrain section [12,6]. ".repeat(36)}`;

// One refused navigate_to per call: the player stays at (16,50) on ROUTE104.
function refusals(targets:readonly (readonly [number,number])[],why:(x:number,y:number)=>string=reason):RunEvent[] {
 const out:RunEvent[]=[];let seq=0;
 const ev=(body:Record<string,unknown>,turn:number):RunEvent=>{const e=checkEvent({v:1,run:"bound",t:"2026-10-28T00:00:00.000-04:00",turn,seq:++seq,...body});out.push(e);return e;};
 const state=(turn:number):RunEvent=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",...ROUTE,position:{x:16,y:50},facing:"left",in_battle:false,field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null}},turn);
 state(0);
 targets.forEach(([x,y],i)=>{
  const turn=i+1,id=`c${String(turn)}`;
  ev({type:"tool_call",id,name:"navigate_to",args:{x,y,map_id:[0,19]}},turn);
  const after=state(turn);
  ev({type:"tool_result",id,name:"navigate_to",is_error:false,duration_ms:1,text:`ok\n${why(x,y)}`,frames:[],state_seq:after.seq},turn);
 });
 return out;
}
function ledger(features:FeatureSet,targets:readonly (readonly [number,number])[],why?:(x:number,y:number)=>string):RefusalLedger {
 const l=new RefusalLedger(features);
 for(const e of refusals(targets,why))l.observe(e);
 return l;
}
const TEN=Array.from({length:10},(_,i)=>[20+i,60] as const);

describe("refusal-ledger-bound-v1: whole entries within the budget",()=>{
 it("OFF lists every entry, as today",()=>{
  const text=ledger(OFF,TEN).text()??"";
  expect(text.split("\n")).toHaveLength(11);
 });
 it("ON keeps whole entries, newest first, within the budget, in their usual order, and counts the rest",()=>{
  const on=ledger(ON,TEN).text()??"",off=ledger(OFF,TEN).text()??"";
  const [header,count,...kept]=on.split("\n");
  expect(header).toBe(off.split("\n")[0]);
  const m=/^(\d+) older refusal entries on this map are left out\.$/.exec(count??"");
  expect(m).not.toBeNull();
  expect(Number(m?.[1])+kept.length).toBe(10);
  expect(kept.at(-1)).toContain("Target (29,60)");
  expect(kept.join("\n").length).toBeLessThanOrEqual(REFUSAL_LEDGER_CHARS);
  expect(off.endsWith(kept.join("\n"))).toBe(true);
 });
 it("ON keeps the newest entry whole even when it alone is over the budget, and is byte-identical when nothing is left out",()=>{
  const two=ledger(ON,[[20,60],[21,60]]).text()??"";
  expect(two.split("\n")[1]).toBe("1 older refusal entry on this map is left out.");
  expect(two).toContain(reason(21,60));
  const one=(f:FeatureSet)=>ledger(f,[[20,60]]).text();
  expect(one(ON)).toBe(one(OFF));
 });
 it("ON shows the latest turns of a repeated refusal and counts the earlier ones",()=>{
  const same=Array.from({length:40},()=>[20,60] as const);
  const on=ledger(ON,same).text()??"",off=ledger(OFF,same).text()??"";
  expect(off).toContain(`40 times navigation returned this reason, at turns ${Array.from({length:40},(_,i)=>String(i+1)).join(", ")}. `);
  expect(on).toContain(`40 times navigation returned this reason, at turns ${Array.from({length:REFUSAL_TURNS_SHOWN},(_,i)=>String(41-REFUSAL_TURNS_SHOWN+i)).join(", ")} (and ${String(40-REFUSAL_TURNS_SHOWN)} earlier turns). `);
  expect(ledger(ON,Array.from({length:REFUSAL_TURNS_SHOWN+1},()=>[20,60] as const)).text()).toContain("(and 1 earlier turn). ");
  const few=Array.from({length:REFUSAL_TURNS_SHOWN},()=>[20,60] as const);
  expect(ledger(ON,few).text()).toBe(ledger(OFF,few).text());
 });
});

describe("refusal-ledger-bound-v1: code points and the production context",()=>{
 it("counts code points, not UTF-16 units: two astral entries that fit by code points both stay",()=>{
  const astral=(x:number,y:number)=>`Navigation: (${String(x)},${String(y)}) is water, not a walkable tile; ${"😀".repeat(1500)}`;
  const text=ledger(ON,[[20,60],[21,60]],astral).text()??"";
  expect(text).not.toContain("left out");
  expect(text).toContain("Target (20,60)");
 });
 // contextTools is what the agent loop builds; the switch must reach the ledger it constructs.
 const delivered=async(features:FeatureSet)=>{
  const subs:((e:RunEvent)=>void)[]=[];const bodies:{text:string|null}[]=[];
  const context=contextTools(features,{subscribe:fn=>{subs.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:()=>undefined,recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:body=>{bodies.push(body);}},m=>Promise.resolve(m));
  for(const e of refusals(TEN))for(const fn of subs)fn(e);
  await context.transformContext([{role:"user",content:"Play.",timestamp:0}]);
  return bodies.at(-1)?.text??"";
 };
 it("contextTools delivers the bounded history only when the switch is on",async()=>{
  expect(await delivered(ON)).toMatch(/\n\d+ older refusal entries on this map are left out\.\n/);
  expect(await delivered(OFF)).not.toContain("left out");
  expect(await delivered(OFF)).toContain("Target (20,60)");
 });
});

describe("refusal-ledger-bound-v1 registry",()=>{
 it("is registered after neutral-yes-no-readout-v1, default off, needs the refusal ledger, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(299);
  expect(featureInfo(ID)).toMatchObject({needs:"refusal-ledger-v1"});
  expect(featureInfo(ID).description).toContain(" Off: every entry and every turn is listed.");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"refusal-ledger-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
});
