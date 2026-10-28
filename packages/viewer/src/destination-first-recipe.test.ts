import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armFeatures,armFeatureBits,armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const root=fileURLToPath(new URL("../../../",import.meta.url));
it.each(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"])("%s resolves destination guidance ON in both actual arm presets",name=>{
 const {definition}=readFixedDefinition(root,name);
 expect(definition.onInBoth).toContain("destination-first-navigation-v1");
 for(const arm of ["control","bundle"] as const){
  expect(armFeatures(definition,arm)["destination-first-navigation-v1"]).toBe(true);
  expect(armFeatureBits(definition,arm)["destination-first-navigation-v1"]).toBe(true);
  for(const phase of definition.phases)expect(armPreset(definition,phase.id,arm).features["destination-first-navigation-v1"]).toBe(true);
 }
});
it("keeps the unrelated next-run draft default OFF",()=>{
 expect(DEFAULT_NEXT_RUN.features["destination-first-navigation-v1"]).toBe(false);
});
