import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";

it("normalizes both Claude schema corrections into both recorded arm presets",()=>{
 const definition=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url),"utf8")).definition;
 const phase=definition.phases[0];expect(phase).toBeDefined();if(phase===undefined)throw new Error("phase required");
 for(const arm of ["control","bundle"] as const)for(const id of ["gateway-tool-schemas-v1","gateway-schema-hint-v1"] as const)expect(armPreset(definition,phase.id,arm).features[id]).toBe(true);
});
