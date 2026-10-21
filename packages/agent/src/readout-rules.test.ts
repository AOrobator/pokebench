import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv, stateOnlyProblems, type FeatureSet, type SwitchableFeature} from "./features.js";
import { MAP_RULE_INDEX, MAP_RULE_SWITCHES, MAP_RULE_TEXTS } from "./map-rules.generated.js";
import { mapRulesSection } from "./map-rules.js";
import { playSystemPrompt } from "./play-config.js";
import { parsePlayPreset, presetFeatures } from "./play-preset.js";
import { stateOnlyPrompt } from "./state-runtime.js";

const ID = "readout-rules-in-prompt-v1";
const set = (base: FeatureSet, changes: Partial<Record<SwitchableFeature, boolean>>): FeatureSet => ({ ...base, ...changes });
// The showcase arm of bundle-v-control (run 2026-10-16T00-34-26_qwen36-gpu1_show): map switches as recorded.
const SHOWCASE = set(ALL_ON, { "full-map-navigation-v1": false, "counter-talk-v1": false, [ID]: true });
const OFF = set(SHOWCASE, { [ID]: false });
const LEGEND = "@ player; N live object; W warp location (each warp's activation is listed in the readout's Warps line); # collision; g grass; ~ water; v ^ < > ledge: a one-way hop in the arrow's direction (move into it that way to jump over it, landing 2 tiles on); impassable from any other side; + edge walls: walkable, but movement across a walled side is refused in both directions (sides listed in the readout's Edge walls line); . clear terrain (may have script triggers); ? outside current map.";
const TERRAIN = "Terrain rules, elevation and objects can still block movement.";
const NAMED_WARPS = "Warp destinations are the map you arrive on: a name the game displays when one is available, then its group/number ID in parentheses; not warp indexes. Activation also requires matching elevation and available field controls; W alone does not guarantee a transition. After a transition, check the new map and position.";
const TRIGGERS = "Trigger elevation must also match the player on entry (0 matches any elevation).";
const HEADER = "Map symbols and rules (the readout's map and lists use these every turn; the readout does not repeat them):";

describe("readout-rules-in-prompt-v1 registry", () => {
  it("is a default-off server readout treatment recorded last that needs the RAM readout", () => {
    expect(featureInfo(ID)).toMatchObject({ group: "observation", needs: "ram-state-v1", switchable: true });
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(featureInfo(ID).description).toContain("Map symbols and rules: see the system prompt.");
    expect(SWITCHABLE_FEATURES.at(-140)).toBe(ID);
    expect(playHarnessFeatures(ALL_ON,null).at(-77)).toBe(ID);
    expect(playHarnessFeatures(set(ALL_ON, { [ID]: false }), null)).not.toContain(ID);
    expect(SERVER_FEATURES.at(-41)).toBe(ID);
    expect(serverFeatureEnv(set(ALL_ON, { [ID]: false })).POKEBENCH_FEATURES_OFF).toBe(`${ID},safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1`);
    expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("safe-navigation-strides-v1,original-speed-pacing-v1,exit-labels-v2,heal-before-trainers-v2,respawn-readout-v1,caught-nickname-prompt-v1,party-item-confirmation-v1,yes-no-answer-readout-v1,field-move-gates-v1,exit-labels-v3,move-learn-settle-v1,move-learn-question-v1,move-learn-comparison-v1,gym-door-label-v1,mart-stock-readout-v1,caught-dex-input-v1,exp-next-level-v1,pokedex-own-v1,shop-interface-v1,map-wide-triggers-v1");
    expect(dependencyProblems(set(ALL_ON, { "ram-state-v1": false }))).toContain(`${ID} needs ram-state-v1`);
  });

  it("reads presets written before the switch as OFF and keeps an explicit ON", () => {
    const v2 = { version: 2, id: "viewer-next", target: null, limits: { maxTurns: 300, maxWallMs: 1800000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: { ...OFF, "state-only-decisions-v1": false } };
    const older = Object.fromEntries(Object.entries(v2.features).filter(([id]) => id !== ID));
    expect(presetFeatures(parsePlayPreset({ ...v2, features: older }))[ID]).toBe(false);
    expect(presetFeatures(parsePlayPreset({ ...v2, features: { ...older, [ID]: true } }))[ID]).toBe(true);
    const v1 = { version: 1, id: "legacy", target: null, limits: v2.limits, sampling: v2.sampling, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false } };
    expect(presetFeatures(parsePlayPreset(v1))[ID]).toBe(false);
  });

  it("keeps state-only decisions from losing the rules: they have no section to carry them", () => {
    expect(stateOnlyProblems(set(ALL_ON, { "state-only-decisions-v1": true }))).toContain(`state-only-decisions-v1 requires ${ID} OFF`);
    expect(stateOnlyPrompt(SHOWCASE, null)).not.toContain(HEADER);
  });
});

describe("readout-rules-in-prompt-v1 system prompt", () => {
  it("OFF leaves the production prompt byte-identical", () => {
    expect(playSystemPrompt(OFF, null)).not.toContain(HEADER);
    expect(playSystemPrompt(OFF, null)).not.toContain(TERRAIN);
    for (const target of [null, "RIVAL_HOUSE_ENTERED"]) {
      expect(playSystemPrompt(SHOWCASE, target).replace(`\n\n${mapRulesSection(SHOWCASE)}`, "")).toBe(playSystemPrompt(OFF, target));
    }
  });

  it("ON states the showcase legend and the three fixed rules once, from the generated table", () => {
    const section = mapRulesSection(SHOWCASE);
    expect(section).toBe([HEADER, LEGEND, TERRAIN, NAMED_WARPS, TRIGGERS].join("\n"));
    const prompt = playSystemPrompt(SHOWCASE, null);
    expect(prompt.split(section)).toHaveLength(2);
    expect(prompt).not.toContain("see activation below");
    expect(prompt).not.toContain("= counter");
  });

  it("follows the configuration's own glyphs and rules", () => {
    const without = (...ids: SwitchableFeature[]): string => mapRulesSection(set(SHOWCASE, Object.fromEntries(ids.map((id) => [id, false]))));
    expect(without("ledge-hops-v1")).not.toContain("ledge");
    expect(without("one-way-tiles-v1")).not.toContain("edge walls");
    expect(mapRulesSection(set(SHOWCASE, { "full-map-navigation-v1": true }))).not.toContain("? outside current map");
    expect(without("named-warp-destinations-v1")).toContain("Warp destinations are map group/number IDs, not warp indexes.");
    expect(without("warp-activation-guidance-v1")).toContain("W warp;");
    expect(without("warp-activation-guidance-v1")).not.toContain("Warp destinations");
    expect(without("coordinate-script-conditions-v1")).not.toContain(TRIGGERS);
    expect(without("live-map-v1")).toBe(`${HEADER}\n${TRIGGERS}`);
    expect(without("live-map-v1", "coordinate-script-conditions-v1")).toBe("");
    expect(playSystemPrompt(set(SHOWCASE, { "live-map-v1": false, "coordinate-script-conditions-v1": false }), null)).toBe(playSystemPrompt(set(OFF, { "live-map-v1": false, "coordinate-script-conditions-v1": false }), null));
  });

  it("looks up a section for every combination of the switches it depends on, all server switches", () => {
    expect(MAP_RULE_SWITCHES.every((id) => SERVER_FEATURES.includes(id))).toBe(true);
    expect(Object.keys(MAP_RULE_INDEX)).toHaveLength(2 ** MAP_RULE_SWITCHES.length);
    expect(Object.values(MAP_RULE_INDEX).every((index) => index >= 0 && index < MAP_RULE_TEXTS.length)).toBe(true);
    expect(() => mapRulesSection(SHOWCASE, {}, MAP_RULE_TEXTS)).toThrow(/no map-rules section for off set "full-map-navigation-v1"/);
    expect(() => mapRulesSection(SHOWCASE, { "full-map-navigation-v1": 99 }, MAP_RULE_TEXTS)).toThrow(/no map-rules section/);
  });
});

describe("readout-rules-in-prompt-v1 pending experiment", () => {
  it("names every registry switch explicitly in its incumbent, with this switch off", () => {
    const entry = JSON.parse(readFileSync(new URL("../../../experiments/readout-rules-in-prompt.json", import.meta.url), "utf8")) as { changedFeature: string; incumbent: { features: Record<string, boolean> } };
    expect(entry.changedFeature).toBe(ID);
    const historical=SWITCHABLE_FEATURES.filter(id=>id!=="milestone-instruction-memory-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1");
    expect(Object.keys(entry.incumbent.features)).toEqual(historical.slice(0,historical.indexOf(ID)+1));
    expect(entry.incumbent.features[ID]).toBe(false);
  });
});
