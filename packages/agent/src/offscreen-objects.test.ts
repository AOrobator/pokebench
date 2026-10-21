import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { expect, it } from "vitest";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, serverFeatureEnv, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";

const ID = "offscreen-objects-v1";
const PREVIOUS = "script-line-presence-v1";
const PREVIOUS_SERVER = "battle-message-waiting-v1";
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });

it("registers off-screen objects as a default-off observation switch that needs live object sprites", () => {
  expect(featureInfo(ID)).toMatchObject({ group: "observation", needs: "live-object-sprites-v1", switchable: true, title: "OFF-SCREEN PEOPLE AND OBJECTS" });
  expect(featureInfo(ID).description).toContain("MAY at 10,3 (out of view; where the map places this character, it may have moved)");
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf(PREVIOUS) + 1);
  const recorded = playHarnessFeatures(ALL_ON, null);
  expect(recorded.indexOf(ID)).toBe(recorded.indexOf(PREVIOUS) + 1);
  expect(playHarnessFeatures(off(ID), null)).not.toContain(ID);
  expect(featuresOf(playHarnessFeatures(off(ID), null))[ID]).toBe(false);
  expect(dependencyProblems(off("live-object-sprites-v1"))).toContain(`${ID} needs live-object-sprites-v1`);
});

it("hands the switch to the game server, which writes the readout", () => {
  expect(SERVER_FEATURES.indexOf(ID)).toBe(SERVER_FEATURES.indexOf(PREVIOUS_SERVER) + 1);
  expect(serverFeatureEnv(off(ID)).POKEBENCH_FEATURES_OFF).toBe(`${ID},safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1`);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1");
});

it("defaults OFF for presets that omit it and for legacy flag presets", () => {
  const without = (features: FeatureSet): Omit<FeatureSet, typeof ID> => Object.fromEntries(Object.entries(features).filter(([id]) => id !== ID)) as Omit<FeatureSet, typeof ID>;
  const older = without(ALL_ON);
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({ ...older, [ID]: true })[ID]).toBe(true);
  const legacy = flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true });
  expect(legacy[ID]).toBe(false);
  const preset = parsePlayPreset({ version: 2, id: "p", target: null, limits: { maxTurns: 1, maxWallMs: 1, failureLimit: 1 }, sampling: { thinkingLevel: "medium", maxTokens: 1 }, features: without(legacy) });
  expect(presetFeatures(preset)[ID]).toBe(false);
});
