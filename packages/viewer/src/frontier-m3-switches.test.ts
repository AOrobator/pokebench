import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";
const ids=["leader-loss-comparison-v1","npc-approach-feedback-v1","owned-battle-context-v1","static-npc-template-approach-v1"] as const;
describe("Frontier M3 switch integration",()=>{
 for(const file of ["bundle-v-control-2h","bundle-v-control","bundle-cook-1h"])it(`${file} has both treatments ON in normalized bundle and OFF in control`,()=>{
  const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  const phase=definition.phases[0];if(phase===undefined)throw new Error("phase");
  for(const arm of ["bundle","control"] as const){
   const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
   for(const id of ids)expect(features[id]).toBe(arm==="bundle");
  }
 });
});
