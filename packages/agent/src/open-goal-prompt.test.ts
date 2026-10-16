// open-goal-prompt-v1: the system prompt's goal sentence names no town, gym or leader. Run
// 2026-10-16T12-42-29_qwen36-gpu0_4caa at T273 read "the LAB" as being in Rustboro City, a town no
// game text in that run had named; the only source was the goal sentence. test-support/open-goal-4caa.json
// holds that run's run_start (features and system prompt) and its T273 reasoning.
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {GOAL_SENTENCE,OPEN_GOAL_SENTENCE,OPEN_PLAY_GOAL,PLAY_GOAL,PLAY_SYSTEM_PROMPT,objectiveSwitches,playGoal,playSystemPrompt,playTools,toolSwitches} from "./play-config.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {stateOnlyPrompt} from "./state-runtime.js";

const ID="open-goal-prompt-v1";
const PREVIOUS="navigation-refusal-reasons-v2";
const RUN4CAA=JSON.parse(readFileSync(new URL("../test-support/open-goal-4caa.json",import.meta.url),"utf8")) as {harness_features:string[];system_prompt:string;turn_273_thinking:string};
const BUNDLE:FeatureSet=featuresOf(RUN4CAA.harness_features);
const with_=(features:FeatureSet,value:boolean):FeatureSet=>({...features,[ID]:value});
const PLACES=/\b(rustboro|petalburg|oldale|littleroot|gym|leader|roxanne|badge|city|town|lab)\b/i;

it("is a default-off agent-side guidance switch recorded right after navigation-refusal-reasons-v2",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"OPEN GOAL"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(featureInfo(ID).description).toContain(OPEN_GOAL_SENTENCE);
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf(PREVIOUS)+1);
 const recorded=playHarnessFeatures(ALL_ON,null);
 expect(recorded.indexOf(ID)).toBe(recorded.indexOf(PREVIOUS)+1);
 expect(playHarnessFeatures(with_(ALL_ON,false),null)).not.toContain(ID);
 expect(SERVER_FEATURES).not.toContain(ID);
 expect(dependencyProblems(with_(ALL_ON,true))).toEqual([]);
});

it("reads presets and legacy flags without the switch as OFF and keeps an explicit ON",()=>{
 const without=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
 expect(normalizeFeatures(without)[ID]).toBe(false);
 expect(normalizeFeatures({...without,[ID]:true})[ID]).toBe(true);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 const preset=parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without});
 expect(presetFeatures(preset)[ID]).toBe(false);
});

it("the recorded failure: run 4caa's prompt named Rustboro and its T273 reasoning put the LAB there",()=>{
 expect(RUN4CAA.system_prompt).toContain(GOAL_SENTENCE);
 expect(RUN4CAA.turn_273_thinking).toContain("LAB (Rustboro City)");
});

it("OFF reproduces run 4caa's recorded system prompt byte for byte",()=>{
 expect(BUNDLE[ID]).toBe(false);
 expect(playSystemPrompt(BUNDLE,null)).toBe(RUN4CAA.system_prompt);
 expect(playGoal(null,BUNDLE)).toBe(PLAY_GOAL);
});

it("ON replaces exactly the goal sentence and nothing else; tools are unchanged",()=>{
 expect(playSystemPrompt(with_(BUNDLE,true),null)).toBe(RUN4CAA.system_prompt.replace(GOAL_SENTENCE,OPEN_GOAL_SENTENCE));
 for(const base of [BUNDLE,with_(ALL_ON,false),{...with_(ALL_ON,false),"contextual-interface-docs-v1":false}]){
  const off=playSystemPrompt(base,null),on=playSystemPrompt(with_(base,true),null);
  expect(off.split(GOAL_SENTENCE)).toHaveLength(2);
  expect(on).toBe(off.replace(GOAL_SENTENCE,OPEN_GOAL_SENTENCE));
  expect(on).not.toMatch(/\b(rustboro|gym|gyms|leader|badge)\b/i);
  expect(playTools(with_(base,true))).toEqual(playTools(base));
  expect(toolSwitches(with_(base,true))).toEqual(toolSwitches(base));
  expect(objectiveSwitches(with_(base,true))).toEqual(objectiveSwitches(base));
 }
 expect(PLAY_SYSTEM_PROMPT.startsWith(`You are playing Pokémon Emerald on a Game Boy Advance emulator. ${GOAL_SENTENCE}\n\n`)).toBe(true);
});

it("names no town, gym, leader or story place in the goal",()=>{
 expect(OPEN_GOAL_SENTENCE).toBe("Your goal is to play the game and make as much story progress as you can; the people in the game will tell you what to do next.");
 expect(OPEN_PLAY_GOAL).toBe("Play the game and make as much story progress as you can; the people in the game will tell you what to do next.");
 expect(OPEN_GOAL_SENTENCE).not.toMatch(PLACES);
 expect(OPEN_PLAY_GOAL).not.toMatch(PLACES);
});

it("a target run keeps its target goal whether the switch is on or off",()=>{
 for(const value of [false,true]){
  const features=with_(BUNDLE,value);
  expect(playGoal("RIVAL_MET",features)).toBe("Reach the native game milestone RIVAL MET.");
  expect(playSystemPrompt(features,"RIVAL_MET")).toBe(playSystemPrompt(with_(BUNDLE,false),"RIVAL_MET"));
  expect(playSystemPrompt(features,"RIVAL_MET")).toContain("Your goal is: Reach the native game milestone RIVAL MET.");
 }
});

it("ON also opens the goal the objective record and the state-only prompt carry",()=>{
 expect(playGoal(null,with_(BUNDLE,true))).toBe(OPEN_PLAY_GOAL);
 const stateOnly={...with_(ALL_ON,false),"state-only-decisions-v1":true};
 expect(stateOnlyPrompt(stateOnly,null)).toContain(`You play Pokémon Emerald. ${PLAY_GOAL}\n\n`);
 expect(stateOnlyPrompt(with_(stateOnly,true),null)).toBe(stateOnlyPrompt(stateOnly,null).replace(PLAY_GOAL,OPEN_PLAY_GOAL));
});

it("a v2 preset with the switch reaches the production prompt (factory path)",()=>{
 const preset=parsePlayPreset({version:2,id:"open-goal-on",target:null,limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:with_(BUNDLE,true)});
 expect(playSystemPrompt(presetFeatures(preset),null)).toContain(OPEN_GOAL_SENTENCE);
 expect(playSystemPrompt(presetFeatures(preset),null)).not.toContain("Rustboro");
 const off=parsePlayPreset({...preset,features:with_(BUNDLE,false)});
 expect(playSystemPrompt(presetFeatures(off),null)).toContain(GOAL_SENTENCE);
});

it("the pending experiment's incumbent is the bundle-v-control bundle arm and flips only this switch",()=>{
 const raw=JSON.parse(readFileSync(new URL("../../../experiments/open-goal-prompt.json",import.meta.url),"utf8")) as {changedFeature:string;queuePosition?:number;externalCohort?:unknown;incumbent:{features:Record<string,boolean>}};
 const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
 expect(raw.changedFeature).toBe(ID);
 expect(raw.queuePosition).toBeUndefined();
 expect(raw.externalCohort).toBeUndefined();
 expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.slice(0,SWITCHABLE_FEATURES.indexOf(ID)+1));
 const bundleArm={...bundle.base.features,...Object.fromEntries(bundle.switches.map(s=>[s,true]))};
 for(const [id,value] of Object.entries(raw.incumbent.features))expect([id,value]).toEqual([id,id===ID?false:bundleArm[id]]);
});
