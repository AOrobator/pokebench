import {recipeText} from "../test-support/recipe-text.js";
import { describe, expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { dependencyProblems } from "@pokebench/agent/features";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const ID = "map-cycle-recovery-v1";
// Current recipes whose bundle arm runs navigation-recovery-v1, the switch this one needs (glm53-flash-4h does not).
const RECIPES = [["gym-rustboro-torchic-healed",48],["bundle-v-control",112],["bundle-cook-1h",113],["whole-map-cook-1h",113],["whole-map-pair-2h",52],["bundle-v-control-2h",54],["gym-rustboro-torchic",48]] as const;

// Each recipe is parsed once and each control base read once, however many cases use them.
const definitions = new Map<string, ReturnType<typeof parseFixedDefinition>["definition"]>();
const controlBases = new Map<string, string>();
function definitionOf(name: string): ReturnType<typeof parseFixedDefinition>["definition"] {
  let definition = definitions.get(name);
  if (definition === undefined) {
    definition = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url),"utf8")).definition;
    definitions.set(name, definition);
  }
  return definition;
}
function controlBaseOf(path: string): string {
  let text = controlBases.get(path);
  if (text === undefined) {
    text = recipeText(new URL(`../../../${path}`, import.meta.url),"utf8");
    controlBases.set(path, text);
  }
  return text;
}

// the operator 2026-10-22 ("yes recovery over stopping the run"): on in the bundle arm only; the control arm keeps it off.
describe("map-cycle recovery bundle activation", () => {
  for (const [name,index] of RECIPES) {
    it(`${name} enables it only in the normalized bundle arm, where navigation-recovery-v1 is on`, () => {
      const definition = definitionOf(name);
      expect(definition.switches.at(index)).toBe(ID);
      expect(definition.base.features[ID]).toBe(false);
      expect(controlBaseProblems(definition, controlBaseOf(definition.controlBase.path))).toEqual([]);
      for (const phase of definition.phases) {
        const control = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")));
        const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
        expect(control[ID]).toBe(false);
        expect(bundle[ID]).toBe(true);
        expect(bundle["navigation-recovery-v1"]).toBe(true);
        expect(dependencyProblems(bundle)).toEqual([]);
      }
    });
  }
  it("leaves glm53-flash-4h, whose bundle does not run navigation-recovery-v1, unchanged", () => {
    const definition = definitionOf("glm53-flash-4h");
    expect(definition.switches).not.toContain(ID);
    expect(definition.switches).not.toContain("navigation-recovery-v1");
  });
});
