import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
// story-goal-player-name-v1: run 2026-10-21T01-16-23_glm53-mac_e9ee kept the default name BRENDAN, so MOM's
// "He lives right next door" (dialogue_auto_advance seq 1628) had two candidates and the Story goal fell back to the TV line.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {StoryDestinations,STORY_HEADER,withStoryDestinations,type PlacesBody} from "./story-destinations.js";
import {HarnessTrust} from "./harness-trust.js";
import {playGameTools} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="story-goal-player-name-v1" as const;
const NEW=["story-goal-player-name-v1","cut-off-reply-feedback-v1","trainer-sight-check-v2","auto-talk-v2"] as const;
interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
// MOM's pages from e9ee seq 1628, word for word (map 1/0, BRENDAN'S HOUSE 1F); the game prints the player's name where BRENDAN is.
const MOM_PAGES=[
 "MOM: Oh! BRENDAN, BRENDAN!\nQuick! Come quickly!",
 "MOM: Look! It's PETALBURG GYM!\nMaybe DAD will be on!",
 "MOM: Oh… It's over.",
 "I think DAD was on, but we missed him.\nToo bad.",
 "Oh, yes.\nOne of DAD's friends lives in town.",
 "PROF. BIRCH is his name.",
 "He lives right next door, so you should\ngo over and introduce yourself.",
].map(text=>({state_seq:null,map:"LITTLEROOT TOWN BRENDANS HOUSE 1F",map_id:[1,0] as [number,number],position:null,speaker:"MOM",speaker_source:"name_prefix",text}));
let seq=200000;
const talk=(id:string,turn:number,player="BRENDAN"):RunEvent=>checkEvent({v:1,run:"2026-10-21T01-16-23_glm53-mac_e9ee",seq:seq++,t:"2026-10-21T01:28:00.000-04:00",type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:7,pages:MOM_PAGES.map(p=>({...p,text:p.text.replaceAll("BRENDAN",player)})),stop:"field_free",detail:"d",duration_ms:1});
const delivered=(id:string,turn:number):RunEvent=>checkEvent({v:1,run:"2026-10-21T01-16-23_glm53-mac_e9ee",seq:seq++,t:"2026-10-21T01:28:00.000-04:00",type:"tool_result",turn,id,name:"press",is_error:false,duration_ms:1,text:"pressed A",frames:[]});
const BASE=((): GameStateSnapshot=>{
 const result=CAAA.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.turn===272);
 const e=CAAA.find(x=>x.seq===result?.state_seq);
 if(e?.type!=="state"||!("started" in e))throw Error("no state");
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
})();
// Outside BRENDAN's house on LITTLEROOT TOWN, as e9ee stood after the TV (turn 34).
const littleroot=(name:string):GameStateSnapshot=>({...BASE,map_id:[0,9],location:"LITTLEROOT TOWN",name});
const BIRCH="- \"He lives\" (He = PROF. BIRCH, the one story character named before it in this conversation) = PROF. BIRCH'S HOUSE 1F (map 1/2). Way in: door on this map at (14,8).";
const AMBIGUOUS="- \"He lives\": not resolved: \"He\" could be BRENDAN or PROF. BIRCH.";
function heard(story:StoryDestinations,player="BRENDAN"):void {story.observe(talk("tv",33,player));story.observe(delivered("tv",33));}

describe("story-goal-player-name-v1 on e9ee's TV pages",()=>{
 it("OFF: with the player named BRENDAN, He could be BRENDAN or PROF. BIRCH, as e9ee saw",()=>{
  const story=new StoryDestinations();heard(story);
  expect(story.block(littleroot("BRENDAN"),"later",PLACES.places)).toContain(AMBIGUOUS);
 });
 it("ON: the player's own name is not a candidate, so He is PROF. BIRCH and the goal is his house's door",()=>{
  const story=new StoryDestinations(false,false,true);heard(story);
  const block=story.block(littleroot("BRENDAN"),"later",PLACES.places);
  expect(block).toBe([`${STORY_HEADER} (turn 33, MOM): "He lives right next door, so you should go over and introduce yourself."`,BIRCH].join("\n"));
 });
 it("a player name that is no story character changes nothing either way (acfa was ASH)",()=>{
  for(const on of [false,true]){
   const story=new StoryDestinations(false,false,on);heard(story,"ASH");
   expect(story.block(littleroot("ASH"),"later",PLACES.places)).toContain(BIRCH);
  }
 });
 it("ON still reports two other named characters as not resolved, and an unknown player name keeps every candidate",()=>{
  const story=new StoryDestinations(false,false,true);
  story.observe(checkEvent({v:1,run:"r",seq:seq++,t:"2026-10-21T01:28:00.000-04:00",type:"dialogue_auto_advance",turn:5,tool_call_id:"w",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:2,pages:[{...MOM_PAGES[0],text:"WALLY and STEVEN came by."},{...MOM_PAGES[0],text:"He lives right next door."}],stop:"field_free",detail:"d",duration_ms:1}));
  story.observe(delivered("w",5));
  expect(story.block(littleroot("BRENDAN"),"later",PLACES.places)).toContain("- \"He lives\": not resolved: \"He\" could be WALLY or STEVEN.");
  const unnamed=new StoryDestinations(false,false,true);heard(unnamed);
  expect(unnamed.block(littleroot(""),"later",PLACES.places)).toContain(AMBIGUOUS);
 });
 it("the Story goal line (harness-trust-v1) follows the same rule",()=>{
  const goal=(on:boolean)=>{
   const trust=new HarnessTrust({supervisor:true,activity:true,playerName:on});
   trust.observe(talk("tv",33));trust.observe(delivered("tv",33));
   return trust.lines("Location: LITTLEROOT TOWN",littleroot("BRENDAN"),"later",PLACES.places).header;
  };
  expect(goal(true)).toContain("Story goal: \"He lives right next door, so you should go over and introduce yourself.\" (MOM, turn 33) -> \"He lives\" (He = PROF. BIRCH");
  expect(goal(false)).not.toContain("He = PROF. BIRCH");
 });
});

type Details={state:GameStateSnapshot};
const observeTool=(state:GameStateSnapshot):AgentTool=>({name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Story: x\nLocation: LITTLEROOT TOWN"}],details:{state}} satisfies AgentToolResult<Details>)});
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");

describe("production factory",()=>{
 it("withStoryDestinations reads the switch from the FeatureSet",async()=>{
  const run=async(features:FeatureSet)=>{
   const subs:((e:RunEvent)=>void)[]=[];
   const [tool]=withStoryDestinations([observeTool(littleroot("BRENDAN"))],features,{subscribe:fn=>{subs.push(fn);}},{places:()=>Promise.resolve(PLACES)});
   subs[0]?.(talk("tv",33));subs[0]?.(delivered("tv",33));
   return textOf(await tool?.execute("o",{}) ?? {content:[],details:undefined});
  };
  const base={...LEGACY_ALL_ON,"story-destinations-v1":true,"scripted-place-guidance-v1":false,"unfinished-activity-v1":false};
  expect(await run({...base,[ID]:true})).toContain(BIRCH);
  expect(await run({...base,[ID]:false})).toContain(AMBIGUOUS);
 });
 it("playGameTools passes the switch to the Story goal line (harness-trust-v1)",async()=>{
  const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
  const run=async(on:boolean)=>{
   const subs:((e:RunEvent)=>void)[]=[];
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
   const [tool]=playGameTools([observeTool(littleroot("BRENDAN"))],{...OFF,"harness-trust-v1":true,[ID]:on},{read:()=>Promise.resolve(littleroot("BRENDAN")),places:()=>Promise.resolve(PLACES)},recorder);
   for(const sub of subs){sub(talk("tv",33));sub(delivered("tv",33));}
   return textOf(await tool?.execute("o",{}) ?? {content:[],details:undefined});
  };
  expect(await run(true)).toContain("(He = PROF. BIRCH, the one story character named before it in this conversation)");
  expect(await run(false)).not.toContain("He = PROF. BIRCH");
 });
});

describe("registry",()=>{
 it("the four GLM-run switches are appended last, in order, default off, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.slice(-46,-42)).toEqual([...NEW]);
  expect(FEATURES.filter(f=>f.switchable).slice(-46,-42).map(f=>f.id)).toEqual([...NEW]);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).slice(-21,-17)).toEqual([...NEW]);
  expect(playHarnessFeatures(LEGACY_ALL_ON,null)).not.toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true,title:"STORY GOAL: PLAYER NAME"});
  expect(featureInfo("cut-off-reply-feedback-v1")).toMatchObject({group:"guard",needs:null});
  expect(featureInfo("trainer-sight-check-v2")).toMatchObject({group:"guard",needs:"trainer-sight-check-v1"});
  expect(featureInfo("auto-talk-v2")).toMatchObject({group:"guard",needs:"auto-talk-v1"});
  for(const id of NEW){
   expect(featureInfo(id).description).toContain("Bundle arm only, default off");
   expect(featureInfo(id).description).toContain(" Off: ");
   expect(LEGACY_ALL_ON[id]).toBe(false);
   expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[id]).toBe(false);
   const omitted=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>!(NEW as readonly string[]).includes(k)));
   expect(normalizeFeatures(omitted as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);
  }
 });
});
