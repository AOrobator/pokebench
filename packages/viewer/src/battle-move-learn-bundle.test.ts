import {recipeText} from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const CURRENT=new Set(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"]);
for (const name of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "glm53-flash-4h"]) {
 it(`${name}: native move-learning input is enabled in normalized bundle, and in control once promoted`, () => {
  const {definition} = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url),"utf8"));
  expect(controlBaseProblems(definition,recipeText(new URL(`../../../${definition.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
  for(const phase of definition.phases) {
   expect(presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")))["delivered-place-evidence-v1"]).toBe(false);
   expect(presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")))["delivered-place-evidence-v1"]).toBe(true);
   expect(presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")))["battle-move-learn-input-v1"]).toBe(CURRENT.has(name));
   expect(presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")))["battle-move-learn-input-v1"]).toBe(true);
  }
 });
}
