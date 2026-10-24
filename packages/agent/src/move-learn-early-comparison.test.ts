import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import { describe, expect, it } from "vitest";
import { ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const ID="move-learn-early-comparison-v1";

describe("move-learn-early-comparison-v1 (the operator 2026-10-22)",()=>{
 it("precedes the two later readout switches in every registry list as a default-off observation that needs the comparison",()=>{
  expect(SWITCHABLE_FEATURES.at(-44)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-44)?.id).toBe(ID);
  expect(SERVER_FEATURES.at(-10)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-9)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",switchable:true,title:"MOVE-LEARN EARLY COMPARISON",needs:"move-learn-comparison-v1"});
  expect(featureInfo(ID).description).toContain("COMBUSKEN is trying to learn DOUBLE KICK.");
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(dependencyProblems({...ALL_ON,"move-learn-comparison-v1":false})).toContain(`${ID} needs move-learn-comparison-v1`);
 });
 it("defaults off in presets, legacy flags and the frozen legacy all-on set",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(off[ID]).toBe(false);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
  const {[ID]:omitted,...rest}=off;
  expect(omitted).toBe(false);
  expect(normalizeFeatures(rest)[ID]).toBe(false);
 });
 it("is handed to the game server: off by default, on when set",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...off,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(playHarnessFeatures({...off,[ID]:true},null)).toContain(ID);
  expect(playHarnessFeatures(off,null)).not.toContain(ID);
 });
});
