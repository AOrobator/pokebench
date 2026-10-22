import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {stallBriefing} from "./play-wiring.js";
import {INTERFACE_DWELL_CALLS,STALL_DROUGHT_MS} from "./stall-briefing.js";
import {attachLoopGuard,Governor} from "./harness.js";
import type {LoopNotice} from "./loop-detection.js";

const ID="milestone-drought-suppression-v1";
const raw=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/drought-cutscene-557c.json.gz",import.meta.url))).toString("utf8")) as {source:string;events:unknown[]};
const events=raw.events.map(checkEvent);
const state=events.find(e=>e.type==="state"&&"started"in e);
if(state?.type!=="state"||!("started"in state))throw new Error("missing recorded cutscene state");
const result=events.find(e=>e.type==="tool_result");
if(result?.type!=="tool_result")throw new Error("missing delivered observation");
const BASE={...LEGACY_ALL_ON,"positive-supervisor-v1":false,"drought-battle-heal-hold-v1":false,"stall-briefing-v1":true};
function rig(on:boolean,positive=false){
 const subscribers:((e:RunEvent)=>void)[]=[];const notes:LoopNotice[]=[];const sent:{kind:string;text:string;evidence:readonly number[]}[]=[];
 let now=STALL_DROUGHT_MS+1;
 const features:FeatureSet={...BASE,[ID]:on,"positive-supervisor-v1":positive};
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notes.push(n);},recordStallGate:()=>undefined};
 stallBriefing(features,recorder,{stall:(kind,text,evidence)=>{sent.push({kind,text:text(311),evidence});return true;}},{pausedMs:()=>0},()=>now);
 const emit=(e:RunEvent)=>{for(const fn of subscribers)fn(e);};
 return {features,notes,sent,emit,advance:()=>{now+=STALL_DROUGHT_MS;}};
}
describe(ID,()=>{
 it("is independent, default off in omitted and flag presets, declared in run metadata",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"stall-briefing-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(normalizeFeatures(BASE)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures(rig(true).features,null)).toContain(ID);
  expect(playHarnessFeatures(rig(false).features,null)).not.toContain(ID);
 });
 it("OFF reproduces the recorded false cutscene intervention",()=>{
  const r=rig(false);r.emit(state);r.emit(result);
  expect(r.sent).toHaveLength(1);
  expect(r.sent[0]?.kind).toBe("milestone_drought");
  expect(r.sent[0]?.text).toContain("SUPERVISOR: You are stalling. There has been no new story milestone for 5 minutes of play, and the game is not moving forward");
  expect(r.sent[0]?.text).toContain('Hmmm… Not a one to be found…');
  expect(r.notes).toEqual([]);
 });
 it("ON keeps the due cutscene warning diagnostic and delivers no drought instruction",()=>{
  expect(state.field_controls_locked).toBe(true);
  expect(result.text).toContain("Field-message phase: dismiss_wait");
  const r=rig(true);r.emit(state);r.emit(result);r.emit(result);
  expect(r.sent).toEqual([]);
  expect(r.notes).toEqual([{kind:"milestone_drought",message:`Not sent (${ID}): No new story milestone for 5 minutes of play.`,calls:0,evidence:[24542],mode:"diagnostic",phase:"would_warn"}]);
  r.advance();r.emit(result);
  expect(r.notes.at(-1)?.message).toBe(`Not sent (${ID}): No new story milestone for 10 minutes of play.`);
 });
 it("also suppresses droughts on the free field; turning the positive supervisor on preserves its old diagnostic bytes",()=>{
  const r=rig(true);r.emit({...state,field_controls_locked:false,world_context:null});r.emit(result);
  expect(r.sent).toEqual([]);expect(r.notes).toHaveLength(1);
  const existing=rig(false,true),combined=rig(true,true);
  for(const r of [existing,combined]){r.emit(state);r.emit(result);}
  expect(combined.notes).toEqual(existing.notes);
  expect(combined.notes[0]?.message).toBe("Not sent (positive-supervisor-v1): No new story milestone for 5 minutes of play.");
 });
 it("the actual loop detector queues OFF feedback for the next decision, and none with ON",()=>{
  for(const on of [false,true]){
   const subscribers:((e:RunEvent)=>void)[]=[];const notes:LoopNotice[]=[];
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{notes.push(n);},recordStallGate:()=>undefined};
   const governor=new Governor({limits:{maxTurns:1000,maxWallMs:1e9,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
   const detector=attachLoopGuard(recorder,governor,undefined,"enforced");
   stallBriefing({...BASE,[ID]:on},recorder,detector,{pausedMs:()=>0},()=>STALL_DROUGHT_MS+1);
   for(const e of [state,result])for(const fn of subscribers)fn(e);
   const feedback=detector.context();
   if(on){expect(feedback).toBeNull();expect(notes.map(n=>n.phase)).toEqual(["would_warn"]);}
   else {expect(feedback).toContain("SUPERVISOR: You are stalling.");expect(notes.map(n=>n.phase)).toEqual(["supervisor"]);}
  }
 });
 it("keeps interface-dwell intervention text and evidence byte-identical",()=>{
  const off=rig(false),on=rig(true);
  for(const r of [off,on])for(let i=0;i<=INTERFACE_DWELL_CALLS;i++){
   const s={...state,seq:26000+i*2,active_ui:{phase:"bag_menu",ready:true,selected:"POTION",controls:"A chooses; B exits",diagnostic:null,value:null,details:{}},screen:"bag_menu",world_context:null};
   r.emit(s);r.emit({...result,seq:s.seq+1,state_seq:s.seq});
  }
  expect(on.sent.filter(n=>n.kind==="interface_dwell")).toEqual(off.sent.filter(n=>n.kind==="interface_dwell"));
  expect(on.sent.filter(n=>n.kind==="interface_dwell")).toHaveLength(1);
 });
 it("keeps map-cycle intervention text and evidence byte-identical",()=>{
  const off=rig(false),on=rig(true);
  for(const r of [off,on]){
   for(let i=0;i<5;i++){
    const s={...state,seq:25000+i*2,field_controls_locked:false,world_context:null,map_id:[0,i%2] as [number,number]};
    r.emit(s);r.emit({...result,seq:s.seq+1,state_seq:s.seq});
   }
  }
  expect(on.sent.filter(n=>n.kind==="map_cycle")).toEqual(off.sent.filter(n=>n.kind==="map_cycle"));
  expect(on.sent.filter(n=>n.kind==="map_cycle")).toHaveLength(1);
 });
});
