import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

const ID = "gym-door-label-v1";
it("keeps ordinary next-run and omitted preset gym defaults off", () => {
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 expect(presetFeatures(parsePlayPreset({version:1,id:"gym-default-check",target:null,limits:{maxTurns:1,maxWallMs:1000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}}))[ID]).toBe(false);
});
