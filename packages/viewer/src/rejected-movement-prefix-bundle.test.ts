import {recipeText} from "../test-support/recipe-text.js";
import { describe, expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const ID = "rejected-movement-prefix-v1";
// Indices into the shared `current` recipe's switch list, which lost two entries before these
// groups when compact-map-grid-v1 and player-map-visibility-v2 became onInBoth (2026-10-28).
// Cook and whole-map recipes carry their own inline lists, so their positions did not move.
const RECIPES = [["bundle-v-control",35],["bundle-cook-1h",108],["whole-map-cook-1h",108],["whole-map-pair-2h",47],["bundle-v-control-2h",35],["glm53-flash-4h",35]] as const;

// the operator 2026-10-22: turn the longest-valid-prefix walk on in the bundle arm; the control arm keeps it off.
describe("rejected movement prefix bundle activation", () => {
  for (const [name,index] of RECIPES) {
    it(`${name} enables it only in the normalized bundle arm, where the navigation guard it needs is on`, () => {
      const { definition } = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url),"utf8"));
      expect(definition.switches.at(index)).toBe(ID);
      expect(definition.base.features[ID]).toBe(false);
      expect(controlBaseProblems(definition, recipeText(new URL(`../../../${definition.controlBase.path}`, import.meta.url),"utf8"))).toEqual([]);
      for (const phase of definition.phases) {
        const control = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")));
        const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
        expect(control[ID]).toBe(false);
        expect(bundle[ID]).toBe(true);
        expect(bundle["navigation-tool-use-guard-v1"]).toBe(true);
      }
    });
  }
});
