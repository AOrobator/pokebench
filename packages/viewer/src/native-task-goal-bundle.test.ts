import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";

it("enables native task retirement in generated bundle presets and keeps controls OFF",()=>{
 const id="native-task-goal-retirement-v1";
 for(const name of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  const {definition}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
  for(const phase of definition.phases){
   expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"control")))[id],name).toBe(false);
   expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"bundle")))[id],name).toBe(true);
  }
 }
});
