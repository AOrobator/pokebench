import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,type FeatureSet} from "./features.js";
import {BattleActionHistory,BATTLE_HISTORY_CONTEXT_CHARS} from "./battle-action-history.js";
import {contextTools} from "./play-wiring.js";

const EVENTS=gunzipSync(readFileSync(new URL("./fixtures/battle-history-7030.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
const before:AgentMessage[]=[{role:"user",content:"Play the game.",timestamp:0}];
const features=(over:Partial<FeatureSet>={}):FeatureSet=>({...featuresOf([]),"leader-loss-comparison-v1":true,...over});
const setup=(on:Partial<FeatureSet>)=>{
 const restorations:boolean[]=[],listeners:((e:RunEvent)=>void)[]=[],notes:{text:string;evidence:number[]}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void,_milestones?:boolean,_latest?:boolean,restored=false)=>{listeners.push(fn);restorations.push(restored);},recordLedgerContext:(n:{text:string;evidence:number[]})=>notes.push(n),recordNavigationContext:()=>undefined,recordMilestoneHint:()=>undefined,recordBeliefLedger:()=>undefined,recordLoopBreaker:()=>undefined};
 const wired=contextTools(features(on),recorder,m=>Promise.resolve(m));
 const emit=(e:RunEvent)=>{for(const f of listeners)f(e);};
 const feed=(upto:number)=>{for(const e of EVENTS)if(e.seq<=upto)emit(e);};
 return {wired,feed,notes,listeners,restorations,emit};
};
const last=(m:AgentMessage[])=>m.at(-1)?.content;
describe("native battle history delivery",()=>{
 it("OFF preserves the original request reference and has no extra subscription",async()=>{
  const s=setup({});s.feed(1744);expect(await s.wired.transformContext(before)).toBe(before);expect(s.listeners).toHaveLength(0);
 });
 it("uses the production restoration-aware recorder for the shared history owner",()=>{
  const s=setup({"leader-loss-immediate-v1":true});expect(s.listeners).toHaveLength(1);expect(s.restorations).toEqual([true]);
 });
 it("delivers the last-loss comparison outside the gym before the next post-loss choice",async()=>{
  const s=setup({"leader-loss-immediate-v1":true});s.feed(1744);
  const out=await s.wired.transformContext(before);
  expect(last(out)).toContain("Last observed loss to GYM LEADER ROXANNE");
  expect(last(out)).toContain("EXP: unchanged");expect(last(out)).toContain("moves: unchanged");
  expect(before).toHaveLength(1);expect(s.notes).toHaveLength(1);expect(s.notes[0]?.evidence).toContain(1744);
 });
 it("retains separate player/foe actions and observed net HP changes, not model damage guesses",async()=>{
  const s=setup({"battle-action-history-v1":true,"leader-loss-comparison-v1":false});s.feed(2171);
  const out=await s.wired.transformContext(before);
  expect(last(out)).toContain("Player TORCHIC used SCRATCH");
  expect(last(out)).toContain("Foe GEODUDE used DEFENSE CURL");
  expect(last(out)).toContain("33/33 → 31/33 (net -2)");
  expect(last(out)).toContain("31/33 → 30/33 (net -1)");
  expect(last(out)).toContain("30/33 → 29/33 (net -1)");expect(last(out)).toContain("19/41 → 0/41 (net -19)");expect(last(out)).toContain("HP endpoint 2161 (last delivered battle-page snapshot; final observation 2169)");
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
 const reply={v:receipt.v,run:receipt.run,t:receipt.t,turn:receipt.turn,type:"assistant",seq:1745,thinking:"",text:"Choose freely",tool_calls:[],stop_reason:"stop",usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null};
 for(const failed of [{...reply,stop_reason:"aborted"},{...reply,seq:1746,stop_reason:"error"},{...reply,seq:1747,error:"transport failure"}]){s.emit(checkEvent(failed));expect(last(await s.wired.transformContext(before))).toContain("Last observed loss");}
 s.emit(checkEvent({...reply,seq:1748}));
 expect(await s.wired.transformContext(before)).toBe(before);
});
it.each(["party","bag"] as const)("keeps a verified pending loss available when a later call in the same batch ends on %s",async screen=>{
 const s=setup({"leader-loss-immediate-v1":true});s.feed(1744);
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("fixture");
 // Structural menu counterfactual: pi0.73.1 executes every issued tool before its next request.
 s.emit(checkEvent({...state,seq:1746,screen}));s.emit({...receipt,seq:1747,id:"post-loss-menu",state_seq:1746});
 const out=last(await s.wired.transformContext(before));expect(out).toContain("Last observed loss to GYM LEADER ROXANNE");expect(s.notes[0]?.evidence).toContain(1747);
});
it.each([{started:false,in_battle:false,screen:"overworld"},{started:true,in_battle:true,screen:"battle"}] as const)("does not offer pending loss context in an unstarted or active-battle observation %#",async patch=>{
 const s=setup({"leader-loss-immediate-v1":true});s.feed(1744);
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("fixture");
 s.emit(checkEvent({...state,...patch,seq:1746}));s.emit({...receipt,seq:1747,id:"later-observation",state_seq:1746});
 expect(await s.wired.transformContext(before)).toBe(before);expect(s.notes).toEqual([]);
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
  const s=setup({"battle-action-history-v1":true,"leader-loss-comparison-v1":false});for(const e of events)if(e.seq<=through)s.emit(e);
  const out=last(await s.wired.transformContext(before));expect(out).toContain(expected);expect(out).toContain("attribution to individual moves is unknown");
  if(through===5762)expect(out).toContain("Foe game page: Foe GEODUDE is hurt by its burn!");
  if(through===5966)expect(out).toContain("Foe game page: Foe NOSEPASS's ORAN BERRY restored health!");
 }
});

it("evicts whole oldest action intervals with small injected limits and preserves complete remaining source evidence",()=>{
 expect(BATTLE_HISTORY_CONTEXT_CHARS).toBe(6000);
 const history=new BattleActionHistory({intervals:2,memory:32,pages:8,sources:12});for(const e of EVENTS)if(e.seq>=2000)history.observe(e);
 const context=history.context();expect(context).not.toBeNull();expect(context?.text).not.toContain("33/33 → 31/33 (net -2)");expect(context?.text).toContain("31/33 → 30/33 (net -1)");expect(context?.evidence.length).toBeLessThanOrEqual(12);expect(history.context(0)).toBeNull();expect(history.context(12,1)).toBeNull();expect(history.context(5)).toBeNull();
 const bounded=new BattleActionHistory({intervals:2,memory:32,pages:8,sources:6});for(const e of EVENTS)if(e.seq>=2000)bounded.observe(e);expect(bounded.context()?.evidence).toEqual([2101,2168,2135,2161,2169,2171]);
});
it("failed and stale action receipts do not publish pending pages",()=>{
 const pages=eventAt(2064),receipt=eventAt(2066);if(receipt.type!=="tool_result")throw new Error("receipt");
 for(const bad of [{...receipt,is_error:true},{...receipt,state_seq:1},{...receipt,state_seq:2063}]){
  const history=new BattleActionHistory();history.observe(eventAt(2063));history.observe(pages);history.observe(eventAt(2065));history.observe(bad);expect(history.context()).toBeNull();
 }
});

it("appends the three registered switches in order with independent default-OFF and declared dependencies",async()=>{
 const {SWITCHABLE_FEATURES,ALL_ON,playHarnessFeatures,dependencyProblems}=await import("./features.js");
 const {normalizeFeatures,flagFeatures}=await import("./play-preset.js");
 const ids=["leader-loss-immediate-v1","battle-action-history-v1","leader-preparation-comparison-v1"] as const;
 expect(SWITCHABLE_FEATURES.slice(-4, -1)).toEqual(ids);expect(playHarnessFeatures(ALL_ON,null).slice(-4,-1)).toEqual(ids);
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
 for(const change of ["identity","max_hp","party_slot","species","absent"] as const){
  const h=new BattleActionHistory();for(const e of EVENTS)if(e.seq>=2000&&e.seq<=2064)h.observe(e);
  h.observe({...after,battle:{...after.battle,battlers:after.battle.battlers.map(b=>b.position%2===1?{...b,...(change==="identity"?{identity:"synthetic-switched-member"}:change==="party_slot"?{party_slot:b.party_slot+1}:change==="species"?{species:"synthetic-other-species"}:change==="absent"?{absent:true}:{max_hp:99})}:b)}});h.observe(eventAt(2066));
  expect(h.context()?.text).toContain("Player TORCHIC used SCRATCH");expect(h.context()?.text).not.toContain("33/33 → 31/33 (net -2)");expect(h.context()?.text).toContain("no comparable HP delta");
 }
});

it("an existing last-loss comparison remains available in a later battle even if no immediate note was consumed",()=>{
 const s=setup({"leader-loss-immediate-v1":true});s.feed(1744);
 const battle=eventAt(2045);if(battle.type!=="state"||!("started"in battle))throw new Error("native battle choice");
 expect(s.wired.training?.block(battle)).toContain("Last observed loss to GYM LEADER ROXANNE");
});

it("held-out native wild MUDKIP/ZIGZAGOON pages retain player and foe sides",async()=>{
 const events=gunzipSync(readFileSync(new URL("./fixtures/battle-history-wild-0d5d.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l)));
 const s=setup({"battle-action-history-v1":true,"leader-loss-comparison-v1":false});for(const e of events)s.emit(e);
 const text=last(await s.wired.transformContext(before));expect(text).toContain("Player MUDKIP used TACKLE");expect(text).toContain("Foe ZIGZAGOON used GROWL");expect(text).not.toContain("Unknown side Wild");
});

it("uses a prior native nickname in fast snapshots and keeps foe-like player nicknames ambiguous",()=>{
 for(const [nickname,side]of [["PEBBLE","Player"],["Foe RALTS","Unknown side"],["Foe A's B","Unknown side"]] as const){
  // Explicit synthetic nickname/effect parser edges: source-owned Emerald strings, not observed battle effects.
  const state=eventAt(2062),pages=eventAt(2064);if(state.type!=="state"||!("started"in state)||pages.type!=="dialogue_auto_advance")throw new Error("native nickname base");
  const h=new BattleActionHistory();h.observe({...state,party:state.party.map((p,i)=>i===0?{...p,nickname}:p)});h.observe(eventAt(2063));
  const used=pages.pages.find(p=>p.text.includes("used"));if(used===undefined)throw new Error("native used page");
  h.observe({...pages,pages:[{...used,text:`${nickname} used\nSCRATCH!`},{...used,text:`${nickname} is hurt by its burn!`},{...used,text:`${nickname}'s POTION restored health!`}]});h.observe(eventAt(2065));h.observe(eventAt(2066));
  expect(h.context()?.text).toContain(`${side} ${nickname} used SCRATCH!`);expect(h.context()?.text).toContain(`${side} game page: ${nickname} is hurt by its burn!`);expect(h.context()?.text).toContain(`${side} game page: ${nickname}'s POTION restored health!`);expect(h.context()?.evidence).toContain(2062);
 }
});

it.each([false,true])("retains the consulted native actor state even with missing names and a later replacement=%s",replacement=>{
 const after=eventAt(2065);if(after.type!=="state"||!("started"in after)||after.battle?.battlers==null)throw new Error("native attribution end");
 // Replacement is a structural counterfactual, not an observed native party change.
 const end=replacement?{...after,battle:{...after.battle,battlers:after.battle.battlers.map(b=>b.position%2===0?{...b,identity:"synthetic-replacement",species:"MUDKIP"}:b)}}:after;
 const h=new BattleActionHistory();h.observe(eventAt(2063));h.observe(eventAt(2064));h.observe(end);h.observe(eventAt(2066));
 expect(h.context()?.text).toContain("Player TORCHIC used SCRATCH");expect(h.context()?.text).toContain("Unknown side Foe GEODUDE used DEFENSE CURL");expect(h.context()?.evidence).toEqual([2064,2063,2065,2066]);
});
it("a caller's larger remaining budget cannot override the action owner's smaller source cap",()=>{
 const h=new BattleActionHistory({intervals:2,memory:32,pages:8,sources:1});for(const seq of [2063,2064,2065,2066])h.observe(eventAt(seq));
 expect(h.context(100)).toBeNull();
});
it("preserves the last current native receipt through a successful registered stateless context tool",async()=>{
 const s=setup({"leader-loss-immediate-v1":true,"dialogue-log-v1":true});s.feed(1744);expect(s.wired.tools.map(t=>t.name)).toEqual(["recall_dialogue"]);const recall=s.wired.tools[0];if(recall===undefined)throw new Error("owned context tool");
 const result=await recall.execute("post-loss-recall",{});expect(result.details).toBeUndefined();
 const receipt=eventAt(1744);if(receipt.type!=="tool_result")throw new Error("native receipt");s.emit(checkEvent({...receipt,seq:1747,id:"post-loss-recall",name:recall.name,state_seq:undefined,frames:[],text:result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n")}));
 expect(last(await s.wired.transformContext(before))).toContain("Last observed loss to GYM LEADER ROXANNE");expect(s.notes[0]?.evidence).toContain(1744);expect(s.notes[0]?.evidence).not.toContain(1747);
});
it.each(["missing-game-observation","failed-context","stale-context","new-state-without-receipt"] as const)("stateless ownership never authorizes invalid native evidence: %s",async kind=>{
 const s=setup({"leader-loss-immediate-v1":true,"dialogue-log-v1":true});s.feed(1744);expect(s.wired.tools.map(t=>t.name)).toEqual(["recall_dialogue"]);const recall=s.wired.tools[0];if(recall===undefined)throw new Error("owned context tool");
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("native evidence");if(kind==="new-state-without-receipt")s.emit({...state,seq:1746});
 s.emit(checkEvent({...receipt,seq:1747,id:"post-loss-result",name:kind==="missing-game-observation"?"press":recall.name,is_error:kind==="failed-context",state_seq:kind==="stale-context"?1:undefined,frames:[],text:"Structural receipt negative case"}));
 expect(await s.wired.transformContext(before)).toBe(before);expect(s.notes).toEqual([]);
});

it("unchanged native move IDs remain unchanged when a current move display name is missing",async()=>{
 const s=setup({"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true});s.feed(1744);
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("native state");
 s.emit({...state,seq:1746,party:state.party.map(p=>({...p,moves:p.moves?.map(m=>({...m,name:null}))??null}))});s.emit({...receipt,seq:1747,state_seq:1746});
 expect(last(await s.wired.transformContext(before))).toContain("moves unchanged");
});

it("an unknown current species with the same native identity does not invent a party removal",async()=>{
 const s=setup({"leader-loss-immediate-v1":true,"leader-preparation-comparison-v1":true});s.feed(1744);
 const state=eventAt(1742),receipt=eventAt(1744);if(state.type!=="state"||!("started"in state)||receipt.type!=="tool_result")throw new Error("native state");
 s.emit({...state,seq:1746,party:state.party.map(p=>({...p,species:null}))});s.emit({...receipt,seq:1747,state_seq:1746});
 const text=last(await s.wired.transformContext(before));expect(text).toContain("party membership unchanged");expect(text).toContain("species unknown");expect(text).not.toContain("no longer in observed party");
});
