import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { experimentArms, parseExperiment } from "./experiments.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID = "birch-intro-pages-v1";

describe("birch-intro-pages-v1", () => {
  it("is appended last as a default-off observation", () => {
    expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
    expect(FEATURES.filter(feature => feature.switchable).at(-1)?.id).toBe(ID);
    expect(SERVER_FEATURES.at(-1)).toBe(ID);
    expect(playHarnessFeatures(ALL_ON, null).at(-1)).toBe(ID);
    expect(featureInfo(ID)).toMatchObject({ group: "observation", switchable: true, title: "BIRCH INTRO PAGES", needs: null });
    expect(featureInfo(ID).description).toContain("Off: ");
    expect(featureInfo(ID).description).toContain("birch_intro_page");
    expect(featureInfo(ID).description).toContain("0x080309CD");
  });

  it("stays off unless a preset turns it on, and the server hears that", () => {
    const off = flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false });
    expect(off[ID]).toBe(false);
    expect(LEGACY_ALL_ON[ID]).toBe(false);
    const { [ID]: omitted, ...rest } = off;
    expect(omitted).toBe(false);
    expect(normalizeFeatures(rest)[ID]).toBe(false);
    expect(normalizeFeatures({ ...rest, [ID]: true })[ID]).toBe(true);
    expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
    expect(serverFeatureEnv({ ...off, [ID]: true }).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
    expect(playHarnessFeatures(off, null)).not.toContain(ID);
    expect(playHarnessFeatures({ ...off, [ID]: true }, null)).toContain(ID);
  });

  it("registers a pending experiment that activates at NEW_GAME_CREATED and grades RIVAL_HOUSE_ENTERED", () => {
    const entry = parseExperiment(JSON.parse(readFileSync(new URL(`../../../experiments/${ID}.json`, import.meta.url), "utf8")));
    expect(entry.changedFeature).toBe(ID);
    expect(entry.queuePosition).toBeUndefined();
    expect(entry.activationMilestone).toBe("NEW_GAME_CREATED");
    expect(entry.primaryMilestone).toBe("RIVAL_HOUSE_ENTERED");
    expect(entry.trialsPerArm).toBe(8);
    expect(entry.modelLane).toBe("think-fast");
    const { incumbent, candidate } = experimentArms(entry);
    expect(incumbent.features[ID]).toBe(false);
    expect(candidate.features[ID]).toBe(true);
    const flipped = SWITCHABLE_FEATURES.filter((feature) => incumbent.features[feature] !== candidate.features[feature]);
    expect(flipped).toEqual([ID]);
    expect(readFileSync(new URL("../../../docs/experiments/readiness.md", import.meta.url), "utf8")).toContain(`| \`${ID}\` | \`NEW_GAME_CREATED\``);
  });
});
