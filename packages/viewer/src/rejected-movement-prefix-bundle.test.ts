import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const ID = "rejected-movement-prefix-v1";
const RECIPES = [["bundle-v-control",106],["bundle-cook-1h",108],["whole-map-cook-1h",108],["whole-map-pair-2h",47],["bundle-v-control-2h",48],["glm53-flash-4h",92]] as const;

// the operator 2026-10-22: turn the longest-valid-prefix walk on in the bundle arm; the control arm keeps it off.
describe("rejected movement prefix bundle activation", () => {
  for (const [name,index] of RECIPES) {
    it(`${name} enables it only in the normalized bundle arm, where the navigation guard it needs is on`, () => {
      const { definition } = parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8"));
      expect(definition.switches.at(index)).toBe(ID);
      expect(definition.base.features[ID]).toBe(false);
      expect(controlBaseProblems(definition, readFileSync(new URL(`../../../${definition.controlBase.path}`, import.meta.url), "utf8"))).toEqual([]);
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
