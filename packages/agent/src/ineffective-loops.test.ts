import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {attachLoopGuard,Governor} from "./harness.js";
import {SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures} from "./play-preset.js";
import {checkEvent,type RunEvent} from "./events.js";
import {LOOP_POLICY,LoopDetector,REVISIT_MESSAGE,WAITING_MESSAGE,semanticState,type CompletedCall,type LoopNotice} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";

// Recorded events of runs 2026-10-16T12-42-29_qwen36-gpu0_4caa, 2026-10-16T07-53-43_qwen36-gpu0_7ccf and
// 2026-10-15T23-28-28_probe_b41f, as the recorder wrote them, trimmed only where the event schema leaves a field optional
// (navigation grid, interaction targets, local map, raw RAM, topology, map grid, game stats, berry/storage resources,
// map triggers; tool result text cut at its first blank line). Every row passes checkEvent.
// Each fixture is read, gunzipped and validated once per test file; every test shares the parsed rows.
const fixtures=new Map<string,RunEvent[]>();
function recorded(name:string):RunEvent[]{
 const cached=fixtures.get(name);
 if(cached!==undefined)return cached;
 const path=fileURLToPath(new URL(`./fixtures/${name}`,import.meta.url));
 const events=gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
 fixtures.set(name,events);
 return events;
}
type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Seen {readonly turn:number;readonly seq:number;readonly kind:string;readonly phase:string;readonly message:string;readonly evidence:readonly number[]}

const ID="ineffective-loops-v1" as const;
const MESSAGE=():string=>REVISIT_MESSAGE;
const WAITING=():string=>WAITING_MESSAGE;

const events103=recorded("revisit-route103-4caa.jsonl.gz");

// The production path: attachLoopGuard on a recorder fan-out with the run's own switches and a supervisor; only this
// switch is set by the test.
function replay(events:readonly RunEvent[],on:boolean|"base"):{seen:Seen[];contexts:{turn:number;text:string|null}[]}{
 const observers:((e:RunEvent)=>void)[]=[];const seen:Seen[]=[];const contexts:{turn:number;text:string|null}[]=[];
 let current:RunEvent|undefined;
 const start=events.find(e=>e.type==="run_start");
 if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 const features=featuresOf(start.harness_features);
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{checkEvent({v:1,run:"replay",seq:current?.seq??0,t:"2026-10-16T15:00:00.000-04:00",turn:current?.turn??0,type:"loop_guard",...n,evidence:[...n.evidence]});seen.push({turn:current?.turn??-1,seq:current?.seq??-1,kind:n.kind,phase:n.phase,message:n.message,evidence:n.evidence});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const supervisor=(kind:string,calls:number)=>`SUPERVISOR: ${kind} at ${String(calls)} calls`;
 const detector=on==="base"
  ?attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],supervisor,features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"])
  :attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],supervisor,features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],on);
 for(const e of events){
  if(e.type==="loop_guard")continue;
  current=e;
  for(const o of observers)o(e);
  if(e.type==="turn_start")contexts.push({turn:e.turn,text:detector.context()});
 }
 return {seen,contexts};
}
const warnings=(seen:readonly Seen[])=>seen.filter(n=>n.phase==="warning").map(n=>({turn:n.turn,kind:n.kind}));
const recordedWarnings=(events:readonly RunEvent[])=>events.filter(e=>e.type==="loop_guard"&&e.phase==="warning").map(e=>({turn:e.turn,kind:e.type==="loop_guard"?e.kind:""}));

describe("ineffective-loops-v1 on recorded run 4caa: navigate_to targets across the Route 103 water, ending on (23,12)/(23,13)/(21,8) (T199-T248)",()=>{
 const events=events103;
 it("the fixture is the loop: five different targets in a row (T202-T206) all end on (23,12) or (23,13)",()=>{
  const calls=events.filter(e=>e.type==="tool_call"&&e.name==="navigate_to"&&e.turn>=202&&e.turn<=206);
  expect(new Set(calls.map(c=>c.type==="tool_call"?JSON.stringify(c.args):"")).size).toBe(5);
  const start=events.find(e=>e.type==="run_start");
  expect(start?.type==="run_start"&&start.harness_features).toEqual(expect.arrayContaining(["deterministic-loop-guard-v1","loop-guard-supervisor-v1","pushback-loop-detection-v1","battle-observation-loop-v1"]));
 });
 it("OFF: reproduces today's notices (one warning at T219, the same target (45,6) four times)",()=>{
  const {seen}=replay(events,false);
  expect(warnings(seen)).toEqual(recordedWarnings(events).filter(w=>w.kind!=="milestone_drought"));
  expect(warnings(seen)).toEqual([{turn:219,kind:"ineffective"}]);
 });
 it("ON: (45,6) three times, LEFT x5, then (45,6) again, all ending on (21,8) but the LEFT walk: a cycle warning and the supervisor briefing at T212, 7 turns before today's",()=>{
  const {seen,contexts}=replay(events,true);
  const warning=seen.find(n=>n.phase==="warning");
  // Evidence: the first of the last three moves ending on (21,8) (T209) and the move that completed the count.
  expect(warning).toMatchObject({kind:"cycle",turn:212,seq:5121,evidence:[5057,5121],message:MESSAGE()});
  expect(seen.find(n=>n.phase==="supervisor")).toMatchObject({kind:"cycle",seq:warning?.seq});
  expect(contexts.find(c=>c.turn>(warning?.turn??Infinity))?.text).toMatch(/^SUPERVISOR: cycle at \d+ calls$/);
  expect(seen.some(n=>n.phase==="stop")).toBe(false);
 });
 it("ON: moves back onto tiles already seen ((23,12) at T213, (23,13) at T214) keep the episode; (20,10) at T215 recovers it, then today's T219 warning follows",()=>{
  const {seen}=replay(events,true);
  expect(seen.filter(n=>n.phase!=="supervisor").map(n=>[n.turn,n.kind,n.phase])).toEqual([[212,"cycle","warning"],[215,"cycle","recovered"],[219,"ineffective","warning"],[221,"ineffective","recovered"]]);
 });
});

describe("ineffective-loops-v1 OFF is today's detector exactly",()=>{
 it.each(["revisit-route103-4caa.jsonl.gz","revisit-ledge-4caa.jsonl.gz","revisit-maniac-7ccf.jsonl.gz"])("%s: every notice and every model context equal",(name)=>{
  const events=recorded(name);
  expect(replay(events,false)).toEqual(replay(events,"base"));
 });
});

describe("ineffective-loops-v1 on recorded run 4caa: alternating presses at the Route 102 ledge (T550-T571)",()=>{
 const events=recorded("revisit-ledge-4caa.jsonl.gz");
 it("OFF: reproduces today's silence (no loop_guard event; only the same-plan note at T571)",()=>{
  expect(replay(events,false).seen).toEqual([]);
 });
 it("ON: warns at T555 (the third end on (35,9)) and again at T571 (the third end on (34,9) from DOWN,LEFT / RIGHT,DOWN)",()=>{
  const {seen}=replay(events,true);
  expect(warnings(seen)).toEqual([{turn:555,kind:"cycle"},{turn:571,kind:"cycle"}]);
  const second=seen.filter(n=>n.phase==="warning")[1];
  expect(second?.evidence).toEqual([15264,15332]);
  // The loop ends on two tiles, and the delivered text says so.
  expect(second?.message).toBe(MESSAGE());
  expect(MESSAGE()).toContain("the same one or two tiles");
 });
});

describe("ineffective-loops-v1 on recorded run 7ccf: the Oldale Maniac stops the player at (1,10) and the model walks back (T198-T244)",()=>{
 const events=recorded("revisit-maniac-7ccf.jsonl.gz");
 it("OFF: reproduces today's notices (one warning at T244), with push-back detection on as replayed",()=>{
  expect(warnings(replay(events,false).seen)).toEqual([{turn:244,kind:"ineffective"}]);
 });
 it("ON: warns at T215 (LEFT T210, navigate_to (0,11) T212 and again T215, each ending on (1,10)), 29 turns before today's; the episode holds until T245 leaves for Oldale's north",()=>{
  const {seen}=replay(events,true);
  expect(seen.filter(n=>n.phase!=="supervisor").map(n=>[n.turn,n.kind,n.phase])).toEqual([[215,"cycle","warning"],[245,"cycle","recovered"]]);
  expect(seen.find(n=>n.phase==="warning")).toMatchObject({seq:5334,evidence:[5222,5334],message:MESSAGE()});
  expect(seen.filter(n=>n.phase==="supervisor").length).toBeGreaterThanOrEqual(4);
 });
});

// Direct completions built from recorded states.
const route103=events103;
const FREE=(()=>{const s=route103.find(e=>e.type==="state"&&e.seq===4954);if(s?.type!=="state"||!("started"in s))throw new Error("no state at seq 4954");return s;})();
const at=(x:number,y:number,more:Partial<State>={}):State=>({...FREE,position:{x,y},...more});
function detector(on:boolean,interactions=true){
 const notices:LoopNotice[]=[];
 const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",interactions,undefined,true,true,true,false,on);
 let seq=0;
 const nav=(x:number,y:number,end:GameStateSnapshot,extra:Partial<CompletedCall>={})=>{d.complete({name:"navigate_to",args:{map_id:[0,18],x,y},isError:false,text:"ok",acted:true,beforeState:end,startState:FREE,state:end,seq:++seq,...extra});};
 const press=(buttons:string[],end:GameStateSnapshot,extra:Partial<CompletedCall>={})=>{d.complete({name:"press",args:{buttons},isError:false,text:"ok",acted:true,beforeState:FREE,startState:FREE,state:end,seq:++seq,...extra});};
 const observe=(state:GameStateSnapshot)=>{d.complete({name:"observe",args:{},isError:false,text:"ok",state,seq:++seq});};
 return {d,notices,nav,press,observe};
}
const kinds=(notices:readonly LoopNotice[])=>notices.map(n=>[n.kind,n.phase]);

describe("ineffective-loops-v1 few-target loops versus progress",()=>{
 it("ON: two targets ending on one tile three times warn; OFF never",()=>{
  for(const on of [true,false]){
   const t=detector(on);
   t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));t.nav(79,9,at(23,12));
   expect(kinds(t.notices)).toEqual(on?[["cycle","warning"]]:[]);
   if(on)expect(t.notices[0]?.evidence).toEqual([1,5]);
  }
 });
 it("ON: one target repeated never counts here (the existing check owns it)",()=>{
  const t=detector(true);
  for(let i=0;i<3;i++){t.nav(79,9,at(23,12));t.nav(79,9,at(23,13));}
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: three moves on one tile that never return to a target are not a loop (arrive, then bump twice: 960a T5-T7; arrive, refused, turn to a sign: 4caa T479-T481)",()=>{
  const t=detector(true);
  t.press(["RIGHT"],at(6,2));t.press(["UP"],at(6,2));t.press(["UP"],at(6,2));
  t.nav(30,30,at(7,9));t.nav(7,8,at(7,9));t.press(["UP"],at(7,9,{facing:"UP"}));
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: inputs while a script or animation holds the controls, or from an unknown start, are not moves",()=>{
  const t=detector(true);
  const locked=at(23,12,{field_controls_locked:true});
  for(const b of ["UP","LEFT","UP","LEFT","UP"])t.press([b],at(23,12),{startState:locked,beforeState:locked});
  for(const b of ["UP","LEFT","UP","LEFT","UP"])t.d.complete({name:"press",args:{buttons:[b]},isError:false,text:"ok",acted:true,state:at(23,12)});
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: three different targets ending on one tile never repeat, so they are not a loop; A, B, A is",()=>{
  const abc=detector(true);
  abc.nav(1,1,at(23,12));abc.nav(2,2,at(23,12));abc.nav(3,3,at(23,12));
  expect(abc.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
  const aba=detector(true);
  aba.nav(1,1,at(23,12));aba.nav(2,2,at(23,12));aba.nav(1,1,at(23,12));
  expect(kinds(aba.notices.filter(n=>n.message===MESSAGE()))).toEqual([["cycle","warning"]]);
 });
 it("ON: exploring out of a hub tile (three or more end tiles) never counts",()=>{
  const t=detector(true);
  t.nav(10,10,at(20,10));t.nav(30,10,at(25,10));t.nav(10,10,at(20,10));t.nav(20,5,at(20,6));t.nav(10,10,at(20,10));t.nav(20,15,at(20,14));t.nav(10,10,at(20,10));
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: a walk that keeps reaching new tiles never counts",()=>{
  const t=detector(true);
  for(let x=10;x<30;x++)t.nav(x+5,9,at(x,9));
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: A or B presses, menu cursor presses and conversations are not moves",()=>{
  const t=detector(true);
  const menu={...FREE,active_ui:{phase:"start_menu",selected:"BAG",ready:true,controls:"UP/DOWN selects",diagnostic:null,value:null,details:null}} as State;
  t.nav(79,9,at(23,12));
  for(let i=0;i<4;i++){t.press(["A"],at(23,12));t.press(["DOWN"],at(23,12),{startState:menu});t.press(["UP"],at(23,12),{dialogue:["MAY: Hi!"]});}
  t.press(["DOWN"],menu);
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: a conversation not heard since the moves began is new information and clears them (a Pokémon Center heal, 4caa T451-T456)",()=>{
  const t=detector(true);
  t.nav(7,3,at(7,8));t.nav(7,4,at(7,4));
  t.press(["A"],at(7,4),{dialogue:["Hello, and welcome to the POKéMON CENTER."]});
  t.nav(7,8,at(7,8));t.nav(7,4,at(7,4));t.nav(7,8,at(7,8));
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: the same conversation again only makes that call not a move (the Maniac's line, 7ccf T199-T202)",()=>{
  const t=detector(true);
  const line=["Ahead looms a tall tree."];
  t.nav(0,10,at(1,10),{dialogue:line});
  t.nav(0,10,at(1,10));t.press(["A"],at(1,10),{dialogue:line});t.nav(2,10,at(2,10));t.nav(0,10,at(1,10));t.press(["DOWN"],at(1,10));
  expect(kinds(t.notices.filter(n=>n.message===MESSAGE()))).toEqual([["cycle","warning"]]);
 });
 it("ON: a call that ends on another map starts the moves again even when it is not a move (stairs taken while the controls were locked, 823c T15-T18)",()=>{
  const t=detector(true);
  const locked=at(8,2,{field_controls_locked:true});
  t.nav(8,2,at(8,2));t.press(["UP"],at(8,2));
  t.press(["UP"],{...at(7,2),map_id:[1,1]},{startState:locked,beforeState:locked});
  t.nav(8,2,at(8,2));
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: a map change or a battle breaks the count, and an errored call is not a move",()=>{
  const t=detector(true);
  t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));
  t.nav(5,5,{...at(23,12),map_id:[0,10]});
  t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));
  t.observe({...at(23,12),in_battle:true,screen:"battle"});
  t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));
  t.d.complete({name:"navigate_to",args:{map_id:[0,18],x:1,y:1},isError:true,text:"Game tool did not return",state:at(23,12)});
  t.nav(1,2,at(23,12));
  expect(t.notices.filter(n=>n.message===MESSAGE())).toEqual([]);
 });
 it("ON: after the warning a turn on the same tiles keeps the episode; a tile not seen in the last 16 results recovers it",()=>{
  const t=detector(true);
  t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));t.nav(79,9,at(23,12));t.nav(40,12,at(23,13));t.nav(79,9,at(23,12));
  t.press(["LEFT"],at(23,12,{facing:"LEFT"}));
  t.press(["UP"],at(23,13,{facing:"UP"}));
  expect(kinds(t.notices)).toEqual([["cycle","warning"]]);
  t.nav(10,10,at(10,10));
  expect(kinds(t.notices)).toEqual([["cycle","warning"],["cycle","recovered"]]);
 });
});

// (a) The one recorded observe of an open START menu (b41f T16, state seq 144).
const MENU=(()=>{const s=recorded("waiting-start-menu-b41f.jsonl.gz").find(e=>e.type==="state"&&e.seq===144);if(s?.type!=="state"||!("started"in s))throw new Error("no state at seq 144");return s;})();
describe("ineffective-loops-v1 unchanged observes while the game waits for input",()=>{
 it("the fixture is an open START menu waiting for input, which today's field fingerprint cannot see",()=>{
  expect(MENU.active_ui).toMatchObject({phase:"start_menu",ready:true,diagnostic:null});
  expect(semanticState(MENU,true)).toBeNull();
 });
 it("ON: the fourth identical observe of the open menu raises an observation warning; OFF never",()=>{
  for(const on of [true,false]){
   const t=detector(on);
   for(let i=0;i<6;i++)t.observe(MENU);
   expect(kinds(t.notices)).toEqual(on?[["observation","warning"]]:[]);
   if(on)expect(t.notices[0]?.message).toBe(WAITING());
   // True with the RAM readout off too (screenshot only): the text points at what the game shows, not a readout.
   expect(WAITING()).not.toMatch(/readout/i);
  }
 });
 it("ON: a ready naming screen, which today's fingerprint already counts, is named as the waiting interface; OFF keeps today's generic warning",()=>{
  const naming={...MENU,screen:"naming",active_ui:{phase:"naming_editor",selected:"A",ready:true,controls:"",diagnostic:null,value:"",details:{page:"uppercase",column:0,row:0}},naming:{text:"",page:"uppercase",column:0,row:0,key:"A",ready:true}} as State;
  expect(semanticState(naming,true)).not.toBeNull();
  const on=detector(true),off=detector(false);
  for(let i=0;i<4;i++){on.observe(naming);off.observe(naming);}
  expect(on.notices.map(n=>[n.kind,n.phase,n.message])).toEqual([["observation","warning",WAITING()]]);
  expect(off.notices.map(n=>[n.kind,n.phase])).toEqual([["observation","warning"]]);
  expect(off.notices[0]?.message).not.toBe(WAITING());
 });
 it("ON: a ready message counts with interaction detection off (today it has no fingerprint then)",()=>{
  const message={...FREE,field_controls_locked:true,world_context:{...FREE.world_context,dialogue:"MAY: Hi!",message:{phase:"dismiss_wait",cursor:9,ready:true}}} as State;
  const t=detector(true,false);
  for(let i=0;i<4;i++)t.observe(message);
  expect(kinds(t.notices)).toEqual([["observation","warning"]]);
 });
 it("ON: the game acting (truck ride, script with no message), printing text and a moving menu cursor never count",()=>{
  const t=detector(true);
  const acting={...FREE,field_controls_locked:true} as State;
  const printing={...FREE,field_controls_locked:true,world_context:{...FREE.world_context,dialogue:"MAY: Hi!",message:{phase:"printing",cursor:3,ready:false}}} as State;
  for(let i=0;i<6;i++)t.observe(acting);
  for(let i=0;i<6;i++)t.observe(printing);
  const options=["BAG","PLAYER","SAVE","OPTIONS","EXIT"];
  for(let i=0;i<6;i++)t.observe({...MENU,active_ui:{...MENU.active_ui,selected:options[i%5]??"BAG"}} as State);
  expect(t.notices).toEqual([]);
 });
 it("ON: a menu not seen recently recovers the episode",()=>{
  const t=detector(true);
  for(let i=0;i<4;i++)t.observe(MENU);
  t.observe({...MENU,active_ui:{...MENU.active_ui,selected:"EXIT"}} as State);
  expect(kinds(t.notices)).toEqual([["observation","warning"],["observation","recovered"]]);
 });
});

describe("ineffective-loops-v1 fixture loading",()=>{
 it("loads each recorded fixture once and shares it",()=>{
  expect(recorded("revisit-ledge-4caa.jsonl.gz")).toBe(recorded("revisit-ledge-4caa.jsonl.gz"));
  expect(fixtures.size).toBe(4);
 });
});

describe("ineffective-loops-v1 pending experiment",()=>{
 it("names every switch explicitly in registry order and flips only this switch",()=>{
  const raw=JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/ineffective-loops.json",import.meta.url)),"utf8")) as {incumbent:{features:Record<string,boolean>}};
  expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="short-cycle-fixed-point-v1"&&id!=="exit-labels-v3"&&id!=="party-item-confirmation-v1"&&id!=="duplicate-turn-collapse-v1"&&id!=="auto-talk-v1"&&id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="unfinished-activity-v1"&&id!=="heal-before-trainers-v2"&&id!=="gym-heal-warning-v1"&&id!=="respawn-readout-v1"&&id!=="trainer-sight-check-v1"&&id!=="caught-nickname-prompt-v1"&&id!=="fail-open-input-v1"&&id!=="context-token-budget-v1"&&id!=="briefing-repeat-count-v1"&&id!=="navigate-already-here-v1"&&id!=="original-speed-pacing-v1"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1").filter(id=>id!=="faced-interaction-history-v1").slice(0,Object.keys(raw.incumbent.features).length));expect(Object.keys(raw.incumbent.features)).toContain("ineffective-loops-v1");
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features[ID]).toBe(false);
  expect(SWITCHABLE_FEATURES.filter(id=>id!=="short-cycle-fixed-point-v1"&&id!=="exit-labels-v3"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&incumbent.features[id]!==candidate.features[id])).toEqual([ID]);
 });
});

describe("ineffective-loops-v1 explainer wiring",()=>{
 it("names the argument position attachLoopGuard and LoopDetector actually give the switch",()=>{
  const position=(source:string):number=>{
   const params=/\(([^)]*)\)/.exec(source.replace(/\s+/g," "))?.[1]??"";
   return params.split(",").map(p=>p.trim()).findIndex(p=>p.includes("ineffectiveLoops"))+1;
  };
  expect(position(attachLoopGuard.toString())).toBe(11);
  expect(position(LoopDetector.toString().slice(LoopDetector.toString().indexOf("constructor")))).toBe(10);
  const html=readFileSync(fileURLToPath(new URL("../../../docs/explainers/ineffective-loops-v1.html",import.meta.url)),"utf8");
  expect(html).toContain(">11th argument (live, probe)<");
 });
});

describe("ineffective-loops-v1 registry",()=>{
 it("is a default-off guard with no dependency, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).at(-43)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"deterministic-loop-guard-v1":false})).not.toContainEqual(expect.stringContaining(ID));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
