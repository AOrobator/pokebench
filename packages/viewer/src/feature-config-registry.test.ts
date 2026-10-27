import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {SWITCHABLE_FEATURES} from "@pokebench/agent/features";

const recipe=JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/feature-configs/current.json",import.meta.url)),"utf8")) as {switches:string[];offInBoth:string[];onInBoth:string[];features:Record<string,boolean>};

it("names only registered switches, each once, in one role, with features that agree with the role",()=>{
 const registered=new Set<string>(SWITCHABLE_FEATURES);
 const roles=[recipe.switches,recipe.offInBoth,recipe.onInBoth];
 for(const ids of roles){
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.filter(id=>!registered.has(id))).toEqual([]);
 }
 expect(new Set(roles.flat()).size).toBe(roles.flat().length);
 expect(Object.keys(recipe.features).filter(id=>!registered.has(id))).toEqual([]);
 for(const id of recipe.onInBoth)expect(recipe.features[id]).toBe(true);
 for(const id of recipe.offInBoth)expect(recipe.features[id]).toBe(false);
});
