import {recipeText} from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { armFeatures, armPreset, definitionProblems, parseFixedDefinition } from "./fixed-design.js";
import { serverFeatureEnv } from "@pokebench/agent/features";

// the operator 2026-10-27 (a702 POKéNAV Match Call analysis): both correctness fixes run in control and bundle.
const IDS = ["pokenav-short-list-v1", "menu-option-honest-refusal-v1"] as const;
const CURRENT = ["bundle-v-control", "bundle-v-control-2h", "glm53-flash-4h", "hyperqwen-control-3h"] as const;

it.each(CURRENT)("current recipe %s turns both PokéNav correctness switches on in both arms", name => {
  const d = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")).definition;
  expect(definitionProblems(d), name).toEqual([]);
  for (const id of IDS) {
    expect(d.switches, `${name}/${id}`).not.toContain(id);
    for (const arm of ["control", "bundle"] as const) {
      expect(armFeatures(d, arm)[id], `${name}/${arm}/${id}`).toBe(true);
      for (const phase of d.phases) expect(armPreset(d, phase.id, arm).features[id], `${name}/${phase.id}/${arm}/${id}`).toBe(true);
    }
    for (const arm of ["control", "bundle"] as const) expect(serverFeatureEnv(armFeatures(d, arm)).POKEBENCH_FEATURES_OFF.split(",")).not.toContain("pokenav-short-list-v1");
  }
});
