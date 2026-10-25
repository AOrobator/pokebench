import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "./fixed-definition.js";
import {readFileSync,readdirSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {dependencyProblems,playHarnessFeatures} from "@pokebench/agent/features";
import {playTools,playSystemPrompt} from "../../agent/src/play-config.js";
import {armPreset,controlBaseProblems} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
const IDS=["instruction-goal-ledger-v1","menu-option-tool-v1"] as const;
const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"];
const ARCHIVED=["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"];
const RECIPES=[...CURRENT,...ARCHIVED];
const read=(p:string)=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
it("disables the ledger in maintained arms while preserving archived definitions and the independent menu tool",()=>{
 for(const id of IDS)expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const name of RECIPES){
  const {definition}=readFixedDefinition(sourceRoot,name,ARCHIVED.includes(name));
  expect(controlBaseProblems(definition,read(definition.controlBase.path)),name).toEqual([]);
  for(const phase of definition.phases)for(const arm of ["control","bundle"] as const){
   const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
   expect(dependencyProblems(features),`${name}/${phase.id}/${arm}`).toEqual([]);
   for(const id of IDS){const enabled=arm==="bundle"&&(id!=="instruction-goal-ledger-v1"||ARCHIVED.includes(name));expect(definition.base.features[id]).toBe(false);expect(features[id]).toBe(enabled);expect(playHarnessFeatures(features,null).includes(id)).toBe(enabled);}
   const names=playTools(features);expect(names.includes("review_goals")).toBe(arm==="bundle"&&ARCHIVED.includes(name));expect(names.includes("select_menu_option")).toBe(arm==="bundle");
   // Disabling either new feature leaves the other one's model tool available.
   if(arm==="bundle"&&ARCHIVED.includes(name)){
    expect(features["harness-trust-v1"],`${name}/${phase.id}`).toBe(true);
    for(const scene of ["overworld","battle","menu","clock","naming","unknown"] as const){
     const prompt=playSystemPrompt(features,null,scene);
     expect(prompt,`${name}/${phase.id}/${scene}`).toContain("Historical place mentions are context; you interpret and maintain your active goals in the instruction ledger.");
     expect(prompt,`${name}/${phase.id}/${scene}`).not.toContain("Each result starts with it as the Story goal line");
     expect(prompt,`${name}/${phase.id}/${scene}`).not.toContain("A SUPERVISOR note under the header says");
    }
    expect(playTools({...features,"instruction-goal-ledger-v1":false})).toContain("select_menu_option");
    expect(playTools({...features,"menu-option-tool-v1":false})).toContain("review_goals");
   }
  }
 }
});
it("does not silently activate either feature in historical or other fixed definitions",()=>{
 const files=readdirSync(new URL("../../../experiments/fixed/",import.meta.url)).filter(name=>name.endsWith(".json"));
 for(const id of IDS){
  const enabled=files.filter(name=>readFixedDefinition(sourceRoot,name.slice(0,-5)).definition.switches.includes(id)).map(name=>name.slice(0,-5)).sort();
  expect(enabled,id).toEqual(id==="instruction-goal-ledger-v1"?[]:[...CURRENT].sort());
 }
});

it("materializes the approved recovery configuration without changing cutscene or archived recipes",()=>{
 for(const id of ["instruction-goal-advisory-v1","goal-review-repair-feedback-v1"] as const)expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const name of CURRENT){
  const {definition}=readFixedDefinition(sourceRoot,name);
  for(const phase of definition.phases)for(const arm of ["control","bundle"] as const){
   const f=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
   expect(f["instruction-goal-ledger-v1"],`${name}/${phase.id}/${arm}`).toBe(false);
   for(const id of ["instruction-goal-advisory-v1","goal-review-repair-feedback-v1","cutscene-journal-v1"] as const)expect(f[id],`${name}/${phase.id}/${arm}/${id}`).toBe(arm==="bundle");
   expect(playTools(f)).not.toContain("review_goals");expect(playSystemPrompt(f,null)).not.toContain("Reviews are optional bookkeeping");expect(dependencyProblems(f)).toEqual([]);
  }
 }
});
