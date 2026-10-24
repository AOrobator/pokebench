import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {serverFeatureEnv} from "@pokebench/agent/features";
import {armPreset,controlBaseProblems,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const IDS=["active-warp-exits-v1","available-exits-presentation-v1"] as const;
it.each(IDS)("%s stays default OFF",id=>{expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);});
it.each(["bundle-v-control","bundle-v-control-2h"])("%s: only the bundle enables both independent switches at the server seam",name=>{
 const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
 expect(controlBaseProblems(definition,readFileSync(new URL(`../../../${definition.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 for(const phase of definition.phases)for(const arm of ["control","bundle"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
  for(const id of IDS){expect(features[id]).toBe(arm==="bundle");expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",").includes(id)).toBe(arm==="control");}
 }
});
