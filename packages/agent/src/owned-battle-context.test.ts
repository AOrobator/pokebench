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
  const run=(on:boolean|undefined)=>{
   const observers:((e:typeof events[number])=>void)[]=[],notes:LoopNotice[]=[],sent:string[]=[];
   const f={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"stall-briefing-v1":true,"drought-battle-heal-hold-v1":true,...(on===undefined?{}:{"owned-battle-context-v1":on})};
   const recorder={subscribe:(fn:(e:typeof events[number])=>void)=>{observers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notes.push(n);},recordStallGate:()=>undefined};
   stallBriefing(f,recorder,{stall:kind=>{sent.push(kind);return true;}},{pausedMs:()=>0},()=>STALL_DROUGHT_MS+1);
   for(const e of [state,result])for(const fn of observers)fn(e);
   return {notes,sent};
  };
  expect(run(undefined)).toEqual(run(false));
  expect(run(false).notes.some(n=>n.message.includes("a battle is on screen"))).toBe(true);
  expect(run(true).notes.some(n=>n.message.includes("a battle is on screen"))).toBe(false);
  expect(run(true).sent).toContain("milestone_drought");
 });
});

import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {GameStateSnapshot} from "./game-state.js";
import {battleDecisionContext} from "./play-wiring.js";
it("move-learning owners override the bit while native battle prompts remain battles",()=>{
 for(const phase of ["evolution_move_learning","evolution_move_confirmation","evolution_result","summary_move_forget","summary_hm_rejection"]){
  const s={...state,screen:"menu",active_ui:{phase,selected:null,ready:true,controls:"",diagnostic:null}};
  expect(battleOnScreen(s,true),phase).toBe(false);expect(battleOnScreen(s,false)).toBe(true);
 }
 const battle={...state,screen:"battle",active_ui:null};
 expect(battleOnScreen(battle,true)).toBe(true);
 expect(battleOnScreen({...battle,in_battle:false},true)).toBe(false);
 expect(battleOnScreen({...battle,active_ui:{phase:"summary_move_forget",selected:null,ready:null,controls:"",diagnostic:"owner unavailable"}},true)).toBe(true);
});
it("production decision readiness does not advance a stale busy battle under evolution ownership",async()=>{
 const snapshot:GameStateSnapshot={...state,battle:state.battle==null?null:{...state.battle,text_phase:"busy"}};
 const observe:AgentTool={name:"observe",label:"observe",description:"",parameters:{},execute:()=>Promise.reject(new Error("must not auto-observe evolution as battle"))};
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"battle-decision-ready-v1":true,"owned-battle-context-v1":true};
 const transform=battleDecisionContext(features,{read:()=>Promise.resolve(snapshot)},[observe],messages=>Promise.resolve(messages),{recordDecisionSnapshot:()=>{throw new Error("no battle snapshot");}});
 expect(await transform([])).toEqual([]);
});
