import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {ALL_ON,featuresOf,playHarnessFeatures} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {StateMilestones,ACTIVITY_MILESTONES,DEPTH_ORDER} from "./milestones.js";
import {PROGRESS_CATALOG,OPTIONAL_PROGRESS_NAMES,progressReached} from "./story-progress.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {stallBriefing} from "./play-wiring.js";
const ID="campaign-progress-clock-v1";
function state(map:[number,number]=[0,24],x=21,y=25):GameStateSnapshot {
 return parseGameState({...IN_GAME,location:"ROUTE109",map_id:map,position:{x,y},in_battle:false,field_controls_locked:false,story_progress:{flags:"00".repeat(300),rustboro_stage:0,devon_stage:0,letter:false,variables:"00".repeat(512),avatar_flags:1}});
}
function progress(s:GameStateSnapshot){const p=s.story_progress;if(p==null)throw Error("missing native progress");return p;}
function flag(s:GameStateSnapshot,n:number):GameStateSnapshot {
 const b=Buffer.from(progress(s).flags,"hex");b[n>>3]=(b[n>>3]??0)|(1<<(n&7));return {...s,story_progress:{...progress(s),flags:b.toString("hex")}};
}
function variable(s:GameStateSnapshot,n:number,value:number):GameStateSnapshot {
 const b=Buffer.from(progress(s).variables??"","hex");b.writeUInt16LE(value,2*(n-0x4000));return {...s,story_progress:{...progress(s),variables:b.toString("hex")}};
}
describe("campaign native predicates",()=>{
 it("credits the beach after landing, excluding transit, water and absent evidence",()=>{
  const s=state();expect(progressReached("ROUTE_109_BEACH_REACHED",s)).toBe(true);
  expect(progressReached("ROUTE_109_BEACH_REACHED",{...s,field_controls_locked:true})).toBe(null);
  expect(progressReached("ROUTE_109_BEACH_REACHED",{...s,story_progress:{...progress(s),avatar_flags:8}})).toBe(false);
  expect(progressReached("ROUTE_109_BEACH_REACHED",{...s,story_progress:null})).toBe(null);
 });
 it("separates the Route118 banks and Ever Grande landings",()=>{
  expect(progressReached("ROUTE_118_EAST_BANK_REACHED",state([0,33],12,10))).toBe(false);
  expect(progressReached("ROUTE_118_EAST_BANK_REACHED",state([0,33],44,11))).toBe(true);
  expect(progressReached("EVER_GRANDE_LANDING",state([0,8],20,70))).toBe(false);
  expect(progressReached("EVER_GRANDE_LANDING",state([0,8],27,49))).toBe(true);
  expect(progressReached("EVER_GRANDE_NORTH_REACHED",state([0,8],27,49))).toBe(false);
  expect(progressReached("EVER_GRANDE_NORTH_REACHED",state([0,8],18,26))).toBe(true);
 });
 it("records the stable Space Center stage even after its notification flag clears",()=>{
  expect(progressReached("SPACE_CENTER_STORY_COMPLETE",variable(state(),0x409f,3))).toBe(true);
  expect(progressReached("SPACE_CENTER_STORY_COMPLETE",variable(state(),0x409f,2))).toBe(false);
  expect(progressReached("SPACE_CENTER_STORY_COMPLETE",variable(state(),0x409f,65535))).toBe(null);
 });
 it("distinguishes Rayquaza awakening, resolution, champion win and game clear",()=>{
  const awake=variable(state(),0x405e,5);
  expect(progressReached("RAYQUAZA_AWAKENED",awake)).toBe(true);
  expect(progressReached("SOOTOPOLIS_CRISIS_RESOLVED",awake)).toBe(false);
  expect(progressReached("SOOTOPOLIS_CRISIS_RESOLVED",variable(awake,0x40ca,2))).toBe(true);
  expect(progressReached("GAME_CLEAR_CONFIRMED",state())).toBe(false);
  expect(progressReached("GAME_CLEAR_CONFIRMED",flag(state(),0x864))).toBe(true);
 });
 it("deduplicates earned arrivals and excludes checkpoint baselines",()=>{
  const tracker=new StateMilestones({read:()=>Promise.resolve(state())});tracker.initialize("save_state");
  expect(tracker.observe(state(),1).find(m=>m.name==="ROUTE_109_BEACH_REACHED")?.origin).toBe("present_at_start");
  expect(tracker.observe(state(),2).filter(m=>m.name==="ROUTE_109_BEACH_REACHED")).toEqual([]);
  const earned=new StateMilestones({read:()=>Promise.resolve(state())});earned.initialize("save_state");earned.observe(state([0,11]),1);
  expect(earned.observe(state(),2).find(m=>m.name==="ROUTE_109_BEACH_REACHED")).toMatchObject({origin:"observed",evidence:[2]});
 });
 it("keeps optional achievements outside campaign depth",()=>{
  expect(OPTIONAL_PROGRESS_NAMES.has("HM_FLASH_RECEIVED")).toBe(true);
  expect(ACTIVITY_MILESTONES.has("HM_FLASH_RECEIVED")).toBe(true);
  expect(DEPTH_ORDER).not.toContain("HM_FLASH_RECEIVED");
  expect(PROGRESS_CATALOG.some(m=>m.name==="POKEMON_LEAGUE_REACHED")).toBe(true);
 });
});
function clock(enabled:boolean,turns=false){
 const features={...ALL_ON,[ID]:enabled,"turn-drought-clock-v1":turns,"positive-supervisor-v1":false,"progress-aware-cycles-v1":false,"story-character-stall-gate-v1":false,"drought-battle-heal-hold-v1":false,"milestone-drought-suppression-v1":false};
 const listeners:((e:RunEvent)=>void)[]=[];const notes:string[]=[];let seq=0,now=0;
 stallBriefing(features,{subscribe:(f:(e:RunEvent)=>void)=>listeners.push(f),recordLoopGuard:()=>undefined,recordStallGate:()=>undefined},{stall:(_k,text)=>{notes.push(text(1));return true;}},{pausedMs:()=>0},()=>now);
 const emit=(b:Record<string,unknown>)=>{const e=checkEvent({v:1,run:"r",seq:++seq,turn:seq,t:"2026-10-23T12:00:00.000-04:00",...b});listeners.forEach(f=> { f(e); });};
 const milestone=(name:string,origin="observed")=>{emit({type:"milestone",name,kind:"story",origin,server_timestamp:1,evidence:[1]});};
 const act=()=>{emit({type:"tool_result",id:"a",name:"press",text:"x",is_error:false,duration_ms:1,frames:[]});};
 return {milestone,act,notes,time:(n:number)=>{now=n;}};
}
describe("campaign drought production wiring",()=>{
 it("defaults off in omitted presets and flags and records explicit activation",()=>{
  const {[ID]:omitted,...legacy}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(legacy)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(featuresOf(playHarnessFeatures({...ALL_ON,[ID]:true},null))[ID]).toBe(true);
 });
 it("OFF preserves the previous clock while ON credits earned Devon and beach progress",()=>{
  for(const enabled of [false,true]){const r=clock(enabled);r.time(290000);r.milestone("DEVON_GOODS_RECOVERED");r.time(301000);r.act();expect(r.notes).toHaveLength(enabled?0:1);}
  const r=clock(true,true);for(let i=0;i<29;i++)r.act();r.milestone("ROUTE_109_BEACH_REACHED");r.act();expect(r.notes).toEqual([]);
  for(let i=0;i<29;i++)r.act();expect(r.notes).toHaveLength(1);
 });
 it("present-at-start and optional milestones never reset the campaign clock",()=>{
  for(const [name,origin] of [["ROUTE_109_BEACH_REACHED","present_at_start"],["HM_FLASH_RECEIVED","observed"]] as const){const r=clock(true);r.time(290000);r.milestone(name,origin);r.time(301000);r.act();expect(r.notes).toHaveLength(1);}
 });
});

it("an already credited campaign milestone cannot keep restarting the drought clock",()=>{
 const r=clock(true);r.time(1000);r.milestone("DEVON_GOODS_RECOVERED");r.time(290000);r.milestone("DEVON_GOODS_RECOVERED");r.time(302000);r.act();expect(r.notes).toHaveLength(1);
});

it("credits automatic interior entry before the ensuing battle or Hall of Fame scene finishes",()=>{
 const champion={...state([16,4]),field_controls_locked:true};
 expect(progressReached("CHAMPION_ROOM_REACHED",champion)).toBe(true);
 expect(progressReached("WALLACE_DEFEATED",champion)).toBe(false);
 expect(progressReached("HALL_OF_FAME_ENTERED",{...champion,map_id:[16,11]})).toBe(true);
 expect(progressReached("GAME_CLEAR_CONFIRMED",champion)).toBe(false);
});
