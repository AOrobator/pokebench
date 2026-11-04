import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armFeatures,armFeatureBits,armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
it("keeps the unrelated next-run draft default OFF",()=>{
 expect(DEFAULT_NEXT_RUN.features["destination-first-navigation-v1"]).toBe(false);
});
