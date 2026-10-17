import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ALL_ON, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, serverFeatureEnv, type FeatureSet } from "./features.js";
import { BATTLE_TRIAGE_SECTION, objectiveSwitches, playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
import { experimentArms, parseExperiment } from "./experiments.js";
import { flagFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";

const ID = "battle-triage-guidance-v1";
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const with_ = (features: FeatureSet, value: boolean): FeatureSet => ({ ...features, [ID]: value });
const PLAYABLE: FeatureSet = { ...ALL_ON, "state-only-decisions-v1": false };

// run_start of 2026-10-16T00-34-26_qwen36-gpu1_show (7 wild battles, 0 fled, blackout at turn 768).
const SHOW_FEATURES = ["ram-state-v1", "live-map-v1", "field-control-lock", "naming-cursor-v1", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "named-interactions-v1", "world-destinations-v1", "bounded-navigation-v1", "live-player-position-v1", "world-coordinate-grid-v1", "field-dialogue-phase-v1", "interaction-loop-detection-v1", "press-result-v1", "warp-activation-guidance-v1", "ledge-hops-v1", "one-way-tiles-v1", "clock-milestone-v1", "story-state-v1", "active-ui-ownership-v1", "story-milestones-v2", "new-game-created-v1", "post-clock-navigation-milestones-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1", "birch-rescue-requested-v1", "rival-house-exit-v1", "route-101-after-handoff-v1", "deterministic-loop-diagnostics-v1", "deterministic-loop-policy-v1:p6:o3:a3:c3:r2:recovery6", "deterministic-loop-guard-v1", "contextual-interface-docs-v1", "elevation-transitions-v1", "game-evidence-priority-v1", "loop-guard-supervisor-v1", "named-warp-destinations-v1", "text-only-supervisor-v1", "character-presence-v1", "navigation-refusal-reasons-v1", "transition-press-result-v1", "stall-briefing-v1", "dialogue-auto-advance-v1"];
const SHOW_PROMPT_SHA = "1dbf2e110968b604d0b8b937557cd2400b038959db64159c48c0f0acfd222d12";

it("registers a default-off guidance switch the game server applies, recorded last", () => {
  expect(featureInfo(ID)).toMatchObject({ group: "guidance", needs: null, switchable: true });
  const description = featureInfo(ID).description;
  expect(description).toContain(" Off: ");
  expect(description).toContain("below half");
  expect(description).toContain("RUN");
  expect(SWITCHABLE_FEATURES.at(-41)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-41)).toBe(ID);
  expect(playHarnessFeatures(with_(ALL_ON, false), null)).not.toContain(ID);
  expect(SERVER_FEATURES.at(-13)).toBe(ID);
  expect(serverFeatureEnv(with_(ALL_ON, false)).POKEBENCH_FEATURES_OFF).toBe(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF).toBe("");
  expect(dependencyProblems(with_(ALL_ON, true))).toEqual([]);
});

it("reads presets and legacy flags without the switch as OFF and keeps an explicit ON", () => {
  const v2 = { version: 2, id: "triage", target: null, limits: { maxTurns: 300, maxWallMs: 1800000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: Object.fromEntries(Object.entries(PLAYABLE).filter(([id]) => id !== ID)) };
  expect(ID in v2.features).toBe(false);
  expect(presetFeatures(parsePlayPreset(v2))[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({ ...v2, features: { ...v2.features, [ID]: true } }))[ID]).toBe(true);
  expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
});

it("OFF reproduces the showcase run's recorded system prompt byte for byte", () => {
  const show = featuresOf(SHOW_FEATURES);
  expect(show[ID]).toBe(false);
  expect(sha(playSystemPrompt(show, null))).toBe(SHOW_PROMPT_SHA);
});

it("ON appends exactly the battle and healing section; tools and results are unchanged", () => {
  for (const base of [featuresOf(SHOW_FEATURES), with_(ALL_ON, false), { ...ALL_ON, "objective-tracking-v1": false, "repeat-attempt-guard-v1": false, "native-objective-completion-v1": false, [ID]: false }]) {
    const off = playSystemPrompt(base, null), on = playSystemPrompt(with_(base, true), null);
    expect(on.length).toBe(off.length + BATTLE_TRIAGE_SECTION.length + 2);
    expect(on.split(`\n\n${BATTLE_TRIAGE_SECTION}`).join("")).toBe(off);
    expect(playTools(with_(base, true))).toEqual(playTools(base));
    expect(toolSwitches(with_(base, true))).toEqual(toolSwitches(base));
    expect(objectiveSwitches(with_(base, true))).toEqual(objectiveSwitches(base));
  }
  const plain = { ...ALL_ON, "explorer-guidance-v1": false, "explorer-guidance-v2": false, "untaken-exits-v1": false, "people-ledger-v1": false, "people-id-cards-v1": false, "trainer-heal-guidance-v1": false, "low-hp-trainer-warning-v1": false,"low-hp-trainer-warning-v2":false, "navigate-first-prompt-v1": false, "objective-tracking-v1": false, "repeat-attempt-guard-v1": false, "native-objective-completion-v1": false };
  expect(playSystemPrompt(plain, null)).toBe(`${playSystemPrompt(with_(plain, false), null)}\n\n${BATTLE_TRIAGE_SECTION}`);
  expect(playSystemPrompt(ALL_ON, "RIVAL_MET")).toContain(BATTLE_TRIAGE_SECTION);
});

it("states the battle menu, when to run and how to heal, without destinations or story steps", () => {
  expect(BATTLE_TRIAGE_SECTION).toContain("RUN, the bottom-right option");
  expect(BATTLE_TRIAGE_SECTION).toContain("from FIGHT press RIGHT, then DOWN, then A");
  expect(BATTLE_TRIAGE_SECTION).toContain("Trainer battles and some story battles cannot be fled");
  expect(BATTLE_TRIAGE_SECTION).toContain("below half its maximum HP");
  expect(BATTLE_TRIAGE_SECTION).toContain("POKéMON CENTER");
  expect(BATTLE_TRIAGE_SECTION).toContain("MOM at home");
  expect(BATTLE_TRIAGE_SECTION).not.toMatch(/\b(rival|birch|professor|may|brendan|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge|pok[eé]dex|lab|town|city)\b/i);
});

it("a v2 preset reaches the production prompt and server env (factory path)", () => {
  const preset = parsePlayPreset({ version: 2, id: "triage-on", target: null, limits: { maxTurns: 300, maxWallMs: 1800000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: { ...PLAYABLE } });
  const on = presetFeatures(preset);
  expect(playSystemPrompt(on, null)).toContain(BATTLE_TRIAGE_SECTION);
  expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  const off = presetFeatures(parsePlayPreset({ ...preset, features: with_(PLAYABLE, false) }));
  expect(playSystemPrompt(off, null)).not.toContain("Battles and healing");
  expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
});

it("registers the pending experiment as active from the new game, since the prompt section is seen from the first turn", () => {
  const entry = parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/battle-triage-guidance.json", import.meta.url), "utf8")));
  expect(entry.changedFeature).toBe(ID);
  expect(entry.queuePosition).toBeUndefined();
  const { incumbent, candidate } = experimentArms(entry);
  expect(playSystemPrompt(candidate.features, null)).not.toBe(playSystemPrompt(incumbent.features, null));
  expect(entry.activationMilestone).toBe("NEW_GAME_CREATED");
});
