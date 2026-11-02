import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "./fixed-definition.js";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {serverFeatureEnv} from "@pokebench/agent/features";
import {armPreset,controlBaseProblems} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
// active-warp-exits-v1 was promoted to both arms (the operator 2026-11-02) beside warp-target-navigation-v1,
// which accepts the warp records it filters; the presentation switch stays bundle-only.
const BOTH=["active-warp-exits-v1"] as const;
const BUNDLE_ONLY=["available-exits-presentation-v1"] as const;
const IDS=[...BOTH,...BUNDLE_ONLY] as const;
it.each(IDS)("%s stays default OFF",id=>{expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);});
it.each(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h","hyperqwen-bundle-24h"])("%s: the both-arm switch is on in both, the bundle-only switch only in the bundle",name=>{
 const {definition}=readFixedDefinition(sourceRoot,name);
 expect(controlBaseProblems(definition,readFileSync(new URL(`../../../${definition.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 for(const phase of definition.phases)for(const arm of ["control","bundle"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
  for(const id of BOTH){expect(features[id]).toBe(true);expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",").includes(id)).toBe(false);}
  for(const id of BUNDLE_ONLY){expect(features[id]).toBe(arm==="bundle");expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",").includes(id)).toBe(arm==="control");}
 }
});
