import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures,normalizeFeatures,flagFeatures} from "@pokebench/agent/play-preset";
import {featureInfo,serverFeatureEnv,playHarnessFeatures} from "@pokebench/agent/features";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {FEATURE_EXPLAINERS} from "./panels.js";
const ID="mauville-puzzle-readout-v1";
it("defaults on for new presets while preserving an explicit off choice",()=>{
 const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(f[ID]).toBe(true);
 const { [ID]: present,...old}=f;expect(present).toBe(true);expect(normalizeFeatures(old)[ID]).toBe(true);
 expect(normalizeFeatures({...f,[ID]:false})[ID]).toBe(false);
});
