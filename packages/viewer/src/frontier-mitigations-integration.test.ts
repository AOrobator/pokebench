import {recipeText} from "../test-support/recipe-text.js";
import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {featureInfo} from "@pokebench/agent/features";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";

const IDS=["coherent-healing-feedback-v1","explorer-family-guidance-v1","battle-move-learn-input-v1","rejected-movement-stride-v1","leader-loss-comparison-v1","npc-approach-feedback-v1","boundary-crossing-facts-v1","delivered-place-evidence-v1","reachable-section-alternatives-v1","owned-battle-context-v1","static-npc-template-approach-v1"] as const;
const CURRENT=new Set(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"]);
const PROMOTED=new Set<string>(["battle-move-learn-input-v1"]);
it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h","glm53-flash-4h"])("all frontier treatments belong only to normalized %s bundle",name=>{
 const {definition}=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
 for(const phase of definition.phases)for(const arm of ["bundle","control"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
  for(const id of IDS){const both=CURRENT.has(name)&&PROMOTED.has(id);expect(features[id],`${name}/${phase.id}/${arm}/${id}`).toBe(both||arm==="bundle");expect(definition.base.features[id]).toBe(both);}
  expect(features["fixed-point-breaker-v1"]).toBe(CURRENT.has(name)||arm==="bundle");
  expect(features["story-battle-heal-gate-v1"],`${name}/${arm}: approved factual policy leaves the action gate OFF`).toBe(false);
 }
});
it.each(IDS)("%s has an unqueued one-switch pending comparison",id=>{
 expect(featureInfo(id).description).toContain("Off:");
});

// Frozen historical recipe bytes from review base a0c3d6138, independent of current registry defaults.
const HISTORICAL_RECIPES=[
 [
  "bundle-cook-4h",
  "570d701250f6cb9143c0e0372c927f97d119d34f4631fb2438eb3f1e16a9b8b6"
 ],
 [
  "bundle-cook-6h",
  "a09e4351f471de1d1714b5d0c25aef3dab53e1dadb8e7be5557572184c1d98cb"
 ],
 [
  "bundle-cook-6h-v2",
  "70f47c61e6c2d711a8d130a2cd95e956c7a44baddcf31705442a25d54850452a"
 ]
] as const;
it.each(HISTORICAL_RECIPES)("historical %s remains byte-identical",(name,sha)=>{
 const text=recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8");
 expect(createHash("sha256").update(text).digest("hex"),`${name}: historical bytes`).toBe(sha);
});
it.each(HISTORICAL_RECIPES)("historical %s keeps every frontier treatment OFF",(name)=>{
 const {definition}=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
 for(const phase of definition.phases)for(const arm of ["bundle","control"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
  expect(IDS.filter(id=>features[id]),`${name}/${phase.id}/${arm}: forbidden frontier switches`).toEqual([]);
 }
});
