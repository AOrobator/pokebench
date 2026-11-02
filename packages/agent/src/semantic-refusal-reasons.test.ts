// semantic-refusal-reasons-v1: a refused navigate_to_target names the cause and the exits that do work.
// The state is the recorded one from 2026-10-17T11-15-07_qwen36-gpu0_0e05 seq 22544 (fixtures/exit-reach-states.json.gz),
// on ROUTE104 at (25,42): the PETALBURG WOODS door at (32,42) is a separate walled pocket, the doors at (10,38)/(11,38) and
// the house at (17,50) are on foot. The 2026-11-02 run asked for that same door six times in eight turns and was told only
// "no supported route to a valid approach" each time, so nothing in the answer told it which exit did work.
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {FEATURES,featureInfo,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
import {withNavigation} from "./navigation.js";
import {withSemanticNavigation} from "./semantic-navigation.js";

const ID="semantic-refusal-reasons-v1";
interface Fixture {readonly states:Record<string,unknown>;readonly map_grids:Record<string,unknown>}
const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/exit-reach-states.json.gz",import.meta.url))).toString("utf8")) as Fixture;
const KEY="0e05:22544";
const STATE=parseGameState({...(FIXTURE.states[KEY] as object),map_grid:FIXTURE.map_grids[KEY]});
const BASE:FeatureSet={...ALL_ON,"bounded-navigation-v1":true,"full-map-navigation-v1":true,"exit-reachability-v1":true,"semantic-navigation-v2":true};

// The production factory over tools that never touch a game server; only navigate_to_target answers.
async function refusal(features:FeatureSet,target:unknown,state:GameStateSnapshot=STATE):Promise<{text:string;details:unknown}> {
 const result=():Promise<AgentToolResult<unknown>>=>Promise.resolve({content:[{type:"text",text:"observed"}],details:{state}});
 const observe={name:"observe",label:"o",description:"o",parameters:{},execute:result} as unknown as AgentTool;
 const press={name:"press",label:"p",description:"p",parameters:{},execute:()=>{throw new Error("no press");},executeChecked:()=>{throw new Error("no press");}} as unknown as CheckedPressTool;
 const source={read:()=>Promise.resolve(state)};
 const tools=withSemanticNavigation(withNavigation([observe,press],features,source),features,source);
 const tool=tools.find(item=>item.name==="navigate_to_target");
 if(tool===undefined)throw new Error("no navigate_to_target");
 const out=await tool.execute("t",{map_id:[0,19],target});
 const first=out.content[0];
 return {text:first?.type==="text"?first.text:"",details:out.details};
}
const receipt=(details:unknown):{refused?:boolean;refusal?:{cause:string;alternatives:string[]}}|undefined=>{
 const semantic=typeof details==="object"&&details!==null&&"semantic_navigation" in details?details.semantic_navigation:undefined;
 return typeof semantic==="object"&&semantic!==null?semantic as never:undefined;
};

describe("a refused semantic navigation says why and what would work",()=>{
 it("OFF: the generic sentence it says today, with no cause and no alternatives",async()=>{
  const {text,details}=await refusal({...BASE,[ID]:false},{kind:"warp",x:32,y:42});
  expect(text).toContain("no supported route to a valid approach");
  expect(text).not.toContain("cannot be walked to");
  expect(receipt(details)?.refused).toBeUndefined();
  expect(receipt(details)?.refusal).toBeUndefined();
 });
 it("ON: names the flood's cause and lists the exits on this map you can walk to, nearest first",async()=>{
  const {text,details}=await refusal({...BASE,[ID]:true},{kind:"warp",x:32,y:42});
  expect(text).toContain("no supported route to a valid approach");
  expect(text).toContain("(32,42) cannot be walked to from (25,42) on foot or across water, so no route on this map reaches it");
  expect(text).toContain("exits you can walk to from here, nearest first:");
  // Both Petalburg Woods doors are reachable and nearer than the house; the sealed door is never offered.
  expect(text).toMatch(/\(10,38\) \(\d+ steps\) into map 24\/11/);
  expect(text).toContain("(11,38)");
  expect(text).toContain("(17,50)");
  expect(text).not.toContain("(32,42) (");
  const cause=receipt(details)?.refusal;
  expect(receipt(details)?.refused).toBe(true);
  expect(cause?.cause).toBe("(32,42) cannot be walked to from (25,42) on foot or across water, so no route on this map reaches it");
  expect(cause?.alternatives.length).toBeLessThanOrEqual(3);
  // Nearest first is by walked steps: the house is 18 steps, the woods doors are further.
  expect(cause?.alternatives[0]).toMatch(/^\(17,50\) \(18 steps\)/);
  const steps=cause?.alternatives.map(entry=>Number(/\((\d+) steps\)/.exec(entry)?.[1]))??[];
  expect(steps).toEqual([...steps].sort((a,b)=>a-b));
 });
 it("ON: a connection that cannot be walked to says so for that edge, and still lists the exits that work",async()=>{
  const {text}=await refusal({...BASE,[ID]:true},{kind:"connection",direction:"NORTH"});
  expect(text).toContain("no walkable way on this map leads from (25,42) to the NORTH edge, on foot or across water");
  expect(text).toContain("(10,38)");
 });
 it("ON: with no reachable exit it says so instead of listing nothing",async()=>{
  const sealed={...STATE,exit_reach:STATE.exit_reach===null?null:{...STATE.exit_reach,warps:STATE.exit_reach.warps.map(w=>({...w,reach:"none" as const}))}} as GameStateSnapshot;
  const {text}=await refusal({...BASE,[ID]:true},{kind:"warp",x:32,y:42},sealed);
  expect(text).toContain("no exit listed on this map can be walked to from here");
 });
});

describe("registry and recipe",()=>{
 it("is a guidance switch with no hard dependency that says what OFF does",()=>{
  expect(FEATURES.filter(feature=>feature.id===ID)).toHaveLength(1);
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
 });
});
