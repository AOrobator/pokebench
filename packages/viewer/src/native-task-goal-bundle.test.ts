import {fileURLToPath} from "node:url";
import {readFixedDefinition} from "./fixed-definition.js";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {armPreset} from "./fixed-design.js";

const sourceRoot=fileURLToPath(new URL("../../../",import.meta.url));
const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"];
const ARCHIVED=["bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"];
it("enables native task retirement in generated bundle presets and keeps controls OFF",()=>{
 const id="native-task-goal-retirement-v1";
 for(const name of [...CURRENT,...ARCHIVED]){
  const {definition}=readFixedDefinition(sourceRoot,name,ARCHIVED.includes(name));
  for(const phase of definition.phases){
   expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"control")))[id],name).toBe(false);
   expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"bundle")))[id],name).toBe(true);
  }
 }
});
