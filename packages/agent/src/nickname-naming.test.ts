import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {dependencyProblems,featureInfo,playHarnessFeatures,SERVER_FEATURES,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {NO_NICKNAME_SECTION,objectiveSwitches,playSystemPrompt} from "./play-config.js";
import {objectivePrompt} from "./objective-tools.js";

// Showcase bundle run 2026-10-16T00-34-26_qwen36-gpu1_show: PROF. BIRCH offered a nickname at
// turn 252, the model said YES and was still in the editor 78 turns later, typing "MOM" from the
// screenshot alone because the in-game naming screen had no readout. live.ts builds the system
// prompt with playSystemPrompt(features, target), so these prompt tests exercise the production path.
const NAMING="in-game-naming-readout-v1";
const GUIDANCE="no-nickname-guidance-v1";
const OFF:FeatureSet={...ALL_ON,[NAMING]:false,[GUIDANCE]:false,"navigate-first-prompt-v1":false};
const base={version:2,id:"nick",target:null,limits:{maxTurns:10,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096}};
const without=(features:Record<string,boolean>,...ids:string[])=>Object.fromEntries(Object.entries(features).filter(([k])=>!ids.includes(k)));

describe("in-game-naming-readout-v1",()=>{
 it("is a default-off server observation switch that needs the naming readout, with OFF copy",()=>{
  expect(featureInfo(NAMING)).toMatchObject({group:"observation",needs:"naming-cursor-v1",switchable:true});
  expect(featureInfo(NAMING).description).toContain(" Off: ");
  expect(SERVER_FEATURES).toContain(NAMING);
  expect(serverFeatureEnv(OFF).POKEBENCH_FEATURES_OFF.split(",")).toContain(NAMING);
  expect(serverFeatureEnv({...OFF,[NAMING]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(NAMING);
  expect(dependencyProblems({...OFF,[NAMING]:true,"naming-cursor-v1":false}).join(" ")).toContain(NAMING);
  expect(playHarnessFeatures({...OFF,[NAMING]:true},null)).toContain(NAMING);
  expect(playHarnessFeatures(OFF,null)).not.toContain(NAMING);
 });
});

describe("no-nickname-guidance-v1",()=>{
 it("is a default-off agent-side guidance switch with OFF copy",()=>{
  expect(featureInfo(GUIDANCE)).toMatchObject({group:"guidance",needs:null,switchable:true});
  expect(featureInfo(GUIDANCE).description).toContain(" Off: ");
  expect(SERVER_FEATURES).not.toContain(GUIDANCE);
  expect(playHarnessFeatures({...OFF,[GUIDANCE]:true},null)).toContain(GUIDANCE);
  expect(playHarnessFeatures(OFF,null)).not.toContain(GUIDANCE);
 });
 it("OFF leaves the system prompt unchanged; ON appends one paragraph",()=>{
  const plain:FeatureSet={...OFF,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"objective-tracking-v1":false,"readout-rules-in-prompt-v1":false,"battle-triage-guidance-v1":false,"explorer-guidance-v1":false,"explorer-guidance-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false};
  const off=playSystemPrompt(plain,null),on=playSystemPrompt({...plain,[GUIDANCE]:true},null);
  expect(off).not.toContain("nickname only costs time");
  expect(on).toBe(`${off}\n\n${NO_NICKNAME_SECTION}`);
  expect(NO_NICKNAME_SECTION).toBe("Nicknames: this is a speed run, and naming a Pokémon only costs time. When the game offers to give a Pokémon a nickname, answer NO. If you are already on the naming screen for a Pokémon's nickname, do not type or fix letters: press START to move the cursor to OK, then A. Any nickname is fine, and with nothing typed the Pokémon keeps its own name.");
 });
 it("the objective record still follows the guidance paragraph",()=>{
  const features:FeatureSet={...OFF,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,[GUIDANCE]:true,"objective-tracking-v1":true,"readout-rules-in-prompt-v1":false,"battle-triage-guidance-v1":false,"explorer-guidance-v1":false,"explorer-guidance-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false};
  expect(playSystemPrompt(features,null)).toBe(`${playSystemPrompt({...features,"objective-tracking-v1":false},null)}\n\n${objectivePrompt(objectiveSwitches(features))}`);
  expect(playSystemPrompt({...features,"objective-tracking-v1":false},null).endsWith(NO_NICKNAME_SECTION)).toBe(true);
 });
});

describe("presets",()=>{
 it("presets and flag presets that omit them run with both off",()=>{
  const flags=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect([flags[NAMING],flags[GUIDANCE]]).toEqual([false,false]);
  const rest=without({...ALL_ON,...flags},NAMING,GUIDANCE);
  const omitted=presetFeatures(parsePlayPreset({...base,features:rest}));
  expect([omitted[NAMING],omitted[GUIDANCE]]).toEqual([false,false]);
  const on=presetFeatures(parsePlayPreset({...base,features:{...rest,[NAMING]:true,[GUIDANCE]:true}}));
  expect([on[NAMING],on[GUIDANCE]]).toEqual([true,true]);
 });
});
