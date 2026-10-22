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
const state=parseGameState({...IN_GAME,screen:"overworld",in_battle:false,map_id:[0,9],location:"LITTLEROOT TOWN"});

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
