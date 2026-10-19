import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {attachLoopGuard,Governor} from "./harness.js";
import {ALL_ON,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures} from "./features.js";
import {flagFeatures} from "./play-preset.js";
import {checkEvent,type RunEvent} from "./events.js";
import {LOOP_POLICY,LoopDetector,PUSHBACK_MESSAGE,type LoopNotice} from "./loop-detection.js";
import {IN_GAME} from "../test-support/events.js";

// Recorded events of run 2026-10-16T02-23-17_qwen36-gpu1_sh02, as the recorder wrote them, trimmed only where the
// event schema leaves a field optional (navigation grid, interaction targets, local map, raw RAM, berry/storage
// resources, map triggers; tool result text cut at its first blank line). Every row passes checkEvent.
function recorded(name:string):RunEvent[]{
 const path=fileURLToPath(new URL(`./fixtures/${name}`,import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
}

interface Seen {readonly turn:number;readonly seq:number;readonly kind:string;readonly phase:string;readonly message:string;readonly evidence:readonly number[]}

// The production path: attachLoopGuard subscribed to a recorder fan-out, as live.ts wires it, with the run's own switches.
function replay(events:readonly RunEvent[],pushback:boolean):{seen:Seen[];contexts:{turn:number;text:string|null}[]}{
 const observers:((e:RunEvent)=>void)[]=[];const seen:Seen[]=[];const contexts:{turn:number;text:string|null}[]=[];
 let current:RunEvent|undefined;
 const start=events.find(e=>e.type==="run_start");
 if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 const features=featuresOf(start.harness_features);
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{checkEvent({v:1,run:"replay",seq:current?.seq??0,t:"2026-10-16T03:00:00.000-04:00",turn:current?.turn??0,type:"loop_guard",...n,evidence:[...n.evidence]});seen.push({turn:current?.turn??-1,seq:current?.seq??-1,kind:n.kind,phase:n.phase,message:n.message,evidence:n.evidence});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],(kind,calls)=>`SUPERVISOR: ${kind} at ${String(calls)} calls`,features["transition-loop-detection-v1"],pushback);
 for(const e of events){
  if(e.type==="loop_guard")continue;
  current=e;
  for(const o of observers)o(e);
  if(e.type==="turn_start")contexts.push({turn:e.turn,text:detector.context()});
 }
 return {seen,contexts};
}

describe("pushback-loop-detection-v1 on recorded run sh02: the Route 101 twin pushes the player back (T141-T173)",()=>{
 const events=recorded("pushback-twin-sh02.jsonl.gz");
 it("the fixture is the bounce: every other UP ends back at (11,2) after the twin's script",()=>{
  const start=events.find(e=>e.type==="run_start");
  expect(start?.type==="run_start"&&start.harness_features).toEqual(expect.arrayContaining(["deterministic-loop-guard-v1","interaction-loop-detection-v1","transition-loop-detection-v1","loop-guard-supervisor-v1","dialogue-auto-advance-v1"]));
  const pushed=events.filter(e=>e.type==="dialogue_auto_advance"&&e.pages.some(p=>p.text.startsWith("It's dangerous")));
  expect(pushed.length).toBeGreaterThanOrEqual(14);
 });
 it("OFF: reproduces today's silence through the whole bounce",()=>{
  expect(replay(events,false).seen).toEqual([]);
 });
 it("ON: the third push-back raises a cycle warning and the supervisor briefing, delivered at the next model call",()=>{
  const {seen,contexts}=replay(events,true);
  const warning=seen.find(n=>n.phase==="warning");
  expect(warning).toMatchObject({kind:"cycle",message:PUSHBACK_MESSAGE});
  // The receipt: the third push-back (T142, T144, T146), each an auto-advanced UP that ended back at (11,2).
  expect(warning).toMatchObject({turn:146,seq:3062,evidence:[2973,3062]});
  expect(seen.find(n=>n.phase==="supervisor")).toMatchObject({kind:"cycle",seq:warning?.seq});
  const next=contexts.find(c=>c.turn>(warning?.turn??Infinity));
  expect(next?.text).toMatch(/^SUPERVISOR: cycle at \d+ calls$/);
  expect(seen.some(n=>n.phase==="stop")).toBe(false);
 });
 it("ON: the episode recovers when navigate_to reaches a new place (T173), not before",()=>{
  const {seen}=replay(events,true);
  const recovered=seen.find(n=>n.phase==="recovered");
  expect(recovered).toMatchObject({turn:173,seq:3693});
  expect(seen.filter(n=>n.phase==="supervisor").map(n=>n.turn)).toEqual([146,152,158,164,170]);
  expect(seen.filter(n=>n.phase==="recovered"&&n.turn<172)).toEqual([]);
 });
});

describe("pushback-loop-detection-v1 on recorded run sh02: Birch's script stops the player leaving west (T262-T310)",()=>{
 const events=recorded("pushback-birch-sh02.jsonl.gz");
 it("OFF: reproduces today's silence through 45 identical batches",()=>{
  expect(replay(events,false).seen).toEqual([]);
 });
 it("ON: the third identical push-back raises the warning; the supervisor re-briefs while it lasts; the run is not stopped",()=>{
  const {seen,contexts}=replay(events,true);
  const warning=seen.find(n=>n.phase==="warning");
  expect(warning).toMatchObject({kind:"cycle",message:PUSHBACK_MESSAGE});
  // The receipt: the third identical batch (T263, T264, T265); the supervisor re-briefs every six calls to T307.
  expect(warning).toMatchObject({turn:265,seq:6011,evidence:[5951,6011]});
  expect(seen.filter(n=>n.phase==="supervisor").map(n=>n.turn)).toEqual([265,271,277,283,289,295,301,307]);
  expect(contexts.some(c=>c.text!==null&&/^SUPERVISOR: cycle at \d+ calls$/.test(c.text))).toBe(true);
  expect(seen.some(n=>n.phase==="stop")).toBe(false);
 });
 it("ON: the episode recovers at the first result on a new tile (T308, (6,13) in the starter scene), not before",()=>{
  const {seen}=replay(events,true);
  const warning=seen.find(n=>n.phase==="warning");
  const recovered=seen.find(n=>n.phase==="recovered"&&n.seq>(warning?.seq??Infinity));
  expect(recovered).toMatchObject({turn:308,seq:7300});
 });
});

// Synthetic runs through the same production path, with schema-checked events.
const ROUTE={location:"ROUTE101",map_id:[0,16]};
const HOME={...ROUTE,position:{x:7,y:15},facing:"right"};
const WEST={...ROUTE,position:{x:6,y:15},facing:"left"};
const FREE={field_controls_locked:false,world_context:{objects:[],triggers:[],dialogue:null}};
const RESOURCES={bag:[],pc_items:[],storage:null,berry_trees:null,planted_berries:null,diagnostics:[],selected_tree_id:null,berry_script_owner:null};
const SCRIPT={field_controls_locked:true,resources:{...RESOURCES,script_pc:0x0827_0000,script_mode:2,script_status:0}};
const ANIMATION={field_controls_locked:true,resources:{...RESOURCES,script_pc:0,script_mode:0,script_status:2}};
const message=(text:string)=>({...SCRIPT,world_context:{objects:[],triggers:[],dialogue:text,message:{phase:"dismiss_wait",cursor:51,ready:true,identity:"ab".repeat(32)}}});
const BIRCH=message("Wh-Where are you going?!\nDon't leave me like this!");

function rig(pushback:boolean,interactions=true){
 const observers:((e:RunEvent)=>void)[]=[];const notices:LoopNotice[]=[];
 let seq=0,turn=0,call=0,stateSeq=0;
 const emit=(body:Record<string,unknown>):RunEvent=>{const e=checkEvent({v:1,run:"pushback",t:"2026-10-16T03:00:00.000-04:00",turn,seq:++seq,...body});for(const o of observers)o(e);return e;};
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{checkEvent({v:1,run:"pushback",seq:seq,t:"2026-10-16T03:00:00.000-04:00",turn,type:"loop_guard",...n,evidence:[...n.evidence]});notices.push(n);}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",interactions,undefined,true,pushback);
 const state=(body:Record<string,unknown>):RunEvent=>{const e=emit({type:"state",...IN_GAME,started:true,screen:"overworld",...FREE,...body});stateSeq=e.seq;return e;};
 // One model turn: the states before the press, the model's input, the states while it ran (each auto-advance B is
 // its own button_press of the same call, as dialogue-auto-advance-v1 records it), and the state the result reports.
 const turnOf=(name:"press"|"navigate_to",args:Record<string,unknown>,before:Record<string,unknown>,during:readonly Record<string,unknown>[],after:Record<string,unknown>):void=>{
  turn++;
  emit({type:"turn_start",context:{messages:1,images:0,est_tokens:10}});
  state(before);
  const id=`c${String(++call)}`;
  emit({type:"tool_call",id,name,args});
  emit({type:"button_press",tool_call_id:id,buttons:name==="press"?args["buttons"]:["LEFT"],before_state_seq:stateSeq});
  for(const s of during){state(s);if(s["field_controls_locked"]===true&&s["world_context"]!==undefined)emit({type:"button_press",tool_call_id:id,buttons:["B"],before_state_seq:stateSeq});}
  const s=state(after);
  emit({type:"tool_result",id,name,is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq});
 };
 const press=(buttons:readonly string[],before:Record<string,unknown>,during:readonly Record<string,unknown>[],after:Record<string,unknown>)=>{turnOf("press",{buttons},before,during,after);};
 // An observe call: the state before it and the state its result reports.
 const observe=(before:Record<string,unknown>,after:Record<string,unknown>):void=>{
  turn++;
  emit({type:"turn_start",context:{messages:1,images:0,est_tokens:10}});
  state(before);
  const id=`c${String(++call)}`;
  emit({type:"tool_call",id,name:"observe",args:{}});
  const s=state(after);
  emit({type:"tool_result",id,name:"observe",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s.seq});
 };
 return {press,turnOf,observe,notices,detector,emit,state};
}
const BATCH=["LEFT","LEFT","LEFT","UP","UP","UP"];
const pushedBack=(r:ReturnType<typeof rig>,buttons:readonly string[]=BATCH)=>{r.press(buttons,HOME,[{...WEST,...BIRCH}],HOME);};

describe("pushback-loop-detection-v1 synthetic push-backs",()=>{
 it("ON: the third push-back by the same input warns with the push-back message, citing the first and the third push-back; OFF never",()=>{
  const on=rig(true);
  pushedBack(on);pushedBack(on);
  expect(on.notices).toEqual([]);
  pushedBack(on);
  expect(on.notices).toEqual([expect.objectContaining({kind:"cycle",phase:"warning",mode:"enforced",message:PUSHBACK_MESSAGE})]);
  expect(on.notices[0]?.evidence).toEqual([expect.any(Number),expect.any(Number)]);
  expect(on.detector.context()).toBe(`LOOP GUARD (cycle): ${PUSHBACK_MESSAGE} Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.`);
  const off=rig(false);
  for(let i=0;i<8;i++)pushedBack(off);
  expect(off.notices).toEqual([]);
 });
 it("ON: a two-call push-back (move onto the trigger, then the script returns the player) counts per round trip",()=>{
  const on=rig(true);
  const DOWNTOWN={location:"LITTLEROOT TOWN",map_id:[0,9]};
  const below={...DOWNTOWN,position:{x:11,y:2},facing:"up"},above={...DOWNTOWN,position:{x:11,y:1},facing:"up"};
  const twin=message("It's dangerous if you don't have\nyour own POKéMON.");
  on.press(["UP"],below,[],below);
  for(let i=0;i<3;i++){
   on.press(["UP"],below,[],{...above,...SCRIPT});
   on.press(["UP"],{...above,...twin},[{...above,...twin},{...below,...twin}],below);
  }
  expect(on.notices.map(n=>[n.kind,n.phase,n.message])).toEqual([["cycle","warning",PUSHBACK_MESSAGE]]);
 });
 it("ON: other inputs between push-backs do not hide them; the same way out (first input) must recur three times",()=>{
  const on=rig(true);
  pushedBack(on);pushedBack(on,["UP"]);pushedBack(on);
  expect(on.notices).toEqual([]);
  pushedBack(on,["UP"]);
  expect(on.notices).toEqual([]);
  pushedBack(on);
  expect(on.notices.map(n=>n.phase)).toEqual(["warning"]);
 });
 it("ON: a push-back seen only in the states recorded during the call counts from the very first call",()=>{
  // No auto-advance: the call's before state is the free start tile; only the recorded states show the script.
  const on=rig(true);
  // UP push-backs in between keep the existing same-input check (consecutive) from firing first.
  const back=(b:string)=>{on.press([b],HOME,[{...WEST,...SCRIPT}],HOME);};
  back("LEFT");back("UP");back("LEFT");back("UP");
  expect(on.notices).toEqual([]);
  back("LEFT");
  expect(on.notices.map(n=>[n.kind,n.phase,n.message])).toEqual([["cycle","warning",PUSHBACK_MESSAGE]]);
 });
 it("ON: a tile no longer among the last 16 results recovers the episode even when its state was seen before",()=>{
  const notices:LoopNotice[]=[];
  const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,(kind,calls)=>`SUPERVISOR: ${kind} at ${String(calls)} calls`,true,true);
  const home=checkState({...IN_GAME,started:true,screen:"overworld",...FREE,...HOME});
  const north=checkState({...IN_GAME,started:true,screen:"overworld",...FREE,...ROUTE,position:{x:7,y:14},facing:"up"});
  const west=checkState({...IN_GAME,started:true,screen:"overworld",...WEST,...BIRCH});
  const held=checkState({...IN_GAME,started:true,screen:"overworld",...HOME,...SCRIPT});
  const press=(buttons:readonly string[],beforeState:typeof home,state:typeof home)=>{d.complete({name:"press",args:{buttons},isError:false,text:"ok",beforeState,state,acted:true});};
  d.complete({name:"observe",args:{},isError:false,text:"ok",state:home});
  press(["UP"],home,north);press(["DOWN"],north,home);
  for(let i=0;i<3;i++)press(BATCH,west,home);
  expect(notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);
  // Results at HOME under a running script: no new fingerprints, but NORTH drops out of the place window.
  for(let i=0;i<16;i++)press(["B"],held,held);
  expect(notices.some(n=>n.phase==="recovered")).toBe(false);
  press(["UP"],home,north);
  expect(notices.at(-1)).toMatchObject({phase:"recovered",kind:"cycle"});
  // The escape also empties the push-back count: a new warning needs three new push-backs.
  press(["DOWN"],north,home);
  const before=notices.length;
  press(BATCH,west,home);press(BATCH,west,home);
  expect(notices.length).toBe(before);
  press(BATCH,west,home);
  expect(notices.slice(before).map(n=>n.phase)).toEqual(["warning","supervisor"]);
 });
 it("ON: reaching a new state recovers the episode",()=>{
  const on=rig(true);
  for(let i=0;i<3;i++)pushedBack(on);
  on.press(["UP"],HOME,[],{...HOME,position:{x:7,y:14},facing:"up"});
  expect(on.notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
 });
 it("ON: a navigate_to target the script keeps refusing counts by its target",()=>{
  const on=rig(true);
  // A press push-back between the navigate_to calls keeps the existing same-target navigation check from firing first.
  const nav=()=>{on.turnOf("navigate_to",{map_id:[0,16],x:4,y:14},HOME,[{...WEST,...BIRCH}],HOME);};
  nav();pushedBack(on);nav();pushedBack(on);
  expect(on.notices).toEqual([]);
  nav();
  expect(on.notices.map(n=>[n.kind,n.phase,n.message])).toEqual([["cycle","warning",PUSHBACK_MESSAGE]]);
 });
});

describe("pushback-loop-detection-v1 adds nothing where nothing pushed the player back",()=>{
 const same=(play:(r:ReturnType<typeof rig>)=>void,interactions=true)=>{
  const on=rig(true,interactions),off=rig(false,interactions);play(on);play(off);
  expect(on.notices.map(n=>[n.kind,n.phase,n.message])).toEqual(off.notices.map(n=>[n.kind,n.phase,n.message]));
  expect(on.notices.some(n=>n.message===PUSHBACK_MESSAGE)).toBe(false);
 };
 it("the same conversation read again and again in place (the player never left the tile)",()=>{
  same(r=>{for(let i=0;i<5;i++)r.press(["A"],HOME,[{...HOME,...BIRCH}],HOME);});
 });
 it("walking back and forth with free controls",()=>{
  same(r=>{for(let i=0;i<5;i++){r.press(["LEFT"],HOME,[],WEST);r.press(["RIGHT"],WEST,[],HOME);}});
 });
 it("bumping a wall",()=>{
  same(r=>{for(let i=0;i<5;i++)r.press(["UP"],HOME,[],HOME);},false);
 });
 it("a door or stairs animation lock (not a script) between the steps",()=>{
  same(r=>{for(let i=0;i<5;i++){r.press(["LEFT"],HOME,[],{...WEST,...ANIMATION});r.press(["RIGHT"],{...WEST,...ANIMATION},[],HOME);}});
 });
 it("story, party, money, badge or item progress between attempts (the state differs, so it is not a return)",()=>{
  same(r=>{for(let i=0;i<5;i++)r.press(BATCH,{...HOME,money:3000+i},[{...WEST,...BIRCH,money:3000+i}],{...HOME,money:3001+i});});
 });
 it("a return that takes more than eight calls without a settled state, observes included",()=>{
  same(r=>{
   for(let i=0;i<3;i++){
    r.press(["LEFT"],HOME,[],{...WEST,...SCRIPT});
    // Alternating pages, so the existing observation check never opens an episode that would mask a push-back.
    for(let k=0;k<8;k++){const page=k%2===0?BIRCH:message("Page two.");r.observe({...WEST,...page},{...WEST,...page});}
    r.press(["B"],{...WEST,...BIRCH},[],HOME);
   }
  });
 });
 it("a return that takes more than eight calls without a settled state",()=>{
  same(r=>{
   for(let i=0;i<3;i++){
    r.press(["LEFT"],HOME,[],{...WEST,...SCRIPT});
    for(let k=0;k<8;k++)r.press(["B"],{...WEST,...BIRCH},[],{...WEST,...BIRCH});
    r.press(["B"],{...WEST,...BIRCH},[],HOME);
   }
  });
 });
 it.each([
  ["an open start menu (the menu, not a script, locks the field)",{...ANIMATION,active_ui:{phase:"start_menu",selected:"BAG",ready:true,controls:"UP/DOWN selects; A accepts; B closes",diagnostic:null,value:null}}],
  ["a lock with unknown script state",{field_controls_locked:true}],
  ["a script mode with no decoded status",{field_controls_locked:true,resources:{...RESOURCES,script_pc:1,script_mode:2,script_status:null}}],
  ["a script mode with an invalid status",{field_controls_locked:true,resources:{...RESOURCES,script_pc:1,script_mode:2,script_status:3}}],
 ] as const)("leaving and coming back through %s",(_label,lock)=>{
  same(r=>{for(let i=0;i<4;i++){r.press(["LEFT","START"],HOME,[],{...WEST,...lock});r.press(["B","RIGHT"],{...WEST,...lock},[],HOME);}});
 });
 it("a return across an errored press (what it did is unknown)",()=>{
  same(r=>{
   for(let i=0;i<3;i++){
    r.press(["LEFT"],HOME,[],{...WEST,...SCRIPT});
    r.emit({type:"tool_call",id:`err${String(i)}`,name:"press",args:{buttons:["A"]}});
    r.emit({type:"tool_result",id:`err${String(i)}`,name:"press",is_error:true,duration_ms:1,text:"HTTP 500",frames:[]});
    r.press(["B"],{...WEST,...BIRCH},[],HOME);
   }
  });
 });
 it("a return across an errored state-only act press",()=>{
  same(r=>{
   for(let i=0;i<3;i++){
    r.state(HOME);
    r.emit({type:"tool_call",id:`act${String(i)}`,name:"act",args:{kind:"press",buttons:["LEFT"]}});
    r.emit({type:"button_press",tool_call_id:`act${String(i)}`,buttons:["LEFT"],before_state_seq:r.state(HOME).seq});
    r.state({...WEST,...SCRIPT});
    r.emit({type:"tool_result",id:`act${String(i)}`,name:"act",is_error:true,duration_ms:1,text:"HTTP 500",frames:[]});
    r.press(["B"],{...WEST,...BIRCH},[],HOME);
   }
  });
 });
 it("errors and planning calls in between change nothing",()=>{
  const on=rig(true);
  pushedBack(on);
  on.emit({type:"tool_call",id:"e1",name:"press",args:{buttons:["LEFT"]}});
  on.emit({type:"tool_result",id:"e1",name:"press",is_error:true,duration_ms:1,text:"HTTP 500",frames:[]});
  pushedBack(on);
  on.detector.complete({name:"get_objectives",args:{},isError:false,text:"none"});
  pushedBack(on);
  expect(on.notices.map(n=>n.phase)).toEqual(["warning"]);
 });
});

describe("LoopDetector push-back default",()=>{
 it("is OFF unless the switch is passed",()=>{
  const notices:LoopNotice[]=[];
  const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,undefined,true);
  const home=checkState({...IN_GAME,started:true,screen:"overworld",...FREE,...HOME});
  const west=checkState({...IN_GAME,started:true,screen:"overworld",...WEST,...BIRCH});
  for(let i=0;i<8;i++)d.complete({name:"press",args:{buttons:BATCH},isError:false,text:"ok",beforeState:west,state:home,acted:true});
  expect(notices).toEqual([]);
 });
 it("ON, direct completions (no recorded states) still see the push-back through the before state",()=>{
  const notices:LoopNotice[]=[];
  const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,undefined,true,true);
  const home=checkState({...IN_GAME,started:true,screen:"overworld",...FREE,...HOME});
  const west=checkState({...IN_GAME,started:true,screen:"overworld",...WEST,...BIRCH});
  d.complete({name:"observe",args:{},isError:false,text:"ok",state:home});
  for(let i=0;i<3;i++)d.complete({name:"press",args:{buttons:BATCH},isError:false,text:"ok",beforeState:west,state:home,acted:true});
  expect(notices.map(n=>[n.kind,n.phase,n.message])).toEqual([["cycle","warning",PUSHBACK_MESSAGE]]);
 });
});

function checkState(body:Record<string,unknown>){
 const e=checkEvent({v:1,run:"s",t:"2026-10-16T03:00:00.000-04:00",turn:0,seq:1,type:"state",...body});
 if(e.type!=="state"||!("started"in e))throw new Error("not a game state");
 return e;
}

describe("pushback-loop-detection-v1 registry",()=>{
 it("is a default-off guard with no dependency, recorded third to last (before the press-result and battle switches)",()=>{
  expect(featureInfo("pushback-loop-detection-v1")).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo("pushback-loop-detection-v1").description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).slice(-50,-48)).toEqual(["pushback-loop-detection-v1","pushback-press-result-v1"]);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,"pushback-loop-detection-v1":false},null)).not.toContain("pushback-loop-detection-v1");
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"deterministic-loop-guard-v1":false})).not.toContainEqual(expect.stringContaining("pushback-loop-detection-v1"));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["pushback-loop-detection-v1"]).toBe(false);
 });
});
