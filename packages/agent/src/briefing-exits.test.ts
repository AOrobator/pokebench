import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {ALL_ON,FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {SupervisorBriefing,type Stall} from "./loop-supervisor.js";
import {loopSupervisor,stallBriefing,textOnlySupervisor} from "./play-wiring.js";
import {ExitHistory,readoutNames,usedWarps} from "./exit-history.js";
import {checkEvent,type RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";

const ID="briefing-exits-v1";
// Cook #2 (bundle arm), 2026-10-16T02-23-17_qwen36-gpu1_sh02, seq 0-3616: state events trimmed by the test author to
// the fields the briefings read (no RAM, local map or navigation grid); native_action and assistant events dropped.
// Tool results keep their whole text. Not a parseEvent-valid run.
function recorded():RunEvent[]{
 const path=fileURLToPath(new URL("./fixtures/briefing-sh02.jsonl.gz",import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
}
const EVENTS=recorded();
const start=EVENTS.find(e=>e.type==="run_start");
if(start?.type!=="run_start")throw new Error("fixture has no run_start");
const RECORDED:FeatureSet={...featuresOf(start.harness_features),[ID]:false};
// The stall each recorded loop_guard event briefed, as the run's StallBriefing computed it.
const STALLS:Readonly<Record<number,Stall>>={
 2783:{kind:"map_cycle",from:"LITTLEROOT TOWN (map 0/9)",to:"LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4)",roundTrips:2,consecutive:true},
 3616:{kind:"milestone_drought",minutes:5},
};
// Replays the recorded events through one briefing and returns the stall text at each recorded loop_guard event.
function replay(features:FeatureSet):{seq:number;recorded:string;text:string}[]{
 const briefing=new SupervisorBriefing(features);const out:{seq:number;recorded:string;text:string}[]=[];
 for(const e of EVENTS){
  if(e.type==="loop_guard"){const stall=STALLS[e.seq];if(stall===undefined)throw new Error(`no stall for ${String(e.seq)}`);out.push({seq:e.seq,recorded:e.message,text:briefing.stallText(stall,e.calls)});continue;}
  briefing.observe(e);
 }
 return out;
}
const line=(text:string,head:string):string=>text.split("\n").find(l=>l.startsWith(head))??"";
const MAYS_OFF="LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2): Warp to map 0/9 at 1,8 (movement; activation depends on metatile (see local map)); Warp to map 0/9 at 2,8 (movement; activation depends on metatile (see local map)); Warp to map 1/3 at 2,2 (movement; activation depends on metatile (see local map)); WOMAN_4 at 3,8 (A); NINJA_BOY at 9,5 (A); coordinate_trigger at 2,8 (step); coordinate_trigger at 1,3 (step); coordinate_trigger at 2,4 (step); coordinate_trigger at 3,3 (step); television at 6,4 (A)";
const MAYS_ON="LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2): Warp to PROF. BIRCH'S HOUSE 2F (map 1/3) at 2,2 (movement; activation depends on metatile (see local map)); WOMAN_4 at 3,8 (A); NINJA_BOY at 9,5 (A); coordinate_trigger at 1,3 (step); coordinate_trigger at 2,4 (step); coordinate_trigger at 3,3 (step); television at 6,4 (A)";
const EXITS_ON="- Exits to maps you have not entered since your last story progress: LITTLEROOT TOWN (map 0/9): Warp to GMREEN's HOUSE 1F (map 1/0) at 5,8 | LITTLEROOT TOWN MAYS HOUSE 1F (map 1/2): Warp to PROF. BIRCH'S HOUSE 2F (map 1/3) at 2,2";

describe("briefing-exits-v1 on cook #2 (sh02): the recorded stall briefings at seq 2783 (T134) and 3616 (T171)",()=>{
 it("OFF reproduces both recorded loop_guard messages byte for byte",()=>{
  const off=replay(RECORDED);
  expect(off.map(r=>r.seq)).toEqual([2783,3616]);
  for(const r of off)expect(r.text).toBe(r.recorded);
  expect(off[0]?.text).toContain(MAYS_OFF);
 });

 it("ON never lists the door the player arrived on and left through (T113-T116), or the trigger it stood on, as untried",()=>{
  for(const r of replay({...RECORDED,[ID]:true})){
   const elsewhere=line(r.text,"- Not tried yet on other maps");
   expect(elsewhere).toContain(MAYS_ON);
   expect(elsewhere).not.toMatch(/at 1,8|at 2,8/);
   // The lab's furniture is dropped from nothing: only used exits and stood-on triggers leave a list.
   expect(elsewhere).toContain("LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4): Machine at 10,7 (A); Machine at 11,7 (A); Book at 8,1 (A); Bookshelf at 1,1 (A); Bookshelf at 0,7 (A); Bookshelf at 1,7 (A); Bookshelf at 2,7 (A); Bookshelf at 3,7 (A); PC at 4,1 (A); PC at 3,1 (A); PC at 1,10 (A); PC at 1,9 (A); PC at 11,10 (A); PC at 11,9 (A)");
  }
 });

 it("ON puts the unentered exits, named as the readout names them, and the latest story step's dialogue first",()=>{
  for(const r of replay({...RECORDED,[ID]:true})){
   const lines=r.text.split("\n");
   expect(lines[1]).toBe("Stop and get your bearings:");
   expect(lines[2]).toMatch(/^- Where you are: LITTLEROOT TOWN \(map 0\/9\) at /);
   expect(lines[3]).toBe(EXITS_ON);
   expect(lines[4]).toMatch(/^- Dialogue shown with your latest story step that came with dialogue \(mom rival instruction at turn 74\), whole, in order: /);
   expect(lines[4]).toContain("He lives right next door, so you should go over and introduce yourself.");
  }
 });

 it("ON reorders and corrects; it drops no other line and changes no other fact",()=>{
  const on=replay({...RECORDED,[ID]:true}),off=replay(RECORDED);
  for(const [i,r] of on.entries()){
   const before=off[i]?.text.split("\n")??[];
   const after=r.text.split("\n");
   expect(after).toHaveLength(before.length);
   const changed=(l:string)=>/^- (Not tried yet on other maps|Exits to maps you have not entered|Listed here that you have not tried yet)/.test(l);
   expect(after.filter(l=>!changed(l)).sort()).toEqual(before.filter(l=>!changed(l)).sort());
   expect(after[0]).toBe(before[0]);
   expect(after.at(-1)).toBe(before.at(-1));
  }
 });
});

describe("exit history",()=>{
 type Target=NonNullable<Extract<RunEvent,{type:"state";started:boolean}>["interaction_targets"]>[number];
 const warp=(x:number,y:number,destination:[number,number,number]):Target=>({kind:"warp",x,y,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination,name:`Warp to map ${String(destination[0])}/${String(destination[1])}`});
 const place=(map:[number,number],x:number,y:number,warps:Target[],extra:Record<string,unknown>={})=>({started:true,screen:"overworld" as const,location:`MAP ${map.join("/")}`,map_id:map,position:{x,y},interaction_targets:warps,topology:null,...extra});
 const TOWN=[warp(14,8,[1,2,1]),warp(7,16,[1,4,0]),warp(5,8,[1,0,1])];
 const HOUSE=[warp(1,8,[0,9,0]),warp(2,8,[0,9,0]),warp(2,2,[1,3,0])];

 it("a door arrival takes the door pair on the house and the door on the town; the stairs stay untaken",()=>{
  const h=new ExitHistory();
  expect(h.observe(place([0,9],14,9,TOWN))).toEqual([]);
  expect(h.observe(place([1,2],2,8,HOUSE))).toEqual([{room:"MAP 0/9|0/9",map:"0/9",tile:"14,8"},{room:"MAP 1/2|1/2",map:"1/2",tile:"1,8"},{room:"MAP 1/2|1/2",map:"1/2",tile:"2,8"}]);
  expect([h.taken("1/2",1,8),h.taken("1/2",2,8),h.taken("1/2",2,2),h.taken("0/9",14,8),h.taken("0/9",7,16)]).toEqual([true,true,false,true,false]);
 });

 it("a door exit already one step out of the door still names the door",()=>{
  const h=new ExitHistory();
  h.observe(place([1,2],2,8,HOUSE));
  expect(h.observe(place([0,9],14,9,TOWN)).map(m=>`${m.map} ${m.tile}`)).toEqual(["1/2 1,8","1/2 2,8","0/9 14,8"]);
 });

 it("a far last tile falls back to the warps to that map only when they share one destination",()=>{
  expect(usedWarps(HOUSE,9,1,"0/9").map(w=>[w.x,w.y])).toEqual([[1,8],[2,8]]);
  const two=[warp(1,1,[0,9,0]),warp(9,9,[0,9,3])];
  expect(usedWarps(two,5,5,"0/9")).toEqual([]);
  expect(usedWarps(two,9,8,"0/9").map(w=>[w.x,w.y])).toEqual([[9,9]]);
  expect(usedWarps([warp(3,3,[127,127,0])],3,4,"5/5").map(w=>[w.x,w.y])).toEqual([[3,3]]);
  expect(usedWarps([warp(3,3,[127,127,0])],9,9,"5/5")).toEqual([]);
 });

 it("counts a map connection crossed only when no warp explains the change, and ignores loads, battles and unstarted states",()=>{
  const h=new ExitHistory();
  const north={direction:"NORTH" as const,offset:0,destination:[0,16] as [number,number],destination_name:"ROUTE101"};
  const south={direction:"SOUTH" as const,offset:0,destination:[0,9] as [number,number],destination_name:"LITTLEROOT TOWN"};
  h.observe(place([0,9],10,0,TOWN,{topology:{width:20,height:20,connections:[north]}}));
  expect(h.observe({...place([0,16],10,19,[]),location:null,map_id:null})).toEqual([]);
  expect(h.observe(place([0,16],10,19,[],{screen:"battle"}))).toEqual([]);
  expect(h.observe(place([0,16],10,19,[],{started:false}))).toEqual([]);
  expect(h.observe(place([0,16],10,19,[],{topology:{width:20,height:20,connections:[south]}}))).toEqual([]);
  expect([h.crossed("0/9","0/16"),h.crossed("0/16","0/9"),h.crossed("0/9","1/2")]).toEqual([true,true,false]);
 });

 it("reads the names the readout gave: the Location line for its own map and every named destination",()=>{
  const names=new Map<string,string>();
  readoutNames("Location: PROF. BIRCH'S HOUSE 1F\nWarps: (1,8) -> LITTLEROOT TOWN (map 0/9) [directional exit], (2,2) -> PROF. BIRCH'S HOUSE 2F (map 1/3) [step onto tile]\nPress result: UP: warped during this press: A [map 0/9] (14,9) -> B [map 1/2] (2,8)\nWarp to GMREEN's HOUSE 1F (map 1/0) at (5,8)\n- NORTH -> ROUTE101 (map 0/16), offset 0\nWarps: (7,7) -> map 2/2 [door]",[1,2],names);
  expect(Object.fromEntries(names)).toEqual({"0/9":"LITTLEROOT TOWN","1/3":"PROF. BIRCH'S HOUSE 2F","1/0":"GMREEN's HOUSE 1F","0/16":"ROUTE101","1/2":"PROF. BIRCH'S HOUSE 1F"});
  readoutNames("Location: X",null,names);
  expect(names.size).toBe(5);
 });
});

describe("briefing-exits-v1 in a production-shaped run",()=>{
 const BASE:FeatureSet={...ALL_ON,"next-milestone-hint-v1":false,"untaken-exits-v1":false};
 const DOOR=[{kind:"warp",x:2,y:8,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[0,9,0],name:"Warp to map 0/9"},{kind:"warp",x:2,y:2,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,3,0],name:"Warp to map 1/3"},{kind:"coordinate_trigger",x:2,y:8,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null}];
 const OUTSIDE=[{kind:"warp",x:14,y:8,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[1,2,1],name:"Warp to map 1/2"}];
 function rig(features:FeatureSet){
  const observers:{fn:(e:RunEvent)=>void}[]=[];const events:RunEvent[]=[];let seq=0,turn=0,call=0;
  const emit=(body:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"exits",t:"2026-10-16T03:00:00.000-04:00",turn,seq:++seq,...body});events.push(e);for(const o of observers)o.fn(e);return e;};
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push({fn});},textOnlySupervisor:()=>undefined};
  const loop=loopSupervisor(features,recorder);
  const textOnly=textOnlySupervisor(features,recorder);
  const press=(states:Record<string,unknown>[],story="player name confirmed",text="ok")=>{
   turn++;const id=`c${String(++call)}`;
   emit({type:"tool_call",id,name:"press",args:{buttons:["DOWN"]}});
   let last:RunEvent|undefined;
   for(const s of states)last=emit({type:"state",...IN_GAME,started:true,screen:"overworld",facing:"down",field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null},...s});
   emit({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:`${text}\nStory: ${story}`,frames:[],state_seq:last?.seq});
  };
  return {press,loop,textOnly,events};
 }
 const HOUSE={location:"HOUSE 1F",map_id:[1,2]},TOWN={location:"TOWN",map_id:[0,9]};
 const walk=(r:ReturnType<typeof rig>,story?:string)=>{
  r.press([{...TOWN,position:{x:14,y:9},interaction_targets:OUTSIDE}]);
  r.press([{...TOWN,position:{x:14,y:8},interaction_targets:OUTSIDE},{...HOUSE,position:{x:2,y:8},interaction_targets:DOOR}],story,"ok\nLocation: BIRCH HOUSE 1F\nWarps: (2,8) -> TOWN (map 0/9) [door], (2,2) -> BIRCH HOUSE 2F (map 1/3) [step onto tile]");
  r.press([{...HOUSE,position:{x:2,y:8},interaction_targets:DOOR},{...TOWN,position:{x:14,y:9},interaction_targets:OUTSIDE}]);
  r.press([{...TOWN,position:{x:14,y:8},interaction_targets:OUTSIDE},{...HOUSE,position:{x:2,y:8},interaction_targets:DOOR}]);
 };

 it("counts a trigger walked over mid-batch as tried; arriving on one or standing on one still is not (finals rule)",()=>{
  const HALL=[{kind:"coordinate_trigger",x:5,y:4,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null},{kind:"coordinate_trigger",x:5,y:9,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null},{kind:"warp",x:5,y:9,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[0,9,0],name:"Warp to map 0/9"},{kind:"coordinate_trigger",x:6,y:6,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:null}];
  const ROOM={location:"HALL",map_id:[2,2],interaction_targets:HALL};
  const run=(id:boolean)=>{
   const r=rig({...BASE,[ID]:id});
   r.press([{...ROOM,position:{x:6,y:6}}]);
   r.press([{...ROOM,position:{x:6,y:6}},{...ROOM,position:{x:5,y:5}},{...ROOM,position:{x:5,y:4}},{...ROOM,position:{x:5,y:3}}]);
   return line(r.loop?.("cycle",9)??"","- Listed here that you have not tried yet");
  };
  expect(run(true)).toBe("- Listed here that you have not tried yet: Warp to map 0/9 at 5,9 (movement); coordinate_trigger at 5,9 (step); coordinate_trigger at 6,6 (step)");
  expect(run(false)).toBe("- Listed here that you have not tried yet: Warp to map 0/9 at 5,9 (movement); coordinate_trigger at 5,4 (step); coordinate_trigger at 5,9 (step); coordinate_trigger at 6,6 (step)");
 });

 it("the loop supervisor and text-only supervisor drop the used door and the arrival trigger, and name the stairs",()=>{
  const on=rig({...BASE,[ID]:true});walk(on);
  const text=on.loop?.("cycle",9)??"";
  expect(line(text,"- Listed here that you have not tried yet")).toBe("- Listed here that you have not tried yet: Warp to BIRCH HOUSE 2F (map 1/3) at 2,2 (movement)");
  expect(line(on.textOnly?.(2,1)??"","- Listed here that you have not tried yet")).toBe("- Listed here that you have not tried yet: Warp to BIRCH HOUSE 2F (map 1/3) at 2,2 (movement)");
  const off=rig({...BASE,[ID]:false});walk(off);
  expect(line(off.loop?.("cycle",9)??"","- Listed here that you have not tried yet")).toBe("- Listed here that you have not tried yet: Warp to map 0/9 at 2,8 (movement); Warp to map 1/3 at 2,2 (movement); coordinate_trigger at 2,8 (step)");
 });

 it("keeps the existing rule that a new Story line starts the tried lists over, after this call's own exits",()=>{
  const on=rig({...BASE,[ID]:true});
  on.press([{...TOWN,position:{x:14,y:9},interaction_targets:OUTSIDE}]);
  on.press([{...TOWN,position:{x:14,y:8},interaction_targets:OUTSIDE},{...HOUSE,position:{x:2,y:8},interaction_targets:DOOR}]);
  on.press([{...HOUSE,position:{x:2,y:7},interaction_targets:DOOR}],"player name confirmed; clock set");
  // Moving off the door mat came with a new Story line: the door taken before it is untried again; nothing else changed.
  expect(line(on.loop?.("cycle",9)??"","- Listed here that you have not tried yet")).toBe("- Listed here that you have not tried yet: Warp to map 0/9 at 2,8 (movement); Warp to map 1/3 at 2,2 (movement); coordinate_trigger at 2,8 (step)");
  const same=rig({...BASE,[ID]:true});
  same.press([{...TOWN,position:{x:14,y:9},interaction_targets:OUTSIDE}]);
  same.press([{...TOWN,position:{x:14,y:8},interaction_targets:OUTSIDE},{...HOUSE,position:{x:2,y:8},interaction_targets:DOOR}],"player name confirmed; clock set");
  expect(line(same.loop?.("cycle",9)??"","- Listed here that you have not tried yet")).toBe("- Listed here that you have not tried yet: Warp to map 1/3 at 2,2 (movement)");
 });

 it("the stall briefing factory honors the switch: ON reorders, OFF keeps today's order",()=>{
  const order=(features:FeatureSet)=>{
   const observers:((e:RunEvent)=>void)[]=[];let text="";
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);}};
   const stall=stallBriefing(features,recorder,{stall:(_kind,t)=>{text=t(5);return true;}},{pausedMs:()=>0},()=>10*60_000);
   expect(stall).not.toBeNull();
   const e=checkEvent({v:1,run:"exits",t:"2026-10-16T03:00:00.000-04:00",turn:1,seq:1,type:"tool_result",id:"c1",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]});
   for(const o of observers)o(e);
   return text.split("\n").map(l=>l.replace(/:.*/,""));
  };
  expect(order({...BASE,[ID]:true}).slice(2,5)).toEqual(["- Where you are","- Exits to maps you have not entered since your last story progress","- Dialogue shown with your latest story step that came with dialogue"]);
  expect(order({...BASE,[ID]:false}).slice(2,5)).toEqual(["- Where you are","- Last story progress","- Characters the readout names here"]);
 });
});

describe("briefing-exits-v1 registry and presets",()=>{
 it("is a default-off guard switch with no dependency, recorded after readout-rules-in-prompt-v1",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"BRIEFING EXIT FACTS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  const ids=FEATURES.filter(f=>f.switchable).map(f=>f.id);
  expect(ids.indexOf(ID)).toBe(ids.indexOf("readout-rules-in-prompt-v1")+1);
  const order=playHarnessFeatures(ALL_ON,null);
  expect(order.indexOf(ID)).toBe(order.indexOf("readout-rules-in-prompt-v1")+1);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"loop-guard-supervisor-v1":false})).not.toContain(`${ID} needs loop-guard-supervisor-v1`);
 });
 it("defaults off in presets that omit it and in legacy flag presets",()=>{
  const {[ID]:omitted,...rest}=ALL_ON;expect(omitted).toBe(true);
  expect(normalizeFeatures(rest as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
});
