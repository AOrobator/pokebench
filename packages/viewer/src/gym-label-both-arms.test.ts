import {recipeText} from "../test-support/recipe-text.js";
import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { serverFeatureEnv } from "@pokebench/agent/features";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

const ID = "gym-door-label-v1";
for (const name of ["bundle-v-control", "bundle-v-control-2h"]) {
 it(`${name}: both normalized arms expose gym identity to the server`, () => {
  const { definition } = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url),"utf8"));
  expect(definition.onInBoth).toContain(ID);
  expect(definition.switches).not.toContain(ID);
  expect(definition.base.features[ID]).toBe(true);
  expect(controlBaseProblems(definition, recipeText(new URL(`../../../${definition.controlBase.path}`, import.meta.url),"utf8"))).toEqual([]);
  for (const phase of definition.phases) {
   for (const arm of ["control", "bundle"] as const) {
    const features = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, arm)));
    expect(features[ID]).toBe(true);
    expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
   }
  }
 });
}
it("keeps ordinary next-run and omitted preset gym defaults off", () => {
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 expect(presetFeatures(parsePlayPreset({version:1,id:"gym-default-check",target:null,limits:{maxTurns:1,maxWallMs:1000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}}))[ID]).toBe(false);
});
