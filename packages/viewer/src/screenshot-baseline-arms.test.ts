import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armFeatures,armFeatureBits,armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const id="screenshot-button-baseline-v1";
it("keeps the next-run default outside standalone baseline mode",()=>{
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
});
