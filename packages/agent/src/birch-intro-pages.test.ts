import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures, serverFeatureEnv, type SwitchableFeature } from "./features.js";
import { experimentArms, parseExperiment } from "./experiments.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID = "birch-intro-pages-v1";

describe("birch-intro-pages-v1", () => {
  it("is appended last as a default-off observation", () => {
    expect(SWITCHABLE_FEATURES.at(-36)).toBe(ID);
    expect(FEATURES.filter(feature => feature.switchable).at(-36)?.id).toBe(ID);
    expect(SERVER_FEATURES.at(-9)).toBe(ID);
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
    for (const name of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h"]) {
      const fixed = JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url), "utf8")) as { base: { features: Record<string, boolean> }; switches: string[] };
      expect(fixed.base.features[ID]).toBe(false);
      expect(fixed.switches.indexOf(ID)).toBeGreaterThan(fixed.switches.indexOf("milestone-instruction-memory-v1"));
      const bundle = { ...fixed.base.features, ...Object.fromEntries(fixed.switches.map((id) => [id, true])) };
      expect(bundle[ID]).toBe(true);
      if (name === "bundle-v-control") {
        for (const [id, value] of Object.entries(bundle)) if (!["story-battle-heal-gate-v1","rejected-movement-prefix-v1","map-cycle-recovery-v1","away-note-buildings-v1","current-map-display-name-v1","window-escape-route-v1","turn-drought-clock-v1","menu-item-guidance-v1","factual-healing-guidance-v1","coherent-healing-feedback-v1", "explorer-family-guidance-v1", "battle-move-learn-input-v1", "rejected-movement-stride-v1", "leader-loss-comparison-v1", "npc-approach-feedback-v1", "boundary-crossing-facts-v1", "delivered-place-evidence-v1", "reachable-section-alternatives-v1", "static-npc-template-approach-v1","owned-battle-context-v1", "fixed-point-breaker-v1", "navigation-recovery-v1", "milestone-drought-suppression-v1", "poison-readout-v1", "berry-readout-v1", "tool-prompt-docs-v1", "field-ownership-feedback-v1", "move-learn-loop-fingerprint-v1", "stale-plan-fact-v1", "post-battle-readout-v1", "move-learn-tool-v1", "move-learn-early-comparison-v1"].includes(id)) expect(incumbent.features[id as SwitchableFeature]).toBe(id === ID ? false : value);
      }
    }
    expect(readFileSync(new URL("../../../docs/experiments/readiness.md", import.meta.url), "utf8")).toContain(`| \`${ID}\` | \`NEW_GAME_CREATED\``);
  });
});
