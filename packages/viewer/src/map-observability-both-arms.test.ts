import {FROZEN_SWITCHES} from "../../agent/test-support/legacy-features.js";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures,normalizeFeatures,flagFeatures} from "@pokebench/agent/play-preset";
import {featureInfo,serverFeatureEnv,playHarnessFeatures,featuresOf} from "@pokebench/agent/features";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

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
