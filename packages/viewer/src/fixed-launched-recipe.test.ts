import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import current from "../../../experiments/feature-configs/current.json" with {type:"json"};
import overlay from "../../../experiments/feature-configs/rayquaza-lane.json" with {type:"json"};
import v3 from "../../../experiments/fixed/rayquaza-lane-8h-v3.json" with {type:"json"};
import launchedCurrent from "../test-support/recipes-frozen/current-36826cea3.json" with {type:"json"};
import {armFeatureBits,armPreset,FixedDesignError,parseFixedDefinition,resolveFeatureRecipe,type FixedArm,type FixedDefinition} from "./fixed-design.js";
import {classifyTrial} from "./fixed-ledger.js";
import {frozenRecipeToWrite,launchedRecipeReader,presetToUse,type LaunchedRecipeReads} from "./fixed-launched-recipe.js";

const JUNK="instruction-memory-junk-filter-v1";
const sha256=(text:string):string=>createHash("sha256").update(text).digest("hex");
const recipes=(base:unknown)=>(id:string):string=>{
 if(id==="rayquaza-lane")return resolveFeatureRecipe(JSON.stringify(overlay),()=>JSON.stringify(base));
 throw new Error(`no recipe ${id}`);
};
const source=JSON.stringify(v3);
const atLaunch=parseFixedDefinition(source,recipes(launchedCurrent)).definition;
const presetText=(def:FixedDefinition,arm:FixedArm):string=>`${JSON.stringify(armPreset(def,"cook",arm),null,1)}\n`;
const launch=(presetSha256:string):string=>JSON.stringify({kind:"launch",slot:1,lane:"A",phase:"cook",arm:"bundle",run:"r1",at:"2026-11-06T15:33:12.346Z",commit:"c",sources:"s",presetSha256,serving:"v"});
const launched=launch(sha256(presetText(atLaunch,"bundle")));
function reads(over:Partial<LaunchedRecipeReads>={}):LaunchedRecipeReads {
 return {ledgerText:()=>launched,frozenText:()=>null,presetText:name=>name==="cook-bundle.json"?presetText(atLaunch,"bundle"):name==="cook-control.json"?presetText(atLaunch,"control"):null,...over};
}
function runLog():string {
 const preset=armPreset(atLaunch,"cook","bundle");
 const start={v:1,run:"r1",seq:0,t:"2026-11-06T10:33:12.000-05:00",type:"run_start",rom_sha1:atLaunch.romSha1,start_state:{kind:"boot"},budgets:{max_wall_ms:28_800_000},isolation:{port:8076},model:{id:atLaunch.serving.model},evaluation:{preset_id:preset.id,target:null,reply_failures_end_run:false,features:preset.features}};
 const end={v:1,run:"r1",seq:1,t:"2026-11-06T18:33:12.000-05:00",type:"run_end",reason:"wall_cap"};
 return `${JSON.stringify(start)}\n${JSON.stringify(end)}\n`;
}
const expectation=(def:FixedDefinition)=>({maxWallMs:28_800_000,primary:def.primaryMilestone,presetId:armPreset(def,"cook","bundle").id,features:armFeatureBits(def,"bundle")});

describe("a launched lane keeps what it launched",()=>{
 it("re-resolving after control promotes a switch would invalidate a correct run",()=>{
  const moved=parseFixedDefinition(source,recipes(current)).definition;
  expect(armFeatureBits(moved,"bundle")[JUNK]).toBe(true);
  const outcome=classifyTrial(runLog(),expectation(moved),0);
  expect(outcome.valid).toBe(false);
  expect(outcome.reason).toContain(JUNK);
 });
 it.each([
  ["derived from the launch's presets",():LaunchedRecipeReads=>reads()],
  ["read from the stored recipe",():LaunchedRecipeReads=>reads({frozenText:()=>recipes(launchedCurrent)("rayquaza-lane"),presetText:()=>null})],
 ])("stays valid after control promotes a switch and the runner reloads: %s",(_name,make)=>{
  const reloaded=parseFixedDefinition(source,launchedRecipeReader(make(),recipes(current),source)).definition;
  expect(armFeatureBits(reloaded,"bundle")[JUNK]??false).toBe(false);
  const outcome=classifyTrial(runLog(),expectation(reloaded),0);
  expect(outcome.reason).not.toContain("does not match the plan");
  expect(outcome.valid).toBe(true);
  for(const arm of ["bundle","control"] as const)expect(armPreset(reloaded,"cook",arm).features).toEqual(armPreset(atLaunch,"cook",arm).features);
 });
 it("rewrites no byte of a preset derived from itself",()=>{
  const reloaded=parseFixedDefinition(source,launchedRecipeReader(reads(),recipes(current),source)).definition;
  for(const arm of ["bundle","control"] as const)expect(presetText(reloaded,arm)).toBe(presetText(atLaunch,arm));
 });
 it("keeps the definition's ROM when the base's ROM has moved on",()=>{
  const moved={...current,romSha1:"0".repeat(40)};
  const out=parseFixedDefinition(source,launchedRecipeReader(reads(),recipes(moved),source)).definition;
  expect(out.romSha1).toBe(v3.romSha1);
 });
 it("validates and derives from one read of each preset",()=>{
  const seen:string[]=[];
  const counted=reads();
  const presets=(name:string):string|null=>{seen.push(name);return counted.presetText(name);};
  parseFixedDefinition(source,launchedRecipeReader({...counted,presetText:presets},recipes(current),source));
  expect(seen.sort()).toEqual(["cook-bundle.json","cook-control.json"]);
 });
 it("a fresh experiment resolves live",()=>{
  for(const ledgerText of [():string|null=>null,():string=>""]){
   const out=parseFixedDefinition(source,launchedRecipeReader(reads({ledgerText}),recipes(current),source)).definition;
   expect(armFeatureBits(out,"bundle")[JUNK]).toBe(true);
  }
 });
 it("ignores a stored recipe left by a runner that never launched",()=>{
  const out=parseFixedDefinition(source,launchedRecipeReader(reads({ledgerText:()=>null,frozenText:()=>recipes(launchedCurrent)("rayquaza-lane")}),recipes(current),source)).definition;
  expect(armFeatureBits(out,"bundle")[JUNK]).toBe(true);
 });
});

describe("deriving from presets fails closed",()=>{
 const reload=(over:Partial<LaunchedRecipeReads>):unknown=>parseFixedDefinition(source,launchedRecipeReader(reads(over),recipes(current),source));
 it("when a preset is missing",()=>{
  expect(()=>reload({presetText:name=>name==="cook-bundle.json"?presetText(atLaunch,"bundle"):null})).toThrow("cook-control.json");
 });
 it("when the launched preset's bytes differ from the ledger",()=>{
  expect(()=>reload({ledgerText:()=>launch("0".repeat(64))})).toThrow("differs from the launch");
 });
 it("when a preset is not a preset",()=>{
  const text=`{"features":{"a":"yes"}}`;
  expect(()=>reload({ledgerText:()=>launch(sha256(text)),presetText:()=>text})).toThrow("not a preset");
 });
 it("when the arms disagree in a way no recipe can",()=>{
  const bundle=JSON.stringify({features:{a:false,b:true}}),control=JSON.stringify({features:{a:true,b:true}});
  expect(()=>reload({ledgerText:()=>launch(sha256(bundle)),presetText:name=>name==="cook-bundle.json"?bundle:control})).toThrow("switch a");
  const fewer=JSON.stringify({features:{b:true}});
  expect(()=>reload({ledgerText:()=>launch(sha256(bundle)),presetText:name=>name==="cook-bundle.json"?bundle:fewer})).toThrow("switch a");
 });
 it("when the ledger is unreadable",()=>{
  expect(()=>reload({ledgerText:()=>"{torn"})).toThrow("ledger");
 });
});

describe("what a real start writes",()=>{
 const text="{}";
 it("stores the recipe for a fresh experiment and refreshes one that never launched",()=>{
  expect(frozenRecipeToWrite(reads({ledgerText:()=>null}),text)).toBe(text);
  expect(frozenRecipeToWrite(reads({ledgerText:()=>null,frozenText:()=>"old"}),text)).toBe(text);
 });
 it("stores a recipe derived on the first restart of an experiment launched without one",()=>{
  expect(frozenRecipeToWrite(reads(),text)).toBe(text);
 });
 it("never replaces a launched experiment's stored recipe",()=>{
  expect(frozenRecipeToWrite(reads({frozenText:()=>"kept"}),text)).toBeNull();
 });
 it("writes nothing for a complete definition",()=>{
  expect(frozenRecipeToWrite(reads(),null)).toBeNull();
 });
});

describe("presetToUse",()=>{
 const preset=(features:Record<string,boolean>,maxWallMs=1):string=>JSON.stringify({id:"p",limits:{maxWallMs},features});
 const kept=preset({a:true,b:false}),generated=preset({b:false,a:true},2);
 it("keeps a launched experiment's preset bytes when nothing changed",()=>{
  expect(presetToUse(true,kept,kept)).toEqual({text:kept,write:false});
 });
 it("takes a schedule edit after launch, so the trial plays what the runner expects",()=>{
  expect(presetToUse(true,kept,generated)).toEqual({text:generated,write:true});
 });
 it("fails before any launch when a kept preset no longer matches the launched recipe",()=>{
  const run=()=>presetToUse(true,preset({a:false,b:false}),generated);
  expect(run).toThrow(FixedDesignError);
  expect(run).toThrow("differs from the launched recipe");
  expect(()=>presetToUse(true,"not json",generated)).toThrow(FixedDesignError);
 });
 it("writes a preset a launched experiment does not have yet",()=>{
  expect(presetToUse(true,null,generated)).toEqual({text:generated,write:true});
 });
 it("regenerates before any launch",()=>{
  expect(presetToUse(false,"old",generated)).toEqual({text:generated,write:true});
 });
});
