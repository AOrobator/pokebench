import {recipeText} from "../../viewer/test-support/recipe-text.js";
import {describe,expect,it} from "vitest";

const ID="named-warp-destinations-v1";

describe(ID,()=>{
 it("is on in both evolving arms as a gym-label prerequisite",()=>{
  const def=JSON.parse(recipeText(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
  expect(def.base.features[ID]).toBe(true);
  expect(def.switches).not.toContain(ID);
  expect(def.onInBoth).toContain(ID);
  expect(def.base.features["displayed-place-names-v1"]).toBe(true);
 });
});
