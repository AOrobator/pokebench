import { expect, it } from "vitest";
import { ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID="yes-no-answer-readout-v1";
it("appends a default-OFF observation server switch and transports explicit ON/OFF",()=>{
 expect(SWITCHABLE_FEATURES.at(-6)).toBe(ID);
 expect(FEATURES.filter(f=>f.switchable).at(-6)?.id).toBe(ID);
 expect(SERVER_FEATURES.at(-3)).toBe(ID);
 expect(featureInfo(ID)).toMatchObject({group:"observation",switchable:true,title:"YES/NO ANSWER READOUT"});
 expect(featureInfo(ID).description).toContain("To answer YES, press UP, then A. Pressing A now answers NO.");
 expect(featureInfo(ID).description).toContain(" Off: ");
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const off=flagFeatures(flags),on={...off,[ID]:true};
 expect(off[ID]).toBe(false);
 const {[ID]:omitted,...legacy}=off;expect(omitted).toBe(false);
 expect(normalizeFeatures(legacy)[ID]).toBe(false);
 expect(LEGACY_ALL_ON[ID]).toBe(false);
 expect(playHarnessFeatures(on,null)).toEqual([...playHarnessFeatures(off,null),ID]);
 expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 expect(ALL_ON[ID]).toBe(true);
});
