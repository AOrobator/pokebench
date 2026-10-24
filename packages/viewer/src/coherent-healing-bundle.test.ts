import {recipeText} from "../test-support/recipe-text.js";
import {expect,it} from "vitest";
import {parsePlayPreset} from "@pokebench/agent/play-preset";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";

it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h","glm53-flash-4h"])("enables coherent healing only in the normalized %s bundle",name=>{
 const {definition}=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
 const phase=definition.phases[0];
 if(phase===undefined)throw new Error("missing phase");
 for(const arm of ["bundle","control"] as const){
  const preset=parsePlayPreset(armPreset(definition,phase.id,arm));
  if(preset.version!==2)throw new Error("expected v2");
  expect(preset.features["coherent-healing-feedback-v1"]).toBe(arm==="bundle");
 }
});
