import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {armPreset,controlBaseProblems,definitionProblems,parseFixedDefinition} from "./fixed-design.js";

const DEFINITIONS=["glm53-flash-1h","glm53-flash-2h","glm53-flash-4h","bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-1h-v8","bundle-v-control-2h","whole-map-pair-2h","random-starter-2h","gym-rustboro-torchic"];
describe("future terrain gate fixes in both arms",()=>{
 for(const name of DEFINITIONS)it(name,()=>{
  const read=(p:string):string=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
  const def=parseFixedDefinition(read(`experiments/fixed/${name}.json`)).definition;
  expect(definitionProblems(def)).toEqual([]);
  expect(controlBaseProblems(def,read(def.controlBase.path))).toEqual([]);
  expect(def.switches).not.toContain("field-move-gates-v1");
  expect(def.onInBoth).toContain("field-move-gates-v1");
  for(const phase of def.phases)for(const arm of ["control","bundle"] as const)expect(armPreset(def,phase.id,arm).features["field-move-gates-v1"]).toBe(true);
 });
});
