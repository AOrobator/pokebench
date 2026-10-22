import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import {checkEvent} from "./events.js";
import {battleEngaged,classifyBattle} from "./battle-text-auto-advance.js";
import {battleOnScreen} from "./battle-context.js";
import {flagFeatures} from "./play-preset.js";
import {stallBriefing} from "./play-wiring.js";
import {STALL_DROUGHT_MS} from "./stall-briefing.js";
import type {LoopNotice} from "./loop-detection.js";
const events=(JSON.parse(gunzipSync(readFileSync(new URL("../test-support/owned-battle-d951.json.gz",import.meta.url))).toString("utf8")) as unknown[]).map(checkEvent);
const state=events[0],result=events[1];
if(state?.type!=="state"||!("started"in state)||result?.type!=="tool_result")throw new Error("fixture");
describe("owned-battle-context-v1",()=>{
 it("preserves legacy stale battle attribution OFF but respects verified evolution ownership ON",()=>{
  expect(state.screen).toBe("evolution");expect(state.in_battle).toBe(true);
  expect(battleOnScreen(state,false)).toBe(true);expect(battleOnScreen(state,true)).toBe(false);
  expect(battleEngaged(state,true)).toBe(false);
  expect(classifyBattle(state,false,true)).toMatchObject({kind:"stop",stop:"menu"});
 });
 it("corrects the production drought hold reason instead of calling evolution a battle",()=>{
  const run=(on:boolean)=>{
   const observers:((e:typeof events[number])=>void)[]=[],notes:LoopNotice[]=[],sent:string[]=[];
   const f={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"stall-briefing-v1":true,"drought-battle-heal-hold-v1":true,"owned-battle-context-v1":on};
   const recorder={subscribe:(fn:(e:typeof events[number])=>void)=>{observers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notes.push(n);},recordStallGate:()=>undefined};
   stallBriefing(f,recorder,{stall:kind=>{sent.push(kind);return true;}},{pausedMs:()=>0},()=>STALL_DROUGHT_MS+1);
   for(const e of [state,result])for(const fn of observers)fn(e);
   return {notes,sent};
  };
  expect(run(false).notes.some(n=>n.message.includes("a battle is on screen"))).toBe(true);
  expect(run(true).notes.some(n=>n.message.includes("a battle is on screen"))).toBe(false);
  expect(run(true).sent).toContain("milestone_drought");
 });
});
