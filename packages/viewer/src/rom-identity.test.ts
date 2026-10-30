import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {armPreset,parseFixedDefinition,definitionProblems} from "./fixed-design.js";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {FEATURE_EXPLAINERS} from "./panels.js";
it("retains ROM identity only in future bundle arms and links its tracked explainer",()=>{
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url))).definition;
 expect(definitionProblems(def)).toEqual([]);
 expect(DEFAULT_NEXT_RUN.features["rom-identity-v1"]).toBe(false);
 for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
  expect(presetFeatures(parsePlayPreset(armPreset(def,phase.id,arm)))["rom-identity-v1"]).toBe(arm==="bundle");
 }
 expect(FEATURE_EXPLAINERS["rom-identity-v1"]).toBe("rom-identity-v1.html");
 expect(recipeText(new URL("../../../docs/explainers/rom-identity-v1.html",import.meta.url))).toContain("hash-verified, unmodified ROM");
});
