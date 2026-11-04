import {expect,it} from "vitest";
import {normalizeFeatures,flagFeatures} from "@pokebench/agent/play-preset";
import {featuresOf} from "@pokebench/agent/features";

const ID="map-observability-v1";

it("defaults missing future-preset keys ON, keeps explicit OFF and never invents historical recording activation",()=>{
 const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(f[ID]).toBe(true);
 const {[ID]:present,...old}=f;
 expect(present).toBe(true);
 expect(normalizeFeatures(old)[ID]).toBe(true);
 expect(normalizeFeatures({...f,[ID]:false})[ID]).toBe(false);
 expect(featuresOf(["mauville-puzzle-readout-v1"])[ID]).toBe(false);
});
