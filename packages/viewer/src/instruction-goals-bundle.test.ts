import {readFileSync,readdirSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {dependencyProblems,playHarnessFeatures} from "@pokebench/agent/features";
import {playTools,playSystemPrompt} from "../../agent/src/play-config.js";
import {armPreset,controlBaseProblems,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const IDS=["instruction-goal-ledger-v1","menu-option-tool-v1"] as const;
const RECIPES=["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"];
const read=(p:string)=>readFileSync(new URL(`../../../${p}`,import.meta.url),"utf8");
it("activates two independent tools only in generated bundle arms and preserves the pinned controls",()=>{
 for(const id of IDS)expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const name of RECIPES){
  const {definition}=parseFixedDefinition(read(`experiments/fixed/${name}.json`));
  expect(controlBaseProblems(definition,read(definition.controlBase.path)),name).toEqual([]);
  for(const phase of definition.phases)for(const arm of ["control","bundle"] as const){
   const features=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,arm)));
   expect(dependencyProblems(features),`${name}/${phase.id}/${arm}`).toEqual([]);
   for(const id of IDS){expect(definition.base.features[id]).toBe(false);expect(features[id]).toBe(arm==="bundle");expect(playHarnessFeatures(features,null).includes(id)).toBe(arm==="bundle");}
   const names=playTools(features);expect(names.includes("review_goals")).toBe(arm==="bundle");expect(names.includes("select_menu_option")).toBe(arm==="bundle");
   // Disabling either new feature leaves the other one's model tool available.
   if(arm==="bundle"){
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
  const enabled=files.filter(name=>{const body:unknown=JSON.parse(read(`experiments/fixed/${name}`));return typeof body==="object"&&body!==null&&"switches"in body&&Array.isArray(body.switches)&&body.switches.includes(id);}).map(name=>name.slice(0,-5)).sort();
  expect(enabled,id).toEqual([...RECIPES].sort());
 }
});
