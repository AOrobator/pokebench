import { recipeText } from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { armFeatures, armPreset, parseFixedDefinition } from "./fixed-design.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

// the operator 2026-11-01: dark-area-flash-reminder-v1 "should be on in both arms".
const ID = "dark-area-flash-reminder-v1";
const CURRENT = ["bundle-v-control", "bundle-v-control-2h", "glm53-flash-4h", "hyperqwen-control-3h"] as const;

it.each(CURRENT)("current recipe %s turns the dark-area FLASH reminder on in both arms", name => {
  const d = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")).definition;
  expect(d.switches).not.toContain(ID);
  expect(d.onInBoth).toContain(ID);
  expect(d.base.features[ID]).toBe(true);
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
  for (const arm of ["control", "bundle"] as const) {
    expect(armFeatures(d, arm)[ID], `${name}/${arm}`).toBe(true);
    for (const phase of d.phases) expect(armPreset(d, phase.id, arm).features[ID], `${name}/${phase.id}/${arm}`).toBe(true);
  }
});
