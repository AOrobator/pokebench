import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {armFeatureBits,armFeatures,parseFixedDefinition,materializeFixedSource} from "./fixed-design.js";
import {readFixedDefinition,readFeatureRecipe} from "./fixed-definition.js";
import {definition} from "../test-support/fixed.js";
const root=fileURLToPath(new URL("../../../",import.meta.url));
function sources(){
 const full=definition();
 const {controlBase,switches,offInBoth,onInBoth,base,...protocol}=full;
 const {features,...baseProtocol}=base;
 return {full,source:{...protocol,base:baseProtocol,featureRecipe:"current"},recipe:{version:1,id:"current",romSha1:full.romSha1,controlBase,features,switches,offInBoth,onInBoth}};
}
it("materializes schedule and shared features into a complete standalone definition",()=>{
 const {full,source,recipe}=sources();
 const out=parseFixedDefinition(JSON.stringify(source),()=>JSON.stringify(recipe));
 expect(out.definition).toEqual(full);
 expect(parseFixedDefinition(JSON.stringify(out.definition)).definition).toEqual(full);
});
it("retains byte-exact hashes for complete historical definitions without reading a recipe",()=>{
 const text=JSON.stringify(definition());
 const out=parseFixedDefinition(text,()=>{throw new Error("historical parse must not read current config");});
 expect(out.sha256).toBe(createHash("sha256").update(text).digest("hex"));
});
it.each(["missing","traversal","wrong-id","wrong-rom","duplicate-fields"] as const)("fails closed for %s",kind=>{
 const {source,recipe}=sources();
 const input=kind==="traversal"?{...source,featureRecipe:"../outside"}:kind==="duplicate-fields"?{...source,switches:[]}:source;
 const config=kind==="wrong-id"?{...recipe,id:"other"}:kind==="wrong-rom"?{...recipe,romSha1:"0".repeat(40)}:recipe;
 expect(()=>materializeFixedSource(input,()=>{if(kind==="missing")throw new Error("missing config");return JSON.stringify(config);})).toThrow();
});
it("binds config bytes to approval identity, and keeps schedule-only edits in source",()=>{
 const {source,recipe}=sources();const dir=mkdtempSync(join(tmpdir(),"fixed-features-"));
 try{
  mkdirSync(join(dir,"experiments/fixed"),{recursive:true});mkdirSync(join(dir,"experiments/feature-configs"));
  writeFileSync(join(dir,"experiments/fixed/test.json"),JSON.stringify(source));
  const path=join(dir,"experiments/feature-configs/current.json");writeFileSync(path,JSON.stringify(recipe));
  const first=readFixedDefinition(dir,"test");writeFileSync(path,JSON.stringify(recipe,null,2));const second=readFixedDefinition(dir,"test");
  expect(first.definition).toEqual(second.definition);expect(first.sha256).not.toBe(second.sha256);
  expect(first.featureRecipe?.id).toBe("current");expect(first.featureRecipe?.sha256).toBe(createHash("sha256").update(JSON.stringify(recipe)).digest("hex"));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it("all maintained future protocols reference one feature owner, including both-arm NPC support",()=>{
 const loaded=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"].map(id=>{
  const source=JSON.parse(readFileSync(join(root,`experiments/fixed/${id}.json`),"utf8")) as {featureRecipe?:string;base:{features?:unknown};switches?:unknown};
  expect(source.featureRecipe,id).toBe("current");expect(source.base.features,id).toBeUndefined();expect(source.switches,id).toBeUndefined();return readFixedDefinition(root,id).definition;
 });
 const baseline=loaded[0];if(baseline===undefined)throw new Error("missing protocol");
 for(const d of loaded)for(const arm of ["control","bundle"] as const){
  expect(armFeatures(d,arm),d.id).toEqual(armFeatures(baseline,arm));
  expect(armFeatures(d,arm)["moving-npc-target-v1"],d.id).toBe(true);
  // the operator 2026-10-27 (9:14 PM New York): no-story-foreknowledge-v1 stays on in both arms going forward.
  expect(armFeatures(d,arm)["no-story-foreknowledge-v1"],d.id).toBe(true);
  expect(armFeatureBits(d,arm)["no-story-foreknowledge-v1"],d.id).toBe(true);
 }
 for(const d of loaded){expect(d.onInBoth,d.id).toContain("no-story-foreknowledge-v1");expect(d.switches,d.id).not.toContain("no-story-foreknowledge-v1");}
 for(const id of ["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  expect(existsSync(join(root,`experiments/fixed/${id}.json`))).toBe(false);
  const archived=readFileSync(join(root,`experiments/archive/fixed/${id}.json`),"utf8");
  expect(parseFixedDefinition(archived).definition.id).toBe(id);
 }
});

it("retired protocols remain readable for history but cannot be loaded for new launches",()=>{
 for(const id of ["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  expect(()=>readFixedDefinition(root,id)).toThrow("no definition");
  const historical=readFixedDefinition(root,id,true);
  expect(historical.definition.id).toBe(id);expect(historical.featureRecipe).toBeNull();
 }
});

it("uses the newer control baseline and retains explicit both-arm promotions",()=>{
 const d=readFixedDefinition(root,"bundle-v-control").definition;
 for(const arm of ["control","bundle"] as const){
  const f=armFeatures(d,arm);
  for(const id of ["full-map-navigation-v1","safe-navigation-strides-v1","semantic-navigation-v2","party-item-confirmation-v1","yes-no-answer-readout-v1","blackout-readout-v1","original-speed-pacing-v1","named-warp-destinations-v1","exit-labels-v2","gym-door-label-v1","trigger-navigation-boundary-v1"])expect(f[id],`${arm}: ${id}`).toBe(true);
 }
});
it("rejects unsafe source and recipe identifiers before file access",()=>{
 expect(()=>readFixedDefinition(root,"../outside")).toThrow("invalid definition or recipe id");
 expect(()=>readFeatureRecipe(root,"../outside")).toThrow("invalid definition or recipe id");
});

it("reports missing resolvers, malformed configs and invalid config schemas",()=>{
 const {source,recipe}=sources();
 expect(()=>materializeFixedSource(source)).toThrow("requires a source loader");
 expect(()=>parseFixedDefinition(JSON.stringify(source))).toThrow("requires a source loader");
 expect(()=>parseFixedDefinition(JSON.stringify(source),()=>"not json")).toThrow();
 expect(()=>parseFixedDefinition(JSON.stringify(source),()=>JSON.stringify({...recipe,features:{wrong:"not boolean"}}))).toThrow("invalid feature recipe");
});

it("enables neutral YES/NO controls only in the current bundle",()=>{
 for(const name of ["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"]){
  const d=readFixedDefinition(root,name).definition;
  expect(armFeatures(d,"bundle")["neutral-yes-no-readout-v1"],name).toBe(true);
  expect(armFeatures(d,"control")["neutral-yes-no-readout-v1"],name).toBe(false);
  expect(armFeatureBits(d,"bundle")["neutral-yes-no-readout-v1"],name).toBe(true);
  expect(d.switches,name).toContain("neutral-yes-no-readout-v1");
 }
});
