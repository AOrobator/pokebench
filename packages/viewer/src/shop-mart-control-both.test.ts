import { recipeText } from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { armFeatures, armPreset, parseFixedDefinition } from "./fixed-design.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

// the operator 2026-11-01: promote mart-stock-readout-v1 and shop-interface-v1 into control.
const IDS = ["mart-stock-readout-v1", "shop-interface-v1"] as const;
const CURRENT = ["bundle-v-control", "bundle-v-control-2h", "glm53-flash-4h", "hyperqwen-control-3h"] as const;

it.each(CURRENT)("current recipe %s turns shop/mart readouts on in both arms", name => {
  const d = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")).definition;
  for (const id of IDS) {
    expect(d.switches, `${name}/${id}`).not.toContain(id);
    expect(d.onInBoth, `${name}/${id}`).toContain(id);
    expect(d.base.features[id], `${name}/${id}`).toBe(true);
    expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  }
  for (const arm of ["control", "bundle"] as const) {
    const features = armFeatures(d, arm);
    for (const id of IDS) expect(features[id], `${name}/${arm}/${id}`).toBe(true);
    for (const phase of d.phases) {
      const preset = armPreset(d, phase.id, arm).features;
      for (const id of IDS) expect(preset[id], `${name}/${phase.id}/${arm}/${id}`).toBe(true);
    }
  }
});
