import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {attachLoopGuard,Governor} from "./harness.js";
import {loopSupervisor,stallBriefing} from "./play-wiring.js";
import {STALL_DROUGHT_MS,STALL_ROUND_TRIPS,StallBriefing} from "./stall-briefing.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {ALL_ON,featureInfo,type FeatureSet} from "./features.js";
import {checkEvent,parseEvent,type RunEvent} from "./events.js";
import {LoopDetector,type LoopNotice} from "./loop-detection.js";
import {IN_GAME} from "../test-support/events.js";

const BASE:FeatureSet={...ALL_ON,"next-milestone-hint-v1":false,"same-plan-breaker-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false};
const ON:FeatureSet={...BASE,"loop-guard-supervisor-v1":true,"stall-briefing-v1":true};
const OFF:FeatureSet={...BASE,"loop-guard-supervisor-v1":true,"stall-briefing-v1":false};
const FORBIDDEN=/\b(rival|birch|professor|may|brendan|neighbou?r|next door|lab|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge)\b/i;
const HOUSE_1F={location:"HOUSE 1F",map_id:[1,0]};
const HOUSE_2F={location:"HOUSE 2F",map_id:[1,1]};
const TOWN={location:"TOWN",map_id:[0,9]};
const LOADING={location:null,map_id:null};

// A production-shaped run: the real recorder's synchronous fan-out, the real loop guard and the factories live.ts calls.
function rig(features:FeatureSet,wire=true){
 const observers:{fn:(e:RunEvent)=>void}[]=[];const events:RunEvent[]=[];
 let seq=0,turn=0,clock=0,paused=0,call=0,stateSeq=0;
 const emit=(body:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"stall",t:"2026-10-15T12:00:00.000-04:00",turn,seq:++seq,...body});events.push(e);for(const o of observers)o.fn(e);return e;};
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push({fn});},recordLoopGuard:(n:LoopNotice)=>{emit({type:"loop_guard",...n,evidence:[...n.evidence]});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>clock});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder));
 const wired=wire?stallBriefing(features,recorder,detector,{pausedMs:()=>paused},()=>clock):null;
 const contexts:(string|null)[]=[];
 // One model turn: the context it is shown, then one press and the observed state after it.
 const press=(buttons:string[],after:Record<string,unknown>,ms=10_000,before:Record<string,unknown>[]=[]):void=>{
  clock+=ms;turn++;
  emit({type:"turn_start",context:{messages:1,images:0,est_tokens:10}});
  contexts.push(detector.context());
  const id=`c${String(++call)}`;
  emit({type:"tool_call",id,name:"press",args:{buttons}});
  emit({type:"button_press",tool_call_id:id,buttons,before_state_seq:stateSeq});
  for(const extra of before)state(extra);
  const s=state(after);
  emit({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok\nStory: player name confirmed",frames:[],state_seq:s.seq});
 };
 const state=(extra:Record<string,unknown>):RunEvent=>{const e=emit({type:"state",...IN_GAME,started:true,screen:"overworld",...HOUSE_1F,position:{x:3,y:3},facing:"up",field_controls_locked:false,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null},...extra});stateSeq=e.seq;return e;};
 const milestone=(name:string,origin:"observed"|"present_at_start")=>emit({type:"milestone",name,server_timestamp:0,kind:"story",origin});
 const guards=()=>events.filter((e):e is Extract<RunEvent,{type:"loop_guard"}>=>e.type==="loop_guard");
 return {press,state,milestone,guards,events,contexts,wired,detector,observers,pause:(ms:number)=>{clock+=ms;paused+=ms;},advance:(ms:number)=>{clock+=ms;},next:()=>{contexts.push(detector.context());return contexts.at(-1);}};
}

// Shape of run 258d T41-T57: up and down the house stairs, with map loads between.
function stairs(r:ReturnType<typeof rig>,moves:number):void {
 r.state(HOUSE_1F);
 for(let i=0;i<moves;i++)r.press(["UP"],i%2===0?{...HOUSE_2F,position:{x:7,y:1}}:{...HOUSE_1F,position:{x:8,y:2}},10_000,[LOADING]);
}

it("briefs on the second round trip between the same two maps, naming both maps and the count",()=>{
 const r=rig(ON);
 stairs(r,2*STALL_ROUND_TRIPS-1);
 expect(r.guards()).toEqual([]);
 r.press(["DOWN"],{...HOUSE_1F,position:{x:8,y:2}},10_000,[LOADING]);
 const [note]=r.guards();
 expect(note).toMatchObject({type:"loop_guard",kind:"map_cycle",phase:"supervisor",mode:"enforced"});
 expect(note?.message).toMatch(/^SUPERVISOR: You are stalling\. You have walked between HOUSE 1F \(map 1\/0\) and HOUSE 2F \(map 1\/1\) 2 times, out and back, with no new story milestone/);
 expect(note?.message).toContain("Where you are: HOUSE 1F (map 1/0) at 8,2 facing up");
 expect(note?.message).toContain("Stop and get your bearings:");
 expect(note?.message).toContain("The run continues.");
 expect(note?.message).not.toMatch(FORBIDDEN);
 expect(()=>parseEvent(JSON.stringify(note))).not.toThrow();
 // Delivered to the model the way supervisor briefings are: the loop guard's context note at the next model call.
 expect(r.next()).toBe(note?.message);
});

it("shows a stall note once, then clears it after the next completed call, and briefs again two round trips later",()=>{
 const r=rig(ON);
 stairs(r,4);
 expect(r.guards()).toHaveLength(1);
 r.press(["UP"],{...HOUSE_2F,position:{x:7,y:1}});
 expect(r.contexts.at(-1)).toMatch(/^SUPERVISOR: You are stalling/);
 expect(r.next()).toBeNull();
 r.press(["DOWN"],{...HOUSE_1F,position:{x:8,y:2}});
 r.press(["UP"],{...HOUSE_2F,position:{x:7,y:1}});
 expect(r.guards()).toHaveLength(1);
 r.press(["DOWN"],{...HOUSE_1F,position:{x:8,y:2}});
 expect(r.guards()).toHaveLength(2);
 expect(r.guards()[1]?.message).toContain("between HOUSE 1F (map 1/0) and HOUSE 2F (map 1/1) 4 times");
});

it("counts each pair of maps separately and starts over after a new milestone",()=>{
 const r=rig(ON);
 r.state(HOUSE_1F);
 r.press(["UP"],HOUSE_2F);r.press(["DOWN"],HOUSE_1F);
 r.press(["DOWN"],TOWN);r.press(["UP"],HOUSE_1F);
 r.press(["UP"],HOUSE_2F);
 r.milestone("LITTLEROOT_TOWN","observed");
 r.press(["DOWN"],HOUSE_1F);r.press(["UP"],HOUSE_2F);r.press(["DOWN"],HOUSE_1F);
 expect(r.guards()).toEqual([]);
 r.press(["UP"],HOUSE_2F);
 expect(r.guards()[0]?.message).toContain("between HOUSE 2F (map 1/1) and HOUSE 1F (map 1/0) 2 times");
});

it("briefs after 5 minutes of active play with no new milestone, once per window, ignoring pauses and start milestones",()=>{
 const r=rig(ON);
 r.milestone("CLOCK_SET","present_at_start");
 r.milestone("GAME_RUNNING","observed");
 r.state({in_battle:true});
 // Shape of run c497 T330-T441: pressing A in the battle bag with no visible effect.
 for(let i=0;i<9;i++)r.press(["A"],{in_battle:true},30_000);
 r.pause(20*60_000);
 r.press(["A"],{in_battle:true},29_999);
 expect(r.guards()).toEqual([]);
 r.press(["A"],{in_battle:true},1);
 const [note]=r.guards();
 expect(note).toMatchObject({kind:"milestone_drought",phase:"supervisor",mode:"enforced"});
 expect(note?.message).toMatch(/^SUPERVISOR: You are stalling\. There has been no new story milestone for 5 minutes of play/);
 expect(note?.message).toContain("Last story progress: none earned in this run yet");
 expect(note?.message).not.toMatch(FORBIDDEN);
 expect(()=>parseEvent(JSON.stringify(note))).not.toThrow();
 for(let i=0;i<9;i++)r.press(["A"],{in_battle:true},30_000);
 expect(r.guards().filter(g=>g.phase==="supervisor")).toHaveLength(1);
 r.press(["A"],{in_battle:true},30_000);
 expect(r.guards().filter(g=>g.phase==="supervisor").map(g=>g.kind)).toEqual(["milestone_drought","milestone_drought"]);
 expect(r.guards()[1]?.message).toContain("no new story milestone for 10 minutes of play");
});

it("restarts the drought clock at a newly observed milestone",()=>{
 const r=rig(ON);
 r.state({});
 r.advance(4*60_000);
 r.milestone("PLAYER_HOUSE_ENTERED","observed");
 r.press(["A"],{},STALL_DROUGHT_MS-1);
 expect(r.guards()).toEqual([]);
 r.press(["A"],{},1);
 expect(r.guards()[0]?.message).toContain("Last story progress: player house entered");
});

it("catches the dea1 shape: identical multi-button batches that the loop guard never flags",()=>{
 const r=rig(ON);
 r.state({position:{x:5,y:5}});
 for(let i=0;i<40;i++)r.press(i%2===0?["RIGHT","RIGHT","RIGHT","UP","UP","UP","UP"]:["LEFT","LEFT","LEFT","UP","UP","UP","UP"],{position:{x:i%2===0?8:5,y:5-(i%7)}},8_000);
 expect(r.guards().map(g=>g.kind)).toEqual(["milestone_drought"]);
});

it("leaves an open loop-guard briefing alone and briefs the stall once that loop recovers",()=>{
 const r=rig(ON);
 r.state({});
 for(let i=0;i<4;i++)r.press(["A"],{},80_000);
 const loop=r.guards().map(g=>[g.kind,g.phase]);
 expect(loop[0]).toEqual(["ineffective","warning"]);
 expect(r.guards().some(g=>g.kind==="milestone_drought")).toBe(false);
 r.press(["UP"],{position:{x:3,y:2}},1_000);
 expect(r.guards().map(g=>g.kind)).toContain("milestone_drought");
});

it("with the switch OFF records the same events and shows the model the same context as the incumbent wiring",()=>{
 const script=(r:ReturnType<typeof rig>)=>{
  stairs(r,6);
  for(let i=0;i<12;i++)r.press(["A"],{in_battle:true},30_000);
  for(let i=0;i<4;i++)r.press(["A"],{},10_000);
  return {events:r.events.map(e=>JSON.stringify(e)),contexts:r.contexts,subscribers:r.observers.length};
 };
 const offRig=rig(OFF);
 const off=script(offRig);
 expect(offRig.wired).toBeNull();
 // The golden: the same run on the incumbent wiring, where live.ts never calls the factory.
 const incumbent=script(rig(OFF,false));
 expect(off).toEqual(incumbent);
 expect(incumbent.events.join("\n")).not.toMatch(/map_cycle|milestone_drought|You are stalling/);
 expect(incumbent.contexts.some(c=>c?.startsWith("SUPERVISOR: You are stalling")===true)).toBe(false);
 const onRig=rig(ON);
 const on=script(onRig);
 expect(onRig.wired).not.toBeNull();
 expect(on.subscribers).toBeGreaterThan(off.subscribers);
 expect(on.events.join("\n")).toMatch(/map_cycle/);
 expect(on.events.join("\n")).toMatch(/milestone_drought/);
});

it("adds no subscriber with the switch OFF, and never briefs in diagnostic mode",()=>{
 const observers:unknown[]=[];const recorder={subscribe:(fn:unknown)=>{observers.push(fn);}};
 const detector=new LoopDetector(()=>undefined);
 expect(stallBriefing(OFF,recorder,detector,{pausedMs:()=>0},()=>0)).toBeNull();
 expect(observers).toHaveLength(0);
 const notices:LoopNotice[]=[];
 const diagnostic=new LoopDetector(n=>notices.push(n),undefined,"diagnostic");
 expect(diagnostic.stall("milestone_drought",()=>"SUPERVISOR: x",[1])).toBe(false);
 expect(diagnostic.context()).toBeNull();
 expect(notices).toEqual([]);
});

it("cites the deferred map cycle's own transition, not a later move between other maps",()=>{
 let accept=false;const notes:{kind:string;evidence:readonly number[];text:string}[]=[];
 const b=new StallBriefing(ON,()=>0,{stall:(kind,text,evidence)=>{if(!accept)return false;notes.push({kind,evidence,text:text(1)});return true;}},s=>JSON.stringify(s));
 const at=(seq:number,body:Record<string,unknown>)=>checkEvent({v:1,run:"m",t:"2026-10-15T12:00:00.000-04:00",turn:seq,seq,...body});
 const go=(seq:number,place:Record<string,unknown>)=>{b.observe(at(seq,{type:"state",...IN_GAME,started:true,screen:"overworld",position:{x:1,y:1},facing:"up",...place}));};
 const done=(seq:number)=>{b.observe(at(seq,{type:"tool_result",id:`c${String(seq)}`,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));};
 go(1,HOUSE_1F);go(2,HOUSE_2F);go(3,HOUSE_1F);go(4,HOUSE_2F);go(5,HOUSE_1F);
 done(6);
 expect(notes).toEqual([]);
 go(7,TOWN);
 accept=true;done(8);
 expect(notes[0]?.kind).toBe("map_cycle");
 expect(notes[0]?.evidence).toEqual([5,8]);
});

it("does not call trips out and back when other maps came between them",()=>{
 const r=rig(ON);
 r.state(HOUSE_1F);
 r.press(["UP"],HOUSE_2F);r.press(["DOWN"],HOUSE_1F);
 r.press(["DOWN"],TOWN);r.press(["UP"],HOUSE_1F);
 r.press(["UP"],HOUSE_2F);
 expect(r.guards()).toEqual([]);
 r.press(["DOWN"],HOUSE_1F);
 const [note]=r.guards();
 expect(note?.message).toMatch(/^SUPERVISOR: You are stalling\. You have walked between HOUSE 1F \(map 1\/0\) and HOUSE 2F \(map 1\/1\) 2 times \(with other maps in between\), with no new story milestone/);
 expect(note?.message).not.toContain("out and back");
});

it("states which stall it is in the headline and keeps the existing loop briefing byte-identical",()=>{
 const b=new SupervisorBriefing(BASE);
 expect(b.stallText({kind:"map_cycle",from:"A",to:"B",roundTrips:3,consecutive:true},7)).toMatch(/^SUPERVISOR: You are stalling\. You have walked between A and B 3 times, out and back, with no new story milestone, and the game is not moving forward \(stall briefing, 7 calls into the run\)\./);
 expect(b.stallText({kind:"map_cycle",from:"A",to:"B",roundTrips:3,consecutive:false},7)).toMatch(/^SUPERVISOR: You are stalling\. You have walked between A and B 3 times \(with other maps in between\), with no new story milestone, and the game/);
 expect(b.stallText({kind:"milestone_drought",minutes:15},9)).toMatch(/^SUPERVISOR: You are stalling\. There has been no new story milestone for 15 minutes of play, and the game is not moving forward \(stall briefing, 9 calls into the run\)\./);
 const loop=b.text("cycle",4);
 expect(loop).toMatch(/^SUPERVISOR: You are currently looping\. You keep repeating the same short cycle of actions, and the game is not moving forward \(loop guard, 4 calls into the run\)\. What you have been trying is not working, so do not try it again\.\nStop and get your bearings:\n- Where you are: no observation yet\n/);
 const facts=(text:string)=>text.slice(text.indexOf("\nStop and get your bearings:"));
 // The stall briefing adds three lines of its own (bundle 3f21 fix F5); every other line is the loop briefing's.
 const added=/^- (Dialogue shown with your latest story step that came with dialogue|Not tried yet on other maps|Exits to maps you have not entered)/;
 const stall=facts(b.stallText({kind:"milestone_drought",minutes:5},4)).split("\n");
 expect(stall.filter(line=>added.test(line))).toEqual(["- Dialogue shown with your latest story step that came with dialogue: none recorded","- Not tried yet on other maps you have been on since your last story progress: none","- Exits to maps you have not entered since your last story progress: none"]);
 expect(stall.filter(line=>!added.test(line)).join("\n")).toBe(facts(loop));
 expect(new StallBriefing(ON,()=>0,{stall:()=>false},()=>"")).toBeInstanceOf(StallBriefing);
});

it("describes exactly what it does in the switch registry",()=>{
 const info=featureInfo("stall-briefing-v1");
 expect(info).toMatchObject({group:"guard",needs:"loop-guard-supervisor-v1"});
 expect(info.description).toContain("second round trip");
 expect(info.description).toContain(`every ${String(STALL_DROUGHT_MS/60_000)} minutes of play`);
 expect(info.description).toContain(" Off: ");
});

it("keeps counting the drought through a measurement-only split",()=>{
 let now=0;const kinds:string[]=[];
 const b=new StallBriefing(ON,()=>now,{stall:(kind)=>{kinds.push(kind);return true;}},()=>"");
 const at=(seq:number,body:Record<string,unknown>)=>checkEvent({v:1,run:"m",t:"2026-10-15T12:00:00.000-04:00",turn:seq,seq,...body});
 now=STALL_DROUGHT_MS-60_000;
 b.observe(at(1,{type:"milestone",name:"ROUTE_101_AFTER_HANDOFF",server_timestamp:0,kind:"navigation",origin:"observed",evidence:[1]}));
 now=STALL_DROUGHT_MS;
 b.observe(at(2,{type:"tool_result",id:"c1",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[]}));
 expect(kinds).toEqual(["milestone_drought"]);
});

it("can brief before the name is confirmed, so its pending experiment activates at NEW_GAME_CREATED",()=>{
 const r=rig(ON);
 r.milestone("NEW_GAME_CREATED","observed");
 r.state(HOUSE_1F);
 for(let i=0;i<31;i++)r.press(["RIGHT"],{...HOUSE_1F,position:{x:i,y:3}},10_000);
 expect(r.guards().map(g=>g.kind)).toEqual(["milestone_drought"]);
 expect(r.events.some(e=>e.type==="milestone"&&e.name==="PLAYER_NAME_CONFIRMED")).toBe(false);
 const entry:unknown=JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/stall-briefing.json",import.meta.url)),"utf8"));
 expect(entry).toMatchObject({activationMilestone:"NEW_GAME_CREATED"});
});
