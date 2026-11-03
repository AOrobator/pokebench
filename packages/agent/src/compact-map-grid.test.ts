import {describe,expect,it} from "vitest";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="compact-map-grid-v1";

describe("compact-map-grid-v1 registry",()=>{
 it("is registered at its pinned index, default off, recorded only when on",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(296);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(featureInfo(ID).description).toContain(" Off: the padded full-token grid.");
  const {[ID]:value,...omitted}={...ALL_ON};expect(value).toBe(true);
  expect(normalizeFeatures(omitted)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"map-observability-v1":false}).some(p=>p.includes(ID))).toBe(true);
 });

 it("is a server feature that is turned off on the game server unless on",()=>{
  expect(SERVER_FEATURES[97]).toBe(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 });
});
