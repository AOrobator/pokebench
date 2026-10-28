import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
import {contextTools} from "./play-wiring.js";
import {sceneFollowup,sceneFollowupNote} from "./scene-followup.js";

// Recorded dialogue_auto_advance events (runs/<run>/events.jsonl at the given seq). Theft: 9e33 t1384 seq 52168,
// d41e t1210 seq 47633. Probes on 9e33's model at the turn after the theft: off 5/160 vs this note 141/160 on five
// unseen runs (runs/reports/run-analysis/2026-10-27_scene-followup-prompt-research).
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
const FIXTURES=JSON.parse(readFileSync(new URL("../test-support/scene-followup-events.json",import.meta.url),"utf8")) as Record<string,{run:string;seq:number;event:Advance}>;
const ev=(name:string):Advance=>checkEvent(FIXTURES[name]?.event) as Advance;
const ID="scene-followup-prompt-v1";
const NOTE="SUPERVISOR: You just watched a scene play out on its own while you could not move. The game showed: \"Get out! Out of the way!\" \"Wait! Pleeeaaase!\" \"Don't take my GOODS!\" The people in it were: MAN_3 at 26,23; MAN_4 at 19,27; MAN_2 at 20,21 (where they stood during the scene). That was a story event, not background flavor. Before anything else, walk up to the nearest person who took part in it and talk to them (face them and press A). Only then return to older plans.";
const recipe=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {switches:string[];offInBoth:string[];onInBoth:string[];features:Record<string,boolean>};
const control={...LEGACY_ALL_ON,...recipe.features} as FeatureSet;
const bundle={...control,...Object.fromEntries(recipe.switches.map(id=>[id,true]))} as FeatureSet;
const messages:AgentMessage[]=[{role:"user",content:"Play the game.",timestamp:0}];

function setup(on:boolean){
 const listeners:((e:RunEvent)=>void)[]=[],notes:unknown[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordNavigationContext:()=>undefined,recordLedgerContext:(n:unknown)=>{notes.push(n);},recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>undefined};
 const wired=contextTools({...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"script-line-presence-v1":true,[ID]:on},recorder,m=>Promise.resolve(m));
 const emit=(e:RunEvent)=>{for(const f of listeners)f(checkEvent(e));};
 const result=(a:Advance,seq=a.seq+2,id=a.tool_call_id):RunEvent=>({v:1,run:a.run,seq,turn:a.turn,t:a.t,type:"tool_result",id,name:a.tool,text:"result",is_error:false,state_seq:seq-1,duration_ms:0,frames:[]});
 const reply=(a:Advance,seq:number,stop:"toolUse"|"stop"|"error"):RunEvent=>({v:1,run:a.run,seq,turn:a.turn+1,t:a.t,type:"assistant",thinking:"",text:"",tool_calls:[],usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null,stop_reason:stop});
 return {wired,notes,listeners,emit,result,reply};
}

describe(ID,()=>{
 it("is a default-off agent-side guidance switch registered last, needing the on-screen page data, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"script-line-presence-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures({...LEGACY_ALL_ON,[ID]:true},null).at(-1)).toBe(ID);
  expect(playHarnessFeatures({...LEGACY_ALL_ON,[ID]:false},null)).not.toContain(ID);
 });

 it("fires on the recorded theft scene in two runs and nowhere else",()=>{
  expect(sceneFollowup(ev("theft-9e33"))).not.toBeNull();
  expect(sceneFollowup(ev("theft-d41e"))).not.toBeNull();
  for(const quiet of ["woods-grunt","museum","birch-lab","birch-rescue","dont-leave-me","rusturf-grunt","gym-youngster"])expect(sceneFollowup(ev(quiet)),quiet).toBeNull();
 });

 it("each guard condition alone keeps it quiet",()=>{
  const theft=ev("theft-9e33");
  expect(sceneFollowup({...theft,stop:"menu"})).toBeNull();
  expect(sceneFollowup({...theft,pages:theft.pages.slice(0,1)})).toBeNull();
  expect(sceneFollowup({...theft,pages:theft.pages.map((p,i)=>i===2&&p.position!==null?{...p,position:{x:p.position.x+1,y:p.position.y}}:p)})).toBeNull();
  expect(sceneFollowup({...theft,pages:theft.pages.map(p=>({...p,on_screen:theft.pages[0]?.on_screen??null}))})).toBeNull();
  expect(sceneFollowup({...theft,pages:[...theft.pages,{...(theft.pages[2] as Advance["pages"][number]),speaker:"MAN_2",speaker_source:"faced_sprite",text:"Thank you!"}]})).toBeNull();
 });

 it("quotes the scene's own pages and on-screen people, whole, in the exact note",()=>{
  const scene=sceneFollowup(ev("theft-9e33"));
  expect(scene).not.toBeNull();
  if(scene!==null)expect(sceneFollowupNote(scene)).toBe(NOTE);
 });

 it("OFF leaves the context transform and subscriptions unchanged",async()=>{
  const s=setup(false);
  expect(await s.wired.transformContext(messages)).toBe(messages);
  s.emit(ev("theft-9e33"));s.emit(s.result(ev("theft-9e33")));
  expect(await s.wired.transformContext(messages)).toBe(messages);
 });

 it("production factory appends the note once after the scene's tool result, and records it",async()=>{
  const s=setup(true),theft=ev("theft-9e33");
  expect(await s.wired.transformContext(messages)).toEqual(messages);
  s.emit(theft);s.emit(s.result(theft));
  const out=await s.wired.transformContext(messages);
  expect(out.slice(0,-1)).toEqual(messages);
  expect(out.at(-1)).toMatchObject({role:"user",content:NOTE});
  expect(out.filter(m=>m.role==="user"&&m.content===NOTE)).toHaveLength(1);
  expect(await s.wired.transformContext(out)).toEqual(out);
  expect(s.notes).toEqual([{text:NOTE,evidence:[theft.seq,theft.seq+2]}]);
 });

 it("survives other results in the same turn and is delivered on the next request",async()=>{
  const s=setup(true),theft=ev("theft-9e33");
  s.emit(theft);s.emit(s.result(theft));s.emit(s.result(theft,theft.seq+5,"second-call-same-turn"));
  expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:NOTE});
 });

 it("is delivered once: after the model answers a request that carried it, it never comes back",async()=>{
  for(const stop of ["toolUse","stop"] as const){
   const s=setup(true),theft=ev("theft-9e33");
   s.emit(theft);s.emit(s.result(theft));
   expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:NOTE});
   s.emit(s.reply(theft,theft.seq+5,stop));
   expect(await s.wired.transformContext(messages)).toEqual(messages);
   s.emit(s.result(theft,theft.seq+9,"next-call"));
   expect(await s.wired.transformContext(messages)).toEqual(messages);
   expect(s.notes).toHaveLength(1);
  }
 });

 it("is resent after a failed model call, since the model never read it",async()=>{
  const s=setup(true),theft=ev("theft-9e33");
  s.emit(theft);s.emit(s.result(theft));
  await s.wired.transformContext(messages);
  s.emit(s.reply(theft,theft.seq+5,"error"));
  expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:NOTE});
  expect(s.notes).toHaveLength(1);
 });

 it("a reply before any delivery does not discard a note that is still due",async()=>{
  const s=setup(true),theft=ev("theft-9e33");
  s.emit(theft);s.emit(s.result(theft));s.emit(s.reply(theft,theft.seq+4,"toolUse"));
  expect((await s.wired.transformContext(messages)).at(-1)).toMatchObject({content:NOTE});
 });

 it("stays quiet for a non-scene dialogue and for a result of another call",async()=>{
  const s=setup(true),gym=ev("gym-youngster"),theft=ev("theft-9e33");
  s.emit(gym);s.emit(s.result(gym));
  expect(await s.wired.transformContext(messages)).toEqual(messages);
  s.emit(theft);s.emit(s.result(theft,theft.seq+2,"other-call"));
  expect(await s.wired.transformContext(messages)).toEqual(messages);
 });

 it("adds no system-prompt text in either arm",()=>{
  expect(playSystemPrompt({...bundle,[ID]:true},null)).toBe(playSystemPrompt({...bundle,[ID]:false},null));
 });

 it("presets and flag presets that omit it run with it off; presets can turn it on",()=>{
  const base={version:2,id:"scene",target:null,limits:{maxTurns:10,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096}};
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  const rest=Object.fromEntries(Object.entries(bundle).filter(([k])=>k!==ID));
  expect(presetFeatures(parsePlayPreset({...base,features:rest}))[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({...base,features:{...rest,[ID]:true}}))[ID]).toBe(true);
 });

 it("is ON in the bundle arm and OFF in control of the maintained feature config",()=>{
  expect(recipe.switches).toContain(ID);
  expect(recipe.offInBoth).not.toContain(ID);
  expect(recipe.onInBoth).not.toContain(ID);
  expect(recipe.features[ID]).toBe(false);
  expect(control["script-line-presence-v1"]).toBe(true);
 });
});
