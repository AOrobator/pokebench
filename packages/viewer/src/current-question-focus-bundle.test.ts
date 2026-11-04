import {expect,it} from "vitest";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

const ID="current-question-focus-v1";
it("keeps the next-run default OFF",()=>{expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);});
