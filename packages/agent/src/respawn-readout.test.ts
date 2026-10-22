import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv,SERVER_FEATURES,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

// respawn-readout-v1: a game-server readout line (env/pokebench_env/respawn.py); the agent only registers and forwards it.
const ID="respawn-readout-v1";

describe("respawn-readout-v1 registry",()=>{
 it("is a default-off observation switch the game server applies",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"ram-state-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("If your party faints, you wake up at your house in LITTLEROOT TOWN");
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"ram-state-v1":false})).toContain(`${ID} needs ram-state-v1`);
 });
 it("is appended last, so recorded runs keep their switch order",()=>{
  expect(SWITCHABLE_FEATURES.at(-61)).toBe(ID);
  expect(SERVER_FEATURES.at(-21)).toBe(ID);
  const all=playHarnessFeatures({...ALL_ON,[ID]:true},null);
  expect(all.at(-1)).toBe(ID);
 });
});
