import {expect,it} from "vitest";
import {normalizeFeatures} from "@pokebench/agent/play-preset";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const IDs=["bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1"] as const;
it("keeps all three bugfixes default OFF after normalization",()=>{
 for(const id of IDs){expect(DEFAULT_NEXT_RUN.features[id],id).toBe(false);expect(normalizeFeatures(DEFAULT_NEXT_RUN.features)[id],id).toBe(false);}
});
