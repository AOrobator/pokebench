import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import { describe, expect, it } from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID="shop-interface-v1";

describe("shop-interface-v1 (the operator 2026-10-21: build it and put it in the bundle)",()=>{
 it("is appended last to every registry list as a default-off observation that needs the RAM readout",()=>{
  expect(SWITCHABLE_FEATURES.at(-57)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-57)?.id).toBe(ID);
  expect(SERVER_FEATURES.at(-14)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-24)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",switchable:true,title:"SHOP INTERFACE",needs:"ram-state-v1"});
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
