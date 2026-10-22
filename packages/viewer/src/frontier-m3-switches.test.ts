import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {parseExperiment} from "@pokebench/agent/experiments";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";
import {FEATURE_EXPLAINERS} from "./panels.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const ids=["leader-loss-comparison-v1","npc-approach-feedback-v1"] as const;
describe("Frontier M3 switch integration",()=>{
 for(const file of ["bundle-v-control-2h","bundle-v-control","bundle-cook-1h"])it(`${file} has both treatments ON in normalized bundle and OFF in control`,()=>{
  const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  const phase=definition.phases[0];if(phase===undefined)throw new Error("phase");
  for(const arm of ["bundle","control"] as const){
   const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
   for(const id of ids)expect(features[id]).toBe(arm==="bundle");
  }
 });
 for(const id of ids)it(`${id} remains default OFF, mapped to a tracked explainer and pending only`,()=>{
  expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  expect(readFileSync(new URL(`../../../docs/explainers/${id}.html`,import.meta.url),"utf8")).toContain("<svg");
  const entry=parseExperiment(JSON.parse(readFileSync(new URL(`../../../experiments/${id}.json`,import.meta.url),"utf8")) as unknown);
  expect(entry.changedFeature).toBe(id);expect(entry.queuePosition).toBeUndefined();expect(entry.incumbent.features[id]).toBe(false);
 });
});
