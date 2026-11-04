import {describe,expect,it} from "vitest";
import {ALL_ON,FEATURES,SERVER_FEATURES,playHarnessFeatures,serverFeatureEnv} from "./features.js";

const ID="warp-areas-v1";
describe(ID,()=>{
 it("is a server switch that needs the exit sections it regroups",()=>{
  expect(SERVER_FEATURES).toContain(ID);
  expect(FEATURES.find(f=>f.id===ID)?.needs).toBe("exit-labels-v3");
  expect(FEATURES.find(f=>f.id===ID)?.description).toContain(" Off: ");
 });
 it("reaches the server only when on",()=>{
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(playHarnessFeatures(ALL_ON,"play")).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},"play")).not.toContain(ID);
 });
});
