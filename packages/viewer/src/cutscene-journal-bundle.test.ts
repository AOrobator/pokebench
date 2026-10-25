import {expect,it} from "vitest";
import {fileURLToPath} from "node:url";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
const ROOT=fileURLToPath(new URL("../../..",import.meta.url));
it("materializes current recipes with the cutscene journal ON only in bundle",()=>{
 expect(DEFAULT_NEXT_RUN.features["cutscene-journal-v1"]).toBe(false);
 for(const id of ["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"]){
  const {definition:def}=readFixedDefinition(ROOT,id);
  const phase=def.phases[0];if(!phase)throw new Error("missing phase");
  expect(armPreset(def,phase.id,"bundle").features["cutscene-journal-v1"],id).toBe(true);
  expect(armPreset(def,phase.id,"control").features["cutscene-journal-v1"],id).toBe(false);
 }
});
