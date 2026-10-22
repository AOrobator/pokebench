import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import { flagFeatures } from "./play-preset.js";

const id = "gym-door-label-v1";
it("is server-owned, recorded, default off and bundle-only", () => {
  expect(featureInfo(id).needs).toBe("exit-labels-v2");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[id]:true},null)).toContain(id);
  expect(serverFeatureEnv({...ALL_ON,[id]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
  expect(serverFeatureEnv({...ALL_ON,[id]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(id);
  for (const name of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h"]) {
    const def = JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>}; switches:string[]; onInBoth:string[]};
    expect(def.base.features[id]).toBe(false);
    expect(def.switches).toContain(id);
    expect(def.onInBoth).not.toContain(id);
  }
});
