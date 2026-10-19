import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {TRUST_HEADER,withHarnessTrust,type StoryGoalAwayFacts} from "./harness-trust.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {STALE_LAB_NOTE,STORY_HEADER,StoryDestinations,staleGoalLine,type PlacesBody} from "./story-destinations.js";

interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
type StateEvent=Extract<RunEvent,{type:"state";started:boolean}>;
type ToolResultEvent=Extract<RunEvent,{type:"tool_result"}>;
function snapshot(e:StateEvent):GameStateSnapshot {
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
}
const stateAt=(seq:number)=>{const e=CAAA.find(x=>x.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error(`no state ${String(seq)}`);return snapshot(e);};
const resultAt=(turn:number)=>{const e=CAAA.find((x):x is ToolResultEvent=>x.type==="tool_result"&&x.turn===turn);if(e===undefined)throw Error(`no result ${String(turn)}`);return e;};
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");
const DOOR="- \"LAB\" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).";
const LAB_QUOTE=`${STORY_HEADER} (turn 5, MOM): "Go see MAY at the LAB."`;
const ID="stale-story-goal-v1";

function field(map:[number,number],location:string):GameStateSnapshot {
 const result=resultAt(272);
 return {...stateAt(result.state_seq ?? -1),map_id:map,location};
}
function dex(state:GameStateSnapshot,received:boolean|null):GameStateSnapshot {
 return withStory(state,{pokedex_received:received});
}
function withStory(state:GameStateSnapshot,patch:Partial<NonNullable<GameStateSnapshot["story"]>>):GameStateSnapshot {
 if(state.story==null)throw Error("fixture has no story");
 return {...state,story:{...state.story,...patch}};
}
const page=(text:string,speaker:string)=>({state_seq:null,map:"X",map_id:[0,0] as [number,number],position:null,speaker,speaker_source:"name_prefix" as const,text});
let seq=200000;
function talk(id:string,turn:number,pages:readonly object[]):RunEvent {
 return checkEvent({v:1,run:"2026-10-16T12-42-29_qwen36-gpu0_4caa",seq:seq++,t:"2026-10-16T13:07:12.905-04:00",type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages,stop:"field_free",detail:"d",duration_ms:1});
}
function delivered(id:string,turn:number):RunEvent {
 return checkEvent({v:1,run:"2026-10-16T12-42-29_qwen36-gpu0_4caa",seq:seq++,t:"2026-10-16T13:07:12.905-04:00",type:"tool_result",turn,id,name:"press",is_error:false,duration_ms:1,text:"pressed A",frames:[]});
}
function block(pages:readonly object[],state:GameStateSnapshot,retireLab:boolean):string|null {
 return run([{turn:5,pages}],state,retireLab);
}
function run(calls:readonly {turn:number;pages:readonly object[]}[],state:GameStateSnapshot,retireLab:boolean):string|null {
 const story=new StoryDestinations();
 calls.forEach((call,i)=>{const id=`c${String(i)}`;story.observe(talk(id,call.turn,call.pages));story.observe(delivered(id,call.turn));});
 return story.block(state,"later",PLACES.places,retireLab);
}

describe("stale-story-goal-v1",()=>{
 const oldale=field([0,10],"OLDALE TOWN");
 const lab=[page("BIRCH lives next door.","MOM"),page("Go see MAY at the LAB.","MOM")];
 it("is registered fifth from the end, default off, and needs nothing",()=>{
  expect(SWITCHABLE_FEATURES.at(-11)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-11)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true,title:"STALE STORY GOAL"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(dependencyProblems({...ALL_ON,[ID]:true,"story-destinations-v1":false,"harness-trust-v1":false})).not.toContain(expect.stringContaining(ID));
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const without=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
 });
 it("OFF keeps the lab door after the Pokédex, byte for byte",()=>{
  const off=block(lab,dex(oldale,true),false);
  expect(off).toBe([LAB_QUOTE,DOOR].join("\n"));
  expect(off).not.toContain("Pokédex received");
 });
 it("ON, once the Pokédex is received, keeps the quote, drops the door, and does not promote an older place line",()=>{
  const on=block(lab,dex(oldale,true),true);
  expect(on).toBe([LAB_QUOTE,STALE_LAB_NOTE].join("\n"));
  expect(on).not.toContain("Way in");
  expect(on).not.toContain("lives");
 });
 it("stays the lab door while the Pokédex flag is false or unreadable, and when the switch is on",()=>{
  for(const received of [false,null]){
   expect(block(lab,dex(oldale,received),true)).toBe([LAB_QUOTE,DOOR].join("\n"));
  }
  const missing=block(lab,{...oldale,story:null},true);
  expect(missing).toBe([LAB_QUOTE,DOOR].join("\n"));
 });
 it("does not retire a newer line that names another place, or a lab line mixed with one",()=>{
  const town=block([page("Go see MAY at the LAB.","MOM"),page("Meet me in OLDALE TOWN.","MAY")],dex(field([0,18],"ROUTE103"),true),true) ?? "";
  expect(town).toContain("OLDALE TOWN");
  expect(town).toContain("Way in");
  expect(town).not.toContain(STALE_LAB_NOTE);
  const mixed=block([page("Go to the LAB, then ROUTE 103.","MAY")],withStory(oldale,{pokedex_received:true,rival_battle_won:false}),true) ?? "";
  expect(mixed).toContain("Way in");
  expect(mixed).toContain("ROUTE103");
  expect(mixed).not.toContain(STALE_LAB_NOTE);
 });
 it("keeps the lab door after Birch's handoff, before the Pokédex, when nobody has spoken since",()=>{
  const handoff=block(lab,withStory(oldale,{birch_lab_stage:5,pokedex_received:false}),true) ?? "";
  expect(handoff).toBe([LAB_QUOTE,DOOR].join("\n"));
  expect(handoff).not.toContain("Birch starter handoff complete");
 });
 it("retires a Route 103 line once the checklist says the rival battle is won, and not before",()=>{
  const line=[page("Meet me on ROUTE 103.","MAY")];
  const won=run([{turn:5,pages:line}],withStory(oldale,{rival_battle_won:true,pokedex_received:false}),true) ?? "";
  expect(won).toContain("Done: Route 103 rival battle won. This is not where to go.");
  expect(won).not.toContain("Way in");
  expect(won).not.toContain("lives");
  const early=run([{turn:5,pages:line}],withStory(oldale,{rival_battle_won:false,pokedex_received:false}),true) ?? "";
  expect(early).toContain("Way in");
  expect(early).not.toContain("Route 103 rival battle won");
 });
 it("keeps the active place through incidental later dialogue, while native completion still retires it",()=>{
  const shoes=page("Don't forget your RUNNING SHOES.","MOM");
  const calls=[{turn:5,pages:lab},{turn:6,pages:[shoes]}];
  const on=run(calls,dex(oldale,false),true) ?? "";
  expect(on).toBe([LAB_QUOTE,DOOR].join("\n"));
  expect(on).toContain("Way in");
  expect(on).not.toContain("lives");
  const clerk=run([{turn:5,pages:lab},{turn:6,pages:[page("Welcome!", "CLERK")]}],dex(oldale,false),true) ?? "";
  expect(clerk).toBe([LAB_QUOTE,DOOR].join("\n"));
  const off=run(calls,dex(oldale,true),false) ?? "";
  expect(off).toBe([LAB_QUOTE,DOOR].join("\n"));
  const both=run(calls,dex(oldale,true),true) ?? "";
  expect(both).toContain(STALE_LAB_NOTE);
  expect(both).not.toContain("is newer");
  expect(both).not.toContain("Way in");
 });
 it("retires Petalburg Woods and the Rustboro Gym when the checklist says those are complete",()=>{
  const woods=run([{turn:5,pages:[page("Go through PETALBURG WOODS.","MAY")]}],withStory(oldale,{woods_stage:1,pokedex_received:false,rival_battle_won:false}),true) ?? "";
  expect(woods).toContain("Done: Petalburg Woods Aqua event complete. This is not where to go.");
  expect(woods).not.toContain("Way in");
  const gym=run([{turn:5,pages:[page("Meet me at the RUSTBORO CITY GYM.","MAY")]}],withStory(oldale,{rustboro_gym_complete:true,pokedex_received:false,rival_battle_won:false}),true) ?? "";
  expect(gym).toContain("Done: Rustboro Gym complete. This is not where to go.");
  expect(gym).not.toContain("Way in");
 });
 it("does not retire the city when the checklist names the woods or the gym",()=>{
  const petalburg=run([{turn:5,pages:[page("Your DAD is waiting in PETALBURG CITY.","MOM")]}],withStory(oldale,{woods_stage:1,pokedex_received:false,rival_battle_won:false}),true) ?? "";
  expect(petalburg).toContain("Way in");
  expect(petalburg).not.toContain("Petalburg Woods Aqua event complete");
  const rustboro=run([{turn:5,pages:[page("Go back to RUSTBORO CITY.","MAY")]}],withStory(oldale,{rustboro_gym_complete:true,pokedex_received:false,rival_battle_won:false}),true) ?? "";
  expect(rustboro).toContain("Way in");
  expect(rustboro).not.toContain("Rustboro Gym complete");
 });
 it("a trainer defeat does not retire the route that trainer stands on",()=>{
  const text=run([{turn:5,pages:[page("The POKéMON on ROUTE 102 are tough.","MAY")]}],withStory(oldale,{route102_calvin_defeated:true,pokedex_received:false}),true) ?? "";
  expect(text).toContain("ROUTE 102");
  expect(text).toContain("Way in");
  expect(text).not.toContain("is newer");
  expect(text).not.toContain("defeated");
 });
});

type Details={state:GameStateSnapshot|undefined};
function scripted(name:"observe"|"navigate_to"):{tool:AgentTool;next:(state:GameStateSnapshot,text:string)=>void} {
 let current:AgentToolResult<Details>={content:[{type:"text",text:""}],details:{state:undefined}};
 return {tool:{name,label:name,description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve(current)},next:(state,text)=>{current={content:[{type:"text",text}],details:{state}};}};
}
function trust(retireLab:boolean) {
 const subs:((e:RunEvent)=>void)[]=[];const notes:{text:string}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},storyGoalAway:(_tool:string,_facts:StoryGoalAwayFacts,text:string)=>{notes.push({text});}};
 const nav=scripted("navigate_to");
 const tools=withHarnessTrust([nav.tool],true,recorder,{places:()=>Promise.resolve(PLACES)},{supervisor:true,retireLab});
 const feed=()=>{const result=resultAt(272);for(const e of CAAA){if(e.seq>result.seq)break;for(const s of subs)s(e);}};
 return {notes,nav,tools,feed};
}

describe("stale-story-goal-v1 harness trust",()=>{
 const result=resultAt(272);
 const base=stateAt(result.state_seq ?? -1);
 const route=(y:number,received:boolean|null):GameStateSnapshot=>dex({...base,map_id:[0,18],location:"ROUTE103",position:{x:9,y}},received);
 const done=staleGoalLine({turn:272,speaker:"MAY",text:"Well, it's time to head back to the LAB.",lives:null});
 async function walk(retireLab:boolean,received:boolean|null) {
  const h=trust(retireLab);h.feed();
  const texts:string[]=[];
  for(const y of [13,10,7]){h.nav.next(route(y,received),"Location: x");texts.push(textOf(await h.tools[0]?.execute(`n${String(y)}`,{}) ?? {content:[],details:undefined}));}
  return {h,texts};
 }
 it("OFF still sends the model back to the lab and notes a walk away from it",async()=>{
  const {h,texts}=await walk(false,true);
  expect(texts[2]).toContain("Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).");
  expect(texts[2]).toContain("SUPERVISOR:");
  expect(h.notes).toHaveLength(1);
  expect(texts[2]).not.toContain("Pokédex received");
 });
 it("ON says the lab line is done and does not fire the away-supervisor",async()=>{
  const {h,texts}=await walk(true,true);
  expect(texts[2]).toBe(`${TRUST_HEADER}\n${done}\n\nLocation: x`);
  expect(texts.join("\n")).not.toContain("SUPERVISOR");
  expect(texts.join("\n")).not.toContain("Way in");
  expect(h.notes).toHaveLength(0);
 });
 it("ON before the Pokédex still treats the lab as the goal",async()=>{
  const {h,texts}=await walk(true,false);
  expect(texts[2]).toContain("Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).");
  expect(h.notes).toHaveLength(1);
 });
});

describe("stale-story-goal-v1 production factory",()=>{
 const here=dex(field([0,10],"OLDALE TOWN"),true);
 const lab=talk("t",5,[page("Go see MAY at the LAB.","MOM")]);
 const features=(on:boolean):FeatureSet=>({...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"story-destinations-v1":true,"harness-trust-v1":true,[ID]:on} as FeatureSet);
 const readout="Location: OLDALE TOWN\nPosition: (10, 1)";
 function observe():AgentTool {
  return {name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state:here}})};
 }
 async function run(on:boolean):Promise<string> {
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
  const tools=playGameTools([observe()],features(on),{read:()=>Promise.resolve(here),places:()=>Promise.resolve(PLACES)},recorder);
  for(const fn of subs){fn(lab);fn(delivered("t",5));}
  return textOf(await tools[0]?.execute("o",{}) ?? {content:[],details:undefined});
 }
 it("OFF still prints the door in the block and the Story goal line",async()=>{
  const text=await run(false);
  expect(text).toContain(DOOR);
  expect(text).toContain(`${TRUST_HEADER}\nStory goal: "Go see MAY at the LAB." (MOM, turn 5) -> "LAB" = PROF. BIRCH'S POKéMON LAB (map 1/4). Way in: door in LITTLEROOT TOWN (map 0/9) at (7,16).`);
  expect(text).not.toContain(STALE_LAB_NOTE);
  expect(text).not.toContain("is done: Pokédex received");
 });
 it("the pending experiment flips only this switch, with the lab parents on, and is not queued",()=>{
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/stale-story-goal.json",import.meta.url),"utf8")) as {incumbent:{features:Record<string,boolean>}};
  expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"));
  const entry=parseExperiment(raw);
  expect(entry.queuePosition).toBeUndefined();
  expect(entry.changedFeature).toBe(ID);
  expect(entry.activationMilestone).toBe("RECEIVED_POKEDEX");
  const {incumbent,candidate}=experimentArms(entry);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual([ID]);
  expect(incumbent.features["story-destinations-v1"]).toBe(true);
  expect(incumbent.features["harness-trust-v1"]).toBe(true);
  expect(incumbent.features[ID]).toBe(false);
  expect(candidate.features[ID]).toBe(true);
  expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
 });
 it("ON retires the lab in both the block and the Story goal line",async()=>{
  const text=await run(true);
  expect(text).toContain([`${STORY_HEADER} (turn 5, MOM): "Go see MAY at the LAB."`,STALE_LAB_NOTE].join("\n"));
  expect(text).toContain(`${TRUST_HEADER}\n${staleGoalLine({turn:5,speaker:"MOM",text:"Go see MAY at the LAB.",lives:null})}`);
  expect(text).not.toContain("Way in");
  expect(text).toContain(readout);
 });
 it("ON with input cuts still prints the stale Story goal, including when navigate_to puts the block in a later part",async()=>{
  const both={...features(true),"input-cuts-v1":true} as FeatureSet;
  const stale=`${TRUST_HEADER}\n${staleGoalLine({turn:5,speaker:"MOM",text:"Go see MAY at the LAB.",lives:null})}`;
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:()=>undefined,destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
  const nav:AgentTool={name:"navigate_to",label:"Walk",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Navigation: arrived"},{type:"text",text:readout}],details:{state:here}})};
  const tools=playGameTools([observe(),nav],both,{read:()=>Promise.resolve(here),places:()=>Promise.resolve(PLACES)},recorder);
  for(const fn of subs){fn(lab);fn(delivered("t",5));}
  const observed=textOf(await tools[0]?.execute("o",{}) ?? {content:[],details:undefined});
  const walked=textOf(await tools[1]?.execute("n",{}) ?? {content:[],details:undefined});
  for(const text of [observed,walked]){
   expect(text).toContain(STORY_HEADER);
   expect(text).toContain(STALE_LAB_NOTE);
   expect(text).toContain(stale);
  }
  expect(walked.indexOf(stale)).toBeLessThan(walked.indexOf("Navigation:"));
 });
});
