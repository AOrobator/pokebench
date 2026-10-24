import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";
it("generates bundle ON and control ON for the first-trigger switch",()=>{
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"]){
  const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
  for(const phase of definition.phases){
   expect(armPreset(definition,phase.id,"control").features["trigger-navigation-boundary-v1"]).toBe(true);
   expect(armPreset(definition,phase.id,"bundle").features["trigger-navigation-boundary-v1"]).toBe(true);
  }
 }
});
