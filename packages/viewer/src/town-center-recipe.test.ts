import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {readFixedDefinition} from "./fixed-definition.js";
import {armFeatures,armFeatureBits,armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
const root=fileURLToPath(new URL("../../../",import.meta.url));
it.each(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"])("%s enables town Center checkpoint guidance in both generated arms",name=>{
 const {definition}=readFixedDefinition(root,name);const id="town-center-checkpoint-v1";
 expect(definition.onInBoth).toContain(id);expect(definition.switches).not.toContain(id);expect(definition.offInBoth).not.toContain(id);
 for(const arm of ["control","bundle"]as const){expect(armFeatures(definition,arm)[id]).toBe(true);expect(armFeatureBits(definition,arm)[id]).toBe(true);for(const phase of definition.phases)expect(armPreset(definition,phase.id,arm).features[id]).toBe(true);}
});
it("keeps ordinary NEXT RUN default OFF",()=>{expect(DEFAULT_NEXT_RUN.features["town-center-checkpoint-v1"]).toBe(false);});
