import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {armFeatureBits,armFeatures} from "./fixed-design.js";
import {readFixedDefinition} from "./fixed-definition.js";

const root=fileURLToPath(new URL("../../../",import.meta.url));
// the operator 2026-10-27: "Let's actually have this be on in both arms."
it.each(["bundle-v-control","bundle-v-control-2h","hyperqwen-control-3h","glm53-flash-4h"])("grass-strides-v1 is on in control and bundle of %s, with its dependencies",id=>{
 const {definition}=readFixedDefinition(root,id);
 expect(definition.onInBoth).toContain("grass-strides-v1");
 expect(definition.switches).not.toContain("grass-strides-v1");
 for(const arm of ["control","bundle"] as const){
  const features=armFeatures(definition,arm);
  expect(features["grass-strides-v1"],arm).toBe(true);
  expect(features["safe-navigation-strides-v1"],arm).toBe(true);
  expect(features["automatic-running-v1"],arm).toBe(true);
  expect(armFeatureBits(definition,arm)["grass-strides-v1"],arm).toBe(true);
 }
});
