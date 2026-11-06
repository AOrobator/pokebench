import {describe,expect,it} from "vitest";
import preset from "../../../experiments/presets/current-control-24h-8k.json" with {type:"json"};
import current from "../../../experiments/feature-configs/current.json" with {type:"json"};
import {rayquazaLanePreset} from "../test-support/rayquaza-lane.js";
import {ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,parsePlayPreset} from "./play-preset.js";

const ID="shop-shelf-hidden-v1";
describe(ID,()=>{
 it("is a server switch with no dependency",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(SERVER_FEATURES).toContain(ID);
  const feature=FEATURES.find(f=>f.id===ID);
  expect(feature?.needs).toBeNull();
  expect(feature?.description).toContain(" Off: ");
 });
 it("reaches the server only when on",()=>{
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(playHarnessFeatures(ALL_ON,"play")).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},"play")).not.toContain(ID);
 });
 it("defaults off when a preset or flag set omits it",()=>{
  const omitted=Object.fromEntries(Object.entries(preset.features).filter(([id])=>id!==ID));
  const parsed=parsePlayPreset({...preset,features:omitted});
  if(parsed.version!==2)throw new Error("version");
  expect(parsed.features[ID]).toBe(false);
  expect(flagFeatures({} as Parameters<typeof flagFeatures>[0])[ID]).toBe(false);
 });
 it("is on in both arms of the current recipe, its plain preset and the Rayquaza lane it reaches",()=>{
  expect(current.onInBoth).toContain(ID);
  expect((current.features as Record<string,boolean>)[ID]).toBe(true);
  for(const plain of [preset,rayquazaLanePreset()])expect((plain.features as Record<string,boolean>)[ID]).toBe(true);
 });
});
