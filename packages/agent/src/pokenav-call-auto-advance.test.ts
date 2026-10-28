import {expect,it} from "vitest";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {featureInfo,playHarnessFeatures,SERVER_FEATURES} from "./features.js";
const ID="pokenav-call-auto-advance-v1";
it("registers the default-OFF call driver and native readout",()=>{
 const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(off[ID]).toBe(false);
 expect(normalizeFeatures(off)[ID]).toBe(false);
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(SERVER_FEATURES).toContain(ID);
 expect(playHarnessFeatures({...off,[ID]:true},null).at(-1)).toBe(ID);
});
