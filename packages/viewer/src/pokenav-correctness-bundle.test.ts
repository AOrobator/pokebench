import {recipeText} from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { armFeatures, armPreset, parseFixedDefinition } from "./fixed-design.js";
import { serverFeatureEnv } from "@pokebench/agent/features";

// the operator 2026-10-27 (a702 POKéNAV Match Call analysis): both correctness fixes run in control and bundle.
const IDS = ["pokenav-short-list-v1", "menu-option-honest-refusal-v1"] as const;
const CURRENT = ["bundle-v-control", "bundle-v-control-2h", "glm53-flash-4h", "hyperqwen-control-3h"] as const;

it.each(CURRENT)("current recipe %s turns both PokéNav correctness switches on in both arms", name => {
  // parseFixedDefinition throws on any definitionProblems, so the definition is validated once here.
  const d = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")).definition;
  for (const id of IDS) expect(d.switches, `${name}/${id}`).not.toContain(id);
  for (const arm of ["control", "bundle"] as const) {
    const features = armFeatures(d, arm);
    for (const id of IDS) expect(features[id], `${name}/${arm}/${id}`).toBe(true);
    for (const phase of d.phases) {
      const preset = armPreset(d, phase.id, arm).features;
      for (const id of IDS) expect(preset[id], `${name}/${phase.id}/${arm}/${id}`).toBe(true);
      expect(serverFeatureEnv(preset).POKEBENCH_FEATURES_OFF.split(","), `${name}/${phase.id}/${arm}`).not.toContain("pokenav-short-list-v1");
    }
  }
});

it.each(CURRENT)("current recipe %s turns call auto-advance on in both arms",name=>{
 const d=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
 const id="pokenav-call-auto-advance-v1";
 expect(d.switches).not.toContain(id);
 expect(d.onInBoth).toContain(id);
 for(const arm of ["control","bundle"] as const){
  expect(armFeatures(d,arm)[id],`${name}/${arm}`).toBe(true);
  for(const phase of d.phases)expect(armPreset(d,phase.id,arm).features[id]).toBe(true);
 }
});
