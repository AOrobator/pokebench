import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armFeatures,armFeatureBits,armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
it("keeps ordinary NEXT RUN default OFF",()=>{expect(DEFAULT_NEXT_RUN.features["town-center-checkpoint-v1"]).toBe(false);});
