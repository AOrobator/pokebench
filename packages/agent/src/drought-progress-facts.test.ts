import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {stallBriefing} from "./play-wiring.js";
import {LoopDetector,type LoopNotice} from "./loop-detection.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {STALL_DROUGHT_MS} from "./stall-briefing.js";
const ID="drought-progress-facts-v1" as const;
const BASE={...LEGACY_ALL_ON,"stall-briefing-v1":true,"same-plan-breaker-v1":false,"next-milestone-hint-v1":false};
function rig(enabled:boolean,extra:Partial<FeatureSet>={}){
 const features={...BASE,[ID]:enabled,...extra};const listeners:((e:RunEvent)=>void)[]=[];const notes:LoopNotice[]=[];let seq=0,now=0;
 const detector=new LoopDetector(n=>notes.push(n));
 stallBriefing(features,{subscribe:f=>listeners.push(f),recordLoopGuard:n=>notes.push(n),recordStallGate:()=>undefined},detector,{pausedMs:()=>0},()=>now);
 const emit=(body:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"facts",t:"2026-10-24T10:00:00.000-04:00",seq:++seq,turn:seq,...body});for(const f of listeners)f(e);};
 const act=(extra:Record<string,unknown>={})=>{emit({type:"state",...IN_GAME,location:"ROUTE 103",map_id:[0,18],position:{x:25,y:11},field_controls_locked:false,interaction_targets:[],...extra});emit({type:"tool_result",id:String(seq),name:"press",text:"pressed",is_error:false,duration_ms:1,frames:[],state_seq:seq});};
 return {notes,act,emit,time:(ms:number)=>{now=ms;},context:()=>detector.context()};
}
describe(ID,()=>{
 it("registers independent default OFF and records explicit activation",()=>{
  expect(featureInfo(ID)).toMatchObject({needs:"stall-briefing-v1",group:"guard"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  const {[ID]:omitted,...old}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(old)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(featuresOf(playHarnessFeatures({...ALL_ON,[ID]:true},null))[ID]).toBe(true);
 });
 it("holds due drought during real battle HP changes, records diagnostic, then restarts after battle",()=>{
  const r=rig(true);r.time(STALL_DROUGHT_MS+1);
  r.act({in_battle:true,screen:"battle",party:[{species:"MUDKIP",level:12,hp:8,max_hp:35}]});
  r.act({in_battle:true,screen:"battle",party:[{species:"MUDKIP",level:12,hp:5,max_hp:35}]});
  expect(r.context()).toBeNull();
  expect(r.notes).toHaveLength(1);
  expect(r.notes[0]).toMatchObject({kind:"milestone_drought",mode:"diagnostic",phase:"would_warn"});
  expect(r.notes[0]?.message).toBe("Not sent (drought-progress-facts-v1): the active drought clock reached 5 minutes of play, but a battle is on screen.");
  r.act();expect(r.context()).toBeNull();
  r.time(2*STALL_DROUGHT_MS+2);r.act();
  expect(r.context()).toContain("No new milestone counted by the active drought clock for 5 minutes");
 });
 it("OFF keeps legacy battle warnings and wording",()=>{
  const r=rig(false);r.time(STALL_DROUGHT_MS+1);r.act({in_battle:true,screen:"battle"});
  expect(r.context()).toContain("You are stalling.");expect(r.context()).toContain("the game is not moving forward");
 });
 it("delivers factual wall/action notes without retiring useful briefing facts",()=>{
  for(const turns of [false,true]){
   const r=rig(true,{"turn-drought-clock-v1":turns});r.time(STALL_DROUGHT_MS+1);
   for(let i=0;i<(turns?30:1);i++)r.act();
   const text=r.context()??"";expect(text).toContain("SUPERVISOR: No new milestone");
   expect(text).toContain("Where you are: ROUTE 103");expect(text).toContain("Listed here that you have not tried yet:");
   expect(text).not.toMatch(/stalling|not moving forward|not working|do not try it again|Make a new plan|choose a different action/i);
  }
 });
 it("reuses the landed campaign clock for earned post-Rustboro steps without crediting baselines",()=>{
  for(const name of ["DEVON_GOODS_RECOVERED","DEVON_GOODS_RETURN_REPORTED","STEVEN_LETTER_RECEIVED","DEVON_PRESIDENT_SCENE_COMPLETE","DEWFORD_TOWN","STEVEN_REACHED","STEVEN_LETTER_DELIVERED","STEVEN_REGISTERED"]){
   for(const origin of ["observed","present_at_start"]){
    const r=rig(true,{"campaign-progress-clock-v1":true});r.time(290000);
    r.emit({type:"milestone",name,origin,kind:"story",server_timestamp:1});r.time(301000);r.act();
    expect(r.context()===null,`${name} ${origin}`).toBe(origin==="observed");
   }
  }
 });
 it("preserves complete historical OFF bytes and every observed fact in factual notes",()=>{
  const events=gunzipSync(readFileSync(new URL("./fixtures/briefing-sh02.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
  const start=events.find(e=>e.type==="run_start");if(start?.type!=="run_start")throw Error("no start");
  const off=new SupervisorBriefing({...featuresOf(start.harness_features),[ID]:false});
  const on=new SupervisorBriefing({...featuresOf(start.harness_features),[ID]:true});
  for(const e of events){
   if(e.type==="loop_guard"&&e.kind==="milestone_drought"){
    const stall={kind:"milestone_drought",minutes:5} as const;
    expect(off.stallText(stall,e.calls)).toBe(e.message);
    const factual=on.stallText(stall,e.calls);
    const facts=e.message.split("\n").filter(l=>l.startsWith("- "));
    expect(factual.split("\n").filter(l=>l.startsWith("- "))).toEqual(facts);
    expect(factual).not.toMatch(/not moving forward|not working|do not try it again|Make a new plan/);
   }else {off.observe(e);on.observe(e);}
  }
 });
});

it("keeps ee12 t428's true south exit facts before the t429 breakout",()=>{
 // Immutable events prefix through seq11919: SHA256 39c2aa50110b6e00d69c217072fbcf2eb23543b5dd77370330f019a9d39e0e34.
 // Offline projection: supervisor-consumed state fields only; no navigation grid, game stats, RAM or model thinking.
 const events=gunzipSync(readFileSync(new URL("./fixtures/drought-ee12.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
 const start=events.find(e=>e.type==="run_start");if(start?.type!=="run_start")throw Error("no start");
 const features={...featuresOf(start.harness_features),[ID]:false};
 const off=new SupervisorBriefing(features),on=new SupervisorBriefing({...features,[ID]:true});let checked=0;
 for(const e of events){
  if(e.seq===11919&&e.type==="loop_guard"){
   const stall={kind:"milestone_drought",minutes:50} as const;
   const original=off.stallText(stall,e.calls),factual=on.stallText(stall,e.calls);
   expect(original).toBe(e.message);
   expect(factual.split("\n").filter(l=>l.startsWith("- "))).toEqual(original.split("\n").filter(l=>l.startsWith("- ")));
   expect(factual).toContain("SOUTH -> OLDALE TOWN");
   expect(factual).not.toMatch(/not moving forward|not working|do not try it again|Make a new plan/);
   checked++;
  }else {off.observe(e);on.observe(e);}
 }
 expect(checked).toBe(1);
});

it("holds action droughts too, without importing heal-trip policy",()=>{
 const r=rig(true,{"turn-drought-clock-v1":true});
 for(let i=0;i<30;i++)r.act({in_battle:true,screen:"battle"});
 expect(r.context()).toBeNull();expect(r.notes).toHaveLength(1);
 expect(r.notes[0]?.message).toContain("30 actions, but a battle is on screen");
});
it.each(["evolution","summary_move_forget"])("does not mistake verified %s ownership for a battle independently of the other switches",owner=>{
 for(const owned of [false,true])for(const legacyHold of [false,true]){
  const label=`${owner}, owned=${String(owned)}, legacyHold=${String(legacyHold)}`;
  const r=rig(true,{"owned-battle-context-v1":owned,"drought-battle-heal-hold-v1":legacyHold});r.time(STALL_DROUGHT_MS+1);
  r.act({in_battle:true,screen:owner==="evolution"?"evolution":"menu",active_ui:{phase:owner,selected:null,ready:true,controls:"",diagnostic:null}});
  expect(r.context(),label).toContain("No new milestone counted by the active drought clock");
  expect(r.notes.filter(n=>n.mode==="diagnostic"),label).toEqual([]);
 }
});
it("holds actual battles for every owner and legacy-hold combination",()=>{
 for(const owned of [false,true])for(const legacyHold of [false,true]){
  const label=`owned=${String(owned)}, legacyHold=${String(legacyHold)}`;
  const r=rig(true,{"owned-battle-context-v1":owned,"drought-battle-heal-hold-v1":legacyHold});r.time(STALL_DROUGHT_MS+1);
  r.act({in_battle:true,screen:"battle",active_ui:null});
  expect(r.context(),label).toBeNull();
  expect(r.notes,label).toHaveLength(1);
  expect(r.notes[0],label).toMatchObject({kind:"milestone_drought",mode:"diagnostic",phase:"would_warn"});
  expect(r.notes[0]?.message,label).toBe("Not sent (drought-progress-facts-v1): the active drought clock reached 5 minutes of play, but a battle is on screen.");
 }
});
it("keeps factual wording in focused and owned-interface briefing variants",()=>{
 const focused=rig(true,{"supervisor-briefing-v2":true});focused.time(STALL_DROUGHT_MS+1);focused.act();
 expect(focused.context()).toContain("choose an action");expect(focused.context()).not.toContain("choose a different action");
 const rows=gunzipSync(readFileSync(new URL("../test-support/showcase-nickname/events.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
 const start=rows[0];if(start?.type!=="run_start")throw Error("no start");
 const recorded=(start as unknown as {evaluation:{features:Record<string,boolean>}}).evaluation.features;
 const b=new SupervisorBriefing({...BASE,...recorded,[ID]:true});
 for(const e of rows){if(e.seq>=7244)break;b.observe(e);}
 const note=b.stallText({kind:"milestone_drought",minutes:5},302);
 expect(note).toContain("nickname naming editor");expect(note).toContain("Choose your next action");expect(note).not.toMatch(/not working|Make a new plan/);
});

it("does not claim no milestone was recorded when the active clock excludes earned campaign progress",()=>{
 const r=rig(true,{"campaign-progress-clock-v1":false});r.time(290000);
 r.emit({type:"milestone",name:"DEWFORD_TOWN",origin:"observed",kind:"story",server_timestamp:1});
 r.time(301000);r.act();
 expect(r.context()).toContain("counted by the active drought clock");
});
