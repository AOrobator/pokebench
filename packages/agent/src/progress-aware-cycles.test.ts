// Exact records retained from fd95 turns 214-239 and 0ced turns 245-255 and 395-410, plus run_start.
// State bodies, text, frame references and sequence numbers are unchanged. Other event types are omitted.
// Rehearsal routes are added in memory using the separately recorded game map table; source logs stay unchanged.
import {describe,it,expect} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {ProgressAwareCycles,healRoutes,HEAL_TRIP_CALL_LIMIT,HEAL_TRIP_IDLE_LIMIT} from "./progress-aware-cycles.js";
import {IN_GAME} from "../test-support/events.js";
import type {Place} from "./story-destinations.js";

const A:[number,number]=[0,18],B:[number,number]=[0,10],C:[number,number]=[2,2];
function rig(){
 const tracker=new ProgressAwareCycles();let seq=0,turn=1;
 const emit=(body:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"trip",seq:++seq,turn,t:"2026-10-21T08:00:00.000-04:00",...body});tracker.observe(e);return e;};
 const state=(map=A,x=0,full=false)=>emit({type:"state",...IN_GAME,party_owner:"player",map_id:map,position:{x,y:0},party:[{...IN_GAME.party[0],species:"TORCHIC",hp:full?20:5,max_hp:20,is_egg:false}]});
 const result=(map=A,x=0,full=false)=>{turn++;const s=state(map,x,full);emit({type:"tool_result",id:String(seq),name:"press",is_error:false,duration_ms:0,text:"result",frames:[],state_seq:s.seq});};
 const gate=(outcome="refused")=>emit({type:"story_battle_heal_gate",tool_call_id:"gate",tool:"press",map_id:A,confirmed:outcome==="confirmed",outcome,reason:null,reached:[],sightings:[],hurt:[{species:"TORCHIC",hp:5,max_hp:20}],heal:[{kind:"pokemon_center",town:"OLDALE TOWN",map_id:C,hops:2,shown:false}],heal_routes:[{outward:[A,B,C],back:[C,B,A]}],text:"heal"});
 state();return {tracker,emit,state,result,gate};
}
describe("bounded gate-directed healing trip",()=>{
 it("protects outward travel, healing and the entire return, then ends",()=>{
  const r=rig();r.gate();r.result(B,1);expect(r.tracker.hold()?.reason).toBe("heal_trip");
  r.result(C,2);expect(r.tracker.hold()).not.toBeNull();
  r.result(C,2,true);expect(r.tracker.hold()).not.toBeNull();
  r.result(B,3,true);expect(r.tracker.hold()?.reason).toBe("heal_trip");
  r.result(A,4,true);expect(r.tracker.hold()).not.toBeNull();
  r.result(A,5,true);expect(r.tracker.hold()).not.toBeNull();
  r.result(A,0,true);expect(r.tracker.hold()).not.toBeNull();
  r.result(A,1,true);expect(r.tracker.hold()).toBeNull();
 });
 it("requires full HP at the offered destination before protecting the return",()=>{
  const r=rig();r.gate();r.result(B,1);r.result(C,2);r.result(B,3);expect(r.tracker.hold()).toBeNull();
 });
 it("ends immediately on a route deviation",()=>{
  const r=rig();r.gate();r.result([0,9],1);expect(r.tracker.hold()).toBeNull();
 });
 it("counts revisited tiles as no progress, and repeated refusals cannot renew bounds",()=>{
  const r=rig();r.gate();r.result(A,1);
  for(let i=0;i<HEAL_TRIP_IDLE_LIMIT;i++){r.gate();r.result(A,1);}
  expect(r.tracker.hold()).toBeNull();r.gate();r.result(B,2);expect(r.tracker.hold()).toBeNull();
 });
 it("has a hard call cap even while wandering over new tiles",()=>{
  const r=rig();r.gate();for(let x=0;x<HEAL_TRIP_CALL_LIMIT+1;x++)r.result(A,x);
  expect(r.tracker.hold()).toBeNull();
 });
 it("confirmation and battle cancel protection",()=>{
  const r=rig();r.gate();r.gate("confirmed");r.result(B,1);expect(r.tracker.hold()).toBeNull();
  const b=rig();b.gate();b.emit({type:"state",...IN_GAME,in_battle:true});b.result(B,1);expect(b.tracker.hold()).toBeNull();
 });
 it("does not infer a trip from low HP or from an old gate without routes",()=>{
  const r=rig();r.result(B,1);expect(r.tracker.hold()).toBeNull();
  const g=r.gate();if(g.type!=="story_battle_heal_gate")throw new Error("gate");
  const {heal_routes:_routes,...old}=g;expect(_routes).toBeDefined();
  const tracker=new ProgressAwareCycles();tracker.observe(checkEvent({...old,seq:1}));expect(tracker.hold()).toBeNull();
 });
 it("marks newly observed milestone turns but ignores checkpoint facts and startup",()=>{
  const r=rig();r.emit({type:"milestone",name:"ROUTE_103",kind:"navigation",origin:"observed",server_timestamp:0});
  expect(r.tracker.hold()?.reason).toBe("milestone");r.result();expect(r.tracker.hold()).toBeNull();
  r.emit({type:"milestone",name:"RIVAL_BATTLE_WON",kind:"story",origin:"present_at_start",server_timestamp:0});expect(r.tracker.hold()).toBeNull();
 });
});
it("builds directed outward and return paths from the game's map table only",()=>{
 const place=(map_id:[number,number],tos:[number,number][]):Place=>({map_id,name:"map",display:"map",connections:tos.map(to=>({direction:"NORTH",to})),warps:[]});
 expect(healRoutes([place(A,[B]),place(B,[C,A]),place(C,[B])],A,[C])).toEqual([{outward:[A,B,C],back:[C,B,A]}]);
 expect(healRoutes([place(A,[B]),place(B,[C]),place(C,[])],A,[C])).toEqual([]);
});

import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {Value} from "typebox/value";
import {PlacesBodySchema} from "./story-destinations.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {stallBriefing} from "./play-wiring.js";
import {featuresOf,featureInfo,playHarnessFeatures} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import type {LoopNotice} from "./loop-detection.js";
const ID="progress-aware-cycles-v1";
const rawPlaces=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as unknown;
function parsedPlaces(){if(!Value.Check(PlacesBodySchema,rawPlaces))throw new Error("invalid recorded map table");return rawPlaces;}
const places=parsedPlaces();
function recorded(suffix:string):RunEvent[]{return gunzipSync(readFileSync(new URL(`../test-support/progress-cycles-${suffix}.jsonl.gz`,import.meta.url))).toString("utf8").trim().split("\n").map(l=>checkEvent(JSON.parse(l) as unknown));}
function replay(suffix:string,on:boolean|undefined){
 const events=recorded(suffix),start=events.find(e=>e.type==="run_start");if(start?.type!=="run_start")throw new Error("start");
 const f={...featuresOf(start.harness_features),...(on===undefined?{}:{[ID]:on})};
 const subscribers:((e:RunEvent)=>void)[]=[],notices:{at:number;notice:LoopNotice}[]=[],contexts:{at:number;text:string|null}[]=[];let at=0,now=0;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(notice:LoopNotice)=>{notices.push({at,notice});},recordStallGate:()=>undefined};
 const governor=new Governor({limits:{maxTurns:2000,maxWallMs:3600000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",f["interaction-loop-detection-v1"],()=>"SUPERVISOR: cycle",f["transition-loop-detection-v1"],f["pushback-loop-detection-v1"],f["battle-observation-loop-v1"],false,f["ineffective-loops-v1"],false,false,false,false,false,false,false,f);
 stallBriefing(f,recorder,detector,{pausedMs:()=>0},()=>now);
 for(const source of events){
  at=source.seq;now=Date.parse(source.t)-Date.parse(events[0]?.t??source.t);
  // Historical events stay intact on disk. Rehearsal adds routes derived from the recorded game map table.
  const e=on&&source.type==="story_battle_heal_gate"&&source.outcome==="refused"?checkEvent({...source,heal_routes:healRoutes(places.places,source.map_id,source.heal.map(h=>h.map_id))}):source;
  for(const fn of subscribers)fn(e);
  if(e.type==="tool_result")contexts.push({at,text:detector.context()});
 }
 return {events,notices,contexts};
}
it("fd95's production stall path exempts the refused healing trip; OFF and omitted are identical",()=>{
 const off=replay("fd95",false),on=replay("fd95",true);
 expect(replay("fd95",undefined).notices).toEqual(off.notices);
 expect(replay("fd95",undefined).contexts).toEqual(off.contexts);
 expect(off.notices.filter(n=>n.notice.kind==="map_cycle"&&n.notice.phase==="supervisor").map(n=>n.at)).toEqual(expect.arrayContaining([6820,6907]));
 expect(on.notices.filter(n=>n.notice.kind==="map_cycle"&&n.notice.mode==="enforced"&&n.at>=6753)).toEqual([]);
 expect(on.notices.some(n=>n.notice.mode==="diagnostic"&&n.notice.message.includes("progress-aware-cycles-v1"))).toBe(true);
 expect(on.contexts.filter(c=>c.at>=6753).every(c=>c.text===null||!c.text.includes("stalling"))).toBe(true);
});
it("the five cited events distinguish recovery from intervention, and confirmed battles have no trip exemption",()=>{
 const r=replay("0ced",true);
 for(const seq of [6798,12633])expect(r.events.find(e=>e.seq===seq)).toMatchObject({type:"loop_guard",phase:"recovered"});
 expect(r.events.find(e=>e.seq===12424)).toMatchObject({type:"loop_guard",phase:"supervisor"});
 const t=new ProgressAwareCycles();for(const e of r.events){t.observe(e);if(e.seq===12424)expect(t.hold()).toBeNull();}
});
it("registers a default-OFF switch with previous behavior preserved and receipts only when enabled",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null});
 const base=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});expect(base[ID]).toBe(false);
 const {[ID]:_off,...old}=base;expect(_off).toBe(false);expect(normalizeFeatures(old as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
 expect(playHarnessFeatures({...base,[ID]:true},null)).toContain(ID);expect(playHarnessFeatures(base,null)).not.toContain(ID);
});
