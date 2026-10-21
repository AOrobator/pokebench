// tool-prompt-docs-v1 (tool-prompt-sync skill): every tool the model has is named in its system prompt.
// Run d548 had choose_evolution in its tool list and not a word about it in its system prompt.
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {jitTools,playSystemPrompt,playTools,type PromptScene} from "./play-config.js";
import {experimentArms,parseExperiment} from "./experiments.js";

const ID="tool-prompt-docs-v1" as const;
const root=(path:string):URL=>new URL(`../../../${path}`,import.meta.url);
const json=(path:string):unknown=>JSON.parse(readFileSync(root(path),"utf8"));
type Fixed={base:{features:Record<string,boolean>};switches:string[]};
const asFeatures=(raw:Record<string,boolean>):FeatureSet=>normalizeFeatures(Object.fromEntries(Object.entries(raw).filter(([id])=>(SWITCHABLE_FEATURES as readonly string[]).includes(id))) as Parameters<typeof normalizeFeatures>[0]);

function featureSets():[string,FeatureSet][]{
 const sets:[string,FeatureSet][]=[["default flags",flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})]];
 for(const name of readdirSync(root("experiments/fixed")).filter(file=>file.endsWith(".json"))){
  const def=json(`experiments/fixed/${name}`) as Fixed;
  for(const arm of ["control","bundle"] as const)sets.push([`fixed ${name} ${arm}`,asFeatures({...def.base.features,...Object.fromEntries(def.switches.map(id=>[id,arm==="bundle"]))})]);
 }
 for(const name of readdirSync(root("experiments/fixed/control-bases")).filter(file=>file.endsWith(".json"))){
  sets.push([`control base ${name}`,presetFeatures(parsePlayPreset(json(`experiments/fixed/control-bases/${name}`)))]);
 }
 for(const name of readdirSync(root("experiments")).filter(file=>file.endsWith(".json"))){
  let arms:ReturnType<typeof experimentArms>;
  try{arms=experimentArms(parseExperiment(json(`experiments/${name}`)));}catch{continue;}
  sets.push([`experiment ${name} incumbent`,arms.incumbent.features],[`experiment ${name} candidate`,arms.candidate.features]);
 }
 return sets;
}

const named=(prompt:string,tool:string):boolean=>new RegExp(`(^|[^a-z_])${tool}([^a-z_]|$)`).test(prompt);
const SCENES:readonly PromptScene[]=["overworld","battle","naming","clock","menu"];

describe("tool-prompt-docs-v1",()=>{
 const sets=featureSets();
 it("covers the default flags, every fixed arm, every control base and experiment arms",()=>{
  expect(sets.filter(([name])=>name.startsWith("fixed ")).length).toBeGreaterThanOrEqual(40);
  expect(sets.some(([name])=>name.startsWith("experiment "))).toBe(true);
 });
 it.each(sets)("names every tool from playTools in playSystemPrompt: %s",(_name,features)=>{
  const on={...features,[ID]:true};
  const prompt=playSystemPrompt(on,null);
  expect(playTools(on).filter(tool=>!named(prompt,tool))).toEqual([]);
 });
 it.each(sets)("names every tool kept for a just-in-time scene in that scene's prompt: %s",(_name,features)=>{
  const on={...features,[ID]:true,"just-in-time-prompt-v1":true};
  expect(SCENES.flatMap(scene=>{
   const prompt=playSystemPrompt(on,null,scene);
   return jitTools(playTools(on).map(name=>({name})),scene).map(tool=>tool.name).filter(tool=>!named(prompt,tool)).map(tool=>`${scene}:${tool}`);
  })).toEqual([]);
 });
 it("documents choose_evolution from its own tool description, recommending neither option",()=>{
  const on={...ALL_ON,[ID]:true};
  const prompt=playSystemPrompt(on,null);
  expect(prompt).toContain("- choose_evolution: when the readout shows an evolution waiting for choose_evolution, call it with decision evolve (the evolution completes) or cancel (it stops). Ordinary buttons are blocked until you choose. Neither option is recommended. Move-learning prompts afterward use their own controls. It refuses, and presses nothing, when no evolution is waiting.");
  expect(playSystemPrompt({...on,"evolution-decision-v1":false},null)).not.toContain("choose_evolution");
 });
 it("documents battle_action from its own tool description, in the scenes that keep it",()=>{
  const on={...ALL_ON,[ID]:true};
  const line="- battle_action: while a battle waits for your choice, chooses fight with move (a move your active POKéMON knows), bag, pokemon or run in one call. The harness moves the battle menu's highlight and presses A, checking the cursor after each press, and refuses without pressing when no battle is waiting for a choice, the active POKéMON does not know the move or the move has no PP. bag and pokemon stop on the BAG or POKéMON screen; choose there with press. YES/NO choices are not handled; use press.";
  expect(playSystemPrompt(on,null)).toContain(line);
  expect(playSystemPrompt({...on,"just-in-time-prompt-v1":true},null,"battle")).toContain(line);
  expect(playSystemPrompt({...on,"just-in-time-prompt-v1":true},null,"overworld")).not.toContain("- battle_action:");
  expect(playSystemPrompt({...on,"battle-move-tool-v1":false},null)).not.toContain("- battle_action:");
 });
 it("gives a tool kept in a just-in-time scene one line when its own section is not shown there",()=>{
  const on={...ALL_ON,[ID]:true,"just-in-time-prompt-v1":true};
  const battle=playSystemPrompt(on,null,"battle");
  for(const line of [
   "- get_dialogue: searches every dialogue page the harness advanced through this run, by speaker, words, map or recency. It presses nothing.",
   "- recall_dialogue: searches every dialogue page you have been shown this run, newest first. It presses nothing.",
   "- remember_destination: optionally keeps your destination hypothesis, grounded in navigation ledger events, across context pruning. It presses nothing.",
   "- note_contradiction: records that the game differed from what you expected, citing 1–4 event numbers. It changes nothing in the game.",
   "- get_next_milestone: tells you the next main story milestone the game has not recorded yet. It presses nothing.",
  ])expect(battle).toContain(line);
  expect(playSystemPrompt(on,null,"overworld")).not.toContain("- get_dialogue: searches");
  expect(playSystemPrompt(on,null,"naming")).not.toContain("- get_dialogue:");
  expect(playSystemPrompt({...on,[ID]:false},null,"battle")).not.toContain("- get_dialogue:");
 });
 it("OFF keeps every prompt byte for byte (hashes taken before the switch existed)",()=>{
  const base=presetFeatures(parsePlayPreset(json("experiments/fixed/control-bases/whole-map-bundle-fd95.json")));
  const hash=(features:FeatureSet):string=>{
   const h=createHash("sha256");h.update(playSystemPrompt(features,null));
   for(const scene of SCENES)h.update("\0"+playSystemPrompt({...features,"just-in-time-prompt-v1":true},null,scene));
   return h.digest("hex");
  };
  expect(hash({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true}),[ID]:false})).toBe("5afd9eb7df56df30a50292e9daabe32b64924d9e699e5078e5e9b2db603853fe");
  expect(hash({...base,[ID]:false})).toBe("9bd07f021405af736767be7147528159f7192c60f59e6c934729422fe232232c");
  expect(hash({...base,[ID]:false,"evolution-decision-v1":true,"battle-move-tool-v1":true})).toBe("9bd07f021405af736767be7147528159f7192c60f59e6c934729422fe232232c");
  for(const [,features] of sets)expect(playSystemPrompt({...features,[ID]:false},null)).not.toContain("- choose_evolution:");
 });
 it("is a default-off agent-only guidance switch, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.at(-2)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-2)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
