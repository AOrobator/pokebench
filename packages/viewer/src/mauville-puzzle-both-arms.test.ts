import {expect,it} from "vitest";
import {normalizeFeatures,flagFeatures} from "@pokebench/agent/play-preset";
const ID="mauville-puzzle-readout-v1";
it("defaults on for new presets while preserving an explicit off choice",()=>{
 const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(f[ID]).toBe(true);
 const { [ID]: present,...old}=f;expect(present).toBe(true);expect(normalizeFeatures(old)[ID]).toBe(true);
 expect(normalizeFeatures({...f,[ID]:false})[ID]).toBe(false);
});
