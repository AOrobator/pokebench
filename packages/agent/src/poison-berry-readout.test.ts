import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseExperiment,experimentArms} from "./experiments.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
const IDS=["poison-readout-v1","berry-readout-v1"] as const;
describe("independent poison and berry observations",()=>{
 it("appends both switches without moving older features",()=>{
  expect(SWITCHABLE_FEATURES.slice(-23,-21)).toEqual(IDS);
  expect(FEATURES.filter(f=>f.switchable).slice(-23,-21).map(f=>f.id)).toEqual(IDS);
  expect(SERVER_FEATURES.slice(-5,-3)).toEqual(IDS);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).slice(-7,-5)).toEqual(IDS);
 });
 for(const id of IDS){
  it(`${id} is independently default OFF and reaches the game server`,()=>{
   const defaults=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
   expect(defaults[id]).toBe(false);expect(LEGACY_ALL_ON[id]).toBe(false);
   const {[id]:omitted,...rest}=defaults;expect(omitted).toBe(false);
   expect(normalizeFeatures(rest)[id]).toBe(false);
   const on=normalizeFeatures({...defaults,[id]:true});
   expect(on[id]).toBe(true);for(const other of IDS) if(other!==id) expect(on[other]).toBe(false);
   expect(serverFeatureEnv(defaults).POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
   expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(id);
   expect(playHarnessFeatures(defaults,null)).not.toContain(id);
   expect(playHarnessFeatures(on,null)).toContain(id);
   expect(featureInfo(id)).toMatchObject({group:"observation",needs:"ram-state-v1"});
   expect(featureInfo(id).description).toContain("Off: ");
  });
  it(`${id} has an unqueued, single-switch experiment`,()=>{
   const entry=parseExperiment(JSON.parse(readFileSync(new URL(`../../../experiments/${id}.json`,import.meta.url),"utf8")));
   expect(entry.changedFeature).toBe(id);expect(entry.queuePosition).toBeUndefined();
   const {incumbent,candidate}=experimentArms(entry);
   expect(SWITCHABLE_FEATURES.filter(f=>incumbent.features[f]!==candidate.features[f])).toEqual([id]);
   expect(incumbent.features[id]).toBe(false);expect(candidate.features[id]).toBe(true);
  });
 }
});
