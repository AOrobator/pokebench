import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { armFeatures, armFeatureBits, armPreset, controlBaseProblems, definitionProblems, parseFixedDefinition } from "./fixed-design.js";

const recipes = ["bundle-v-control", "bundle-v-control-2h", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "gym-rustboro-torchic", "gym-rustboro-torchic-healed", "random-starter-2h"];
const id = "trigger-navigation-boundary-v1";
it.each(recipes)("%s enables trigger boundary navigation in both generated arms", name => {
 const def = parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")).definition;
 expect(definitionProblems(def)).toEqual([]);
 expect(controlBaseProblems(def, readFileSync(new URL(`../../../${def.controlBase.path}`, import.meta.url), "utf8"))).toEqual([]);
 expect(def.onInBoth).toContain(id);
 expect(def.switches).not.toContain(id);
 for (const arm of ["control", "bundle"] as const) {
  expect(armFeatures(def, arm)[id]).toBe(true);
  expect(armFeatureBits(def, arm)[id]).toBe(true);
  for (const phase of def.phases) expect(armPreset(def, phase.id, arm).features[id]).toBe(true);
 }
});
