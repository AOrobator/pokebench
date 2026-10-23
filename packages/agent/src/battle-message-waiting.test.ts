import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { Value } from "typebox/value";
import { expect, it } from "vitest";
import { BattleMessageSchema } from "./events.js";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, serverFeatureEnv, type FeatureSet} from "./features.js";
import { flagFeatures, normalizeFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";

const ID = "battle-message-waiting-v1";
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON,"battle-decision-ready-v1":false,...Object.fromEntries(ids.map((id) => [id, false])) });

it("registers a default-off observation switch with no dependency, recorded last", () => {
  expect(featureInfo(ID)).toMatchObject({ group: "observation", needs: null, switchable: true, title: "BATTLE MESSAGE WAITING" });
  const description = featureInfo(ID).description;
  expect(description).toContain('battle message waiting: "Wild WINGULL fainted!" — press A or B to continue');
  expect(description).toContain(" Off: ");
  expect(description).toContain("resolving (no input until the game asks)");
  // As built: a finishing battle keeps its text and gains the message clause (battle_details._input_text).
  expect(description).toContain('finishing (outcome won) · battle message waiting: "Got away safely!"');
  expect(description).not.toContain("finishing and recorded-playback text is unchanged");
  expect(SWITCHABLE_FEATURES.at(-176)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON), null).at(-71)).toBe(ID);
  expect(playHarnessFeatures(off(ID), null)).not.toContain(ID);
  expect(featuresOf(playHarnessFeatures(off(ID), null))[ID]).toBe(false);
  // Works whatever the battle readout switches are: the control arm has battle-details-v2 off.
  expect(dependencyProblems(off("battle-decision-ready-v1","battle-effective-damage-v1", "battle-details-v2", "expanded-menu-battle-information-v1", "status-names-v1"))).toEqual([]);
});

it("hands the switch to the game server, which writes the battle readout", () => {
  expect(SERVER_FEATURES.at(-47)).toBe(ID);
  expect(serverFeatureEnv(off(ID)).POKEBENCH_FEATURES_OFF).toBe(`${ID},safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1,move-learn-early-comparison-v1,poison-readout-v1,berry-readout-v1,battle-move-learn-input-v1,static-npc-template-approach-v1,coherent-battle-observation-v1,window-escape-route-v1`);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1,birch-intro-pages-v1,post-battle-readout-v1,move-learn-early-comparison-v1,poison-readout-v1,berry-readout-v1,battle-move-learn-input-v1,static-npc-template-approach-v1,coherent-battle-observation-v1,window-escape-route-v1");
  // The Python server's own list and default-off set name it too.
  const readout = readFileSync(new URL("../../../env/pokebench_env/readout.py", import.meta.url), "utf8");
  expect(readout).toContain(`"${ID}",\n    "offscreen-objects-v1",\n    "levelup-box-v1",\n    "transition-coherence-v1",\n    "readout-truth-v1",`);
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



it("accepts the recorded message page, and states recorded before the page existed", () => {
  const waiting = { state: "waiting_for_input", render_state: "page_wait", text: "Wild WINGULL\nfainted!\n", cursor: 22, identity: "773f", diagnostic: null, page: "Wild WINGULL fainted!" };
  expect(Value.Check(BattleMessageSchema, waiting)).toBe(true);
  const older = Object.fromEntries(Object.entries(waiting).filter(([key]) => key !== "page"));
  expect(Value.Check(BattleMessageSchema, older)).toBe(true);
  expect(Value.Check(BattleMessageSchema, { ...waiting, page: 3 })).toBe(false);
});
