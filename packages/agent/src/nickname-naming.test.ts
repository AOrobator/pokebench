import {describe,expect,it} from "vitest";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SERVER_FEATURES,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {NO_NICKNAME_SECTION,playSystemPrompt} from "./play-config.js";

// Showcase bundle run 2026-10-16T00-34-26_qwen36-gpu1_show: PROF. BIRCH offered a nickname at
// turn 252, the model said YES and was still in the editor 78 turns later, typing "MOM" from the
// screenshot alone because the in-game naming screen had no readout. live.ts builds the system
// prompt with playSystemPrompt(features, target), so these prompt tests exercise the production path.
const NAMING="in-game-naming-readout-v1";
const GUIDANCE="no-nickname-guidance-v1";
const OFF:FeatureSet={...ALL_ON,[NAMING]:false,[GUIDANCE]:false};
const base={version:2,id:"nick",target:null,limits:{maxTurns:10,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096}};
const without=(features:FeatureSet,...ids:string[])=>Object.fromEntries(Object.entries(features).filter(([k])=>!ids.includes(k)));

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
  const off=playSystemPrompt(OFF,null),on=playSystemPrompt({...OFF,[GUIDANCE]:true},null);
  expect(off).not.toContain("nickname only costs time");
  expect(on).toBe(`${off}\n\n${NO_NICKNAME_SECTION}`);
  expect(NO_NICKNAME_SECTION).toBe("Nicknames: this is a speed run, and naming a Pokémon only costs time. When the game offers to give a Pokémon a nickname, answer NO. If you are already on the naming screen for a Pokémon's nickname, do not type or fix letters: press START to move the cursor to OK, then A. Any nickname is fine, and with nothing typed the Pokémon keeps its own name.");
 });
 it("the objective record still follows the guidance paragraph",()=>{
  const on=playSystemPrompt({...OFF,[GUIDANCE]:true,"objective-tracking-v1":true},null);
  expect(on.indexOf(NO_NICKNAME_SECTION)).toBeGreaterThan(0);
  expect(on.indexOf(NO_NICKNAME_SECTION)).toBeLessThan(on.indexOf("objective"));
 });
});

describe("presets",()=>{
 it("presets and flag presets that omit them run with both off",()=>{
  const flags=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect([flags[NAMING],flags[GUIDANCE]]).toEqual([false,false]);
  const rest=without(OFF,NAMING,GUIDANCE);
  const omitted=presetFeatures(parsePlayPreset({...base,features:rest}));
  expect([omitted[NAMING],omitted[GUIDANCE]]).toEqual([false,false]);
  const on=presetFeatures(parsePlayPreset({...base,features:{...rest,[NAMING]:true,[GUIDANCE]:true}}));
  expect([on[NAMING],on[GUIDANCE]]).toEqual([true,true]);
 });
});
