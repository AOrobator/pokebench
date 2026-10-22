import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {SWITCHABLE_FEATURES,featureInfo} from "@pokebench/agent/features";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {experimentArms,parseExperiment} from "@pokebench/agent/experiments";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";

const IDS=["coherent-healing-feedback-v1","explorer-family-guidance-v1","battle-move-learn-input-v1","rejected-movement-stride-v1","leader-loss-comparison-v1","npc-approach-feedback-v1","boundary-crossing-facts-v1","delivered-place-evidence-v1","reachable-section-alternatives-v1","owned-battle-context-v1"] as const;
it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h","glm53-flash-4h"])("all frontier treatments belong only to normalized %s bundle",name=>{
 const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
 for(const phase of definition.phases)for(const arm of ["bundle","control"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
  for(const id of IDS){expect(features[id],`${name}/${phase.id}/${arm}/${id}`).toBe(arm==="bundle");expect(definition.base.features[id]).toBe(false);}
  expect(features["fixed-point-breaker-v1"]).toBe(arm==="bundle");
 }
});
it.each(IDS)("%s has an unqueued one-switch pending comparison",id=>{
 const raw:unknown=JSON.parse(readFileSync(new URL(`../../../experiments/${id}.json`,import.meta.url),"utf8"));
 const experiment=parseExperiment(raw);
 expect(experiment.changedFeature).toBe(id);
 expect(experiment.queuePosition).toBeUndefined();
 const {incumbent,candidate}=experimentArms(experiment);
 expect(SWITCHABLE_FEATURES.filter(feature=>incumbent.features[feature]!==candidate.features[feature])).toEqual([id]);
 expect(featureInfo(id).description).toContain("Off:");
});
