import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID = "birch-intro-pages-v1";

describe("birch-intro-pages-v1", () => {
  it("is appended last as a default-off observation", () => {
    expect(SWITCHABLE_FEATURES.at(-46)).toBe(ID);
    expect(FEATURES.filter(feature => feature.switchable).at(-46)?.id).toBe(ID);
    expect(SERVER_FEATURES.at(-11)).toBe(ID);
    expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON), null).at(-15)).toBe(ID);
    expect(featureInfo(ID)).toMatchObject({ group: "observation", switchable: true, title: "BIRCH INTRO PAGES", needs: null });
    expect(featureInfo(ID).description).toContain("Bundle arm only, default off");
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
    for (const name of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h"]) {
      const fixed = JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")) as { base: { features: Record<string, boolean> }; switches: string[] };
      expect(fixed.base.features[ID]).toBe(false);
      expect(fixed.switches.indexOf(ID)).toBeGreaterThan(fixed.switches.indexOf("milestone-instruction-memory-v1"));
      const bundle = { ...fixed.base.features, ...Object.fromEntries(fixed.switches.map((id) => [id, true])) };
      expect(bundle[ID]).toBe(true);
    }
  });
});
