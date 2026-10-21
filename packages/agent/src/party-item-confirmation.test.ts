import { expect, it } from "vitest";
import { ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";

const ID="party-item-confirmation-v1";
it("appends a default-OFF party message server switch and transports explicit ON/OFF",()=>{
 expect(SWITCHABLE_FEATURES.at(-7)).toBe(ID);
 expect(FEATURES.filter(f=>f.switchable).at(-7)?.id).toBe(ID);
 expect(SERVER_FEATURES.at(-4)).toBe(ID);
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const off=flagFeatures(flags),on={...off,[ID]:true};
 expect(off[ID]).toBe(false);
 const {[ID]:omitted,...legacy}=off;expect(omitted).toBe(false);
 expect(normalizeFeatures(legacy)[ID]).toBe(false);
 expect(playHarnessFeatures(on,null)).toEqual([...playHarnessFeatures(off,null),ID]);
 expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 expect(ALL_ON[ID]).toBe(true);
});
