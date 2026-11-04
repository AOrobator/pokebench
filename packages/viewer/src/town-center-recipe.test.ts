import {expect,it} from "vitest";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
it("keeps ordinary NEXT RUN default OFF",()=>{expect(DEFAULT_NEXT_RUN.features["town-center-checkpoint-v1"]).toBe(false);});
