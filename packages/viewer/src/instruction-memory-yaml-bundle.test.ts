import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {armFeatures,armPreset,parseFixedDefinition} from "./fixed-design.js";

const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"] as const;
it.each(CURRENT)("%s enables instruction-memory YAML only in the bundle",name=>{
 const definition=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
 const id="instruction-memory-yaml-v1";
 expect(definition.switches).toContain(id);
 for(const arm of ["control","bundle"] as const){
  const features=armFeatures(definition,arm);
  expect(features[id],`${name}/${arm}`).toBe(arm==="bundle");
  if(arm==="bundle"){
   expect(features["observed-instructions-v1"]).toBe(true);
   expect(features["instruction-memory-cap-v1"]).toBe(true);
   expect(features["instruction-goal-ledger-v1"]).toBe(false);
   expect(features["milestone-instruction-memory-v1"]||features["instruction-memory-dedup-v1"]).toBe(true);
  }
  for(const phase of definition.phases)expect(armPreset(definition,phase.id,arm).features[id],`${name}/${phase.id}/${arm}`).toBe(arm==="bundle");
 }
});
