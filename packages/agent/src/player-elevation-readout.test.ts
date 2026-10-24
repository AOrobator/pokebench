import { describe, expect, it } from "vitest";
import { ALL_ON, featureInfo, SERVER_FEATURES, serverFeatureEnv, SWITCHABLE_FEATURES, playHarnessFeatures, type FeatureSet } from "./features.js";
import { playSystemPrompt, playTools } from "./play-config.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";

const ID = "player-elevation-readout-v1";
const off: FeatureSet = { ...ALL_ON, [ID]: false };
const on: FeatureSet = { ...ALL_ON, [ID]: true };

describe(ID, () => {
  it("registers the factual observation and defaults omitted historical presets OFF", () => {
    expect(SWITCHABLE_FEATURES).toContain(ID);
    expect(SERVER_FEATURES).toContain(ID);
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
  });

  it("the production server environment and recorded metadata honor both arms", () => {
    expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
    expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
    expect(playHarnessFeatures(off, null)).not.toContain(ID);
    expect(playHarnessFeatures(on, null)).toContain(ID);
  });

  it("adds no tool, tool argument, prompt advice or automatic navigation", () => {
    expect(playTools(on)).toEqual(playTools(off));
    expect(playSystemPrompt(on, null)).toBe(playSystemPrompt(off, null));
  });
});
