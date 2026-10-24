import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {dependencyProblems} from "@pokebench/agent/features";
import {armPreset} from "./fixed-design.js";
import {readFixedDefinition} from "./fixed-definition.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"];
const ARCHIVED=["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"];
it("the production arm builder enables citation evidence only in the named bundle arms",()=>{
 const id="citation-evidence-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const name of [...CURRENT,...ARCHIVED]){
  const {definition}=readFixedDefinition(sourceRoot,name,ARCHIVED.includes(name));
  expect(definition.base.features[id],name).toBe(false);
  for(const phase of definition.phases){
   const bundle=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"bundle")));
   const control=presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"control")));
   expect(bundle[id],name).toBe(true);
   expect(bundle["cited-destination-v1"],name).toBe(true);
   expect(control[id],name).toBe(false);
   expect(dependencyProblems(bundle),name).toEqual([]);
   expect(dependencyProblems(control),name).toEqual([]);
  }
 }
});
