import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {featureInfo,serverFeatureEnv,ALL_ON} from "@pokebench/agent/features";
import {flagFeatures,normalizeFeatures} from "@pokebench/agent/play-preset";
const ID="caught-nickname-prompt-v2";
it("records V2 independently and keeps historical omitted behavior",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 expect(normalizeFeatures({...ALL_ON,[ID]:undefined})[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 expect(featureInfo(ID).needs).toBe("caught-nickname-prompt-v1");
 expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
});
it("materializes capture input fixes in both maintained arms",()=>{
 const root=fileURLToPath(new URL("../../../",import.meta.url));
 for(const name of ["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"]){
  const {definition:def}=readFixedDefinition(root,name);
  for(const phase of def.phases)for(const arm of ["bundle","control"]){
   const features=armPreset(def,phase.id,arm).features;
   for(const id of ["caught-dex-input-v1","caught-nickname-prompt-v1",ID] as const)expect(features[id],`${name}/${arm}/${id}`).toBe(true);
  }
 }
});
