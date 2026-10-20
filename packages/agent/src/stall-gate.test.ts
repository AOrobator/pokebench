import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type EventBody,type RunEvent} from "./events.js";
import {SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,type FeatureSet} from "./features.js";
import {attachLoopGuard,Governor} from "./harness.js";
import type {LoopNotice} from "./loop-detection.js";
import {storyCharacters} from "./people-ledger.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {loopSupervisor,stallBriefing} from "./play-wiring.js";
import {StoryCharacterGate} from "./stall-gate.js";

const ID="story-character-stall-gate-v1";
interface Fixture {readonly source:string;readonly events:readonly RunEvent[]}
// Real events of run 2026-10-20T03-02-13_qwen36-gpu1_f28d (the fixture's source line says which).
const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/stall-gate-f28d.json.gz",import.meta.url))).toString("utf8")) as Fixture;
const RUN:FeatureSet=featuresOf(FIXTURE.events.flatMap(e=>e.type==="run_start"?e.harness_features:[]));
type Guard=Extract<RunEvent,{type:"loop_guard"}>;
type Held=Extract<RunEvent,{type:"stall_gate"}>;

// The recorder's fan-out, the real loop guard and supervisor, and the production stall factory, over the recorded stream.
function replay(features:FeatureSet){
 const subscribers:((e:RunEvent)=>void)[]=[];const guards:Guard[]=[];const held:Held[]=[];
 let current:RunEvent=FIXTURE.events[0] as RunEvent;
 const stamp=(body:Record<string,unknown>)=>({v:1,run:current.run,seq:current.seq,t:current.t,turn:current.turn,...body});
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{guards.push(checkEvent(stamp({type:"loop_guard",...n,evidence:[...n.evidence]})) as Guard);},recordStallGate:(b:Omit<Held,"v"|"run"|"seq"|"t"|"turn"|"type">)=>{held.push(checkEvent(stamp({type:"stall_gate",...b})) as Held);}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 const detector=attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder),features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],features["ineffective-loops-v1"],features["battle-menu-loop-v1"],features["clock-view-loop-v1"],features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"]);
 const t0=Date.parse(current.t);
 stallBriefing(features,recorder,detector,{pausedMs:()=>0},()=>Date.parse(current.t)-t0);
 for(const e of FIXTURE.events){
  if(e.type==="loop_guard"||e.type==="text_only_supervisor"||e.type==="stall_gate")continue;
  current=e;
  if(e.type==="turn_start")detector.context();
  for(const s of subscribers)s(e);
 }
 const briefings=guards.filter(g=>g.phase==="supervisor");
 return {briefings,held,at:(turn:number)=>briefings.filter(g=>g.turn===turn)};
}

describe("registry and presets",()=>{
 it("registers a default-off guard switch after the breaker that needs the stall briefing, with an exact OFF",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"stall-briefing-v1",switchable:true,title:"STORY-CHARACTER STALL GATE"});
  expect(featureInfo(ID).description).toContain(" Off: stall briefings go out as soon as they are due, supervisor notes list the ways off the map, and a navigate_to tries its target tile whatever it reached.");
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("fixed-point-breaker-v1")+1);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,[ID]:true,"stall-briefing-v1":false})).toContain(`${ID} needs stall-briefing-v1`);
 });
 it("defaults off for presets that omit it and for legacy flag presets",()=>{
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});

describe("the story characters line",()=>{
 it("reads the readout's own line and the ledger's copy, names with periods and tiles included",()=>{
  expect(storyCharacters("Location: ROUTE103\nStory characters here (from this map's own object list): MAY at 10,3 (out of view; where the map places this character, it may have moved). Not on this map: PROF. BIRCH. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.")).toEqual([{name:"MAY",tile:{x:10,y:3},text:"MAY at 10,3 (out of view; where the map places this character, it may have moved)"}]);
  expect(storyCharacters("Story characters here: PROF. BIRCH at 7,7, MOM (on this map, out of view). Not on this map: MAY.")).toEqual([{name:"PROF. BIRCH",tile:{x:7,y:7},text:"PROF. BIRCH at 7,7"},{name:"MOM",tile:null,text:"MOM (on this map, out of view)"}]);
  expect(storyCharacters("Story characters here: none. Not on this map: MAY.")).toEqual([]);
  expect(storyCharacters("Location: ROUTE103")).toBeNull();
 });
});

describe("story-character-stall-gate-v1 on run f28d, Route 103 with MAY at (10,3)",()=>{
 it("OFF reproduces the recording: the turn 450 supervisor lists the way south and the turn 452 drought briefing goes out",()=>{
  const off=replay({...RUN,[ID]:false});
  expect(off.at(450)[0]?.message).toContain("- Ways off this map across its edge (the game's map connections): SOUTH -> OLDALE TOWN (map 0/10)");
  expect(off.at(452).map(g=>g.kind)).toEqual(["milestone_drought"]);
  expect(off.held).toEqual([]);
 });
 it("ON holds the drought briefing once, names MAY, and keeps her among the untried targets with no way off listed",()=>{
  const on=replay({...RUN,[ID]:true});
  expect(on.briefings.filter(g=>g.turn>=409&&(g.kind==="milestone_drought"||g.kind==="map_cycle"))).toEqual([]);
  expect(on.held.map(h=>[h.turn,h.kind,h.level,h.reason,h.character,h.map_id])).toEqual([[452,"milestone_drought",1,"untalked","MAY",[0,18]]]);
  const note=on.at(450)[0]?.message??"";
  expect(note).not.toContain("Ways off this map");
  expect(note).toContain("- Story characters on this map you have not talked to since your last story milestone: MAY at 10,3 (out of view; where the map places this character, it may have moved)\n");
 });
});

describe("the gate on its own",()=>{
 let seq=0;
 const ev=(body:EventBody):RunEvent=>checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T03:40:00.000-04:00",...body});
 const LINE="Story characters here: MAY at 10,3. Not on this map: PROF. BIRCH.";
 const at=(x:number,y:number,extra:Partial<typeof IN_GAME>={})=>ev({type:"state",turn:1,...IN_GAME,map_id:[0,18],position:{x,y},facing:"up",interaction_targets:[{kind:"object",name:"RIVAL_MAY_NORMAL",x:10,y:3,elevation:3,activation:"A",availability:"live",facing:"down",local_id:2,destination:null}],...extra});
 const result=(state:RunEvent,text=LINE,id="c1",name="observe")=>ev({type:"tool_result",turn:1,id,name,is_error:false,duration_ms:1,text,frames:[],state_seq:state.seq});
 function gate(){const held:unknown[]=[];const g=new StoryCharacterGate({recordStallGate:b=>{held.push(b);}});return {g,held};}

 it("holds while MAY is untalked, releases after talking to her, and holds again while walking toward her",()=>{
  const {g}=gate();
  const s1=at(14,10);g.observe(s1);g.observe(result(s1));
  expect(g.holds()).toEqual({reason:"untalked",character:"MAY",map_id:[0,18]});
  const facing=at(10,4);g.observe(facing);
  g.observe(ev({type:"dialogue_auto_advance",turn:1,tool_call_id:"c2",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:2,pages:[{state_seq:facing.seq,map:"ROUTE103",map_id:[0,18],position:{x:10,y:4},speaker:null,speaker_source:null,text:"Let's battle!"}],stop:"field_free",detail:"",duration_ms:1}));
  g.observe(result(facing,LINE,"c2","press"));
  expect(g.holds()).toEqual({reason:"closer",character:"MAY",map_id:[0,18]});
  const away=at(10,8);g.observe(away);g.observe(result(away));
  expect(g.holds()).toBeNull();
  const back=at(10,7);g.observe(back);g.observe(result(back));
  expect(g.holds()).toEqual({reason:"closer",character:"MAY",map_id:[0,18]});
 });
 it("counts a page spoken under her name, forgets talks at a story milestone, and keeps the line through a battle",()=>{
  const {g}=gate();
  const s=at(9,6);g.observe(s);g.observe(result(s));
  g.observe(ev({type:"dialogue_auto_advance",turn:1,tool_call_id:"c3",tool:"navigate_to",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:s.seq,map:"ROUTE103",map_id:[0,18],position:{x:9,y:6},speaker:"MAY",speaker_source:"name_prefix",text:"MAY: Hi!"}],stop:"field_free",detail:"",duration_ms:1}));
  g.observe(result(s,"Navigation: arrived.","c3","navigate_to"));
  expect(g.holds()).toBeNull();
  g.observe(ev({type:"milestone",turn:1,name:"RIVAL_BATTLE_WON",server_timestamp:1,kind:"story",origin:"observed"}));
  const battle=at(9,6,{screen:"battle",in_battle:true});g.observe(battle);g.observe(result(battle,"Battle: TORCHIC vs ZIGZAGOON","c4","battle_action"));
  expect(g.holds()?.reason).toBe("untalked");
 });
 it("never holds on another map, without the line, or when the line names no one, and records each held briefing once",()=>{
  const {g,held}=gate();
  expect(g.holds()).toBeNull();
  const s=at(9,6);g.observe(s);g.observe(result(s,"Location: ROUTE103"));
  expect(g.holds()).toBeNull();
  g.observe(result(s,"Story characters here: none. Not on this map: MAY."));
  expect(g.holds()).toBeNull();
  g.observe(result(s));
  const other=at(5,5,{map_id:[0,10]});g.observe(other);
  expect(g.holds()).toBeNull();
  g.observe(at(9,6));
  const hold=g.holds();
  expect(hold).not.toBeNull();
  if(hold===null)return;
  g.held("milestone_drought",1,"p",hold);g.held("milestone_drought",1,"p",hold);g.held("milestone_drought",2,"p",hold);
  expect(held).toEqual([{kind:"milestone_drought",level:1,reason:"untalked",character:"MAY",map_id:[0,18]},{kind:"milestone_drought",level:2,reason:"untalked",character:"MAY",map_id:[0,18]}]);
 });
});
