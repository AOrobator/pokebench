import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {armFeatures,armPreset,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

const ID="current-question-focus-v1";
const CURRENT=["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","hyperqwen-control-3h"] as const;
it("keeps the next-run default OFF",()=>{expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);});
it.each(CURRENT)("%s enables the tested question cue only in future bundles",name=>{
 const definition=parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")).definition;
 expect(definition.switches.filter(id=>id===ID)).toEqual([ID]);
 expect(armFeatures(definition,"bundle")[ID]).toBe(true);
 expect(armFeatures(definition,"control")[ID]).toBe(false);
 const before={...definition,switches:definition.switches.filter(id=>id!==ID)};
 for(const phase of definition.phases){
  const bundle=armPreset(definition,phase.id,"bundle"),control=armPreset(definition,phase.id,"control");
  expect(bundle.features[ID],`${name}/${phase.id}/bundle`).toBe(true);
  expect(bundle.features["dialogue-auto-advance-v1"]).toBe(true);
  expect(control,`${name}/${phase.id}/control unchanged`).toEqual(armPreset(before,phase.id,"control"));
  expect(control.features[ID]).toBe(false);
 }
});
