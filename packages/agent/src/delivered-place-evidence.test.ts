import { expect, it } from "vitest";
import { Type } from "typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { readFileSync } from "node:fs";
import { checkEvent, type RunEvent } from "./events.js";
import { ALL_ON, type FeatureSet } from "./features.js";
import { StoryDestinations, withStoryDestinations, type PlacesBody } from "./story-destinations.js";
import { observedInstructions } from "./observed-instructions.js";
import { IN_GAME } from "../test-support/events.js";
import { parseGameState } from "./game-state.js";

const ID = "delivered-place-evidence-v1";
const places = JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
const event=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"place-evidence",seq:1,t:"2026-10-22T12:00:00.000-04:00",turn:12,...body});
const page=(text:string)=>({text,speaker:null,speaker_source:null,map:"LITTLEROOT TOWN MAYS HOUSE 1F",map_id:[1,2],state_seq:5,position:null});
const dialogue=(text:string)=>event({type:"dialogue_auto_advance",seq:6,tool_call_id:"talk",pages:[page(text)],tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,stop:"field_free",detail:"test",duration_ms:1});
const result=(error=false)=>event({type:"tool_result",seq:7,id:"talk",name:"press",text:"Location: LITTLEROOT TOWN MAYS HOUSE 1F",is_error:error,duration_ms:1,frames:[],state_seq:5});
const features=(on:boolean):FeatureSet=>({...ALL_ON,[ID]:on,"milestone-instruction-memory-v1":false,"observed-field-dialogue-v1":false});
const state=parseGameState({...IN_GAME,name:"RUBY",screen:"overworld",in_battle:false,map_id:[0,9],location:"LITTLEROOT TOWN"});

it("production resolver retains an explicit named person and place from an unnamed delivered speaker",async()=>{
 const run=async(on:boolean)=>{
  const listeners:((e:RunEvent)=>void)[]=[];
  const tool:AgentTool={name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Location: LITTLEROOT TOWN\nStory: x"}],details:{state}})};
  const [wrapped]=withStoryDestinations([tool],features(on),{subscribe:fn=>listeners.push(fn)},{places:()=>Promise.resolve(places)});
  for(const e of [dialogue("MAY went out to ROUTE 103."),result()])for(const fn of listeners)fn(e);
  return JSON.stringify(await wrapped?.execute("observe",{}));
 };
 const on=await run(true);
 expect(on).toContain("MAY went out to ROUTE 103.");
 expect(on).toContain("map 0/18");
 expect(on).toContain("unnamed speaker");
 expect(on).toContain("result 7");
 expect(await run(false)).not.toContain("MAY went out");
});

it("context retains the exact relative quote with uncertain speaker and no invented person identity",async()=>{
 const run=async(on:boolean,error=false)=>{
  const listeners:((e:RunEvent)=>void)[]=[];
  const transform=observedInstructions(features(on),{subscribe:fn=>listeners.push(fn),recordLedgerContext:()=>{}},messages=>Promise.resolve(messages));
  for(const e of [dialogue("Our daughter is upstairs, I think."),result(error)])for(const fn of listeners)fn(e);
  return JSON.stringify(await transform([]));
 };
 const on=await run(true);
 expect(on).toContain("Our daughter is upstairs, I think.");
 expect(on).toContain("speaker");
 expect(on).toContain("historical");
 expect(on).not.toContain('"MAY"');
 expect(await run(false)).toBe("[]");
 expect(await run(true,true)).toBe("[]");
});


it("pending or failed unnamed text is never a destination and relative daughter text never names MAY",()=>{
 for(const text of ["MAY went out to ROUTE 103.","Our daughter is upstairs, I think."]){
  const story=new StoryDestinations(false,false,false,false,true);
  story.observe(dialogue(text));
  expect(story.latest("talk")).toBeNull();
  story.observe(result(true));
  expect(story.latest("next")).toBeNull();
 }
 const relative=new StoryDestinations(false,false,false,false,true);
 relative.observe(dialogue("Our daughter is upstairs, I think."));relative.observe(result());
 expect(relative.latest("next")).toBeNull();
});

it("the OFF context is byte identical to the previous instruction memory",async()=>{
 const {ObservedInstructions}=await import("./observed-instructions.js");
 const listeners:((e:RunEvent)=>void)[]=[];
 const old=new ObservedInstructions(false,false);
 const transform=observedInstructions(features(false),{subscribe:fn=>listeners.push(fn),recordLedgerContext:()=>{}},messages=>Promise.resolve(messages));
 const named={...page("MOM: Our new home is in LITTLEROOT TOWN."),speaker:"MOM",speaker_source:"name_prefix"};
 const d=dialogue("unused");if(d.type!=="dialogue_auto_advance")throw Error("type");
 for(const e of [{...d,pages:[named]} as RunEvent,result()]){old.observe(e);for(const fn of listeners)fn(e);}
 expect((await transform([])).at(-1)?.content).toBe(old.text());
});

it("replays recorded ea04 upstairs dialogue with exact source and audited expiry",async()=>{
 const {gunzipSync}=await import("node:zlib");
 const {ObservedInstructions}=await import("./observed-instructions.js");
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/milestone-memory-ea04.json.gz",import.meta.url))).toString("utf8")) as {events:unknown[]};
 const memory=new ObservedInstructions(true,true);
 let before:string|null=null;
 for(const raw of fixture.events){const e=checkEvent(raw);memory.observe(e);if(memory.placeEvidence()?.includes("Our daughter is upstairs, I think."))before=memory.placeEvidence();}
 expect(before).toContain("Our daughter is upstairs, I think.");
 expect(before).toContain("WOMAN_4");
 expect(before).toContain("state_event");
 expect(memory.retention()?.retired.some(e=>e.rule==="rival-upstairs")).toBe(true);
 expect(memory.placeEvidence()).not.toContain("Our daughter is upstairs, I think.");
});


it("normalizes omitted flags OFF and records the new treatment only when enabled",async()=>{
 const {normalizeFeatures,flagFeatures}=await import("./play-preset.js");
 const {featuresOf,playHarnessFeatures}=await import("./features.js");
 const {[ID]:value,...omitted}=features(false);expect(value).toBe(false);
 expect(normalizeFeatures(omitted)[ID]).toBe(false);
 expect(flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 expect(playHarnessFeatures(features(false),null)).not.toContain(ID);
 expect(playHarnessFeatures(features(true),null)).toContain(ID);
 expect(featuresOf([ID])[ID]).toBe(true);
});

it("keeps a named-place quote historical in the actual trust header, with no walk-away supervision",async()=>{
 const {HarnessTrust}=await import("./harness-trust.js");
 const trust=new HarnessTrust({supervisor:true,deliveredPlaces:true});
 trust.observe(dialogue("MAY went out to ROUTE 103."));trust.observe(result());
 const output=trust.lines("Location: LITTLEROOT TOWN",state,"later",places.places);
 expect(output.header).toContain("Historical named place evidence:");
 expect(output.header).toContain("not current presence or an instruction");
 expect(output.away).toBeNull();
});
