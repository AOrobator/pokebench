import { expect, it } from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, featureInfo,
  featuresOf, playHarnessFeatures, serverFeatureEnv, type SwitchableFeature,
} from "./features.js";
const PENDING_BASE_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"gym-evidence-v1":false};
const ALL_ON={...PENDING_BASE_ALL_ON,"progress-aware-cycles-v1":false,"caught-dex-input-v1":false,"menu-refusal-recovery-v1":false,"pending-field-dialogue-v1":false};
import { flagFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";
import { playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
import { parseEvent } from "./events.js";
import { RUN_START_META } from "../test-support/events.js";

const ID = "original-speed-pacing-v1" as SwitchableFeature;
const OFF = { ...ALL_ON, "short-cycle-fixed-point-v1": false, "party-item-confirmation-v1": false, [ID]: false, "fixed-point-breaker-v1": false, "story-character-stall-gate-v1": false, "positive-supervisor-v1": false, "semantic-navigation-v2": false, "auto-talk-v1": false, "duplicate-turn-collapse-v1": false, "unfinished-activity-v1": false, "exit-labels-v2": false, "heal-before-trainers-v2": false, "gym-heal-warning-v1": false, "respawn-readout-v1": false, "trainer-sight-check-v1": false, "caught-nickname-prompt-v1": false, "fail-open-input-v1": false, "whiteout-healed-v1": false, "field-move-gates-v1": false, "gym-readiness-readout-v1": false, "same-target-no-progress-v1": false, "story-progress-clock-v1": false, "yes-no-answer-readout-v1": false , "story-battle-heal-gate-v1": false, "story-battle-heal-first-v1": false };
const ON = { ...OFF, [ID]: true };
const flags = { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false };

it("appends the independent speed policy without reordering recorded feature identity", () => {
  expect(SWITCHABLE_FEATURES.at(-59)).toBe(ID);
  expect(SWITCHABLE_FEATURES.at(-65)).toBe("evolution-decision-v1");
  expect(FEATURES.filter(feature => feature.switchable).map(feature => feature.id)).toEqual([...SWITCHABLE_FEATURES]);
  expect(featureInfo(ID)).toMatchObject({ group: "guidance", needs: null, switchable: true });
  expect(featureInfo(ID).description).toMatch(/80/);
  expect(featureInfo(ID).description).toMatch(/ Off: .*59\.7275/);
  expect(SERVER_FEATURES.at(-21)).toBe(ID);
});

it("defaults omitted historical presets and legacy flags OFF", () => {
  const legacyFeatures = flagFeatures(flags);
  expect(legacyFeatures[ID]).toBe(false);
  const omitted = Object.fromEntries(Object.entries(legacyFeatures).filter(([id]) => id !== ID));
  const preset = { version: 2, id: "historical-speed", target: null,
    limits: { maxTurns: 300, maxWallMs: 600000, failureLimit: 3 },
    sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: omitted };
  expect(presetFeatures(parsePlayPreset(preset))[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({ ...preset, features: { ...omitted, [ID]: true } }))[ID]).toBe(true);
  expect(() => parsePlayPreset({ ...preset, features: { ...omitted, [ID]: "true" } })).toThrow(/preset/i);
});

it("transports only the explicit server selection and records ON at the end", () => {
  expect(serverFeatureEnv(OFF).POKEBENCH_FEATURES_OFF).toBe(`${ID},semantic-navigation-v2,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,caught-dex-input-v1`);
  expect(serverFeatureEnv(ON).POKEBENCH_FEATURES_OFF).toBe("semantic-navigation-v2,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,caught-dex-input-v1");
  const off = playHarnessFeatures(OFF, null);
  const on = playHarnessFeatures(ON, null);
  expect(off).not.toContain(ID);
  expect(on.filter(id=>id!==ID)).toEqual(off);
  expect(featuresOf(on)[ID]).toBe(true);
  expect(featuresOf(off)[ID]).toBe(false);
  const event = parseEvent(JSON.stringify({ v: 1, run: "speed-policy-recorded", seq: 0,
    t: "2026-10-19T18:00:00.000-04:00", type: "run_start", turn: 0,
    ...RUN_START_META, harness_features: on }));
  if (event.type !== "run_start") throw new Error("Expected run_start");
  expect(event.harness_features).toContain(ID);
});

it("does not rewrite prompts, tools or tool configuration when only clock policy changes", () => {
  expect(playSystemPrompt(ON, null)).toBe(playSystemPrompt(OFF, null));
  expect(playTools(ON)).toEqual(playTools(OFF));
  expect(toolSwitches(ON)).toEqual(toolSwitches(OFF));
});
