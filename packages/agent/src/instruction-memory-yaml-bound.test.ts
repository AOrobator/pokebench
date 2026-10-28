import {describe,expect,it,vi} from "vitest";

// Exercise the real selector and renderer with small bounds; production constants are pinned separately.
const bounds=vi.hoisted(()=>({json:1200,yaml:1800,locations:180}));
vi.mock("./instruction-memory-cap.js",async original=>{
 const actual=await original<typeof import("./instruction-memory-cap.js")>();
 return {...actual,get INSTRUCTION_MEMORY_CAP_CHARS(){return bounds.json;},get CAP_LOCATION_CHARS(){return bounds.locations;}};
});
vi.mock("./instruction-memory-yaml.js",async original=>{
 const actual=await original<typeof import("./instruction-memory-yaml.js")>();
 return {...actual,get INSTRUCTION_MEMORY_YAML_CAP_CHARS(){return bounds.yaml;}};
});

import type {RunEvent} from "./events.js";
import {codePoints} from "./instruction-memory-cap.js";
import {ObservedInstructions} from "./observed-instructions.js";

const event=(body:Record<string,unknown>):RunEvent=>({v:1,run:"yaml-bounds",t:"2026-10-28T00:00:00.000Z",turn:1,...body}) as unknown as RunEvent;
function deliver(memory:ObservedInstructions,seq:number,story:string,location="ROUTE104",known=true):void {
 memory.observe(event({seq,type:"dialogue_auto_advance",tool_call_id:`call-${String(seq)}`,tool:"press",requested:[],sent:[],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"FAR",map_id:[9,9],position:null,speaker:known?"MOM":"BOY_1",speaker_source:known?"name_prefix":"faced_sprite",text:`${known?"MOM:":"Someone lives in town."} whole episode ${String(seq)} ${"a".repeat(80)}`}],stop:"field_control",detail:"",duration_ms:1}));
 memory.observe(event({seq:seq+1,type:"tool_result",id:`call-${String(seq)}`,name:"press",is_error:false,text:`Location: ${location}\nStory: ${story}`,state_seq:null}));
}

describe("YAML cap measures every delivered form",()=>{
 it("keeps current progress and visit history out of place-only YAML",()=>{
  const memory=new ObservedInstructions(false,false,true,true,false,true),places=new ObservedInstructions(true,true);
  for(const owner of [memory,places])deliver(owner,10,"progress from an unrelated owner","ROUTE104",false);
  expect(memory.archive()).toEqual([]);
  const text=memory.text(places.placeEpisodes());
  expect(text).toContain("speaker: BOY_1");
  expect(text).not.toMatch(/^(?:current|current_left_out|observed_locations|earlier_locations_left_out):/m);
 });

 it("leaves oversized current progress out whole and reports it",()=>{
  const memory=new ObservedInstructions(true,true,true,true,false,true);
  deliver(memory,10,"x".repeat(2200));
  const text=memory.text();
  expect(codePoints(text??"")).toBeLessThanOrEqual(bounds.yaml);
  expect(text).toContain("\ncurrent: null\ncurrent_left_out: true");
 });
 it("retains current progress that fits YAML's budget even when it would exceed JSON's",()=>{
  const memory=new ObservedInstructions(true,true,true,true,false,true),story="x".repeat(900);
  deliver(memory,10,story);
  const text=memory.text();
  expect(text).toContain(`story: ${story}`);
  expect(text).not.toContain("current_left_out");
  expect(codePoints(text??"")).toBeLessThanOrEqual(bounds.yaml);
 });
 it.each([true,false])("bounds locations and preserves their omission count with retention=%s",trim=>{
  const memory=new ObservedInstructions(true,trim,true,true,false,true);
  for(let i=0;i<4;i++)deliver(memory,10+i*2,"ok",`${"L".repeat(50)}${String(i)}`);
  const text=memory.text(memory.archive());
  expect(codePoints(text??"")).toBeLessThanOrEqual(bounds.yaml);
  expect(text).toMatch(/^[1-4] other episodes are left out and remain in the run recording\.$/m);
  if(!trim)expect(text).toMatch(/\nearlier_locations_left_out: [1-4]$/);
 });
 it("keeps the unchanged legacy form under its existing JSON cap",()=>{
  const memory=new ObservedInstructions(true,false,true,true,false,true);
  for(let i=0;i<5;i++)deliver(memory,10+i*2,"x".repeat(2200));
  const text=memory.text();
  expect(codePoints(text??"")).toBeLessThanOrEqual(bounds.json);
  expect(text).toContain("observed_instruction_episodes:");
  expect(text).toContain("current_left_out: true");
 });
});
