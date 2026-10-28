import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON as REGISTRY_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {BRIEFING_DIALOGUE_CHARS,BRIEFING_ELSEWHERE_CHARS,BRIEFING_EXITS_CHARS,SupervisorBriefing} from "./loop-supervisor.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {loopSupervisor,textOnlySupervisor} from "./play-wiring.js";

const ID="supervisor-briefing-bound-v1";
const BASE:FeatureSet={...ALL_ON,"battle-decision-ready-v1":false,"cache-aligned-window-v1":false,"next-milestone-hint-v1":false,"briefing-exits-v1":false,"dialogue-context-kept-v1":true,"stall-briefing-v1":true};
const OFF:FeatureSet={...BASE,[ID]:false};
const ON:FeatureSet={...BASE,[ID]:true};
const HEAD="- Dialogue you were shown leading up to the last story step the game confirmed";
const ELSEWHERE="- Not tried yet on other maps you have been on since your last story progress: ";
const STALL={kind:"milestone_drought",minutes:30} as const;

const ev=(body:Record<string,unknown>,seq:number,turn:number):RunEvent=>checkEvent({v:1,run:"bound",t:"2026-10-28T00:00:00.000-04:00",turn,seq,...body});
const shown=(b:SupervisorBriefing,seq:number,turn:number,dialogue:string|null,room={location:"HOUSE 1F",map_id:[1,0]},targets:unknown[]=[])=>{
 b.observe(ev({type:"state",...IN_GAME,started:true,screen:"overworld",...room,position:{x:4,y:5},facing:"left",interaction_targets:targets,world_context:{objects:[],triggers:[],dialogue}},seq,turn));
 b.observe(ev({type:"tool_result",id:`r${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:seq},seq+1,turn));
};
const story=(b:SupervisorBriefing,seq:number,turn:number,name:string)=>{b.observe(ev({type:"milestone",name,server_timestamp:1,kind:"story",origin:"observed"},seq,turn));};
const line=(text:string,start:string)=>text.split("\n").find(l=>l.startsWith(start))??"";

// 120 distinct pages of about 60 chars each between two story steps: about 9,000 chars of quoted pages.
function talkative(features:FeatureSet):SupervisorBriefing {
 const b=new SupervisorBriefing(features);
 story(b,1,1,"FIRST_STEP");
 for(let i=0;i<120;i++)shown(b,10+2*i,2+i,`Page ${String(i).padStart(3,"0")} of a long talk that goes on and on.`);
 story(b,1000,130,"SECOND_STEP");
 return b;
}

describe("supervisor-briefing-bound-v1: the story lead-up dialogue",()=>{
 it("OFF keeps every page, oldest first, as today",()=>{
  const l=line(talkative(OFF).stallText(STALL,200),HEAD);
  expect(l.startsWith(`${HEAD} (second step at turn 130), oldest first: turn 2, HOUSE 1F (map 1/0): "Page 000`)).toBe(true);
  expect(l.split(" | ")).toHaveLength(120);
 });

 it("ON keeps whole pages, newest first, within the budget, shows them oldest first and counts the rest",()=>{
  const on=talkative(ON).stallText(STALL,200),off=talkative(OFF).stallText(STALL,200);
  const l=line(on,HEAD);
  const m=/^- Dialogue you were shown leading up to the last story step the game confirmed \(second step at turn 130\), oldest first \((\d+) earlier pages are left out; get_dialogue searches the pages the harness advanced through\): (.*)$/.exec(l);
  expect(m).not.toBeNull();
  const kept=(m?.[2]??"").split(" | ");
  expect(Number(m?.[1])+kept.length).toBe(120);
  expect(kept.at(-1)).toContain("Page 119 ");
  expect(kept[0]).toContain(`Page ${String(120-kept.length).padStart(3,"0")} `);
  expect((m?.[2]??"").length).toBeLessThanOrEqual(BRIEFING_DIALOGUE_CHARS);
  const one=`turn 2, HOUSE 1F (map 1/0): "Page 000 of a long talk that goes on and on." | `;
  expect((m?.[2]??"").length+one.length).toBeGreaterThan(BRIEFING_DIALOGUE_CHARS);
  for(const page of kept)expect(line(off,HEAD)).toContain(page);
  expect(on.replace(l,"")).toBe(off.replace(line(off,HEAD),""));
 });

 it("ON without auto-advance names no tool, and with nothing left out is byte-identical to OFF",()=>{
  const plain=line(talkative({...ON,"dialogue-auto-advance-v1":false}).stallText(STALL,200),HEAD);
  expect(plain).toMatch(/oldest first \(\d+ earlier pages are left out\): turn /);
  const small=(f:FeatureSet)=>{const b=new SupervisorBriefing(f);story(b,1,1,"A");shown(b,10,2,"Just one page.");story(b,20,3,"B");return b.stallText(STALL,9);};
  expect(small(ON)).toBe(small(OFF));
 });

 it("ON keeps the newest page even when it alone is over the budget",()=>{
  const b=new SupervisorBriefing(ON);story(b,1,1,"A");
  shown(b,10,2,"Older page.");shown(b,12,3,"x".repeat(BRIEFING_DIALOGUE_CHARS+10));story(b,20,4,"B");
  const l=line(b.stallText(STALL,9),HEAD);
  expect(l).toContain("(1 earlier page is left out; get_dialogue");
  expect(l).toContain("x".repeat(BRIEFING_DIALOGUE_CHARS+10));
  expect(l).not.toContain("Older page.");
 });
});

describe("supervisor-briefing-bound-v1: budgets in code points, through the production factories",()=>{
 it("counts code points, not UTF-16 units: two astral pages that fit by code points both stay",()=>{
  const b=new SupervisorBriefing(ON);story(b,1,1,"A");
  shown(b,10,2,`Older ${"😀".repeat(1500)}`);shown(b,12,3,`Newer ${"😀".repeat(1500)}`);story(b,20,4,"B");
  const l=line(b.stallText(STALL,9),HEAD);
  expect(l).not.toContain("left out");
  expect(l).toContain("Older ");expect(l).toContain("Newer ");
 });
 // The factories the agent loop calls forward the run's switches to the briefing they build.
 const feed=(features:FeatureSet)=>{
  const subs:((e:RunEvent)=>void)[]=[];const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},textOnlySupervisor:()=>undefined};
  const loop=loopSupervisor({...features,"loop-guard-supervisor-v1":true},recorder);
  const textOnly=textOnlySupervisor({...features,"text-only-supervisor-v1":true},recorder);
  const b={observe:(e:RunEvent)=>{for(const fn of subs)fn(e);}} as unknown as SupervisorBriefing;
  story(b,1,1,"FIRST_STEP");
  for(let i=0;i<120;i++)shown(b,10+2*i,2+i,`Page ${String(i).padStart(3,"0")} of a long talk that goes on and on.`);
  story(b,1000,130,"SECOND_STEP");
  return {loop:loop?.("cycle",200)??"",textOnly:textOnly?.(3,1)??""};
 };
 it("loopSupervisor and textOnlySupervisor bound the dialogue line only when the switch is on",()=>{
  const on=feed(ON),off=feed(OFF);
  for(const text of [on.loop,on.textOnly])expect(line(text,HEAD)).toMatch(/oldest first \(\d+ earlier pages are left out/);
  for(const text of [off.loop,off.textOnly]){expect(line(text,HEAD)).not.toContain("left out");expect(line(text,HEAD).split(" | ")).toHaveLength(120);}
 });
});

describe("supervisor-briefing-bound-v1: untried targets on other maps",()=>{
 // 60 maps walked since the last story step, each with four untried signs: about 13,000 chars.
 function walked(features:FeatureSet):SupervisorBriefing {
  const b=new SupervisorBriefing(features);
  story(b,1,1,"A");
  for(let i=0;i<60;i++){
   const targets=[0,1,2,3].map(k=>({kind:"bg_event",x:k,y:i%7,elevation:0,activation:"A",availability:"available",facing:null,local_id:null,destination:null,name:`Sign ${String(k)} of map ${String(i)}`}));
   shown(b,10+2*i,2+i,null,{location:`ROOM ${String(i).padStart(2,"0")}`,map_id:[30,i]},targets);
  }
  shown(b,500,90,null,{location:"HERE",map_id:[31,0]});
  return b;
 }
 it("OFF lists every map, newest first",()=>{
  const l=line(walked(OFF).stallText(STALL,200),ELSEWHERE);
  expect(l.slice(ELSEWHERE.length).split(" | ")).toHaveLength(60);
 });
 it("ON keeps whole map entries, newest first, within the budget, and counts the rest",()=>{
  const on=walked(ON).stallText(STALL,200),off=walked(OFF).stallText(STALL,200);
  const l=line(on,ELSEWHERE);
  const m=/^(.*); (\d+) earlier maps are left out$/.exec(l.slice(ELSEWHERE.length));
  expect(m).not.toBeNull();
  const kept=(m?.[1]??"").split(" | ");
  expect(kept.length+Number(m?.[2])).toBe(60);
  expect(kept[0]?.startsWith("ROOM 59 (map 30/59): ")).toBe(true);
  expect((m?.[1]??"").length).toBeLessThanOrEqual(BRIEFING_ELSEWHERE_CHARS);
  expect(line(off,ELSEWHERE).startsWith(`${ELSEWHERE}${m?.[1]??""} | `)).toBe(true);
  expect(on.replace(l,"")).toBe(off.replace(line(off,ELSEWHERE),""));
 });
});

describe("supervisor-briefing-bound-v1: exits to maps not entered",()=>{
 const EXITS="- Exits to maps you have not entered since your last story progress: ";
 // 60 maps walked since the last story step, each with three warps to maps never entered.
 function exits(features:FeatureSet):SupervisorBriefing {
  const b=new SupervisorBriefing(features);
  story(b,1,1,"A");
  for(let i=0;i<60;i++){
   const targets=[0,1,2].map(k=>({kind:"warp",x:k,y:i%7,elevation:0,activation:"walk",availability:"available",facing:null,local_id:null,destination:[40+k,i,0],name:null}));
   shown(b,10+2*i,2+i,null,{location:`ROOM ${String(i).padStart(2,"0")}`,map_id:[30,i]},targets);
  }
  return b;
 }
 it("OFF lists every map, nearest first",()=>{
  expect(line(exits(OFF).stallText(STALL,200),EXITS).slice(EXITS.length).split(" | ")).toHaveLength(60);
 });
 it("ON keeps whole map entries, nearest first, within the budget, and counts the rest",()=>{
  const on=exits(ON).stallText(STALL,200),off=exits(OFF).stallText(STALL,200);
  const l=line(on,EXITS);
  const m=/^(.*); (\d+) earlier maps are left out$/.exec(l.slice(EXITS.length));
  expect(m).not.toBeNull();
  const kept=(m?.[1]??"").split(" | ");
  expect(kept.length+Number(m?.[2])).toBe(60);
  expect(kept[0]?.startsWith("ROOM 59 (map 30/59): ")).toBe(true);
  expect((m?.[1]??"").length).toBeLessThanOrEqual(BRIEFING_EXITS_CHARS);
  expect(line(off,EXITS).startsWith(`${EXITS}${m?.[1]??""} | `)).toBe(true);
  // These warps are also untried, so the other-map list (bounded on its own) differs too; every other line is unchanged.
  const rest=(t:string)=>t.replace(line(t,EXITS),"").replace(line(t,ELSEWHERE),"");
  expect(rest(on)).toBe(rest(off));
 });
});

describe("supervisor-briefing-bound-v1 registry",()=>{
 it("is registered last, default off, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(296);
  expect(playHarnessFeatures({...REGISTRY_ON,[ID]:true},null).at(-1)).toBe(ID);
  expect(featureInfo(ID).description).toContain(" Off: every page and every map is listed.");
  const {[ID]:value,...omitted}={...REGISTRY_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...REGISTRY_ON,[ID]:false},null)).not.toContain(ID);
 });
});
