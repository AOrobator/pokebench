import {describe,expect,it} from "vitest";
import {A702_PLACES,a702Events,a702State,a702StateAt,callAt} from "../test-support/a702-dewford.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {HarnessTrust,type TrustOptions} from "./harness-trust.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {StoryDestinations,headsOf,selfName} from "./story-destinations.js";

const ID="self-named-speaker-v1";
// The bundle arm's harness-trust options (play-wiring), as a702 ran them.
const A702:TrustOptions={supervisor:false,goalOnce:false,retireLab:true,stageBound:true,nativeTasks:true,omitEmptyGoal:true,scriptedGuidance:true,reachableGoal:true,semanticTargets:true,exitSections:true,activity:true,playerName:true,gymEvidence:true,deliveredPlaces:true};
const header=(on:boolean,turn:number,state:GameStateSnapshot):string=>{
 const trust=new HarnessTrust({...A702,selfNamed:on});
 for(const e of a702Events(turn))trust.observe(e);
 return trust.lines("Location: x",state,"later",A702_PLACES).header;
};
const DAD='Story line heard (DAD, turn 312): "Head for RUSTBORO CITY beyond this town."';
const BRINEY='"You can usually find me in my cottage by the sea near PETALBURG WOODS." (MR. BRINEY, turn 621)';
const STONE='"Well, on the way, could you stop off in DEWFORD TOWN?" (MR. STONE, turn 630)';

describe("selfName: a page in which its speaker gives a name in capitals",()=>{
 it("reads the a702 introductions",()=>{
  expect(selfName("They call me MR. BRINEY.\nAnd, you are?")).toBe("MR. BRINEY");
  expect(selfName("I'm MR. STONE, the PRESIDENT of\nthe DEVON CORPORATION.")).toBe("MR. STONE");
  expect(selfName("My name is ROXANNE!")).toBe("ROXANNE");
 });
 it("ignores pages that do not introduce their speaker",()=>{
  expect(selfName("MR. STONE: Now, you should know that\nI am a great PRESIDENT.")).toBeNull();
  expect(selfName("Ah, so you are AAAAAA!\nI sincerely thank you!")).toBeNull();
  expect(selfName("I'm a POKéMON TRAINER!")).toBeNull();
  expect(selfName("I'm X.")).toBeNull();
  expect(selfName("Our PRESIDENT would like to have\na word with you.")).toBeNull();
  // Review round 1: a sentence's full stop never joins the next word; a word must end where its capitals end.
  expect(selfName("I'm ROXANNE. POKéMON are great.")).toBe("ROXANNE");
  expect(selfName("I'm ABCd here.")).toBeNull();
  expect(selfName("I'm OK!")).toBeNull();
  expect(selfName("I'm MR.")).toBeNull();
 });
});

describe("self-named-speaker-v1 on a702's recorded Story line",()=>{
 const rusturf=a702StateAt([24,4],"RUSTURF TUNNEL");
 it("OFF: after Briney's and Stone's conversations the header still shows Dad's turn-312 line",()=>{
  expect(header(false,629,rusturf)).toContain(DAD);
  expect(header(false,631,a702State("630"))).toContain(DAD);
  expect(header(false,631,a702State("630"))).not.toContain("MR. STONE");
 });
 it("ON: Briney's cottage line becomes the Story goal after turn 621, whole, with PETALBURG WOODS resolved",()=>{
  const trust=new HarnessTrust({supervisor:false,activity:true,selfNamed:true});
  for(const e of a702Events(629))trust.observe(e);
  const text=trust.lines("Location: x",rusturf,"later",A702_PLACES).header;
  expect(text).toContain(`Story goal: ${BRINEY} -> "PETALBURG WOODS" = PETALBURG WOODS (map 24/11).`);
  expect(text).not.toContain(DAD);
 });
 it("ON with a702's stale-story-goal switches: the checklist's \"Petalburg Woods Aqua event complete\" retires Briney's line, so the header names no goal until Stone's request",()=>{
  const text=header(true,629,rusturf);
  expect(text).not.toContain("Story goal");
  expect(text).not.toContain(DAD);
 });
 it("ON: Stone's DEWFORD TOWN request replaces it after turn 630",()=>{
  const text=header(true,631,a702State("630"));
  expect(text).toContain(`Story goal: ${STONE} -> "DEWFORD TOWN" = DEWFORD TOWN (map 0/11).`);
  expect(text).not.toContain(DAD);
 });
 it("pages before the introduction stay unattributed: the employee's SHIPYARD request is no story line",()=>{
  const events=a702Events(630);
  const story=new StoryDestinations(false,true,true,true,false,false,true);
  for(const e of events){
   if(e.type==="dialogue_auto_advance"&&e.turn===630){
    const before=e.pages.slice(0,e.pages.findIndex(p=>p.text.startsWith("I'm MR. STONE")));
    story.observe({...e,pages:before});
   }else story.observe(e);
  }
  // The latest story line is Briney's from turn 621, not one of the employee's pages before Stone introduces himself.
  expect(story.latest("later",headsOf(A702_PLACES))).toMatchObject({turn:621,speaker:"MR. BRINEY"});
 });
 it("a name must be introduced in the same conversation: a later call by the same sprite kind is not credited",()=>{
  const story=new StoryDestinations(false,false,false,false,false,false,true);
  const page=(text:string)=>({state_seq:null,map:"X",map_id:[0,0] as [number,number],position:null,speaker:"EXPERT_M",speaker_source:"faced_sprite" as const,text});
  const talk=(id:string,seq:number,text:string):RunEvent[]=>[checkEvent({v:1,run:"a702",seq,t:"2026-10-27T19:40:34.254-04:00",type:"dialogue_auto_advance",turn:seq,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[page(text)],stop:"field_free",detail:"d",duration_ms:1}),checkEvent({v:1,run:"a702",seq:seq+1,t:"2026-10-27T19:40:34.254-04:00",type:"tool_result",turn:seq,id,name:"press",is_error:false,duration_ms:1,text:"pressed A",frames:[]})];
  for(const e of [...talk("a",1,"They call me MR. BRINEY."),...talk("b",3,"Head for ROUTE 104.")])story.observe(e);
  expect(story.latest("later",headsOf(A702_PLACES))).toBeNull();
 });
});

describe("self-named-speaker-v1 registry and factory",()=>{
 it("is registered after the earlier switches, default off, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(285);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).indexOf(ID)).toBe(309);
  expect(featureInfo(ID).description).toContain(" Off: only the listed story characters (and DAD) speak story lines.");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"dialogue-auto-advance-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });
 it("the production trust header honors the switch",async()=>{
  const {playGameTools}=await import("./play-wiring.js");
  const {Type}=await import("typebox");
  const features=(on:boolean)=>({...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"harness-trust-v1":true,[ID]:on} as typeof ALL_ON);
  const run=async(on:boolean)=>{
   const listeners:((e:RunEvent)=>void)[]=[];
   const state=a702State("630");
   const observe={name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"Location: RUSTBORO CITY DEVON CORP 3F"}],details:{state}})};
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{listeners.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
   const tools=playGameTools([observe],features(on),{read:()=>Promise.resolve(state),places:()=>Promise.resolve({places:A702_PLACES})},recorder);
   for(const e of a702Events(631))for(const fn of listeners)fn(e);
   const out=await tools.find(t=>t.name==="observe")?.execute("later",{});
   return JSON.stringify(out?.content);
  };
  expect(await run(true)).toContain("MR. STONE, turn 630");
  expect(await run(false)).not.toContain("MR. STONE, turn 630");
 });
 it("records which call it replays",()=>{expect(callAt(621)).toMatch(/^[A-Za-z0-9]+$/);});
});
