import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {armPreset,parseFixedDefinition,definitionProblems,controlBaseProblems} from "./fixed-design.js";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
const ID="player-map-visibility-v1";
it("enables visibility in both generated current arms while preserving frozen historical defaults",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url))).definition;
 expect(def.onInBoth).toContain(ID);
 expect(def.switches).not.toContain(ID);
 expect(definitionProblems(def)).toEqual([]);
 const base=recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url));
 expect(controlBaseProblems(def,base)).toEqual([]);
 for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
  expect(presetFeatures(parsePlayPreset(armPreset(def,phase.id,arm)))[ID]).toBe(true);
 }
});
