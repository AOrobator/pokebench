// trainer-heal-guidance-v1: the system prompt says trainer and rival battles cannot be fled, what a blackout
// costs, and to heal before talking to a trainer or the rival when below half HP. Round 2 bundle run
// 2026-10-16T04-51-03_qwen36-gpu0_54a7 talked to MAY at 3/21 HP (T369), blacked out and lost ₽1500.
// test-support/trainer-heal-54a7.json holds its run_start.
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {BATTLE_TRIAGE_SECTION,TRAINER_HEAL_SECTION,objectiveSwitches,playSystemPrompt,playTools,toolSwitches} from "./play-config.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";

const ID="trainer-heal-guidance-v1";
const PREVIOUS="presence-penalty-v1";
const RUN54A7=JSON.parse(readFileSync(new URL("../test-support/trainer-heal-54a7.json",import.meta.url),"utf8")) as {harness_features:string[];system_prompt:string};
const BUNDLE:FeatureSet=featuresOf(RUN54A7.harness_features);
const with_=(features:FeatureSet,value:boolean):FeatureSet=>({...features,[ID]:value});

it("is a default-off agent-side guidance switch recorded right after presence-penalty-v1",()=>{
 expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true,title:"TRAINER HEAL GUIDANCE"});
 expect(featureInfo(ID).description).toContain(" Off: ");
 expect(featureInfo(ID).description).toContain(TRAINER_HEAL_SECTION);
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

it("OFF reproduces run 54a7's recorded system prompt byte for byte",()=>{
 expect(BUNDLE[ID]).toBe(false);
 expect(playSystemPrompt(BUNDLE,null)).toBe(RUN54A7.system_prompt);
});

it("ON appends exactly the section, after battle triage when that is on; tools are unchanged",()=>{
 const on=playSystemPrompt(with_(BUNDLE,true),null);
 expect(on).toBe(RUN54A7.system_prompt.replace(`\n\n${BATTLE_TRIAGE_SECTION}`,`\n\n${BATTLE_TRIAGE_SECTION}\n\n${TRAINER_HEAL_SECTION}`));
 for(const base of [BUNDLE,with_(ALL_ON,false),{...BUNDLE,"battle-triage-guidance-v1":false,[ID]:false}]){
  const off=playSystemPrompt(base,null),withIt=playSystemPrompt(with_(base,true),null);
  expect(withIt.length).toBe(off.length+TRAINER_HEAL_SECTION.length+2);
  expect(withIt.split(`\n\n${TRAINER_HEAL_SECTION}`).join("")).toBe(off);
  expect(playTools(with_(base,true))).toEqual(playTools(base));
  expect(toolSwitches(with_(base,true))).toEqual(toolSwitches(base));
  expect(objectiveSwitches(with_(base,true))).toEqual(objectiveSwitches(base));
 }
});

it("states the game rules: no running from trainers, the blackout cost, and healing first",()=>{
 expect(TRAINER_HEAL_SECTION).toContain("cannot be run from");
 expect(TRAINER_HEAL_SECTION).toContain("your rival");
 expect(TRAINER_HEAL_SECTION).toContain("half your money");
 expect(TRAINER_HEAL_SECTION).toContain("last POKéMON CENTER you entered");
 expect(TRAINER_HEAL_SECTION).toContain("below half its maximum HP");
 expect(TRAINER_HEAL_SECTION).toContain("POKéMON CENTER heals your whole party");
 expect(TRAINER_HEAL_SECTION).toContain("MOM at home");
 // Game rules only: no places, characters or story steps.
 expect(TRAINER_HEAL_SECTION).not.toMatch(/\b(birch|professor|may|brendan|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge|pok[eé]dex|lab|town|city)\b/i);
});

it("a v2 preset with the switch reaches the production prompt (factory path)",()=>{
 const preset=parsePlayPreset({version:2,id:"heal-on",target:null,limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:with_(BUNDLE,true)});
 expect(playSystemPrompt(presetFeatures(preset),null)).toContain(TRAINER_HEAL_SECTION);
 const off=parsePlayPreset({...preset,features:with_(BUNDLE,false)});
 expect(playSystemPrompt(presetFeatures(off),null)).not.toContain("Trainer battles and your rival");
});
