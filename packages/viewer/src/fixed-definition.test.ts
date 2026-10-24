import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {armFeatures,parseFixedDefinition,materializeFixedSource} from "./fixed-design.js";
import {readFixedDefinition} from "./fixed-definition.js";
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
it("all maintained future protocols reference one feature owner, including bundle-only NPC support",()=>{
 const loaded=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"].map(id=>{
  const source=JSON.parse(readFileSync(join(root,`experiments/fixed/${id}.json`),"utf8")) as {featureRecipe?:string;base:{features?:unknown};switches?:unknown};
  expect(source.featureRecipe,id).toBe("current");expect(source.base.features,id).toBeUndefined();expect(source.switches,id).toBeUndefined();return readFixedDefinition(root,id).definition;
 });
 const baseline=loaded[0];if(baseline===undefined)throw new Error("missing protocol");
 for(const d of loaded)for(const arm of ["control","bundle"] as const){
  expect(armFeatures(d,arm),d.id).toEqual(armFeatures(baseline,arm));
  expect(armFeatures(d,arm)["moving-npc-target-v1"],d.id).toBe(arm==="bundle");
 }
 for(const id of ["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  expect(existsSync(join(root,`experiments/fixed/${id}.json`))).toBe(false);
  const archived=readFileSync(join(root,`experiments/archive/fixed/${id}.json`),"utf8");
  expect(parseFixedDefinition(archived).definition.id).toBe(id);
 }
});
