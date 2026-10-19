import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {attachLoopGuard,Governor} from "./harness.js";
import {ALL_ON,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import {checkEvent,type RunEvent} from "./events.js";
import {LOOP_POLICY,LoopDetector,type LoopNotice} from "./loop-detection.js";
import {IN_GAME} from "../test-support/events.js";

// Recorded events, trimmed by the test author to the fields the loop guard reads
// (heavy map/RAM fields and non-error tool result text removed). Not a parseEvent-valid run.
function recorded(name:string):RunEvent[]{
 const path=fileURLToPath(new URL(`./fixtures/${name}`,import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
}

interface Seen {readonly turn:number;readonly seq:number;readonly kind:string;readonly phase:string;readonly message:string}

// The production path: attachLoopGuard subscribed to a recorder fan-out, as live.ts wires it.
function replay(events:readonly RunEvent[],transitions:boolean):{seen:Seen[];contexts:(string|null)[]}{
 const observers:((e:RunEvent)=>void)[]=[];const seen:Seen[]=[];const contexts:(string|null)[]=[];
 let current:RunEvent|undefined;
 const start=events.find(e=>e.type==="run_start");
 if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 const features=featuresOf(start.harness_features);
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{seen.push({turn:current?.turn??-1,seq:current?.seq??-1,kind:n.kind,phase:n.phase,message:n.message});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],(kind,calls)=>`SUPERVISOR: ${kind} at ${String(calls)} calls`,transitions);
 for(const e of events){
  if(e.type==="loop_guard")continue;
  current=e;
  for(const o of observers)o(e);
  if(e.type==="turn_start")contexts.push(detector.context());
 }
 return {seen,contexts};
}

describe("transition-loop-detection-v1 on recorded run 2919 (Birch's lab door bounce, seq 2860-4239)",()=>{
 const events=recorded("bounce-2919.jsonl.gz");
 const labEntries=(upTo:number)=>{let n=0,last:string|null=null;for(const e of events){if(e.seq>upTo)break;if(e.seq<3097&&e.type==="state"&&"started"in e&&e.map_id!==null){last=JSON.stringify(e.map_id);continue;}if(e.type==="state"&&"started"in e&&e.map_id!==null){const m=JSON.stringify(e.map_id);if(last!==null&&m!==last&&m==="[1,4]")n++;last=m;}}return n;};

 it("OFF: reproduces today's silence through the whole bounce window",()=>{
  expect(replay(events,false).seen).toEqual([]);
 });

 it("ON: raises a cycle warning and the supervisor briefing within three lab re-entries",()=>{
  const {seen,contexts}=replay(events,true);
  const warning=seen.find(n=>n.phase==="warning");
  expect(warning).toMatchObject({kind:"cycle"});
  expect(seen.find(n=>n.phase==="supervisor")).toMatchObject({kind:"cycle",seq:warning?.seq});
  expect(labEntries(warning?.seq??Infinity)).toBeLessThanOrEqual(3);
  // The receipt reported for 2919: the sixth door crossing of the bounce (T200-T205). The T185 entry does not
  // count: the conversation with the scientist (results T191-T199) restarted the count.
  expect(warning).toMatchObject({turn:205,seq:3244});
  // Delivered to the model as the supervisor briefing at the next model call.
  expect(contexts.some(c=>c!==null&&/^SUPERVISOR: cycle at \d+ calls$/.test(c))).toBe(true);
  // The guard keeps briefing while the bounce lasts; nothing stops the run.
  expect(seen.filter(n=>n.phase==="supervisor").length).toBeGreaterThan(1);
  expect(seen.some(n=>n.phase==="stop")).toBe(false);
 });
});

describe("transition-loop-detection-v1 on recorded run 2919 (MOM's conversation, seq 1800-1900)",()=>{
 it("a real locked conversation yields exactly today's notices, no new cycle",()=>{
  const events=recorded("conversation-2919.jsonl.gz");
  expect(events.some(e=>e.type==="state"&&"started"in e&&e.field_controls_locked===true&&typeof e.world_context?.dialogue==="string")).toBe(true);
  expect(replay(events,true).seen).toEqual(replay(events,false).seen);
 });
});

// Synthetic runs through the same production path, with schema-checked events.
const HOUSE_1F={location:"LITTLEROOT TOWN BRENDANS HOUSE 1F",map_id:[1,0]};
const HOUSE_2F={location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1]};
// The door/stairs animation: field locked, no message, the game's script context stopped (pokeemerald src/script.c).
const ANIMATION={field_controls_locked:true,resources:{bag:[],pc_items:[],storage:null,berry_trees:null,planted_berries:null,diagnostics:[],script_pc:0,script_mode:0,script_status:2,selected_tree_id:null,berry_script_owner:null}};
// A running script with no message yet: bytecode mode, context running.
const SCRIPT={field_controls_locked:true,resources:{...ANIMATION.resources,script_pc:0x0827_0000,script_mode:1,script_status:0}};

function rig(transitions:boolean){
 const observers:((e:RunEvent)=>void)[]=[];const notices:LoopNotice[]=[];
 let seq=0,turn=0,call=0,stateSeq=0;
 const emit=(body:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"bounce",t:"2026-10-16T01:00:00.000-04:00",turn,seq:++seq,...body});for(const o of observers)o(e);return e;};
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{notices.push(n);}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",false,undefined,transitions);
 const state=(extra:Record<string,unknown>):RunEvent=>{const e=emit({type:"state",...IN_GAME,started:true,screen:"overworld",...HOUSE_1F,position:{x:8,y:2},facing:"up",field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null},...extra});stateSeq=e.seq;return e;};
 // One model turn: a settled state before the press, the press, then the state the result reports.
 const press=(button:string,before:Record<string,unknown>,after:Record<string,unknown>):void=>{
  turn++;
  emit({type:"turn_start",context:{messages:1,images:0,est_tokens:10}});
  state(before);
  const id=`c${String(++call)}`;
  emit({type:"tool_call",id,name:"press",args:{buttons:[button]}});
  emit({type:"button_press",tool_call_id:id,buttons:[button],before_state_seq:stateSeq});
  const s=state(after);
  emit({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq});
 };
 const milestone=(name:string)=>emit({type:"milestone",name,server_timestamp:0,kind:"navigation",origin:"observed"});
 return {press,milestone,notices,detector,turn:()=>turn};
}

const UPSTAIRS={...HOUSE_2F,position:{x:7,y:1},facing:"down"};
const DOWNSTAIRS={...HOUSE_1F,position:{x:8,y:2},facing:"down"};
// One stairs round trip: UP onto the 1F stairs arrives on 2F mid-animation, DOWN back arrives on 1F mid-animation.
function roundTrip(r:ReturnType<typeof rig>,extra:Record<string,unknown>={}):void{
 r.press("UP",{...DOWNSTAIRS,...extra},{...UPSTAIRS,...ANIMATION,...extra});
 r.press("DOWN",{...UPSTAIRS,...extra},{...DOWNSTAIRS,...ANIMATION,...extra});
}

describe("transition-loop-detection-v1 stairs bounce",()=>{
 it("ON: the third stairs round trip raises a cycle warning; OFF stays silent for twice as long",()=>{
  const on=rig(true);
  roundTrip(on);roundTrip(on);
  on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  expect(on.notices).toEqual([]);
  on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...ANIMATION});
  expect(on.notices).toEqual([expect.objectContaining({kind:"cycle",phase:"warning",mode:"enforced",calls:6})]);
  expect(on.detector.context()).toBe(`LOOP GUARD (cycle): ${on.notices[0]?.message ?? ""} Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.`);
  const off=rig(false);
  for(let i=0;i<6;i++)roundTrip(off);
  expect(off.notices).toEqual([]);
 });

 it("ON: the warning names the map ping-pong truthfully",()=>{
  const on=rig(true);
  for(let i=0;i<3;i++)roundTrip(on);
  expect(on.notices[0]?.message).toBe("Moving back and forth between the same maps is repeating with no new story, party, money, badge or item change. Reassess the objective and choose a different exit or target using observed evidence.");
 });

 it("ON: story, party, money, badge or item progress between trips restarts the count",()=>{
  const on=rig(true);
  for(let i=0;i<6;i++)roundTrip(on,{money:3000+i});
  expect(on.notices).toEqual([]);
 });

 it("ON: a newly observed milestone restarts the count",()=>{
  const on=rig(true);
  roundTrip(on);roundTrip(on);on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  on.milestone("PLAYER_BEDROOM");
  on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...ANIMATION});
  expect(on.notices).toEqual([]);
  roundTrip(on);roundTrip(on);
  expect(on.notices).toEqual([]);
  on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  expect(on.notices).toEqual([expect.objectContaining({kind:"cycle",phase:"warning"})]);
 });
});

describe("transition-loop-detection-v1 unsettled arrivals",()=>{
 it("ON: a map change first seen in the next press's before state still counts",()=>{
  const on=rig(true);
  // The press result still shows the old map mid-door (locked); the new map appears only before the next press.
  const stillDown={...DOWNSTAIRS,...ANIMATION},stillUp={...UPSTAIRS,...ANIMATION};
  // The first press's own move is only seen at the second press, so six moves need seven presses.
  for(let i=0;i<3;i++){on.press("UP",DOWNSTAIRS,stillDown);on.press("DOWN",UPSTAIRS,stillUp);}
  expect(on.notices).toEqual([]);
  on.press("UP",DOWNSTAIRS,stillDown);
  expect(on.notices).toEqual([expect.objectContaining({kind:"cycle",phase:"warning"})]);
 });
});

describe("transition-loop-detection-v1 scripted map changes",()=>{
 const DIALOGUE={...ANIMATION,world_context:{objects:[],triggers:[],dialogue:"MOM: Go see PROF. BIRCH."}};
 it.each([["a running script",SCRIPT],["an open dialogue",DIALOGUE],["an active menu",{...ANIMATION,active_ui:{phase:"start_menu",selected:"BAG",ready:true,controls:"UP/DOWN selects; A accepts; B closes",diagnostic:null,value:null}}]] as const)("ON: map changes that land in %s never count",(_label,lock)=>{
  const on=rig(true);
  for(let i=0;i<6;i++){on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...lock});on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...lock});}
  expect(on.notices).toEqual([]);
 });
 it("ON: map changes that start from a running script never count",()=>{
  const on=rig(true);
  for(let i=0;i<6;i++){on.press("UP",{...DOWNSTAIRS,...SCRIPT},UPSTAIRS);on.press("DOWN",{...UPSTAIRS,...SCRIPT},DOWNSTAIRS);}
  expect(on.notices).toEqual([]);
 });
 it("ON: a scripted crossing whose result still shows the old map does not bridge into the next call",()=>{
  const on=rig(true);
  // The script warps after the result was read: the result is still 1F (script running), the next call starts on 2F.
  on.press("A",DOWNSTAIRS,{...DOWNSTAIRS,...SCRIPT});
  on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...ANIMATION});
  on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...ANIMATION});
  on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...ANIMATION});
  expect(on.notices).toEqual([]);
  on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  expect(on.notices).toEqual([expect.objectContaining({kind:"cycle",phase:"warning"})]);
 });
 it("ON: a scripted map change between bounces restarts the count",()=>{
  const on=rig(true);
  roundTrip(on);roundTrip(on);on.press("UP",DOWNSTAIRS,{...UPSTAIRS,...ANIMATION});
  on.press("DOWN",UPSTAIRS,{...DOWNSTAIRS,...SCRIPT});
  roundTrip(on);roundTrip(on);
  expect(on.notices).toEqual([]);
 });
});

describe("transition-loop-detection-v1 lock handling",()=>{
 const Y={position:{x:4,y:3},facing:"right"};
 const Xl={position:{x:3,y:3},facing:"left"};
 // RIGHT X->Y, LEFT Y->X, then A into a lock and A out of it, three times on one map.
 const pattern=(r:ReturnType<typeof rig>,lock:Record<string,unknown>)=>{
  for(let i=0;i<3;i++){
   r.press("RIGHT",Xl,Y);
   r.press("LEFT",Y,Xl);
   r.press("A",Xl,{...Xl,...lock});
   r.press("A",{...Xl,...lock},Xl);
  }
 };
 it("ON: a transient (animation) lock is skipped, so the repeating pattern around it is seen",()=>{
  const on=rig(true);pattern(on,ANIMATION);
  expect(on.notices.map(n=>[n.kind,n.phase])).toEqual([["cycle","warning"]]);
  const off=rig(false);pattern(off,ANIMATION);
  expect(off.notices).toEqual([]);
 });
 it("ON: a running script lock still clears the history, so no cycle forms across it",()=>{
  const on=rig(true);pattern(on,SCRIPT);
  expect(on.notices).toEqual([]);
 });
 it("ON: a lock with a dialogue open still clears the history",()=>{
  const on=rig(true);pattern(on,{...ANIMATION,world_context:{objects:[],triggers:[],dialogue:"MOM: Hello"}});
  expect(on.notices).toEqual([]);
 });
 it("ON: a lock with unknown script state still clears the history",()=>{
  const on=rig(true);pattern(on,{field_controls_locked:true});
  expect(on.notices).toEqual([]);
 });
});

describe("LoopDetector constructor default",()=>{
 it("is OFF unless the switch is passed",()=>{
  const notices:LoopNotice[]=[];
  const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",false);
  const a={...IN_GAME,started:true,screen:"overworld",...DOWNSTAIRS,field_controls_locked:false};
  const b={...IN_GAME,started:true,screen:"overworld",...UPSTAIRS,field_controls_locked:false};
  for(let i=0;i<12;i++)d.complete({name:"press",args:{buttons:[i%2===0?"UP":"DOWN"]},isError:false,text:"ok",beforeState:checkState(i%2===0?a:b),state:checkState(i%2===0?b:a),acted:true});
  expect(notices.filter(n=>n.phase==="warning").map(n=>n.message)).not.toContain("Moving back and forth between the same maps is repeating with no new story, party, money, badge or item change. Reassess the objective and choose a different exit or target using observed evidence.");
 });
});

function checkState(body:Record<string,unknown>){
 const e=checkEvent({v:1,run:"s",t:"2026-10-16T01:00:00.000-04:00",turn:0,seq:1,type:"state",...body});
 if(e.type!=="state"||!("started"in e))throw new Error("not a game state");
 return e;
}

describe("transition-loop-detection-v1 registry",()=>{
 it("is a default-off guard with no dependency, recorded last",()=>{
  expect(featureInfo("transition-loop-detection-v1")).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo("transition-loop-detection-v1").description).toContain(" Off: any locked step clears the cycle history and map changes are not counted.");
  expect(playHarnessFeatures(ALL_ON,null).at(-76)).toBe("transition-loop-detection-v1");
  expect(playHarnessFeatures({...ALL_ON,"transition-loop-detection-v1":false},null)).not.toContain("transition-loop-detection-v1");
  expect(dependencyProblems({...ALL_ON,"deterministic-loop-guard-v1":false})).not.toContain(expect.stringContaining("transition-loop-detection-v1"));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["transition-loop-detection-v1"]).toBe(false);
 });
});
