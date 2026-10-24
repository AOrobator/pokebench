import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";
const ID="moving-npc-target-v1";
it("defaults OFF and enables the fix only in maintained bundle arms",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 for(const name of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
  const phase=def.phases[0];if(phase===undefined)throw new Error("missing phase");
  expect(armPreset(def,phase.id,"bundle").features[ID],name).toBe(true);
  expect(armPreset(def,phase.id,"control").features[ID],name).toBe(false);
 }
});
