import {recipeText} from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const IDS = ["menu-item-guidance-v1", "factual-healing-guidance-v1"] as const;
const RECIPES = ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "glm53-flash-4h"];

it.each(RECIPES)("%s enables potion guidance only in future bundle presets", name => {
  const { definition } = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url),"utf8"));
  expect(controlBaseProblems(definition, recipeText(new URL(`../../../${definition.controlBase.path}`, import.meta.url),"utf8"))).toEqual([]);
  for (const phase of definition.phases) {
    const control = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")));
    const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
    for (const id of IDS) {
      expect(definition.switches).toContain(id);
      expect(definition.base.features[id]).toBe(false);
      expect(control[id]).toBe(false);
      expect(bundle[id]).toBe(true);
    }
  }
});
