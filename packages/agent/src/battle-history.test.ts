import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {BattleActionHistory} from "./battle-action-history.js";
import {contextTools} from "./play-wiring.js";

const EVENTS=gunzipSync(readFileSync(new URL("./fixtures/battle-history-7030.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
const before:AgentMessage[]=[{role:"user",content:"Play the game.",timestamp:0}];
const features=(over:Partial<FeatureSet>={}):FeatureSet=>({...featuresOf([]),"leader-loss-comparison-v1":true,...over});
const setup=(on:Partial<FeatureSet>)=>{
 const listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordLedgerContext:(n:{text:string;evidence:number[]})=>notes.push(n),recordNavigationContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:()=>undefined};
 const wired=contextTools(features(on),recorder,m=>Promise.resolve(m));
 const emit=(e:RunEvent)=>{for(const f of listeners)f(e);};
 const feed=(upto:number)=>{for(const e of EVENTS)if(e.seq<=upto)emit(e);};
 return {wired,feed,notes,listeners,emit};
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

const eventAt=(seq:number):RunEvent=>{const e=EVENTS.find(e=>e.seq===seq);if(e===undefined)throw new Error(`missing ${String(seq)}`);return structuredClone(e);};
it("requires a successful current-state receipt and consumes immediate context only after an assistant decision",async()=>{
 const s=setup({"leader-loss-immediate-v1":true});s.feed(1742);expect(await s.wired.transformContext(before)).toBe(before);
 const receipt=eventAt(1744);if(receipt.type!=="tool_result")throw new Error("fixture receipt");
 s.emit({...receipt,is_error:true});expect(await s.wired.transformContext(before)).toBe(before);
 s.emit({...receipt,state_seq:1});expect(await s.wired.transformContext(before)).toBe(before);
 s.emit(receipt);expect(last(await s.wired.transformContext(before))).toContain("Last observed loss");
 expect(last(await s.wired.transformContext(before))).toContain("Last observed loss");
 s.emit(checkEvent({v:receipt.v,run:receipt.run,t:receipt.t,turn:receipt.turn,type:"assistant",seq:1745,thinking:"",text:"Choose freely",tool_calls:[],stop_reason:"stop",usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null}));
 expect(await s.wired.transformContext(before)).toBe(before);
});
it("incomplete identities produce unknown preparation comparisons, never unchanged EXP or moves",async()=>{
 const s=setup({"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true});s.feed(1744);
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("fixture");
 s.emit({...state,seq:1746,party:state.party.map(p=>({...p,identity:null})),resources:null});s.emit({...receipt,seq:1747,state_seq:1746});
 const out=last(await s.wired.transformContext(before));expect(out).toContain("comparison unknown");expect(out).toContain("BAG quantities: unknown");expect(out).not.toContain("EXP unchanged");
});
it("evolution, EXP and moves compare by native identity without treating a species change as a new party member",async()=>{
 const s=setup({"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true});s.feed(1744);
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("fixture");
 s.emit({...state,seq:1746,party:state.party.map(p=>({...p,species:"COMBUSKEN",level:16,experience:2600,moves:null}))});s.emit({...receipt,seq:1747,state_seq:1746});
 const out=last(await s.wired.transformContext(before));expect(out).toContain("membership unchanged");expect(out).toContain("TORCHIC → COMBUSKEN");expect(out).toContain("2041 → 2600");expect(out).toContain("moves unknown");
});

it("held-out4637 critical-hit and burn pages keep the move's player/foe side",async()=>{
 const events=gunzipSync(readFileSync(new URL("./fixtures/battle-history-4637.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
 for(const [through,expected]of [[5762,"Player move page: A critical hit!"],[5966,"Player move page: A critical hit!"],[6256,"Foe move page: A critical hit!"]] as const){
  const s=setup({"battle-action-history-v1":true});for(const e of events)if(e.seq<=through)s.emit(e);
  const out=last(await s.wired.transformContext(before));expect(out).toContain(expected);expect(out).toContain("attribution to individual moves is unknown");
  if(through===5762)expect(out).toContain("burn");
 }
});

it("evicts whole oldest action intervals with small injected limits and preserves complete remaining source evidence",()=>{
 const history=new BattleActionHistory({intervals:2,memory:64,pages:8,sources:8});for(const e of EVENTS)history.observe(e);
 const context=history.context();expect(context).not.toBeNull();expect(context?.text).not.toContain("33/33 → 31/33 (net -2)");expect(context?.text).toContain("31/33 → 30/33 (net -1)");expect(context?.evidence.length).toBeLessThanOrEqual(8);expect(history.context(0)).toBeNull();expect(history.context(4)?.evidence.length).toBeLessThanOrEqual(4);
 const bounded=new BattleActionHistory({intervals:2,memory:64,pages:8,sources:4});for(const e of EVENTS)bounded.observe(e);expect(bounded.context()?.evidence.length).toBeLessThanOrEqual(4);
});
it("failed and stale action receipts do not publish pending pages",()=>{
 const pages=eventAt(2064),receipt=eventAt(2066);if(receipt.type!=="tool_result")throw new Error("receipt");
 for(const bad of [{...receipt,is_error:true},{...receipt,state_seq:1}]){
  const history=new BattleActionHistory();history.observe(eventAt(2063));history.observe(pages);history.observe(eventAt(2065));history.observe(bad);expect(history.context()).toBeNull();
 }
});

it("appends the three registered switches in order with independent default-OFF and declared dependencies",async()=>{
 const {SWITCHABLE_FEATURES,ALL_ON,playHarnessFeatures,dependencyProblems}=await import("./features.js");
 const {normalizeFeatures,flagFeatures}=await import("./play-preset.js");
 const ids=["leader-loss-immediate-v1","battle-action-history-v1","leader-preparation-comparison-v1"] as const;
 expect(SWITCHABLE_FEATURES.slice(-3)).toEqual(ids);expect(playHarnessFeatures(ALL_ON,null).slice(-3)).toEqual(ids);
 const omitted=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>!ids.includes(id as typeof ids[number]))) as Parameters<typeof normalizeFeatures>[0];
 for(const id of ids){expect(normalizeFeatures(omitted)[id]).toBe(false);expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[id]).toBe(false);}
 expect(dependencyProblems({...features(),"leader-loss-comparison-v1":false,"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true})).toEqual(["leader-loss-immediate-v1 needs leader-loss-comparison-v1","leader-preparation-comparison-v1 needs leader-loss-comparison-v1"]);
});
it("compact tool comparison uses the latest completed attempt even when it won, rather than reusing an older loss",()=>{
 const s=setup({"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true});s.feed(1744);
 const start=EVENTS.find(e=>e.type==="state"&&"started"in e&&e.trainer_opponent?.battle_active===true&&e.battle?.outcome==="ongoing"),end=eventAt(1742);
 if(start?.type!=="state"||!("started"in start)||start.battle==null||end.type!=="state"||!("started"in end))throw new Error("native attempt states");
 s.emit({...start,seq:10000});s.emit({...start,seq:10001,battle:{...start.battle,outcome:"won"}});s.emit({...end,seq:10002,location:"RUSTBORO CITY GYM"});
 const text=s.wired.training?.block({...end,location:"RUSTBORO CITY GYM"});expect(text).toContain("attempt (won; battle-start state 10000, completion state 10002");expect(text).not.toContain("Last observed loss");expect(text).not.toContain("Moves at battle start:");
});

it("changed battler identity or HP limit prevents a damage delta while retaining delivered actions",()=>{
 const after=eventAt(2065);if(after.type!=="state"||!("started"in after)||after.battle?.battlers==null)throw new Error("battle");
 for(const change of ["identity","max_hp"] as const){
  const h=new BattleActionHistory();for(const e of EVENTS)if(e.seq>=2000&&e.seq<=2064)h.observe(e);
  h.observe({...after,battle:{...after.battle,battlers:after.battle.battlers.map(b=>b.position%2===1?{...b,...(change==="identity"?{identity:"synthetic-switched-member"}:{max_hp:99})}:b)}});h.observe(eventAt(2066));
  expect(h.context()?.text).toContain("Player TORCHIC used SCRATCH");expect(h.context()?.text).not.toContain("33/33 → 31/33 (net -2)");expect(h.context()?.text).toContain("no comparable HP delta");
 }
});
