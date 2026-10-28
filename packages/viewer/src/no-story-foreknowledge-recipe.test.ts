import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {armFeatureBits,armFeatures} from "./fixed-design.js";
import {readFixedDefinition} from "./fixed-definition.js";

const root=fileURLToPath(new URL("../../../",import.meta.url));
// the operator 2026-10-27 (9:14 PM New York): keep no-story-foreknowledge-v1 on in both arms going forward.
it.each(["bundle-v-control","bundle-v-control-2h","hyperqwen-control-3h","glm53-flash-4h"])("no-story-foreknowledge-v1 is on in control and bundle of %s",id=>{
 const {definition}=readFixedDefinition(root,id);
 expect(definition.onInBoth).toContain("no-story-foreknowledge-v1");
 expect(definition.switches).not.toContain("no-story-foreknowledge-v1");
 for(const arm of ["control","bundle"] as const){
  expect(armFeatures(definition,arm)["no-story-foreknowledge-v1"],arm).toBe(true);
  expect(armFeatureBits(definition,arm)["no-story-foreknowledge-v1"],arm).toBe(true);
 }
});
