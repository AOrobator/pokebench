import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {dependencyProblems} from "@pokebench/agent/features";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

const ROOT=fileURLToPath(new URL("../../..",import.meta.url));
it("enables unique instruction memory only in future current-recipe bundles",()=>{
 const id="instruction-memory-dedup-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const name of ["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"]){
  const {definition}=readFixedDefinition(ROOT,name);
  expect(definition.base.features[id],name).toBe(false);
  for(const phase of definition.phases){
   const bundle=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"bundle")));
   const control=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"control")));
   expect(bundle[id],name).toBe(true);
   expect(control[id],name).toBe(false);
   expect(bundle["delivered-place-evidence-v1"],name).toBe(true);
   expect(bundle["instruction-goal-ledger-v1"],name).toBe(false);
   expect(dependencyProblems(bundle),name).toEqual([]);
   expect(dependencyProblems(control),name).toEqual([]);
  }
 }
});
