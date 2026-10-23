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
const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("frontier report fixes bundle activation", () => {
  it("are off in the next-run defaults", () => {
    for (const [id] of SWITCHES) expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  });
  it("each recipe enables them, last and in order, only in the normalized bundle arm, where the switch each needs is on", () => {
    for (const name of RECIPES) {
      const { definition } = parseFixedDefinition(read(`experiments/fixed/${name}.json`));
      expect(controlBaseProblems(definition, read(definition.controlBase.path))).toEqual([]);
      // map-cycle-recovery-v1 is appended after them where its dependency is on in the bundle arm.
      expect(definition.switches.filter((id) => id !== "move-learn-offer-identity-v1" && id !== "map-cycle-recovery-v1").slice(-3)).toEqual(SWITCHES.map(([id]) => id));
      for (const [id] of SWITCHES) expect(definition.base.features[id]).toBe(false);
      for (const phase of definition.phases) {
        const control = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")));
        const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
        for (const [id, needs] of SWITCHES) {
          expect(control[id]).toBe(false);
          expect(bundle[id]).toBe(true);
          expect(bundle[needs]).toBe(true);
        }
      }
    }
  });
});
