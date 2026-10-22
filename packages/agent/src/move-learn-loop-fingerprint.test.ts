// move-learn-loop-fingerprint-v1: run 2026-10-21T13-33-54_qwen36-gpu0_ea04 pressed B round the 4-state cycle
// "Delete a move to make room for DOUBLE KICK?" -> "Stop learning DOUBLE KICK?" -> "COMBUSKEN is trying to learn
// DOUBLE KICK." -> "But, COMBUSKEN can't learn more than four moves." for 15 turns (seq 20494-20844). semanticState
// returned null for every state (in_battle, and evolution phases not whitelisted), so no loop rule counted.
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {parseGameState} from "./game-state.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {moveLearningState,semanticState} from "./loop/fingerprints.js";
import type {LoopNotice} from "./loop/types.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="move-learn-loop-fingerprint-v1" as const;
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/move-learn-loop-ea04.json.gz",import.meta.url))).toString("utf8")) as {events:Record<string,unknown>[]};
const EVENTS=fixture.events.map(e=>checkEvent(e));
const fixed=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
const bundle=(on:boolean):FeatureSet=>({...normalizeFeatures({...fixed.base.features,...Object.fromEntries(fixed.switches.map(id=>[id,true]))} as Parameters<typeof normalizeFeatures>[0]),[ID]:on});
const snapshot=(e:RunEvent)=>parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key))));
const states=EVENTS.filter(e=>e.type==="state");
const at=(seq:number)=>{const e=states.find(s=>s.seq===seq);if(e===undefined)throw new Error(`no state ${String(seq)}`);return snapshot(e);};

function replay(features:FeatureSet):{notices:LoopNotice[];results:number[]}{
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notices.push(n);}};
 const governor=new Governor({limits:{maxTurns:20000,maxWallMs:1e9,failureLimit:3},now:()=>0,retry:()=>undefined,abort:()=>undefined});
 attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],undefined,features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],features["ineffective-loops-v1"],features["battle-menu-loop-v1"],features["clock-view-loop-v1"],features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"],features["same-target-no-progress-v1"],features);
 for(const e of EVENTS)for(const fn of subscribers)fn(e);
 return {notices,results:EVENTS.filter(e=>e.type==="tool_result").map(e=>e.seq)};
}

describe("move-learn-loop-fingerprint-v1",()=>{
 it("the fixture is the recorded B cycle: 15 presses of B on the evolution move-learning prompts, in_battle set",()=>{
  const calls=EVENTS.filter(e=>e.type==="tool_call");
  expect(calls.filter(c=>c.name==="press"&&JSON.stringify(c.args)==='{"buttons":["B"]}').length).toBeGreaterThanOrEqual(15);
  expect(states.every(s=>"in_battle" in s&&s.in_battle)).toBe(true);
  expect(states.every(s=>semanticState(snapshot(s),true)===null)).toBe(true);
 });
 it("fingerprints the four prompts apart from what the game shows: question, MVSTATE, page and party moves",()=>{
  const prints=[20528,20601,20553,20576].map(seq=>moveLearningState(at(seq)));
  expect(prints.every(p=>p!==null)).toBe(true);
  expect(new Set(prints).size).toBe(4);
  expect(JSON.parse(prints[0]??"null")).toEqual({kind:"move_learning",phase:"evolution_move_confirmation",selected:"YES",mvstate:4,question:[11,0],move:"DOUBLE KICK",page:null,party:[["SCRATCH","GROWL","FOCUS ENERGY","EMBER"]]});
  expect(JSON.parse(prints[2]??"null")).toMatchObject({phase:"evolution_move_learning",mvstate:1,page:"COMBUSKEN is trying to learn DOUBLE KICK."});
  expect(semanticState(at(20528),true,true)).toBe(prints[0]);
  expect(moveLearningState(at(20502))).toBeNull();
 });
 it("in battle, fingerprints the learn_move and stop_learning_move boxes and the two pages that lead to them, nothing else",()=>{
  const base=at(20528);
  const battle=base.battle;if(battle==null)throw new Error("fixture battle");
  const inBattle=(b:Partial<typeof battle>)=>({...base,screen:"battle",active_ui:{phase:"battle_resolving",selected:null,ready:false,controls:"",diagnostic:null,value:null},battle:{...battle,...b}});
  const idle={state:"idle" as const,render_state:null,text:null,cursor:null,identity:null,diagnostic:null,page:null};
  const waiting=(page:string)=>({...idle,state:"waiting_for_input" as const,page});
  expect(JSON.parse(moveLearningState(inBattle({prompt:{kind:"learn_move",ready:true,selected:"YES"},message:idle}))??"null")).toEqual({kind:"move_learning",phase:"learn_move",selected:"YES",party:[["SCRATCH","GROWL","FOCUS ENERGY","EMBER"]]});
  expect(moveLearningState(inBattle({prompt:{kind:"stop_learning_move",ready:true,selected:"NO"},message:idle}))).toContain('"phase":"stop_learning_move"');
  expect(moveLearningState(inBattle({prompt:{kind:"yes_no",ready:true,selected:"YES"},message:idle}))).toBeNull();
  expect(moveLearningState(inBattle({prompt:null,message:waiting("COMBUSKEN is trying to learn DOUBLE KICK.")}))).toContain('"phase":"battle_message"');
  expect(moveLearningState(inBattle({prompt:null,message:waiting("But, COMBUSKEN can't learn more than four moves.")}))).toContain("four moves");
  expect(moveLearningState(inBattle({prompt:null,message:waiting("COMBUSKEN used EMBER!")}))).toBeNull();
  expect(moveLearningState(inBattle({prompt:null,message:idle}))).toBeNull();
  expect(moveLearningState({...inBattle({prompt:null,message:waiting("COMBUSKEN is trying to learn DOUBLE KICK.")}),in_battle:false})).toBeNull();
  expect(moveLearningState(inBattle({diagnostic:"torn",prompt:{kind:"learn_move",ready:true,selected:"YES"}}))).toBeNull();
  const forget={...base,screen:"summary",active_ui:{phase:"summary_move_forget",selected:"SCRATCH",ready:true,controls:"",diagnostic:null,value:null,details:{}}};
  expect(JSON.parse(moveLearningState(forget)??"null")).toMatchObject({phase:"summary_move_forget",selected:"SCRATCH",mvstate:null,question:null,move:null,page:null});
  expect(moveLearningState({...forget,active_ui:{...forget.active_ui,ready:false}})).toBeNull();
 });
 it("ON: the production loop guard warns of the cycle by the second time round",()=>{
  const {notices,results}=replay(bundle(true));
  const warning=notices.find(n=>n.phase==="warning"&&(n.kind==="cycle"||n.kind==="ineffective"));
  expect(warning?.kind).toBe("cycle");
  const firstWarned=Math.max(...(warning?.evidence??[]));
  // The first B is result 1; two full cycles of four are results 1-8 (a result per press).
  expect(results.indexOf(results.find(seq=>seq>=firstWarned)??-1)).toBeLessThanOrEqual(8);
 });
 it("OFF: no fingerprint, so neither the cycle nor the ineffective rule counts the recorded window",()=>{
  const {notices}=replay(bundle(false));
  expect(notices.filter(n=>n.kind==="cycle"||n.kind==="ineffective")).toEqual([]);
  expect(semanticState(at(20528),true,false)).toBeNull();
 });
 it("is a default-off agent-only guard, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.at(-5)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-5)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
