import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {serverFeatureEnv} from "@pokebench/agent/features";
import {normalizeFeatures,parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {armFeatures,armPreset,controlBaseProblems,definitionProblems} from "./fixed-design.js";
import {readFixedDefinition} from "./fixed-definition.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const IDs=["bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1"] as const;
const root=fileURLToPath(new URL("../../../",import.meta.url));
it("keeps all three bugfixes default OFF after normalization",()=>{
 for(const id of IDs){expect(DEFAULT_NEXT_RUN.features[id],id).toBe(false);expect(normalizeFeatures(DEFAULT_NEXT_RUN.features)[id],id).toBe(false);}
});
it.each(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"])("%s enables all three bugfixes in both arms through the current recipe",name=>{
 const loaded=readFixedDefinition(root,name),def=loaded.definition;
 expect(loaded.featureRecipe?.id,name).toBe("current");
 expect(definitionProblems(def),name).toEqual([]);expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8")),name).toEqual([]);
 for(const id of IDs){
  expect(def.onInBoth,name).toContain(id);expect(def.switches,name).not.toContain(id);
  for(const arm of ["bundle","control"] as const){
   expect(armFeatures(def,arm)[id],`${name} ${arm} ${id}`).toBe(true);
   for(const phase of def.phases){
    const features=presetFeatures(parsePlayPreset(armPreset(def,phase.id,arm)));
    expect(features[id],`${name} ${phase.id} ${arm} ${id}`).toBe(true);
    expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(","),`${name} ${phase.id} ${arm} ${id}`).not.toContain(id);
   }
  }
 }
});
it.each(["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"])("%s remains historical without adopting the current recipe",name=>{
 expect(()=>readFixedDefinition(root,name)).toThrow("no definition");
 const historical=readFixedDefinition(root,name,true);
 expect(historical.definition.id).toBe(name);expect(historical.featureRecipe).toBeNull();
});
