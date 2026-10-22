import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// open-goal-prompt-v1: the system prompt's goal sentence names no town, gym or leader. Run
// 2026-10-16T12-42-29_qwen36-gpu0_4caa at T273 read "the LAB" as being in Rustboro City, a town no
// game text in that run had named; the only source was the goal sentence. test-support/open-goal-4caa.json
// holds that run's run_start (features and system prompt) and its T273 reasoning.
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {GOAL_SENTENCE,OPEN_GOAL_SENTENCE,OPEN_PLAY_GOAL,PLAY_GOAL,PLAY_SYSTEM_PROMPT,objectiveSwitches,playGoal,playSystemPrompt,playTools,toolSwitches} from "./play-config.js";
import {deriveStatus,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {stateOnlyPrompt} from "./state-runtime.js";

const ID="open-goal-prompt-v1";
const PREVIOUS="people-id-cards-v1";
const RUN4CAA=JSON.parse(readFileSync(new URL("../test-support/open-goal-4caa.json",import.meta.url),"utf8")) as {harness_features:string[];system_prompt:string;turn_273_thinking:string};
const BUNDLE:FeatureSet=featuresOf(RUN4CAA.harness_features);
const with_=(features:FeatureSet,value:boolean):FeatureSet=>({...features,[ID]:value});
const PLACES=/\b(rustboro|petalburg|oldale|littleroot|gym|leader|roxanne|badge|city|town|lab)\b/i;
const OLD_WARP_RULE="Warp destinations are the map you arrive on: its name when the game's map table has one";
const KNOWN_WARP_RULE="Warp destinations are the map you arrive on: a name the game displays when one is available";
const currentPrompt=(recorded:string):string=>recorded.replace(OLD_WARP_RULE,KNOWN_WARP_RULE);

it("is a default-off agent-side guidance switch recorded right after people-id-cards-v1",()=>{
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
 const without=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
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
 expect(playSystemPrompt(BUNDLE,null)).toBe(currentPrompt(RUN4CAA.system_prompt));
 expect(playGoal(null,BUNDLE)).toBe(PLAY_GOAL);
});

it("ON replaces exactly the goal sentence and nothing else; tools are unchanged",()=>{
 expect(playSystemPrompt(with_(BUNDLE,true),null)).toBe(currentPrompt(RUN4CAA.system_prompt).replace(GOAL_SENTENCE,OPEN_GOAL_SENTENCE));
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
 const historical=SWITCHABLE_FEATURES.filter(id=>id!=="rejected-movement-prefix-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1").filter(id=>id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1");
 const named=historical.slice(0,historical.indexOf(ID)+1);
 expect(named.at(-1)).toBe(ID);
 expect(Object.keys(raw.incumbent.features).slice(0,named.length)).toEqual(named);
 const bundleArm={...bundle.base.features,...Object.fromEntries(bundle.switches.map(s=>[s,true]))};
 for(const [id,value] of Object.entries(raw.incumbent.features))expect([id,value]).toEqual([id,id===ID?false:(bundleArm[id]??false)]);
 for(const id of bundle.switches.filter(id=>id in raw.incumbent.features))expect([id,raw.incumbent.features[id]]).toEqual([id,id!==ID]);
});

it("the pending entry never joins the queue by itself: it stays blocked as a bundle-arm switch even once readiness passes",()=>{
 const experiment=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/open-goal-prompt.json",import.meta.url),"utf8")));
 const ready={ready:true,basis:"comparable",milestone:"NEW_GAME_CREATED",window:4,minReached:3,reached:4,considered:["r1","r2","r3","r4"]} as const;
 const status=deriveStatus({experiment,approval:null,ledger:[],runner:null,readiness:ready});
 expect(status.state).toBe("blocked");
 expect(status.reason).toContain("bundle arm of bundle-v-control");
});
