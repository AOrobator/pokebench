import { expect, it } from "vitest";
import { ALL_ON, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo, featuresOf, playHarnessFeatures, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";
import { PRESENCE_PENALTY, playSampling, samplingExtras } from "./presence-penalty.js";
import { readFileSync } from "node:fs";
import { checkEvent } from "./events.js";

const ID = "presence-penalty-v1";
const PREVIOUS = "navigate-first-prompt-v1";
const off = (...ids: (typeof SWITCHABLE_FEATURES)[number][]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });

it("registers presence penalty as a default-off agent-side guidance switch recorded after navigate_to first", () => {
  expect(featureInfo(ID)).toMatchObject({ group: "guidance", needs: null, switchable: true, title: "PRESENCE PENALTY 1.5" });
  expect(featureInfo(ID).description).toContain("presence_penalty");
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf(PREVIOUS) + 1);
  const recorded = playHarnessFeatures(ALL_ON, null);
  expect(recorded.indexOf(ID)).toBe(recorded.indexOf(PREVIOUS) + 1);
  expect(featuresOf(playHarnessFeatures(off(ID), null))[ID]).toBe(false);
  expect(SERVER_FEATURES).not.toContain(ID);
});

it("defaults OFF for presets that omit it and for legacy flag presets", () => {
  const without = (features: FeatureSet): Omit<FeatureSet, typeof ID> => Object.fromEntries(Object.entries(features).filter(([id]) => id !== ID)) as Omit<FeatureSet, typeof ID>;
  expect(normalizeFeatures(without(ALL_ON))[ID]).toBe(false);
  expect(normalizeFeatures({ ...without(ALL_ON), [ID]: true })[ID]).toBe(true);
  const legacy = flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true });
  expect(legacy[ID]).toBe(false);
  const preset = parsePlayPreset({ version: 2, id: "p", target: null, limits: { maxTurns: 1, maxWallMs: 1, failureLimit: 1 }, sampling: { thinkingLevel: "medium", maxTokens: 1 }, features: without(legacy) });
  expect(presetFeatures(preset)[ID]).toBe(false);
});

it("sends and records the Qwen3.6 card's thinking-mode value only when on", () => {
  expect(PRESENCE_PENALTY).toBe(1.5);
  expect(samplingExtras(off(ID))).toEqual({});
  expect(samplingExtras(ALL_ON)).toEqual({ presence_penalty: 1.5 });
  expect(playSampling(off(ID), "medium", 4096)).toEqual({ thinking_level: "medium", max_tokens: 4096 });
  expect(playSampling(ALL_ON, "medium", 4096)).toEqual({ thinking_level: "medium", max_tokens: 4096, presence_penalty: 1.5 });
});

it("run_start records the value it sent; records without it stay valid", () => {
  // Cook run #2's recorded run_start (2026-10-16T02-23-17_qwen36-gpu1_sh02, seq 0) with its sampling replaced.
  const recorded = checkEvent(JSON.parse(readFileSync(new URL("../test-support/run-start-sh02.json", import.meta.url), "utf8")));
  if (recorded.type !== "run_start") throw new Error("not a run_start");
  expect(recorded.sampling).toEqual({ thinking_level: "medium", max_tokens: 4096 });
  const start = (sampling: Record<string, unknown>) => ({ ...recorded, sampling });
  expect(() => checkEvent(start({ thinking_level: "medium", max_tokens: 4096 }))).not.toThrow();
  expect(() => checkEvent(start({ thinking_level: "medium", max_tokens: 4096, presence_penalty: 1.5 }))).not.toThrow();
  expect(() => checkEvent(start({ thinking_level: "medium", max_tokens: 4096, presence_penalty: "high" }))).toThrow();
});
