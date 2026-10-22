import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const IDS = ["poison-readout-v1", "berry-readout-v1"] as const;
const RECIPES = ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "glm53-flash-4h"];

describe("poison and berry bundle activation", () => {
  for (const name of RECIPES) {
    it(`${name} enables both only in the normalized bundle arm`, () => {
      const { definition } = parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8"));
      expect(definition.switches.slice(definition.switches.indexOf(IDS[0]),definition.switches.indexOf(IDS[0])+2)).toEqual(IDS);
      expect(controlBaseProblems(definition, readFileSync(new URL(`../../../${definition.controlBase.path}`, import.meta.url), "utf8"))).toEqual([]);
      for (const phase of definition.phases) {
        const control = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")));
        const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
        for (const id of IDS) {
          expect(definition.base.features[id]).toBe(false);
          expect(control[id]).toBe(false);
          expect(bundle[id]).toBe(true);
        }
      }
    });
  }
});
