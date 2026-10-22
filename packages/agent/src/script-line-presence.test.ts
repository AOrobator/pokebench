import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {checkEvent,type Button,type RunEvent} from "./events.js";
import {FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {pageLines,DialogueRecord,type AutoAdvanceRecorder} from "./dialogue-auto-advance.js";
import {DialogueLog,speakerLabel} from "./dialogue-log.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {InstructionLedger,instructionLedger} from "./instruction-ledger.js";
import {dialogueUnits} from "./harness.js";
import {observeTool,pressTool} from "./game-tools.js";
import {playGameTools} from "./play-wiring.js";
import {SCREEN_REACH,STORY_CHARACTERS,canonicalStoryCharacterName,onScreen,presenceTag,storyCharacter} from "./script-line-presence.js";
import type {GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type ToolResult=Extract<RunEvent,{type:"tool_result"}>;
type LoopGuard=Extract<RunEvent,{type:"loop_guard"}>;
interface Fixture {readonly source:string;readonly features:readonly string[];readonly events:readonly RunEvent[]}

// Live run 2026-10-16T02-23-17_qwen36-gpu1_sh02, seq 5560–7272 (see the fixture's source field).
const FIXTURE=JSON.parse(readFileSync(new URL("../test-support/script-line-presence-sh02.json",import.meta.url),"utf8")) as Fixture;
const EVENTS=FIXTURE.events;
const RUN:FeatureSet=featuresOf(FIXTURE.features);
const OFF:FeatureSet={...RUN,"script-line-presence-v1":false};
const ON:FeatureSet={...RUN,"script-line-presence-v1":true};
const STATES=new Map(EVENTS.flatMap(e=>e.type==="state"&&"started" in e?[[e.seq,e] as const]:[]));
const stateAt=(seq:number):State=>{const s=STATES.get(seq);if(s===undefined)throw new Error(`no state ${String(seq)}`);return s;};
const T259=EVENTS.find((e):e is Advance=>e.type==="dialogue_auto_advance"&&e.seq===5851);
const T259_RESULT=EVENTS.find((e):e is ToolResult=>e.type==="tool_result"&&e.seq===5853);
const STALL=EVENTS.find((e):e is LoopGuard=>e.type==="loop_guard"&&e.seq===7272);

// What Pages.add records with the switch on: the page's own recorded state, read the same way.
function withPresence(events:readonly RunEvent[],named:boolean):RunEvent[] {
 return events.map(e=>e.type!=="dialogue_auto_advance"?e:{...e,pages:e.pages.map(p=>p.speaker!==null||p.state_seq===null?p:{...p,on_screen:onScreen(stateAt(p.state_seq),named)})});
}
const PAGES_ON=withPresence(T259===undefined?[]:[T259],true)[0] as Advance|undefined;

const BAG="BIRCHS_BAG at 7,14";
const AT_BIRCH="PROF. BIRCH (sprite PROF_BIRCH) at 4,13; ZIGZAGOON_1 at 5,13; BIRCHS_BAG at 7,14";
const TAG1=`(no speaker shown by the game; on screen: ${BAG})`;
const TAG23=`(no speaker shown by the game; on screen: ${AT_BIRCH})`;

describe("script-line-presence-v1: the T259 Birch rescue pages (sh02 seq 5851)",()=>{
 it("the recorded pages have no speaker: they come from map scripts, not a faced object",()=>{
  expect(T259?.pages.map(p=>[p.state_seq,p.speaker,p.speaker_source])).toEqual([[5833,null,null],[5839,null,null],[5845,null,null]]);
 });

 it("OFF: the page lines are byte-for-byte the block the model received at T259",()=>{
  const recorded=T259_RESULT?.text??"";
  const block=recorded.slice(recorded.indexOf("1. turn 259"),recorded.indexOf("\n\nScreen:"));
  expect(pageLines(T259?.pages??[],259).join("\n")).toBe(block);
  expect(block).toBe(`1. turn 259 · ROUTE101 (map 0/16) · at 11,19: "H-help me!"\n2. turn 259 · ROUTE101 (map 0/16) · at 11,15: "Hello! You over there!\nPlease! Help!"\n3. turn 259 · ROUTE101 (map 0/16) · at 11,15: "In my BAG!\nThere's a POKé BALL!"`);
 });

 it("ON: each page names who is on screen at its own recorded state, never a speaker",()=>{
  expect(pageLines(PAGES_ON?.pages??[],259)).toEqual([
   `1. turn 259 · ROUTE101 (map 0/16) · at 11,19 · ${TAG1}: "H-help me!"`,
   `2. turn 259 · ROUTE101 (map 0/16) · at 11,15 · ${TAG23}: "Hello! You over there!\nPlease! Help!"`,
   `3. turn 259 · ROUTE101 (map 0/16) · at 11,15 · ${TAG23}: "In my BAG!\nThere's a POKé BALL!"`,
  ]);
 });

 it("ON: the recorded page carries what it named, and the event still validates",()=>{
  expect(PAGES_ON?.pages[0]?.on_screen).toEqual([{local_id:3,graphics_id:97,sprite_kind:"BIRCHS_BAG",x:7,y:14,character:null}]);
  expect(PAGES_ON?.pages[2]?.on_screen).toEqual([
   {local_id:2,graphics_id:64,sprite_kind:"PROF_BIRCH",x:4,y:13,character:"PROF. BIRCH"},
   {local_id:4,graphics_id:98,sprite_kind:"ZIGZAGOON_1",x:5,y:13,character:null},
   {local_id:3,graphics_id:97,sprite_kind:"BIRCHS_BAG",x:7,y:14,character:null},
  ]);
  expect(()=>checkEvent(PAGES_ON)).not.toThrow();
 });

 it("dialogue-context-kept keeps the tagged block byte for byte when the result collapses",()=>{
  const text=`pressed UP\nDialogue shown during this call (3 pages, in order, whole):\n${pageLines(PAGES_ON?.pages??[],259).join("\n")}\n\nScreen: overworld`;
  expect(dialogueUnits(text)).toEqual([text.slice(text.indexOf("Dialogue shown"),text.indexOf("\n\nScreen"))]);
 });

 it("get_dialogue and recall_dialogue re-show the tag with the page",()=>{
  const record=new DialogueRecord();
  for(const e of withPresence(EVENTS,true))record.observe(e);
  expect(record.recall({contains:"BAG",last:1})).toContain(`#5851 turn 259 · ROUTE101 (map 0/16) · at 11,15 · ${TAG23}: "In my BAG!\nThere's a POKé BALL!"`);
  const log=new DialogueLog({...ON,"dialogue-log-v1":true});
  for(const e of withPresence(EVENTS,true))log.observe(e);
  expect(log.recall({contains:"BAG",last:1})).toContain(`#5845 turn 259 · ROUTE101 (map 0/16) · at 11,15 · ${TAG23}: "In my BAG!\nThere's a POKé BALL!"`);
  const plain=new DialogueLog({...OFF,"dialogue-log-v1":true});
  for(const e of EVENTS)plain.observe(e);
  expect(plain.recall({contains:"BAG",last:1})).toContain(`#5845 turn 259 · ROUTE101 (map 0/16) · at 11,15: "In my BAG!\nThere's a POKé BALL!"`);
 });
});

describe("script-line-presence-v1: the T307 stall briefing (sh02 loop_guard seq 7272)",()=>{
 const brief=(features:FeatureSet,events:readonly RunEvent[])=>{
  const b=new SupervisorBriefing(features);for(const e of events)b.observe(e);
  return b.stallText({kind:"milestone_drought",minutes:5},304);
 };
 const recent=(text:string)=>text.split("\n").find(l=>l.startsWith("- Recent dialogue"));
 it("OFF: the recent-dialogue line is the one the model received",()=>{
  const line=recent(STALL?.message??"");
  expect(line).toBe(`- Recent dialogue you were shown, newest first: turn 261, ROUTE101 (map 0/16): "Wh-Where are you going?! Don't leave me like this!" | turn 259, ROUTE101 (map 0/16): "In my BAG! There's a POKé BALL!" | turn 259, ROUTE101 (map 0/16): "Hello! You over there! Please! Help!"`);
  expect(recent(brief(OFF,EVENTS))).toBe(line);
 });
 it("ON: each unattributed page is quoted with who was on screen",()=>{
  const at6="PROF. BIRCH (sprite PROF_BIRCH) at 4,13; ZIGZAGOON_1 at 5,13; BIRCHS_BAG at 7,14";
  expect(recent(brief(ON,withPresence(EVENTS,true)))).toBe(`- Recent dialogue you were shown, newest first: turn 261, ROUTE101 (map 0/16), (no speaker shown by the game; on screen: ${at6}): "Wh-Where are you going?! Don't leave me like this!" | turn 259, ROUTE101 (map 0/16), ${TAG23}: "In my BAG! There's a POKé BALL!" | turn 259, ROUTE101 (map 0/16), ${TAG23}: "Hello! You over there! Please! Help!"`);
 });
 it("the story-step pages keep their speakers; an unattributed one there takes the tag through speakerLabel",()=>{
  const step=(text:string)=>text.split("\n").find(l=>l.startsWith("- Dialogue shown with your latest story step"));
  expect(step(brief(ON,withPresence(EVENTS,true)))).toBe(step(STALL?.message??""));
  expect(speakerLabel({speaker:null,speaker_source:null,on_screen:[]})).toBe("(no speaker shown by the game; on screen: nothing but you)");
  expect(speakerLabel({speaker:null,speaker_source:null})).toBeNull();
  expect(speakerLabel({speaker:"TWIN",speaker_source:"faced_sprite",on_screen:[]})).toBe("TWIN (sprite kind, not a name)");
 });
});

describe("script-line-presence-v1: on screen and names",()=>{
 const obj=(x:number,y:number,graphics=35,sprite:string|null="YOUNGSTER",local=1,map:[number,number]=[0,16])=>({local_id:local,map_id:map,graphics_id:graphics,sprite_kind:sprite,x,y});
 const state=(objects:ReturnType<typeof obj>[],location="ROUTE101"):Pick<GameStateSnapshot,"position"|"map_id"|"location"|"world_context">=>({position:{x:10,y:10},map_id:[0,16],location,world_context:{objects,triggers:[],dialogue:null,message:null}});

 it("the screen reaches 7 columns and 5 rows from the player (15 columns, rows -5..+5 partly visible)",()=>{
  expect(SCREEN_REACH).toEqual({columns:7,rows:5});
  const xs=onScreen(state([obj(3,10),obj(17,10),obj(2,10),obj(18,10),obj(10,5),obj(10,15),obj(10,4),obj(10,16)]),false)?.map(o=>`${String(o.x)},${String(o.y)}`);
  expect(xs).toEqual(["10,5","3,10","17,10","10,15"]);
 });
 it("lists in reading order and leaves out objects of another map",()=>{
  expect(onScreen(state([obj(12,11,35,"A",1),obj(8,9,35,"B",2),obj(9,11,35,"C",3),obj(9,9,35,"D",4,[0,9])]),false)?.map(o=>o.sprite_kind)).toEqual(["B","C","A"]);
 });
 it("names a story character only with character presence on and only on that character's maps",()=>{
  expect(onScreen(state([obj(10,9,64,"PROF_BIRCH")]),true)?.[0]?.character).toBe("PROF. BIRCH");
  expect(onScreen(state([obj(10,9,64,"PROF_BIRCH")]),false)?.[0]?.character).toBeNull();
  expect(onScreen(state([obj(10,9,64,"PROF_BIRCH")],"PETALBURG CITY"),true)?.[0]?.character).toBeNull();
  expect(onScreen(state([obj(10,9,106,"RIVAL_MAY_NORMAL")],"ROUTE103"),true)?.[0]?.character).toBe("MAY");
  expect(onScreen(state([obj(10,9,106,"RIVAL_MAY_NORMAL")],"SLATEPORT CITY BATTLE TENT BATTLE ROOM"),true)?.[0]?.character).toBeNull();
  expect(storyCharacter(17,"LITTLEROOT TOWN PROFESSOR BIRCHS LAB")).toBeNull();
  expect(storyCharacter(64,null)).toBeNull();
 });
 it("canonicalizes only exact source-proven story-character labels",()=>{
  expect(canonicalStoryCharacterName("NORMAN")).toBe("NORMAN");
  expect(canonicalStoryCharacterName("DAD")).toBe("NORMAN");
  expect(canonicalStoryCharacterName("dad")).toBeNull();
  expect(canonicalStoryCharacterName("WALLYS DAD")).toBeNull();
 });
 it("cannot tell who is on screen without a position, map or object list",()=>{
  expect(onScreen({...state([]),position:null},true)).toBeNull();
  expect(onScreen({...state([]),map_id:null},true)).toBeNull();
  expect(onScreen({...state([]),world_context:null},true)).toBeNull();
  expect(onScreen({position:{x:1,y:1},map_id:[0,1],location:"X"},true)).toBeNull();
  expect(presenceTag(null)).toBe("(no speaker shown by the game; who is on screen was not read)");
  expect(presenceTag([])).toBe("(no speaker shown by the game; on screen: nothing but you)");
  expect(presenceTag([{local_id:9,graphics_id:250,sprite_kind:null,x:1,y:2,character:null}])).toBe("(no speaker shown by the game; on screen: graphics 250 at 1,2)");
 });
 it("mirrors character-presence-v1's own table (shared golden fixture, also checked by the Python suite)",()=>{
  const golden=JSON.parse(readFileSync(new URL("../test-support/story-characters.json",import.meta.url),"utf8")) as unknown;
  expect(STORY_CHARACTERS.map(c=>({name:c.name,graphics:[...c.graphics].sort((a,b)=>a-b),maps:[...c.maps].sort()}))).toEqual(golden);
 });
});

const png=(()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write("IHDR",12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return b.toString("base64");})();
// A Route 101 entrance: stepping UP onto the trigger opens a map-script line with no faced object.
class ScriptGame {
 constructor(private readonly text="H-help me!"){}
 posts:Button[]=[];
 private mode:"free"|"printing"|"waiting"="free";
 private readonly objects=[
  {local_id:2,map_id:[0,16] as [number,number],graphics_id:64,sprite_kind:"PROF_BIRCH",x:9,y:13},
  {local_id:3,map_id:[0,16] as [number,number],graphics_id:97,sprite_kind:"BIRCHS_BAG",x:7,y:14},
  {local_id:4,map_id:[0,16] as [number,number],graphics_id:98,sprite_kind:"ZIGZAGOON_1",x:10,y:13},
 ];
 press(b:Button){
  this.posts.push(b);
  if(this.mode==="free"&&b==="UP")this.mode="printing";
  else if(this.mode==="waiting"&&(b==="A"||b==="B"))this.mode="free";
 }
 tick(){if(this.mode==="printing")this.mode="waiting";}
 state():GameStateSnapshot{
  const base:GameStateSnapshot={...IN_GAME,location:"ROUTE101",map_id:[0,16],position:{x:11,y:19},facing:"up",active_ui:null,naming:null,field_controls_locked:false,interaction_targets:[],world_context:{objects:this.objects,triggers:[],dialogue:null,message:null}};
  if(this.mode==="free")return base;
  const text=this.text;
  return {...base,field_controls_locked:true,world_context:{objects:this.objects,triggers:[],dialogue:text,message:{phase:this.mode==="printing"?"printing":"button_wait",cursor:this.mode==="printing"?3:text.length,ready:this.mode==="waiting",identity:"a".repeat(64)}}};
 }
 fetch:typeof fetch=(input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown;
  if(url.endsWith("/action")){if(typeof init?.body!=="string")throw new Error("body");for(const b of (JSON.parse(init.body) as {buttons:Button[]}).buttons)this.press(b);body={status:"success"};}
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.endsWith("/pokebench/observation")){this.tick();const s=this.state();body={state_text:`Location: ${s.location??""}`,screenshot_base64:png,state:s};}
  else if(url.endsWith("/pokebench/state")){this.tick();body=this.state();}
  else throw new Error(`Unexpected request ${url}`);
  return Promise.resolve(new Response(JSON.stringify(body)));
 };
 read={read:()=>{this.tick();return Promise.resolve(this.state());}};
}
function recorder(){
 const events:RunEvent[]=[];const subs:((e:RunEvent)=>void)[]=[];let seq=0;
 const push=(body:Record<string,unknown>)=>{const e={v:1,run:"r",seq:++seq,t:"2026-10-16T03:00:00.000-04:00",turn:7,...body} as RunEvent;events.push(e);for(const s of subs)s(e);return {seq:e.seq,turn:7};};
 const api:AutoAdvanceRecorder&{lowHpTrainerWarning:()=>void;peopleIdCard:()=>void}={lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,recordState:s=>push({type:"state",...s}),recordDialogueAutoAdvance:b=>push({type:"dialogue_auto_advance",...b}),subscribe:o=>{subs.push(o);}};
 return {api,advances:()=>events.filter((e):e is Advance=>e.type==="dialogue_auto_advance")};
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
async function play(features:FeatureSet,text?:string){
 const game=new ScriptGame(text);const rec=recorder();
 const clock={now:()=>0,sleep:()=>Promise.resolve()};
 const base=[observeTool("http://127.0.0.1",game.fetch),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},game.fetch,clock)];
 const tools=playGameTools(base,features,game.read,rec.api);
 const press=tools.find(t=>t.name==="press") as AgentTool;
 const result=await press.execute("c1",{buttons:["UP"]});
 return {text:textOf(result),pages:rec.advances()[0]?.pages??[]};
}

describe("script-line-presence-v1: the production factory honors the switch",()=>{
 const BASE:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-auto-advance-v1":true,"character-presence-v1":true};
 it("ON: playGameTools records on_screen for the unattributed page and lists it in the result",async()=>{
  const {text,pages}=await play({...BASE,"script-line-presence-v1":true});
  expect(text).toContain(`1. turn 7 · ROUTE101 (map 0/16) · at 11,19 · ${TAG1}: "H-help me!"`);
  expect(pages.map(p=>p.on_screen)).toEqual([[{local_id:3,graphics_id:97,sprite_kind:"BIRCHS_BAG",x:7,y:14,character:null}]]);
 });
 it("ON: a page with a speaker is unchanged and records nothing extra",async()=>{
  const {text,pages}=await play({...BASE,"script-line-presence-v1":true},"MOM: Hi!");
  expect(text).toContain(`1. turn 7 · ROUTE101 (map 0/16) · at 11,19 · MOM: "MOM: Hi!"`);
  expect(pages.map(p=>Object.keys(p))).toEqual([["state_seq","map","map_id","position","speaker","speaker_source","text"]]);
 });
 it("OFF: no field is recorded and the line is today's",async()=>{
  const {text,pages}=await play({...BASE,"script-line-presence-v1":false});
  expect(text).toContain(`1. turn 7 · ROUTE101 (map 0/16) · at 11,19: "H-help me!"`);
  expect(text).not.toContain("no speaker shown");
  expect(pages.map(p=>Object.keys(p))).toEqual([["state_seq","map","map_id","position","speaker","speaker_source","text"]]);
 });
});

describe("script-line-presence-v1: registry",()=>{
 it("is the last switchable feature, an observation that needs dialogue auto-advance, default off",()=>{
  expect(SWITCHABLE_FEATURES.at(-164)).toBe("script-line-presence-v1");
  const info=featureInfo("script-line-presence-v1");
  expect(info.group).toBe("observation");
  expect(info.needs).toBe("dialogue-auto-advance-v1");
  expect(info.description).toContain(" Off: ");
  expect(FEATURES.filter(f=>f.id==="script-line-presence-v1")).toHaveLength(1);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-70)).toBe("script-line-presence-v1");
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,"script-line-presence-v1":false},null)).not.toContain("script-line-presence-v1");
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!=="script-line-presence-v1")) as Omit<FeatureSet,"script-line-presence-v1">;
  expect(normalizeFeatures(older)["script-line-presence-v1"]).toBe(false);
  expect(normalizeFeatures({...older,"script-line-presence-v1":true})["script-line-presence-v1"]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})["script-line-presence-v1"]).toBe(false);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"dialogue-auto-advance-v1":false})).toContain("script-line-presence-v1 needs dialogue-auto-advance-v1");
 });
});


describe("script-line-presence-v1: the instruction ledger re-shows the tag (review round 1)",()=>{
 const LEDGER:FeatureSet={...ON,"instruction-ledger-v1":true};
 it("ON: received instructions carry the tag in the text and in the recorded ledger_context",async()=>{
  const recorded:string[]=[];let subscriber:((e:RunEvent)=>void)|undefined;
  const ledger=instructionLedger(LEDGER,{subscribe:o=>{subscriber=o;},recordLedgerContext:b=>{recorded.push(b.text);return {seq:1,turn:1};}},m=>Promise.resolve(m));
  for(const e of withPresence(EVENTS,true))subscriber?.(e);
  const sent=await ledger?.transformContext([]);
  const text=recorded[0]??"";
  expect(text).toContain(`#5893 turn 261 · ROUTE101 (map 0/16) · (no speaker shown by the game; on screen: ${AT_BIRCH}): "Wh-Where are you going?!\nDon't leave me like this!"`);
  expect(text).toContain(`#5845 turn 259 · ROUTE101 (map 0/16) · ${TAG23}: "In my BAG!\nThere's a POKé BALL!"`);
  expect(sent?.at(-1)).toMatchObject({role:"user",content:text});
 });
 it("ON: a room's last-heard page carries the tag when it is an unattributed auto-advance page",()=>{
  const ledger=new InstructionLedger(LEDGER);
  const state=stateAt(5845);
  const page={state_seq:5845,map:"ROUTE101",map_id:[0,16] as [number,number],position:{x:11,y:15},speaker:null,speaker_source:null,text:"In my BAG!",on_screen:onScreen(state,true)};
  ledger.observe({v:1,run:"r",seq:5851,t:"2026-10-16T02:43:52.264-04:00",turn:259,type:"dialogue_auto_advance",tool_call_id:"c",tool:"press",requested:["UP"],sent:["UP"],dropped:[],auto_presses:1,pages:[page],stop:"field_free",detail:"x",duration_ms:1});
  ledger.observe(state);
  ledger.observe({v:1,run:"r",seq:5853,t:"2026-10-16T02:43:52.300-04:00",turn:259,type:"tool_result",id:"c",name:"press",text:"pressed UP",is_error:false,frames:[],duration_ms:1,state_seq:5845});
  expect(ledger.text()).toContain(`ROUTE101 (map 0/16) (first turn 259): last heard ${TAG23}: "In my BAG!"`);
 });
 it("OFF: the ledger text is today's",()=>{
  const ledger=new InstructionLedger({...OFF,"instruction-ledger-v1":true});
  for(const e of EVENTS)ledger.observe(e);
  expect(ledger.text()).toContain(`#5845 turn 259 · ROUTE101 (map 0/16): "In my BAG!\nThere's a POKé BALL!"`);
  expect(ledger.text()).not.toContain("no speaker shown");
 });
});

describe("script-line-presence-v1: pending experiment (review round 1)",()=>{
 it("names every registry switch explicitly, in order, with only this switch flipped in the candidate",()=>{
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/script-line-presence.json",import.meta.url),"utf8")) as {changedFeature:string;incumbent:{features:Record<string,boolean>}};
  expect(raw.changedFeature).toBe("script-line-presence-v1");
  const historical=SWITCHABLE_FEATURES.filter(id=>id!=="rejected-movement-prefix-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1");
  expect(Object.keys(raw.incumbent.features)).toEqual(historical.slice(0,historical.indexOf("script-line-presence-v1")+1));
  expect(raw.incumbent.features["script-line-presence-v1"]).toBe(false);
  expect(raw.incumbent.features["dialogue-auto-advance-v1"]).toBe(true);
 });
});
