import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const id="gateway-current-turn-v1";
describe(id,()=>{
 it("registers a non-server correction without changing omitted historical presets",()=>{
  expect(SWITCHABLE_FEATURES[284]).toBe(id);
  expect(SERVER_FEATURES).not.toContain(id);
  expect(featureInfo(id).description).toContain(" Off: ");
  const {"gateway-current-turn-v1":supplied,...historical}=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(supplied).toBe(false);
  expect(normalizeFeatures(historical)[id]).toBe(false);
  expect(playHarnessFeatures({...normalizeFeatures(historical),[id]:true},null)).toContain(id);
 });
});
