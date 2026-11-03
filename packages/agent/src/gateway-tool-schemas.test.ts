import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {featureInfo,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
const recipe=():{onInBoth:string[];features:Record<string,boolean>}=>JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {onInBoth:string[];features:Record<string,boolean>};

describe("gateway-tool-schemas-v1",()=>{
 const id="gateway-tool-schemas-v1";
 it("registers a non-server correction without changing omitted historical presets",()=>{
  expect(SWITCHABLE_FEATURES[285]).toBe(id);
  expect(SERVER_FEATURES).not.toContain(id);
  expect(featureInfo(id).description).toContain(" Off: ");
  const {"gateway-tool-schemas-v1":supplied,...historical}=flagFeatures(flags);
  expect(supplied).toBe(false);
  expect(normalizeFeatures(historical)[id]).toBe(false);
  expect(playHarnessFeatures({...normalizeFeatures(historical),[id]:true},null)).toContain(id);
 });
 it("is declared on in both current arms",()=>{expect(recipe().onInBoth).toContain(id);expect(recipe().features[id]).toBe(true);});
});

describe("gateway-schema-hint-v1",()=>{
 const id="gateway-schema-hint-v1";
 it("registers a non-server correction without changing omitted historical presets",()=>{
  expect(SWITCHABLE_FEATURES[286]).toBe(id);
  expect(SERVER_FEATURES).not.toContain(id);
  expect(featureInfo(id).description).toContain(" Off: ");
  const {"gateway-schema-hint-v1":supplied,...historical}=flagFeatures(flags);
  expect(supplied).toBe(false);
  expect(normalizeFeatures(historical)[id]).toBe(false);
  expect(playHarnessFeatures({...normalizeFeatures(historical),[id]:true},null)).toContain(id);
 });
 it("is declared on in both current arms",()=>{expect(recipe().onInBoth).toContain(id);expect(recipe().features[id]).toBe(true);});
});
