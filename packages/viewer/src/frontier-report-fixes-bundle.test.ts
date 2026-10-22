import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

// the operator 2026-10-22 (frontier report fixes): each switch default off and on in the bundle arm; control keeps it off.
const SWITCHES = [
  ["away-note-buildings-v1", "harness-trust-v1"],
  ["current-map-display-name-v1", "semantic-current-map-feedback-v1"],
  ["window-escape-route-v1", "bounded-navigation-v1"],
] as const;
const RECIPES = ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "glm53-flash-4h"];

describe("frontier report fixes bundle activation", () => {
  it("are off in the next-run defaults", () => {
    for (const [id] of SWITCHES) expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  });
  for (const name of RECIPES) {
    it(`${name} enables each only in the normalized bundle arm, where the switch it needs is on`, () => {
      const { definition } = parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8"));
      expect(controlBaseProblems(definition, readFileSync(new URL(`../../../${definition.controlBase.path}`, import.meta.url), "utf8"))).toEqual([]);
      for (const [id, needs] of SWITCHES) {
        expect(definition.switches).toContain(id);
        expect(definition.base.features[id]).toBe(false);
        for (const phase of definition.phases) {
          const control = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")));
          const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
          expect(control[id]).toBe(false);
          expect(bundle[id]).toBe(true);
          expect(bundle[needs]).toBe(true);
        }
      }
    });
  }
});
