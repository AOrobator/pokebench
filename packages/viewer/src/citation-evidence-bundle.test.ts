import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

it("the production arm builder enables citation evidence only in the named bundle arms",()=>{
 const id="citation-evidence-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const name of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","glm53-flash-4h"]){
  const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
  const phase=definition.phases[0];if(phase===undefined)throw Error("missing phase");
  expect(armPreset(definition,phase.id,"bundle").features[id],name).toBe(true);
  expect(armPreset(definition,phase.id,"bundle").features["cited-destination-v1"],name).toBe(true);
  expect(armPreset(definition,phase.id,"control").features[id],name).toBe(false);
 }
});
