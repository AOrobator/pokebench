import { describe, expect, it } from "vitest";
import { ALL_ON as RAW_PROGRESS_ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
const ALL_ON={...RAW_PROGRESS_ALL_ON,"progress-aware-cycles-v1":false};
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID="mart-stock-readout-v1";

describe("mart-stock-readout-v1 (Rustboro strategy report, proposal 4)",()=>{
 it("is appended last to every registry list as a default-off observation that needs the RAM readout",()=>{
  expect(SWITCHABLE_FEATURES.at(-20)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-20)?.id).toBe(ID);
  expect(SERVER_FEATURES.at(-6)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-19)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",switchable:true,title:"MART STOCK READOUT",needs:"ram-state-v1"});
  expect(featureInfo(ID).description).toContain("Bundle arm only, default off");
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(dependencyProblems({...ALL_ON,"ram-state-v1":false})).toContain(`${ID} needs ram-state-v1`);
 });
 it("is off in presets, legacy flags and the frozen legacy all-on set",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(off[ID]).toBe(false);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
  const {[ID]:omitted,...rest}=off;
  expect(omitted).toBe(false);
  expect(normalizeFeatures(rest)[ID]).toBe(false);
  expect(normalizeFeatures({...rest,[ID]:true})[ID]).toBe(true);
 });
 it("reaches the game server as a server feature",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...off,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(playHarnessFeatures({...off,[ID]:true},null)).toContain(ID);
  expect(playHarnessFeatures(off,null)).not.toContain(ID);
 });
});
