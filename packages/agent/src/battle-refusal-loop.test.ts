import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {gunzipSync} from "node:zlib";
import {describe,it,expect} from "vitest";
import {LoopDetector,type LoopNotice} from "./loop-detection.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featureInfo,type FeatureSet} from "./features.js";
import {parsePlayPreset,presetFeatures,flagFeatures} from "./play-preset.js";
import {readFileSync} from "node:fs";
import {withBattleAction,BATTLE_ACTION_DESCRIPTION} from "./battle-action.js";
import {observeTool,pressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";

const recorded=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/battle-message-refusals.json.gz",import.meta.url))).toString("utf8")) as {state:unknown;result:{text:string};call:unknown}[];
const waiting=parseGameState(recorded[0]?.state);
const refusal='Battle action: nothing pressed: the battle is not waiting for a choice; a battle message is waiting for A or B: "Go!".';
function rig(on:boolean,battles=false){
 const notices:LoopNotice[]=[];
 const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>subscribers.push(fn),recordLoopGuard:(n:LoopNotice)=>notices.push(n)};
 attachLoopGuard(recorder,governor,undefined,"enforced",false,undefined,false,false,battles,false,false,false,false,false,false,on);
 let seq=0;
 const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"refusal",seq:++seq,t:"2026-10-19T15:00:00.000-04:00",turn:seq,...body});subscribers.forEach(f=>{f(e);});};
 const call=(text=refusal,pressed=false,name="battle_action",state:GameStateSnapshot=waiting)=>{
  const id=String(seq);emit({type:"tool_call",id,name,args:{action:"fight",move:"TACKLE"}});
  if(pressed)emit({type:"button_press",tool_call_id:id,buttons:["A"]});
  emit({type:"state",...state});
  emit({type:"tool_result",id,name,text,is_error:false,duration_ms:1,frames:[],state_seq:seq});
 };
 return {notices,call,emit};
}

describe("battle-refusal-loop-v1",()=>{
 it("threads refusal guidance through the production battle tool factory with exact OFF description bytes",()=>{
  const base=[observeTool("http://127.0.0.1:1"),pressTool("http://127.0.0.1:1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()})];
  const source={read:()=>Promise.resolve(IN_GAME)};
  const off=withBattleAction(base,{...ALL_ON,"battle-refusal-loop-v1":false},source).find(t=>t.name==="battle_action");
  const on=withBattleAction(base,{...ALL_ON,"battle-refusal-loop-v1":true},source).find(t=>t.name==="battle_action");
  expect(off?.description).toBe(BATTLE_ACTION_DESCRIPTION);
  expect(on?.description).toBe(BATTLE_ACTION_DESCRIPTION+" A refused call presses nothing and does not automatically advance text. When the returned state says a message is waiting for A or B, use press with A or B; battle_action cannot choose FIGHT there. While the game runs its own text or animation without a waiting input, wait and observe.");
 });
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
  for(let i=0;i<2;i++)d.complete({name:"battle_action",args:{},isError:false,text:refusal,acted:false,state:waiting,seq:i+1});
  expect(n[0]?.phase).toBe("would_warn");
  const enforced:LoopNotice[]=[];const guard=new LoopDetector(x=>enforced.push(x),{planning:6,observation:3,ineffective:3,cycleRepeats:3,rejection:2,recovery:2},"enforced",false,undefined,false,false,false,false,false,false,false,false,false,true);
  const call={name:"battle_action",args:{},isError:false,text:refusal,acted:false,state:waiting};
  guard.complete(call);guard.complete(call);expect(guard.context()).toContain("A or B");
  guard.complete(call);guard.complete(call);
  expect(enforced.map(n=>n.phase)).toEqual(["warning","stop"]);expect(guard.stopped).toBe(true);
 });
 it("replays the actual wrapped refusals and recovers only on qualified native change",()=>{
  const r=rig(true);for(const row of recorded)r.call(row.result.text,false,"battle_action",parseGameState(row.state));
  expect(r.notices).toHaveLength(1);
  r.call(refusal,false,"battle_action",{...waiting,battle:null});
  expect(r.notices).toHaveLength(1);
  if(waiting.battle==null)throw Error("fixture requires battle");
  r.call("Battle action: chose FIGHT.",true,"battle_action",{...waiting,battle:{...waiting.battle,turn:(waiting.battle.turn??0)+1}});
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
 });
 it("unknown/unavailable state and changing native battle state cannot establish repeated refusals",()=>{
  const r=rig(true);r.call(refusal,false,"battle_action",{...waiting,battle:null});r.call(refusal,false,"battle_action",{...waiting,battle:null});expect(r.notices).toEqual([]);
  if(waiting.battle==null)throw Error("fixture requires battle");
  for(const battle of [{...waiting.battle,initialized:false},{...waiting.battle,diagnostic:"harness bug: unavailable"}]) {
   const unqualified=rig(true);unqualified.call(refusal,false,"battle_action",{...waiting,battle});unqualified.call(refusal,false,"battle_action",{...waiting,battle});expect(unqualified.notices).toEqual([]);
  }
  const moving=rig(true);moving.call();moving.call(refusal,false,"battle_action",{...waiting,battle:{...waiting.battle,turn:(waiting.battle.turn??0)+1}});expect(moving.notices).toEqual([]);moving.call();expect(moving.notices).toEqual([]);
 });
 for(const unknown of [false,true])it(`keeps refusal warning through ${unknown?"initializing readouts":"unchanged observations"} with battle detection enabled`,()=>{
  if(waiting.battle==null)throw Error("fixture requires battle");
  const r=rig(true,true);r.call();r.call();
  expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);
  if(unknown) {
   r.call("Initializing battle",false,"observe",{...waiting,battle:{...waiting.battle,initialized:false,phase:"initializing",ready:false,diagnostic:null}});
   expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);
  }
  r.call("Same battle",false,"observe",waiting);
  expect(r.notices.map(n=>n.phase)).toEqual(["warning"]);
  r.call("Turn advanced",false,"observe",{...waiting,battle:{...waiting.battle,turn:(waiting.battle.turn??0)+1}});
  expect(r.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
 });
 it("registers the new switch OFF in omitted presets and flags",()=>{
  expect(featureInfo("battle-refusal-loop-v1")).toMatchObject({group:"guard",needs:null});
  const features=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!=="battle-refusal-loop-v1")) as FeatureSet;
  expect(presetFeatures(parsePlayPreset({version:2,id:"test",target:null,limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features}))["battle-refusal-loop-v1"]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["battle-refusal-loop-v1"]).toBe(false);
  for(const file of ["live.ts","decision-probe.ts"]){expect(readFileSync(new URL(`./${file}`,import.meta.url),"utf8")).toContain('features["battle-refusal-loop-v1"]');}
 });
});
