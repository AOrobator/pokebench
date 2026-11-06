import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {expect,it} from "vitest";
import {attachLoopGuard,Governor} from "./harness.js";
import {loopSupervisor,stallBriefing} from "./play-wiring.js";
import {INTERFACE_DWELL_CALLS,STALL_DROUGHT_MS,STALL_ROUND_TRIPS,StallBriefing} from "./stall-briefing.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {featureInfo,type FeatureSet} from "./features.js";
import {checkEvent,parseEvent,type RunEvent} from "./events.js";
import {LoopDetector,type LoopNotice} from "./loop-detection.js";
import {IN_GAME} from "../test-support/events.js";

const BASE:FeatureSet={...ALL_ON,"next-milestone-hint-v1":false,"same-plan-breaker-v1":false,"briefing-exits-v1":false};
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
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{observers.push({fn});},recordStallGate:()=>undefined,recordLoopGuard:(n:LoopNotice)=>{emit({type:"loop_guard",...n,evidence:[...n.evidence]});}};
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
 const observers:unknown[]=[];const recorder={subscribe:(fn:unknown)=>{observers.push(fn);},recordStallGate:()=>undefined,recordLoopGuard:()=>undefined};
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
});

// open-milestone-stall-v1 / drought-progress-credit-v2: a GYM LEADER loss left open, played from recorded state only.
const GYM={location:"RUSTBORO CITY GYM",map_id:[11,3]};
const CITY={location:"RUSTBORO CITY",map_id:[0,3]};
const LEADER={trainer_id:265,name:"ROXANNE",trainer_class:0x20,defeated:false,battle_active:true};
const FIGHT={active:true,initialized:true,phase:"resolving",ready:false,main_func:0x0803e08d,script_pc:0x082d9000,battle_type:8,turn:1,outcome_code:0,outcome:"ongoing",battlers:[],player_inputs:[],controller_exec_flags:1,signals:[],current_execution:null,diagnostic:null,raw_hex:null};
const MEMBER=(identity:string,species:string,level:number,experience:number)=>({identity,species,level,experience,hp:36,max_hp:36,is_egg:false});
const LOSS_PARTY=[MEMBER("t1","TORCHIC",14,1724)];
const OPEN_BASE:FeatureSet={...ON,"turn-drought-clock-v1":true,"drought-progress-facts-v1":true,"drought-battle-heal-hold-v1":true};
const A_ON:FeatureSet={...OPEN_BASE,"drought-progress-credit-v2":true,"open-milestone-stall-v1":false};
const A_OFF:FeatureSet={...OPEN_BASE,"drought-progress-credit-v2":false,"open-milestone-stall-v1":false};
const B_ON:FeatureSet={...ON,"turn-drought-clock-v1":false,"open-milestone-stall-v1":true,"drought-progress-credit-v2":false};
const B_OFF:FeatureSet={...B_ON,"open-milestone-stall-v1":false};

function leaderLoss(r:ReturnType<typeof rig>,party= LOSS_PARTY):void {
 r.state({...GYM,in_battle:true,screen:"battle",party,trainer_opponent:{...LEADER},battle:{...FIGHT}});
 r.press(["A"],{...GYM,in_battle:true,screen:"battle",party,trainer_opponent:{...LEADER},battle:{...FIGHT,outcome:"lost"}},1000);
 r.press(["B"],{...CITY,party,trainer_opponent:{...LEADER,battle_active:false}},1000);
}
function walk(r:ReturnType<typeof rig>,n:number,party:unknown[],until=()=>false):number {
 let i=0;for(;i<n&&!until();i++)r.press(["RIGHT"],{...CITY,position:{x:4+(i%8),y:3},party},1000);
 return i;
}

it("credits a level-up toward an open leader loss only for a POKéMON the loss saw",()=>{
 const caught=[MEMBER("t1","TORCHIC",14,1724),MEMBER("w1","WINGULL",5,156)];
 const levelled=[MEMBER("t1","TORCHIC",14,1724),MEMBER("w1","WINGULL",6,232)];
 const on=rig(A_ON);leaderLoss(on);
 on.press(["RIGHT"],{...CITY,party:caught},1000);
 on.press(["RIGHT"],{...CITY,party:levelled},1000);
 const onPresses=walk(on,40,levelled,()=>on.guards().length>0);
 const off=rig(A_OFF);leaderLoss(off);
 off.press(["RIGHT"],{...CITY,party:caught},1000);
 off.press(["RIGHT"],{...CITY,party:levelled},1000);
 const offPresses=walk(off,40,levelled,()=>off.guards().length>0);
 expect(on.guards().map(g=>g.kind)).toEqual(["milestone_drought"]);
 expect(off.guards().map(g=>g.kind)).toEqual(["milestone_drought"]);
 // Off, the Wingull's level restarts the clock: four presses later, counting the result the restart skips.
 expect(offPresses-onPresses).toBe(4);
});

it("keeps crediting a level-up by the POKéMON that lost",()=>{
 const after=[MEMBER("t1","TORCHIC",15,2064)];
 const r=rig(A_ON);leaderLoss(r);
 r.press(["RIGHT"],{...CITY,party:after},1000);
 const presses=walk(r,40,after,()=>r.guards().length>0);
 expect(r.guards().map(g=>g.kind)).toEqual(["milestone_drought"]);
 expect(presses).toBe(30);
});

it("briefs once on an open leader loss after 30 actions, naming the loss and the party then and now",()=>{
 const now=[MEMBER("t1","TORCHIC",15,2064)];
 const r=rig(B_ON);leaderLoss(r);
 walk(r,40,now,()=>r.guards().length>0);
 const [note]=r.guards();
 expect(note).toMatchObject({kind:"open_milestone",phase:"supervisor",mode:"enforced"});
 expect(note?.message).toMatch(/^SUPERVISOR: You have an unfinished battle: you lost to ROXANNE on RUSTBORO CITY GYM \(map 11\/3\) at turn \d+, and 30 actions have passed without another attempt/);
 expect(note?.message).toContain("Party at that battle: TORCHIC Lv14, EXP. POINTS 1724");
 expect(note?.message).toContain("Party now: TORCHIC Lv15, EXP. POINTS 2064");
 expect(note?.message).not.toMatch(/\b(go|head|walk|return|train|should|route)\b/i);
 expect(()=>parseEvent(JSON.stringify(note))).not.toThrow();
 expect(r.next()).toBe(note?.message);
});

it("banks a due open-milestone note through a battle and sends it at the next free result",()=>{
 const now=[MEMBER("t1","TORCHIC",15,2064)];
 const r=rig(B_ON);leaderLoss(r);
 walk(r,27,now);
 r.press(["A"],{...CITY,in_battle:true,screen:"battle",party:now,trainer_opponent:{...LEADER},battle:{...FIGHT}},1000);
 expect(r.guards()).toEqual([]);
 r.press(["RIGHT"],{...CITY,party:now},1000);
 expect(r.guards().map(g=>g.kind)).toEqual(["open_milestone"]);
 expect(r.guards()[0]?.message).toMatch(/and 30 actions have passed without another attempt/);
});

it("stops briefing once the leader is beaten",()=>{
 const now=[MEMBER("t1","TORCHIC",15,2064)];
 const r=rig(B_ON);leaderLoss(r);
 r.state({...GYM,in_battle:true,screen:"battle",party:now,trainer_opponent:{...LEADER},battle:{...FIGHT}});
 r.press(["A"],{...GYM,in_battle:true,screen:"battle",party:now,trainer_opponent:{...LEADER},battle:{...FIGHT,outcome:"won"}},1000);
 r.press(["B"],{...CITY,party:now,trainer_opponent:{...LEADER,battle_active:false,defeated:true}},1000);
 walk(r,60,now);
 expect(r.guards().filter(g=>g.kind==="open_milestone")).toEqual([]);
});

it("sends no open-milestone note with the switch off",()=>{
 const now=[MEMBER("t1","TORCHIC",15,2064)];
 const r=rig(B_OFF);leaderLoss(r);
 walk(r,60,now);
 expect(r.guards().filter(g=>g.kind==="open_milestone")).toEqual([]);
});

// first-visit-cycle-credit-v1. Shape of ee2a: a cycle note fired on the way to the first entry of MT PYRE EXTERIOR.
const CREDIT:FeatureSet={...ON,"first-visit-cycle-credit-v1":true};
const PLAIN_CLOCK={"drought-battle-heal-hold-v1":false,"drought-progress-facts-v1":false,"turn-drought-clock-v1":false} as const;
const CAVE={location:"CAVE",map_id:[2,0]};
const CLIFF={location:"CLIFF",map_id:[2,1]};
const held=(r:ReturnType<typeof rig>)=>r.guards().filter(g=>g.message.startsWith("Not sent (first-visit-cycle-credit-v1):"));
const sent=(r:ReturnType<typeof rig>)=>r.guards().filter(g=>g.message.startsWith("SUPERVISOR:"));
// Up and down between the first-entered map and the one before it, four moves: a cycle is due on the fourth.
function firstVisitThenCycle(r:ReturnType<typeof rig>):void {
 stairs(r,3);
 r.press(["UP"],{...TOWN,position:{x:1,y:1}},10_000,[LOADING]);
 for(let i=0;i<4;i++)r.press(["DOWN"],i%2===0?{...HOUSE_2F,position:{x:7,y:1}}:{...TOWN,position:{x:1,y:1}},10_000,[LOADING]);
}
let steps=0;
const stay=(r:ReturnType<typeof rig>,n:number,place=TOWN):void=>{for(let i=0;i<n;i++){steps++;r.press([steps%2===0?"LEFT":"RIGHT"],{...place,position:{x:steps,y:1}});}};

it("first-visit-cycle-credit-v1 off: the same walk sends its cycle note at once, with no hold recorded",()=>{
 const r=rig(ON);
 firstVisitThenCycle(r);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toHaveLength(1);
 expect(held(r)).toEqual([]);
});

it("first entry to a map clears the pair counts, so it cannot complete a cycle",()=>{
 const r=rig(CREDIT);
 stairs(r,3);
 r.press(["UP"],{...TOWN,position:{x:1,y:1}},10_000,[LOADING]);
 r.press(["DOWN"],{...HOUSE_2F,position:{x:7,y:1}},10_000,[LOADING]);
 stay(r,11,HOUSE_2F);
 r.press(["DOWN"],{...HOUSE_1F,position:{x:8,y:2}},10_000,[LOADING]);
 expect(r.guards().filter(g=>g.kind==="map_cycle")).toEqual([]);
});

it("holds a due cycle note for 10 calls after a first entry, records it once naming the map, then delivers it",()=>{
 const r=rig(CREDIT);
 firstVisitThenCycle(r);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toEqual([]);
 const [note]=held(r);
 expect(note).toMatchObject({kind:"map_cycle",mode:"diagnostic",phase:"would_warn"});
 expect(note?.message).toContain("TOWN (map 0/9)");
 expect(()=>parseEvent(JSON.stringify(note))).not.toThrow();
 stay(r,5);
 expect(held(r)).toHaveLength(1);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toEqual([]);
 stay(r,1);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toEqual([]);
 stay(r,1);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toHaveLength(1);
});

it("a held cycle note that stopped being due is recorded, not sent and not dropped silently",()=>{
 const r=rig(CREDIT);
 firstVisitThenCycle(r);
 r.milestone("ROUTE_101","observed");
 stay(r,7);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toEqual([]);
 expect(held(r)).toHaveLength(2);
 expect(held(r)[1]?.message).toContain("no longer due");
 expect(held(r)[1]).toMatchObject({kind:"map_cycle",mode:"diagnostic",phase:"would_warn"});
});

it("another first entry restarts the 10-call hold",()=>{
 const r=rig(CREDIT);
 firstVisitThenCycle(r);
 stay(r,5);
 r.press(["UP"],{...CAVE,position:{x:1,y:1}},10_000,[LOADING]);
 stay(r,9,CAVE);
 r.press(["UP"],{...CLIFF,position:{x:1,y:1}},10_000,[LOADING]);
 stay(r,11,CLIFF);
 expect(sent(r).filter(g=>g.kind==="map_cycle")).toEqual([]);
 expect(held(r).at(-1)?.message).toContain("no longer due");
});

it("holds a due drought note during the hold and delivers it after, still due",()=>{
 const r=rig({...CREDIT,...PLAIN_CLOCK});
 r.state(HOUSE_1F);
 r.press(["UP"],{...TOWN,position:{x:1,y:1}},STALL_DROUGHT_MS,[LOADING]);
 r.press(["A"],{...TOWN,position:{x:1,y:1}});
 expect(sent(r).filter(g=>g.kind==="milestone_drought")).toEqual([]);
 const [note]=held(r);
 expect(note).toMatchObject({kind:"milestone_drought",mode:"diagnostic",phase:"would_warn"});
 expect(note?.message).toContain("TOWN (map 0/9)");
 stay(r,10);
 expect(sent(r).filter(g=>g.kind==="milestone_drought")).toHaveLength(1);
 expect(held(r)).toHaveLength(1);
});

it("the map a run starts on and maps it returns to start no hold",()=>{
 const r=rig({...CREDIT,...PLAIN_CLOCK});
 r.state(HOUSE_1F);
 r.press(["UP"],{...HOUSE_1F,position:{x:1,y:1}},STALL_DROUGHT_MS);
 expect(sent(r).filter(g=>g.kind==="milestone_drought")).toHaveLength(1);
 expect(held(r)).toEqual([]);
});

it("a first entry during a hold keeps a due note back for 10 more calls",()=>{
 const r=rig({...CREDIT,...PLAIN_CLOCK});
 r.state(HOUSE_1F);
 r.press(["UP"],{...TOWN,position:{x:1,y:1}},STALL_DROUGHT_MS,[LOADING]);
 stay(r,8);
 r.press(["UP"],{...CAVE,position:{x:1,y:1}},10_000,[LOADING]);
 stay(r,10,CAVE);
 expect(sent(r).filter(g=>g.kind==="milestone_drought")).toEqual([]);
 stay(r,1,CAVE);
 expect(sent(r).filter(g=>g.kind==="milestone_drought")).toHaveLength(1);
});

it("the hold does not touch interface dwell briefings",()=>{
 const r=rig(CREDIT);
 r.state(HOUSE_1F);
 for(let i=0;i<INTERFACE_DWELL_CALLS-2;i++)r.press([i%2===0?"LEFT":"RIGHT"],{...HOUSE_1F,screen:"naming",position:{x:1,y:1}});
 expect(sent(r)).toEqual([]);
 r.press(["UP"],{...TOWN,screen:"naming",position:{x:1,y:1}},10_000,[LOADING]);
 for(let i=0;i<3;i++)r.press([i%2===0?"LEFT":"RIGHT"],{...TOWN,screen:"naming",position:{x:1,y:1}});
 expect(sent(r).filter(g=>g.kind==="interface_dwell")).toHaveLength(1);
});
