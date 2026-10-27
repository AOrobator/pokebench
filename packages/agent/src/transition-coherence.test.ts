import {serverOff, serverOffWith} from "../test-support/server-features.js";
import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, type FeatureSet} from "./features.js";
import { flagFeatures, normalizeFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";

const ID = "transition-coherence-v1";
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON,"battle-decision-ready-v1":false,...Object.fromEntries(ids.map((id) => [id, false])) });

it("registers a default-off observation switch with no dependency, recorded last", () => {
  expect(featureInfo(ID)).toMatchObject({ group: "observation", needs: null, switchable: true, title: "COHERENT TRANSITION READOUTS" });
  const description = featureInfo(ID).description;
  expect(description).toContain(" Off: ");
  // The three model-visible fixes and what OFF keeps, from the cook harness audit.
  expect(description).toContain("finishing (outcome won)");
  expect(description).toContain("STATE COVERAGE ERROR: harness bug: invalid battle positions");
  expect(description).toContain("Screen: battle_transition");
  expect(description).toContain("unknown (callback2 0x08036FAD)");
  expect(description).toContain("field_transition");
  expect(description).toContain("Save-backed world state unavailable");
  expect(description).toContain("both arms");
  expect(SWITCHABLE_FEATURES.at(88)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON), null).at(-52)).toBe(ID);
  expect(playHarnessFeatures(off(ID), null)).not.toContain(ID);
  expect(featuresOf(playHarnessFeatures(off(ID), null))[ID]).toBe(false);
  // A correctness fix meant for both arms of the bundle, whatever their battle readout switches.
  expect(dependencyProblems(off("battle-decision-ready-v1","battle-effective-damage-v1", "battle-details-v2", "expanded-menu-battle-information-v1", "status-names-v1"))).toEqual([]);
});

it("hands the switch to the game server, which owns the decoding", () => {
  expect(SERVER_FEATURES.at(35)).toBe(ID);
  expect(serverOff(off(ID))).toEqual(serverOffWith(ALL_ON,{off:[ID]}));
  expect(serverOff(ALL_ON)).not.toContain(ID);
  const readout = readFileSync(new URL("../../../env/pokebench_env/readout.py", import.meta.url), "utf8");
  expect(readout).toContain(`"levelup-box-v1",\n    "${ID}",\n    "readout-truth-v1",`);
  expect(readout).toContain(`"levelup-box-v1,"\n        "${ID},"\n        "readout-truth-v1,`);
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
