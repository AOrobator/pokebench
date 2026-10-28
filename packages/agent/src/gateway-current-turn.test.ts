import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const id="gateway-current-turn-v1";
describe(id,()=>{
 it("registers a non-server correction without changing omitted historical presets",()=>{
  expect(SWITCHABLE_FEATURES).toContain(id);
  expect(featureInfo(id).description).toContain(" Off: ");
  const {"gateway-current-turn-v1":supplied,...historical}=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(supplied).toBe(false);
  expect(normalizeFeatures(historical)[id]).toBe(false);
  expect(playHarnessFeatures({...normalizeFeatures(historical),[id]:true},null)).toContain(id);
 });
 it("is declared on in both current arms",()=>{
  const recipe=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {onInBoth:string[];features:Record<string,boolean>};
  expect(recipe.onInBoth).toContain(id);expect(recipe.features[id]).toBe(true);
 });
});
