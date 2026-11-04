import {expect,it} from "vitest";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {featureInfo,serverFeatureEnv,ALL_ON} from "@pokebench/agent/features";
import {flagFeatures,normalizeFeatures} from "@pokebench/agent/play-preset";
const ID="caught-nickname-prompt-v2";
it("records V2 independently and keeps historical omitted behavior",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 const {[ID]:omitted,...historical}=ALL_ON;expect(omitted).toBe(true);
 expect(normalizeFeatures(historical)[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 expect(featureInfo(ID).needs).toBe("caught-nickname-prompt-v1");
 expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
});
