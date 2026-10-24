import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { serverFeatureEnv } from "@pokebench/agent/features";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

const ID = "player-elevation-readout-v1";
it("keeps the next-run default OFF", () => {
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});
for (const name of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "gym-rustboro-torchic", "gym-rustboro-torchic-healed"]) {
 it(`${name}: normalized bundle alone enables player elevation at the server seam`, () => {
  const { definition } = parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8"));
  expect(controlBaseProblems(definition, readFileSync(new URL(`../../../${definition.controlBase.path}`, import.meta.url), "utf8"))).toEqual([]);
  for (const phase of definition.phases) {
   for (const arm of ["control", "bundle"] as const) {
    const features = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, arm)));
    expect(features[ID]).toBe(arm === "bundle");
    expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",").includes(ID)).toBe(arm === "control");
   }
  }
 });
}
