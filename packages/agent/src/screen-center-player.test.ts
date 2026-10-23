import { describe, expect, it } from "vitest";
import { ALL_ON, featureInfo, SERVER_FEATURES, serverFeatureEnv, SWITCHABLE_FEATURES, type FeatureSet } from "./features.js";
import { playSystemPrompt } from "./play-config.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";

const ID = "screen-center-player-v1";
const SENTENCE = "Finding yourself on screen: in the overworld the camera follows you, so your character is the sprite on the tile at the exact center of the screenshot";
const off: FeatureSet = { ...ALL_ON, [ID]: false };
const on: FeatureSet = { ...ALL_ON, [ID]: true };

describe("screen-center-player-v1", () => {
  it("adds one screen section to the overworld system prompt and nothing else", () => {
    const without = playSystemPrompt(off, null);
    const with_ = playSystemPrompt(on, null);
    expect(without).not.toContain("Finding yourself on screen");
    expect(with_).toContain(SENTENCE);
    expect(with_).toContain("except while a scripted scene moves the camera or a warp fades the screen");
    expect(with_.replace(/\n\nFinding yourself on screen: [^\n]*/, "")).toBe(without);
  });
  it("keeps the section out of a battle-only just-in-time prompt", () => {
    const jit: FeatureSet = { ...on, "just-in-time-prompt-v1": true };
    expect(playSystemPrompt(jit, null, "battle")).not.toContain("Finding yourself on screen");
    expect(playSystemPrompt(jit, null, "overworld")).toContain(SENTENCE);
  });
  it("is a registered server switch, default off, whose OFF copy says what OFF does", () => {
    expect(SWITCHABLE_FEATURES).toContain(ID);
    expect(SERVER_FEATURES).toContain(ID);
    expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
    expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
  });
});
