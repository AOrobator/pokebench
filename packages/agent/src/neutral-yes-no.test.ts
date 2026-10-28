import {describe, expect, it} from "vitest";
import {ALL_ON, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv} from "./features.js";
import {flagFeatures, normalizeFeatures} from "./play-preset.js";

const ID = "neutral-yes-no-readout-v1";
describe(ID, () => {
  it("defaults off and records the replacement only when enabled", () => {
    const {[ID]: enabled, ...omitted} = ALL_ON;
    expect(enabled).toBe(true);
    expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(294);
    expect(normalizeFeatures(omitted)[ID]).toBe(false);
    expect(flagFeatures({loopGuard:true, activeUi:true, interfaceDocs:true, objectives:false})[ID]).toBe(false);
    expect(featureInfo(ID).description).toContain("Off: the original");
    expect(playHarnessFeatures({...ALL_ON, [ID]:false}, null)).not.toContain(ID);
    expect(playHarnessFeatures(ALL_ON, null)).toContain(ID);
    expect(dependencyProblems({...ALL_ON, "yes-no-answer-readout-v1":false}).some(p => p.includes(ID))).toBe(true);
  });
  it("passes the switch through the production server environment", () => {
    const on = serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF;
    const off = serverFeatureEnv({...ALL_ON, [ID]:false}).POKEBENCH_FEATURES_OFF;
    expect(on.split(",")).not.toContain(ID);
    expect(off.split(",")).toContain(ID);
  });
});
