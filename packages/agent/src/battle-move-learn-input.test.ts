import { describe, expect, it } from "vitest";
import { ALL_ON, SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";

const ID = "battle-move-learn-input-v1";
describe(ID, () => {
 it("appends the server-owned input correction without changing omitted presets", () => {
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(featureInfo(ID).group).toBe("observation");
  const off = {...ALL_ON, [ID]: false};
  expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(playHarnessFeatures(ALL_ON, null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(off, null)).not.toContain(ID);
  const {[ID]: omitted, ...historical} = ALL_ON;
  expect(omitted).toBe(true);
  expect(normalizeFeatures(historical)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
