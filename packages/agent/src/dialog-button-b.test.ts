import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures,presetFeatures,parsePlayPreset} from "./play-preset.js";
import type {FeatureSet} from "./features.js";
import {DIALOGUE_BUTTON_B_SECTION,playSystemPrompt} from "./play-config.js";

const ID = "dialog-button-b-v1" as const;

describe("dialog-button-b-v1", () => {
  it("is registered last, default off, and the bundle arm is the one that turns it on", () => {
    expect(SWITCHABLE_FEATURES.at(-44)).toBe(ID);
    expect(playHarnessFeatures(ALL_ON, null).at(-18)).toBe(ID);
    expect(featureInfo(ID)).toMatchObject({group: "guidance", needs: null, switchable: true, title: "DIALOGUE BUTTON B"});
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(featureInfo(ID).description).toContain("Bundle arm only");
    expect(flagFeatures({loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false})[ID]).toBe(false);
    expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
    const without = Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, "state-only-decisions-v1": false}).filter(([id]) => id !== ID)) as FeatureSet;
    expect(presetFeatures(parsePlayPreset({version: 2, id: "p", target: null, limits: {maxTurns: 1, maxWallMs: 1, failureLimit: 1}, sampling: {thinkingLevel: "medium", maxTokens: 1}, features: without}))[ID]).toBe(false);
    const bundle = JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json", import.meta.url), "utf8")) as {base: {features: Record<string, boolean>}; switches: string[]};
    expect(bundle.base.features[ID]).toBe(false);
    expect(bundle.switches).toContain(ID);
    const cook = JSON.parse(readFileSync(new URL("../../../experiments/open-goal-prompt.json", import.meta.url), "utf8")) as {incumbent: {features: Record<string, boolean>}};
    expect(cook.incumbent.features[ID]).toBe(true);
    const raw = JSON.parse(readFileSync(new URL("../../../experiments/dialog-button-b.json", import.meta.url), "utf8")) as {queuePosition?: number; incumbent: {features: Record<string, boolean>}};
    expect(raw.queuePosition).toBeUndefined();
    expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="short-cycle-fixed-point-v1"&&id!=="party-item-confirmation-v1"&&id!=="same-target-no-progress-v1"&&id!=="duplicate-turn-collapse-v1"&&id!=="auto-talk-v1"&&id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="unfinished-activity-v1"&&id!=="exit-labels-v2"&&id!=="heal-before-trainers-v2"&&id!=="gym-heal-warning-v1"&&id!=="respawn-readout-v1"&&id!=="trainer-sight-check-v1"&&id!=="caught-nickname-prompt-v1"&&id!=="fail-open-input-v1"&&id!=="whiteout-healed-v1"&&id!=="gym-readiness-readout-v1"&&id!=="context-token-budget-v1"&&id!=="briefing-repeat-count-v1"&&id!=="navigate-already-here-v1"&&id!=="original-speed-pacing-v1"&&id!=="semantic-navigation-v2"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="stale-story-goal-v2"&&id!=="visited-terrain-navigation-v1"));
    const {incumbent, candidate} = experimentArms(parseExperiment(raw));
    expect(incumbent.features[ID]).toBe(false);
    expect(candidate.features[ID]).toBe(true);
    expect(SWITCHABLE_FEATURES.filter((id) => incumbent.features[id] !== candidate.features[id])).toEqual([ID]);
  });

  it("OFF leaves the prompt byte for byte, and ON adds the section immediately before harness trust", () => {
    const off = playSystemPrompt({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, [ID]: false, "harness-trust-v1": true}, null);
    const on = playSystemPrompt({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, [ID]: true, "harness-trust-v1": true}, null);
    expect(off).not.toContain("Dialogue button:");
    expect(on.replace(`\n\n${DIALOGUE_BUTTON_B_SECTION}`, "")).toBe(off);
    expect(DIALOGUE_BUTTON_B_SECTION).toContain("B is the button for a message");
    expect(DIALOGUE_BUTTON_B_SECTION).not.toContain("MOM");
    expect(DIALOGUE_BUTTON_B_SECTION).not.toContain("truck");
    const sectionAt = on.indexOf(DIALOGUE_BUTTON_B_SECTION);
    expect(sectionAt).toBeGreaterThan(0);
    expect(on.indexOf("Trust order", sectionAt)).toBeGreaterThan(sectionAt);
  });
});
