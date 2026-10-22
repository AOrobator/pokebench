import {describe,expect,it} from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
const PENDING_BASE_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
const ALL_ON={...PENDING_BASE_ALL_ON,"progress-aware-cycles-v1":false,"caught-dex-input-v1":false,"menu-refusal-recovery-v1":false,"pending-field-dialogue-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {loopSupervisor,stallBriefing,textOnlySupervisor} from "./play-wiring.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {checkEvent,type RunEvent} from "./events.js";
import type {LoopNotice} from "./loop-detection.js";
import {INTERFACE_DWELL_CALLS,StallBriefing} from "./stall-briefing.js";
import {IN_GAME} from "../test-support/events.js";
import {recorded,recordedFeatures} from "../test-support/battle-facts.js";
import {replayNotes} from "../test-support/supervisor-replay.js";
import {replayStalls} from "../test-support/stall-replay.js";

const ID="story-progress-clock-v1";
const BD60="supervisor-truth-bd60.jsonl.gz";
const DC5A="supervisor-truth-dc5a.jsonl.gz";
const PROGRESS=/^- Last story progress: .*$/m;
// bd60: RIVAL_OLDALE_SEND_OFF (measurement-only) at seq 11571, T428, 01:33:59; the stall briefing at seq 11962
// (T440, 01:35:21) said "no new story milestone for 10 minutes" and "Last story progress: first pokecenter heal".
const SEND_OFF="- Last story progress: rival oldale send off at turn 428 (12 turns ago)";
const SINCE_ELSEWHERE=/^- Not tried yet on other maps you have been on since your last story progress: .*$/m;
const SINCE_EXITS=/^- Exits to maps you have not entered since your last story progress: .*$/m;
// The maps a "since your last story progress" list names, by map id.
const mapsIn=(line:string):string[]=>[...line.matchAll(/\(map (\d+)\/(\d+)\)(?=: )/g)].map(m=>`${m[1]??""}/${m[2]??""}`);
const strip=(t:string|null|undefined)=>t?.replace(PROGRESS,"").replace(SINCE_ELSEWHERE,"").replace(SINCE_EXITS,"");
const droughtsOf=(events:readonly RunEvent[])=>events.filter(e=>e.type==="loop_guard"&&e.phase==="supervisor"&&e.kind==="milestone_drought").map(e=>e.seq);

describe("story-progress-clock-v1 on bd60",()=>{
 const events=recorded(BD60);
 it("OFF: every recorded supervisor note replays byte for byte",()=>{
  const notes=replayNotes(events,recordedFeatures(events,{[ID]:false}));
  expect(notes).toHaveLength(14);
  for(const {note,text} of notes)expect(text).toBe(note.message);
 });
 it("ON: only the notes after a measurement-only milestone change, in their progress line and the lists counted from it",()=>{
  const off=replayNotes(events,recordedFeatures(events,{[ID]:false})),on=replayNotes(events,recordedFeatures(events,{[ID]:true}));
  const changed=on.filter((n,i)=>n.text!==off[i]?.text).map(n=>n.note.seq);
  expect(changed).toEqual([3737,11962,12029]);
  for(const [i,n] of on.entries())expect(strip(n.text)).toBe(strip(off[i]?.text));
  const at11962=on.find(n=>n.note.seq===11962)?.text??"";
  expect(PROGRESS.exec(at11962)?.[0]).toBe(SEND_OFF);
  expect(PROGRESS.exec(off.find(n=>n.note.seq===11962)?.text??"")?.[0]).toBe("- Last story progress: first pokecenter heal at turn 353 (87 turns ago)");
  expect(PROGRESS.exec(on.find(n=>n.note.seq===3737)?.text??"")?.[0]).toBe("- Last story progress: route 101 after handoff at turn 169 (5 turns ago)");
 });
 it("ON: the lists headed \"since your last story progress\" name only maps walked since that progress",()=>{
  const on=replayNotes(events,recordedFeatures(events,{[ID]:true}));
  const walked=new Set(events.flatMap(e=>e.type==="state"&&"started" in e&&e.seq>11571&&e.map_id!==null?[e.map_id.join("/")]:[]));
  for(const seq of [11962,12029]){
   const text=on.find(n=>n.note.seq===seq)?.text??"";
   const lines=[SINCE_ELSEWHERE.exec(text)?.[0]??"",SINCE_EXITS.exec(text)?.[0]??""];
   expect(lines.every(l=>l!=="")).toBe(true);
   for(const line of lines)for(const map of mapsIn(line))expect(walked.has(map),`${String(seq)}: ${map} in ${line}`).toBe(true);
  }
 });
 it("OFF: the drought clock fires the recorded briefings, the 10-minute one at seq 11962; ON: the send-off resets it",()=>{
  const off=replayStalls(events,recordedFeatures(events,{[ID]:false})).filter(f=>f.kind==="milestone_drought");
  const on=replayStalls(events,recordedFeatures(events,{[ID]:true})).filter(f=>f.kind==="milestone_drought");
  expect(droughtsOf(events)).toEqual([7118,8358,10692,11962,19002]);
  expect(off.map(f=>f.seq+1)).toEqual(droughtsOf(events));
  expect(off.find(f=>f.seq===11961)?.minutes).toBe(10);
  expect(on.some(f=>f.seq>11571&&f.seq<12820)).toBe(false);
  // Before RIVAL_BATTLE_STARTED (seq 8711) nothing differs; 19002 follows only counted milestones on both.
  expect(on.filter(f=>f.seq<8711)).toEqual(off.filter(f=>f.seq<8711));
  expect(on.find(f=>f.seq===19001)).toEqual(off.find(f=>f.seq===19001));
 });
});

describe("story-progress-clock-v1 on dc5a",()=>{
 const events=recorded(DC5A);
 // dc5a: RIVAL_BATTLE_STARTED (measurement-only) at seq 13775, T512, 01:41:48; the stall briefing at seq 13819
 // (T513, 01:42:02, in the battle) said "no new story milestone for 15 minutes" and named FIRST_POKECENTER_HEAL (T380).
 it("OFF: every recorded supervisor note replays byte for byte",()=>{
  const notes=replayNotes(events,recordedFeatures(events,{[ID]:false}));
  expect(notes).toHaveLength(16);
  for(const {note,text} of notes)expect(text).toBe(note.message);
 });
 it("OFF: the 15-minute drought briefing fires 14 s into the rival battle; ON: the battle's start resets the clock",()=>{
  const off=replayStalls(events,recordedFeatures(events,{[ID]:false})).filter(f=>f.kind==="milestone_drought");
  const on=replayStalls(events,recordedFeatures(events,{[ID]:true})).filter(f=>f.kind==="milestone_drought");
  expect(droughtsOf(events)).toEqual([7019,8374,9551,11174,12600,13819,15392]);
  expect(off.map(f=>f.seq+1)).toEqual(droughtsOf(events));
  expect(off.find(f=>f.seq===13818)?.minutes).toBe(15);
  expect(on.some(f=>f.seq>13775&&f.seq<15391)).toBe(false);
  // Before ROUTE_101_AFTER_HANDOFF (seq 4905) nothing differs; 15392 follows RIVAL_BATTLE_WON, a counted milestone, on both.
  expect(on.filter(f=>f.seq<4905)).toEqual(off.filter(f=>f.seq<4905));
  expect(on.find(f=>f.seq===15391)).toEqual(off.find(f=>f.seq===15391));
 });
 it("ON: the note at seq 13819 names the battle's start as the last progress",()=>{
  const off=replayNotes(events,recordedFeatures(events,{[ID]:false})),on=replayNotes(events,recordedFeatures(events,{[ID]:true}));
  expect(PROGRESS.exec(off.find(n=>n.note.seq===13819)?.text??"")?.[0]).toBe("- Last story progress: first pokecenter heal at turn 380 (133 turns ago)");
  expect(PROGRESS.exec(on.find(n=>n.note.seq===13819)?.text??"")?.[0]).toBe("- Last story progress: rival battle started at turn 512 (1 turns ago)");
  for(const [i,n] of on.entries())expect(strip(n.text)).toBe(strip(off[i]?.text));
 });
});

describe("story-progress-clock-v1 stall counts",()=>{
 const features:FeatureSet={...ALL_ON,"next-milestone-hint-v1":false,"same-plan-breaker-v1":false,"positive-supervisor-v1":false,[ID]:true};
 function rig(f:FeatureSet){
  let now=0,seq=0;const kinds:string[]=[];const retired:string[]=[];
  const b=new StallBriefing(f,()=>now,{stall:(kind)=>{kinds.push(kind);return true;}},()=>"",null,(kind)=>{retired.push(kind);});
  const emit=(body:Record<string,unknown>)=>{b.observe(checkEvent({v:1,run:"m",t:"2026-10-15T12:00:00.000-04:00",turn:seq,seq:++seq,...body}));};
  const state=(extra:Record<string,unknown>)=>{emit({type:"state",...IN_GAME,started:true,screen:"overworld",location:"A",map_id:[0,1],position:{x:1,y:1},facing:"up",field_controls_locked:false,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null},...extra});emit({type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:seq});};
  const go=(location:string,map_id:[number,number])=>{now+=1000;state({location,map_id});};
  const milestone=(name:string,origin:"observed"|"present_at_start"="observed")=>{emit({type:"milestone",name,server_timestamp:0,kind:"story",origin,evidence:[seq]});};
  return {kinds,retired,go,state,milestone,advance:(ms:number)=>{now+=ms;}};
 }
 it("first Roxanne interaction stays measurement-only even when the progress clock is enabled",()=>{
   const r=rig(features);r.advance(4*60_000);r.state({});
   r.milestone("ROXANNE_FIRST_INTERACTION");r.advance(2*60_000);r.state({});
   expect(r.kinds).toContain("milestone_drought");
 });
 it("ON: map-cycle trips made before a measurement-only milestone do not count toward the next note",()=>{
  const r=rig(features);
  r.go("A",[0,1]);r.go("B",[0,2]);r.go("A",[0,1]);r.go("B",[0,2]);
  r.milestone("RIVAL_OLDALE_SEND_OFF");
  r.go("A",[0,1]);
  expect(r.kinds).toEqual([]);
  r.go("B",[0,2]);r.go("A",[0,1]);r.go("B",[0,2]);
  expect(r.kinds).toEqual(["map_cycle"]);
 });
 it("OFF: those trips count, so the note comes one move after the measurement-only milestone",()=>{
  const r=rig({...features,[ID]:false});
  r.go("A",[0,1]);r.go("B",[0,2]);r.go("A",[0,1]);r.go("B",[0,2]);
  r.milestone("RIVAL_OLDALE_SEND_OFF");
  r.go("A",[0,1]);
  expect(r.kinds).toEqual(["map_cycle"]);
 });
 it("ON: calls made in an interface before a measurement-only milestone do not count toward the dwell note; OFF they do",()=>{
  const dwell=(f:FeatureSet)=>{
   const r=rig(f);
   for(let i=0;i<=INTERFACE_DWELL_CALLS-1;i++)r.state({screen:"naming"});
   r.milestone("RIVAL_BATTLE_STARTED");
   r.state({screen:"naming"});
   return r.kinds;
  };
  expect(dwell({...features,[ID]:false})).toEqual(["interface_dwell"]);
  expect(dwell(features)).toEqual([]);
 });
 it("a measurement-only milestone present at start, and GAME_RUNNING, are never progress",()=>{
  const r=rig(features);
  r.advance(4*60_000);
  r.state({});
  r.milestone("GAME_RUNNING");r.milestone("RIVAL_BATTLE_STARTED","present_at_start");
  r.advance(2*60_000);
  r.state({});
  expect(r.kinds).toEqual(["milestone_drought"]);
 });
 it("positive-supervisor-v1 ON (the bundle arm): the retired drought diagnostic follows the same clock",()=>{
  const run=(on:boolean)=>{
   const r=rig({...features,"positive-supervisor-v1":true,[ID]:on});
   r.advance(4*60_000);r.state({});
   r.milestone("RIVAL_BATTLE_STARTED");
   r.advance(2*60_000);r.state({});
   return r.retired;
  };
  expect(run(false)).toEqual(["milestone_drought"]);
  expect(run(true)).toEqual([]);
 });
});

describe("story-progress-clock-v1 switch",()=>{
 const events=recorded(BD60);
 it("covers every measurement-only milestone",()=>{
  expect([...MEASUREMENT_ONLY_MILESTONES]).toEqual(["ROXANNE_FIRST_INTERACTION","PLAYER_BEDROOM_EXITED_AFTER_CLOCK","ROUTE_101_AFTER_HANDOFF","RIVAL_BATTLE_STARTED","RIVAL_BATTLE_DEFEATED","RIVAL_OLDALE_SEND_OFF","ROUTE_101_AFTER_RIVAL_BATTLE","LITTLEROOT_AFTER_RIVAL_BATTLE"]);
 });
 it("is registered last as a default-off agent-side guard with no dependency",()=>{
  expect(SWITCHABLE_FEATURES.at(-57)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-57)?.id).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"STORY PROGRESS CLOCK"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("Bundle arm only, default off");
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).at(-50)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID));
  expect(normalizeFeatures(older as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
 it("the production stall briefing honors it: no drought note between the send-off and seq 11962 when on",()=>{
  const run=(on:boolean):string[]=>{
   const observers:((e:RunEvent)=>void)[]=[];const notes:string[]=[];
   let now=Date.parse(events[0]?.t??"");const start=now;
   const detector={stall:(kind:string,text:(calls:number)=>string)=>{notes.push(`${kind}: ${text(0).split("\n")[0]??""}`);return true;}};
   stallBriefing(recordedFeatures(events,{[ID]:on}),{subscribe:fn=>{observers.push(fn);},recordStallGate:()=>undefined,recordLoopGuard:()=>undefined},detector,{pausedMs:()=>0},()=>now-start);
   for(const e of events){if(e.seq>11962)break;now=Date.parse(e.t);for(const o of observers)o(e);}
   return notes;
  };
  const off=run(false),on=run(true);
  expect(off.at(-1)).toContain("no new story milestone for 10 minutes");
  expect(on.filter(n=>n.startsWith("milestone_drought")).length).toBe(off.filter(n=>n.startsWith("milestone_drought")).length-1);
 });
 it("the production stall briefing with positive-supervisor-v1 on records no retired drought diagnostic after the send-off when on",()=>{
  const run=(on:boolean):number[]=>{
   const observers:((e:RunEvent)=>void)[]=[];const retired:number[]=[];
   let now=Date.parse(events[0]?.t??"");const start=now;let seq=0;
   const recordLoopGuard=(n:LoopNotice)=>{if(n.kind==="milestone_drought"&&n.phase==="would_warn")retired.push(seq);};
   stallBriefing(recordedFeatures(events,{"positive-supervisor-v1":true,[ID]:on}),{subscribe:fn=>{observers.push(fn);},recordStallGate:()=>undefined,recordLoopGuard},{stall:()=>true},{pausedMs:()=>0},()=>now-start);
   for(const e of events){if(e.seq>12820)break;now=Date.parse(e.t);seq=e.seq;for(const o of observers)o(e);}
   return retired;
  };
  expect(run(false).filter(s=>s>11571)).toEqual([11961]);
  expect(run(true).filter(s=>s>11571)).toEqual([]);
 });
 it("the production loop supervisor and text-only supervisor name the measurement-only step as the last progress when on (bd60 seq 3737)",()=>{
  const run=(on:boolean):[string,string]=>{
   const observers:((e:RunEvent)=>void)[]=[];
   const features=recordedFeatures(events,{[ID]:on,"text-only-supervisor-v1":true});
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push(fn);},textOnlySupervisor:()=>undefined};
   const text=loopSupervisor(features,recorder),textOnly=textOnlySupervisor(features,recorder);
   if(text===undefined||textOnly===undefined)throw new Error("supervisors are off in bd60");
   for(const e of events){if(e.seq>=3737)break;for(const o of observers)o(e);}
   return [text("ineffective",174),textOnly(2,1)];
  };
  for(const t of run(true))expect(PROGRESS.exec(t)?.[0]).toBe("- Last story progress: route 101 after handoff at turn 169 (5 turns ago)");
  for(const t of run(false))expect(PROGRESS.exec(t)?.[0]).toBe("- Last story progress: birch starter handoff complete at turn 157 (17 turns ago)");
 });
});
