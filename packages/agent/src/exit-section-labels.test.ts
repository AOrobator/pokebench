import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {parseGameState} from "./game-state.js";
import {sectionWarp,sectionConnection} from "./exit-section-labels.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {HarnessTrust} from "./harness-trust.js";
import {UntakenExits} from "./untaken-exits.js";
import {normalizeFeatures} from "./play-preset.js";
import {ALL_ON,FEATURES,SERVER_FEATURES,playHarnessFeatures} from "./features.js";
import type {Place} from "./story-destinations.js";

const raw:unknown=JSON.parse(readFileSync(new URL("./fixtures/exit-sections-b300.json",import.meta.url),"utf8"));
if(typeof raw!=="object"||raw===null||!("18814" in raw)||!("18834" in raw))throw new Error("fixture cases missing");
const woods=parseGameState(raw["18814"]),route=parseGameState(raw["18834"]);
const features=normalizeFeatures({...ALL_ON,"exit-labels-v3":true,"exit-labels-v2":true});
const places:Place[]=[{map_id:[24,11],name:"PETALBURG WOODS",display:"PETALBURG WOODS",warps:[],connections:[]},{map_id:[0,19],name:"ROUTE104",display:"ROUTE 104",warps:[{x:17,y:50,to:[17,0]},{x:10,y:38,to:[24,11]},{x:11,y:38,to:[24,11]}],connections:[]}];

describe("exit-labels-v3 shared recorded descriptions",()=>{
 it("registers as a separate treatment and stays OFF when omitted",()=>{
  const {"exit-labels-v3":wasEnabled,...old}=ALL_ON;
  expect(wasEnabled).toBe(true);
  expect(normalizeFeatures(old)["exit-labels-v3"]).toBe(false);
  expect(FEATURES.find(f=>f.id==="exit-labels-v3")?.needs).toBe("exit-labels-v2");
  expect(SERVER_FEATURES).toContain("exit-labels-v3");
  expect(playHarnessFeatures(features,null)).toContain("exit-labels-v3");
 });
 it("preserves exact physical exit and destination-section identity",()=>{
  const north=sectionWarp(woods,14,5,true),south=sectionWarp(woods,16,38,true);
  expect(north).toContain("terrain section");expect(south).toContain("terrain section");expect(north).not.toBe(south);
  expect(sectionWarp(woods,14,5,false)).toBeNull();expect(sectionWarp(woods,-1,-1,true)).toBeNull();
  expect(sectionWarp({},14,5,true)).toBeNull();
 });
 it("matches connection offset and destination, never direction alone",()=>{
  const c=route.exit_sections?.connections[0];if(c===undefined)throw new Error("no connections");
  expect(sectionConnection(route,c,true)).toBe(c.label);
  expect(sectionConnection(route,c,false)).toBeNull();
  expect(sectionConnection(route,{...c,offset:c.offset+1},true)).toBeNull();
  expect(sectionConnection(route,{...c,destination:[99,99]},true)).toBeNull();
 });
 it("delivers shared labels in the actual prominent header, preserving OFF",()=>{
  const on=new HarnessTrust({supervisor:false,exitSections:true});
  const off=new HarnessTrust({supervisor:false});
  const label=sectionWarp(route,10,38,true);if(label===null)throw new Error("missing warp");
  expect(on.lines("",route,"x",places).header).toContain(label);
  expect(off.lines("",route,"x",places).header).not.toContain("terrain section");
  expect(on.lines("",route,"x",places).header).toContain("(10,38)");
  expect(on.lines("",route,"x",places).header).toContain("(11,38)");
 });
 it("delivers the same labels through the unvisited-exit annotation",()=>{
  const on=new UntakenExits(features),off=new UntakenExits({...features,"exit-labels-v3":false});
  expect(on.line(route,"" )).toContain(sectionWarp(route,10,38,true));
  expect(off.line(route,"" )).not.toContain("terrain section");
 });
 it("delivers the shared current section and exits in a supervisor briefing",()=>{
  const on=new SupervisorBriefing({...features,"positive-supervisor-v1":false,"supervisor-briefing-v2":false});
  on.observe({...route,v:1,run:"section-replay",type:"state",seq:1,turn:1,t:"2026-10-20T21:20:24-04:00"});
  on.observe({v:1,run:"section-replay",type:"tool_result",seq:2,turn:1,t:"2026-10-20T21:20:24-04:00",state_seq:1,name:"observe",id:"x",is_error:false,duration_ms:1,text:"",frames:[]});
  const text=on.stallText({kind:"milestone_drought",minutes:5},2);
  expect(text).toContain(route.exit_sections?.current);
  expect(text).toContain(sectionWarp(route,10,38,true));
 });

});
