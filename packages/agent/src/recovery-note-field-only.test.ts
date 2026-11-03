import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {NavigationRecovery,NAVIGATION_RECOVERY_CALLS} from "./loop/navigation-recovery.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {FeatureSet} from "./features.js";
import type {LoopNotice} from "./loop-detection.js";

// recovery-note-field-only-v1. Run 2026-10-24T19-37-24_glm53-mac_6bbd opened a map-cycle note on the overworld at
// turn 811; the open episode rode along on every request after it, and on battle turns 818-823 the model called it
// "boilerplate - it fires mid-battle". Battle calls never advance the episode's 12-call budget, so a battle kept it open.
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/navigation-recovery-loop.json.gz",import.meta.url))).toString("utf8")) as {events:unknown[];seed:unknown[]};
const recorded=fixture.events.map(checkEvent);
const body=(event:unknown):GameStateSnapshot=>parseGameState(Object.fromEntries(Object.entries(event as Record<string,unknown>).filter(([k])=>!["v","run","seq","t","type","turn"].includes(k))));
const field=body(recorded.find(e=>e.type==="state"&&e.seq===6857));
const battle=parseGameState({...field,in_battle:true,screen:"battle"});
const call=(s:GameStateSnapshot,seq:number)=>({name:"observe",args:{},isError:false,text:"",state:s,seq});

function direct(fieldOnly:boolean){
 const notices:LoopNotice[]=[];const recovery=new NavigationRecovery(n=>notices.push(n),"enforced",false,false,fieldOnly);recovery.state(field);return {recovery,notices};
}

describe("recovery-note-field-only-v1",()=>{
 it("off: an open episode is still sent with a battle request, as before",()=>{
  const r=direct(false);r.recovery.cycle("cycle",[1],1);r.recovery.state(battle);
  expect(r.recovery.context()).toContain("NAVIGATION RECOVERY: The repeated map cycle remains unresolved.");
 });
 it("on: nothing during the battle, the same note again on the next field request",()=>{
  const off=direct(false);off.recovery.cycle("cycle",[1],1);const expected=off.recovery.context();
  const r=direct(true);r.recovery.cycle("cycle",[1],1);
  r.recovery.state(battle);expect(r.recovery.context()).toBe(null);
  r.recovery.complete(call(battle,5),2);expect(r.recovery.active).toBe(true);
  r.recovery.state(field);expect(r.recovery.context()).toBe(expected);
 });
 it("on: a briefing that falls due is not used up by a battle request",()=>{
  const r=direct(true);r.recovery.cycle("cycle",[1],1);r.recovery.context();
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.recovery.complete(call(field,10+i),i+2);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);
  r.recovery.state(battle);expect(r.recovery.context()).toBe(null);
  r.recovery.complete(call(battle,40),20);
  r.recovery.state(field);expect(r.recovery.context()).toContain("NAVIGATION RECOVERY BRIEFING");
 });
 it("the production loop guard honors the switch",()=>{
  const context=(on:boolean)=>{
   const subscribers:((e:RunEvent)=>void)[]=[];
   const governor=new Governor({limits:{maxTurns:1000,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
   const features:FeatureSet={...LEGACY_ALL_ON,"navigation-recovery-v1":true,"recovery-note-field-only-v1":on};
   const detector=attachLoopGuard({subscribe:fn=>{subscribers.push(fn);},recordLoopGuard:()=>undefined},governor,undefined,"enforced",false,()=>"generic supervisor",false,false,false,false,false,false,false,false,false,false,false,false,features);
   const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
   for(const e of fixture.seed.map(checkEvent))emit(e);
   for(const e of recorded.filter(e=>e.turn>=252&&e.turn<=257)){
    if(e.type==="loop_guard"&&e.kind==="map_cycle")detector.stall("map_cycle",()=>e.message,e.evidence);else emit(e);
    if(e.type==="tool_result"||e.type==="loop_guard")detector.context();
   }
   const last=recorded.filter(e=>e.type==="state"&&e.turn<=257).at(-1);
   emit(checkEvent({...(last as object),in_battle:true,screen:"battle"}));
   return detector.context();
  };
  expect(context(false)).toContain("NAVIGATION RECOVERY");
  expect(context(true)).toBe(null);
 });
});
