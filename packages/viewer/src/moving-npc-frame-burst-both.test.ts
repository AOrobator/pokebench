import { recipeText } from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { armFeatures, armPreset, parseFixedDefinition } from "./fixed-design.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

// the operator 2026-11-01: the control and bundle arms differ only by the recipe's switches, and the frame
// burst is harness support (the model gets up to six chronological frames while an NPC moves),
// not a treatment, so both arms get it. Registry default stays off.
const ID = "moving-npc-frame-burst-v1";
const CURRENT = ["bundle-v-control", "bundle-v-control-2h", "glm53-flash-4h", "hyperqwen-control-3h"] as const;

it.each(CURRENT)("current recipe %s gives the moving-NPC frame burst to both arms", name => {
  const d = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")).definition;
  expect(d.switches).not.toContain(ID);
  expect(d.onInBoth).toContain(ID);
  expect(d.offInBoth).not.toContain(ID);
  expect(d.base.features[ID]).toBe(true);
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
  for (const arm of ["control", "bundle"] as const) {
    expect(armFeatures(d, arm)[ID], `${name}/${arm}`).toBe(true);
    for (const phase of d.phases) expect(armPreset(d, phase.id, arm).features[ID], `${name}/${phase.id}/${arm}`).toBe(true);
  }
});

it("keeps the burst beside moving-npc-target-v1, the switch it reads, in both arms", () => {
  const d = parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control.json", import.meta.url), "utf8")).definition;
  // moving-npc-target-v1 is the switch the burst reads; both arms carry it too.
  expect(d.base.features["moving-npc-target-v1"]).toBe(true);
  expect(d.onInBoth).toContain("moving-npc-target-v1");
});
