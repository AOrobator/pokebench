import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import current from "../../../experiments/feature-configs/current.json" with {type:"json"};
import overlay from "../../../experiments/feature-configs/rayquaza-lane.json" with {type:"json"};
import v1 from "../../../experiments/fixed/rayquaza-lane-8h.json" with {type:"json"};
import v2 from "../../../experiments/fixed/rayquaza-lane-8h-v2.json" with {type:"json"};
import v3 from "../../../experiments/fixed/rayquaza-lane-8h-v3.json" with {type:"json"};
import frozenCurrent from "../test-support/recipes-frozen/current-36826cea3.json" with {type:"json"};
import frozenLane from "../test-support/recipes-frozen/rayquaza-lane-36826cea3.json" with {type:"json"};
import {readFeatureRecipe} from "./fixed-definition.js";
import {armFeatures,FixedDesignError,materializeFixedSource,parseFixedDefinition,resolveFeatureRecipe,type FeatureRecipe} from "./fixed-design.js";

const LANE_ON=["just-in-time-prompt-v2","jit-guide-reuse-v1","rq-slim-prompt-v1","rq-milestone-guide-v1","rq-battle-explainer-v1","rq-no-grind-note-v1","rq-checkpoint-recovery-v1","rq-mach-dash-v1","foe-trainer-items-v1","league-stock-up-v1"];
const LANE_OFF=["context-exact-count-v1","no-story-foreknowledge-v1","story-route-plan-v1","town-center-checkpoint-v1"];
const reader=(files:Readonly<Record<string,unknown>>)=>(id:string):string=>{
 if(!Object.hasOwn(files,id))throw new Error(`no recipe ${id}`);
 return JSON.stringify(files[id]);
};
const resolved=(lane:unknown,base:unknown):FeatureRecipe=>JSON.parse(resolveFeatureRecipe(JSON.stringify(lane),reader({current:base}))) as FeatureRecipe;
const sorted=(list:readonly string[]):string[]=>[...list].sort();
// The frozen recipes predate this overlay entry.
const atFreeze={...overlay,on:Object.fromEntries(Object.entries(overlay.on).filter(([id])=>id!=="rq-no-grind-note-v1"&&id!=="rq-checkpoint-recovery-v1"&&id!=="rq-mach-dash-v1"&&id!=="foe-trainer-items-v1"&&id!=="league-stock-up-v1"))};
const small={version:1,id:"current",romSha1:"a".repeat(40),controlBase:{path:"p.json",presetId:"p",sha256:"b".repeat(64)},
 switches:["treat-a","treat-b"],offInBoth:["off-a"],onInBoth:["on-a"],features:{"treat-a":false,"treat-b":false,"off-a":false,"on-a":true,"plain":false}};
const because=(ids:readonly string[]):Record<string,string>=>Object.fromEntries(ids.map(id=>[id,"a reason"]));
const lane=(on:readonly string[],off:readonly string[]):object=>({version:1,id:"lane",base:"current",on:because(on),off:because(off)});

describe("the Rayquaza lane overlay",()=>{
 it("is a small overlay naming the lane's differences from current",()=>{
  expect(Object.keys(overlay)).toEqual(["version","id","base","on","off"]);
  expect(overlay.base).toBe("current");
  expect(Object.keys(overlay.on)).toEqual(LANE_ON);
  expect(Object.keys(overlay.off)).toEqual(LANE_OFF);
 });
 it("gives every exception a one-line reason",()=>{
  for(const reason of [...Object.values(overlay.on),...Object.values(overlay.off)])expect(reason).toMatch(/^[^\n]{10,100}$/);
 });
 it("resolves to the hand-kept recipe on every feature, list member and bundle arm",()=>{
  const out=resolved(atFreeze,frozenCurrent);
  expect(out.id).toBe(frozenLane.id);
  expect(out.romSha1).toBe(frozenLane.romSha1);
  expect(out.controlBase).toEqual(frozenLane.controlBase);
  expect(out.features).toEqual(frozenLane.features);
  for(const list of ["switches","offInBoth","onInBoth"] as const)expect(sorted(out[list])).toEqual(sorted(frozenLane[list]));
  const def=(recipe:Pick<FeatureRecipe,"features"|"switches">)=>({base:{features:recipe.features},switches:recipe.switches});
  for(const arm of ["bundle","control"] as const)expect(armFeatures(def(out),arm)).toEqual(armFeatures(def(frozenLane),arm));
 });
 it.each([["v1",v1],["v2",v2],["v3",v3]] as const)("keeps fixed definition %s valid on today's control",(_name,source)=>{
  const {definition}=parseFixedDefinition(JSON.stringify(source),reader({"rayquaza-lane":overlay,current}));
  const bundle=armFeatures(definition,"bundle");
  for(const id of LANE_ON)expect(bundle[id]).toBe(true);
  for(const id of LANE_OFF)expect(bundle[id]).toBe(false);
  const expected={...current.features,...Object.fromEntries(current.switches.map(id=>[id,true])),...Object.fromEntries(LANE_ON.map(id=>[id,true])),...Object.fromEntries(LANE_OFF.map(id=>[id,false]))};
  expect(bundle).toEqual(expected);
 });
});

describe("resolveFeatureRecipe",()=>{
 it("moves on-switches to onInBoth and off-switches to offInBoth, out of the other lists",()=>{
  const out=resolved(lane(["treat-a","off-a","plain"],["treat-b","on-a"]),small);
  expect(out).toEqual({...small,id:"lane",switches:[],offInBoth:["treat-b","on-a"],onInBoth:["treat-a","off-a","plain"],
   features:{"treat-a":true,"treat-b":false,"off-a":true,"on-a":false,"plain":true}});
 });
 it("follows the base: a new control switch and a promotion reach the lane unedited",()=>{
  const moved={...small,switches:["treat-b","treat-new"],onInBoth:["on-a","treat-a"],features:{...small.features,"treat-a":true,"treat-new":false}};
  const out=resolved(lane(["plain"],[]),moved);
  expect(out.switches).toEqual(["treat-b","treat-new"]);
  expect(out.onInBoth).toEqual(["on-a","treat-a","plain"]);
  expect(out.features).toMatchObject({"treat-a":true,"treat-new":false,"plain":true});
 });
 it("returns a complete recipe's own bytes, so existing recipe hashes hold",()=>{
  const text=`${JSON.stringify(small,null,2)}\n`;
  expect(resolveFeatureRecipe(text,()=>{throw new Error("a complete recipe reads no base");})).toBe(text);
 });
 it("names a switch the base does not know",()=>{
  const run=():string=>resolveFeatureRecipe(JSON.stringify(lane(["treat-a"],["ghost-v1"])),reader({current:small}));
  expect(run).toThrow(FixedDesignError);
  expect(run).toThrow("ghost-v1");
 });
 it("names a switch listed both on and off",()=>{
  const run=():string=>resolveFeatureRecipe(JSON.stringify(lane(["treat-a"],["treat-a"])),reader({current:small}));
  expect(run).toThrow(FixedDesignError);
  expect(run).toThrow("treat-a");
 });
 it("refuses a base that is itself an overlay",()=>{
  const run=():string=>resolveFeatureRecipe(JSON.stringify(lane([],[])),reader({current:{version:1,id:"current",base:"other",on:[],off:[]}}));
  expect(run).toThrow(FixedDesignError);
  expect(run).toThrow("itself an overlay");
 });
 it.each([
  ["an unexpected field",{...lane([],[]),features:{}},small,"invalid feature recipe overlay"],
  ["a switch with no reason",{...lane([],[]),on:{"treat-a":""}},small,"invalid feature recipe overlay"],
  ["a blank reason",{...lane([],[]),on:{"treat-a":"  "}},small,"invalid feature recipe overlay"],
  ["a two-line reason",{...lane([],[]),off:{"treat-a":"one\ntwo"}},small,"invalid feature recipe overlay"],
  ["an overlong reason",{...lane([],[]),on:{"treat-a":"x".repeat(121)}},small,"invalid feature recipe overlay"],
  ["a bare switch list",{...lane([],[]),on:["treat-a"]},small,"invalid feature recipe overlay"],
  ["a traversing base id",{...lane([],[]),base:"../outside"},small,"invalid feature recipe overlay"],
  ["an invalid base",lane([],[]),{id:"current"},"invalid feature recipe"],
  ["a base with another identity",lane([],[]),{...small,id:"other"},"base current has identity other"],
 ] as const)("fails closed for %s",(_name,value,base,message)=>{
  expect(()=>resolveFeatureRecipe(JSON.stringify(value),reader({current:base}))).toThrow(message);
 });
});

describe("reading an overlay",()=>{
 const files=(base:unknown)=>reader({"rayquaza-lane":overlay,current:base});
 it("materializes through a raw reader",()=>{
  const out=materializeFixedSource(v3,files(current)) as {switches:string[];onInBoth:string[]};
  expect(out.switches).not.toContain("story-route-plan-v1");
  expect(out.onInBoth).toContain("rq-milestone-guide-v1");
 });
 it("rejects an overlay whose id differs from the reference",()=>{
  expect(()=>materializeFixedSource(v3,reader({"rayquaza-lane":{...overlay,id:"other"},current}))).toThrow("feature recipe identity differs");
 });
 it("hashes the resolved recipe, so a control change shows in the definition digest",()=>{
  const source=JSON.stringify(v3);
  const before=parseFixedDefinition(source,files(current));
  const expected=resolveFeatureRecipe(JSON.stringify(overlay),files(current));
  expect(before.sha256).toBe(createHash("sha256").update(JSON.stringify([source,expected])).digest("hex"));
  const promoted="untalked-in-gym-v1";
  expect(current.switches).toContain(promoted);
  const changed={...current,switches:current.switches.filter(id=>id!==promoted),onInBoth:[...current.onInBoth,promoted],features:{...current.features,[promoted]:true}};
  expect(parseFixedDefinition(source,files(changed)).sha256).not.toBe(before.sha256);
 });
 it("readFeatureRecipe returns the resolved text through its injected reader",()=>{
  const paths:string[]=[];
  const read=(path:string):string=>{paths.push(path);return path.endsWith("rayquaza-lane.json")?JSON.stringify(overlay):JSON.stringify(current);};
  const out=JSON.parse(readFeatureRecipe("/repo","rayquaza-lane",read)) as FeatureRecipe;
  expect(paths).toEqual(["/repo/experiments/feature-configs/rayquaza-lane.json","/repo/experiments/feature-configs/current.json"]);
  expect(out.id).toBe("rayquaza-lane");
  expect(out.onInBoth).toContain("rq-slim-prompt-v1");
 });
 it("readFeatureRecipe keeps a complete recipe's bytes",()=>{
  const text=`${JSON.stringify(small,null,2)}\n`;
  expect(readFeatureRecipe("/repo","current",()=>text)).toBe(text);
 });
});
