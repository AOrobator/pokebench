import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parseFixedDefinition,materializeFixedSource} from "./fixed-design.js";
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
it.each([
 {recipe:"other",path:"experiments/feature-configs/archive/current-000000000000.json",sha256:"0".repeat(64)},
 {recipe:"current",path:"../../outside.json",sha256:"0".repeat(64)},
 {recipe:"current",path:"experiments/feature-configs/archive/current-000000000000.json",sha256:"bad"},
 {recipe:"current",path:"experiments/feature-configs/archive/current-000000000000.json",sha256:"0".repeat(64),extra:true},
])("rejects malformed ancestry before reading its source: %j",derivedFrom=>{
 expect(()=>parseFixedDefinition(JSON.stringify({...definition(),derivedFrom}))).toThrow();
});
