import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armFeatures,armFeatureBits,armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const root=fileURLToPath(new URL("../../../",import.meta.url));
const id="screenshot-button-baseline-v1";
it.each(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"])("%s excludes the standalone screenshot baseline from both arms",name=>{
 const {definition}=readFixedDefinition(root,name);
 expect(definition.offInBoth).toContain(id);
 expect(definition.switches).not.toContain(id);
 expect(definition.onInBoth).not.toContain(id);
 for(const arm of ["control","bundle"] as const){
  expect(armFeatures(definition,arm)[id],`${name}/${arm}`).toBe(false);
  expect(armFeatureBits(definition,arm)[id],`${name}/${arm}/bits`).toBe(false);
  for(const phase of definition.phases)expect(armPreset(definition,phase.id,arm).features[id],`${name}/${phase.id}/${arm}`).toBe(false);
 }
});
it("keeps the next-run default outside standalone baseline mode",()=>{
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
});
