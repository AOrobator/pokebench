import {describe,it,expect} from "vitest";
import {LoopDetector,type LoopNotice} from "./loop-detection.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,featureInfo,type FeatureSet} from "./features.js";
import {parsePlayPreset,flagFeatures} from "./play-preset.js";
import {readFileSync} from "node:fs";

const refusal='Battle action: nothing pressed: the battle is not waiting for a choice; a battle message is waiting for A or B: "Go!".';
function rig(on:boolean){
 const notices:LoopNotice[]=[];
 const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>subscribers.push(fn),recordLoopGuard:(n:LoopNotice)=>notices.push(n)};
 attachLoopGuard(recorder,governor,undefined,"enforced",false,undefined,false,false,false,false,false,false,false,false,false,on);
 let seq=0;
 const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"refusal",seq:++seq,t:"2026-10-19T19:00:00Z",turn:seq,...body});subscribers.forEach(f=>f(e));};
 const call=(text=refusal,pressed=false,name="battle_action")=>{
  const id=String(seq);emit({type:"tool_call",id,name,args:{action:"fight",move:"TACKLE"}});
  if(pressed)emit({type:"button_press",tool_call_id:id,buttons:["A"]});
  emit({type:"tool_result",id,name,text,is_error:false,duration_ms:1,frames:[]});
 };
 return {notices,call,emit};
}

describe("battle-refusal-loop-v1",()=>{
 it("OFF preserves successful-result semantics; ON routes two no-press refusals through the existing rejection episode",()=>{
  const off=rig(false);off.call();off.call();expect(off.notices).toEqual([]);
  const on=rig(true);on.call();expect(on.notices).toEqual([]);on.call();
  expect(on.notices.map(n=>[n.kind,n.phase,n.calls])).toEqual([["rejection","warning",2]]);
  expect(on.notices[0]?.message).toContain("A or B");
  expect(on.notices[0]?.evidence).toHaveLength(2);
 });
 it("keys only the refusal status, excluding changing observation text",()=>{
  const r=rig(true);r.call(refusal+"\nTurn 1");r.call(refusal+"\nTurn 2");expect(r.notices).toHaveLength(1);
 });
 it("never classifies a call that pressed, another tool, a successful call or an infrastructure error",()=>{
  for(const [text,pressed,name] of [[refusal,true,"battle_action"],[refusal,false,"observe"],["Battle action: selected FIGHT.",false,"battle_action"],["HTTP 500: "+refusal,false,"battle_action"]] as const){
   const r=rig(true);r.call(text,pressed,name);r.call(text,pressed,name);expect(r.notices).toEqual([]);
  }
 });
 it("a different reason is not a repeat and a successful intervening call clears refusal counts",()=>{
  const r=rig(true);r.call();r.call("Battle action: nothing pressed: no battle is in progress.");expect(r.notices).toEqual([]);
  const success=rig(true);success.call();success.call("Battle action: selected FIGHT.",true);success.call();expect(success.notices).toEqual([]);
 });
 it("uses the existing bounded stop lifecycle and diagnostic-only mode",()=>{
  const n:LoopNotice[]=[];const d=new LoopDetector(x=>n.push(x),{planning:6,observation:3,ineffective:3,cycleRepeats:3,rejection:2,recovery:2},"diagnostic",false,undefined,false,false,false,false,false,false,false,false,false,true);
  for(let i=0;i<2;i++)d.complete({name:"battle_action",args:{},isError:false,text:refusal,acted:false,seq:i+1});
  expect(n[0]?.phase).toBe("would_warn");
 });
 it("registers the new switch OFF in omitted presets and flags",()=>{
  expect(featureInfo("battle-refusal-loop-v1")).toMatchObject({group:"guard",needs:"deterministic-loop-guard-v1"});
  const features=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!=="battle-refusal-loop-v1")) as FeatureSet;
  expect(parsePlayPreset({version:2,id:"test",target:null,limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features}).features["battle-refusal-loop-v1"]).toBe(false);
  expect(flagFeatures({})["battle-refusal-loop-v1"]).toBe(false);
  for(const file of ["live.ts","decision-probe.ts"]){expect(readFileSync(new URL(`./${file}`,import.meta.url),"utf8")).toContain('features["battle-refusal-loop-v1"]');}
 });
});
