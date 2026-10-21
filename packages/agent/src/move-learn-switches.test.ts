import { describe, expect, it } from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
const RAW_PROGRESS_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
const ALL_ON={...RAW_PROGRESS_ALL_ON,"progress-aware-cycles-v1":false};
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";

const IDS=["move-learn-settle-v1","move-learn-question-v1","move-learn-comparison-v1","effectiveness-heard-v1","game-said-goals-v1"] as const;
const SERVER=IDS.slice(0,3);
const TITLES=["MOVE-LEARN SETTLE","MOVE-LEARN QUESTION","MOVE-LEARN COMPARISON","EFFECTIVENESS HEARD","GAME-SAID GOALS"];
const NEEDS=[null,"ram-state-v1","ram-state-v1","battle-text-auto-advance-v1",null];

describe("move-learn switches (the operator 2026-10-21: F1, F2, J1, J2, J3)",()=>{
 it("are appended in order to every registry list as default-off observations",()=>{
  expect(SWITCHABLE_FEATURES.slice(-29,-24)).toEqual([...IDS]);
  expect(FEATURES.filter(f=>f.switchable).slice(-29,-24).map(f=>f.id)).toEqual([...IDS]);
  expect(SERVER_FEATURES.slice(-10,-7)).toEqual([...SERVER]);
  expect(playHarnessFeatures({...ALL_ON,"gym-door-label-v1":false,"menu-refusal-recovery-v1":false,"mart-stock-readout-v1":false,"caught-dex-input-v1":false},null).slice(-22,-17)).toEqual([...IDS]);
  IDS.forEach((id,i)=>{
   expect(featureInfo(id)).toMatchObject({group:"observation",switchable:true,title:TITLES[i],needs:NEEDS[i]});
   expect(featureInfo(id).description).toContain("Bundle arm only, default off");
   expect(featureInfo(id).description).toContain(" Off: ");
  });
 });
 it("default off in presets, legacy flags and the frozen legacy all-on set",()=>{
  const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
  const off=flagFeatures(flags);
  for(const id of IDS){
   expect(off[id]).toBe(false);
   expect(LEGACY_ALL_ON[id]).toBe(false);
   const {[id]:omitted,...rest}=off;
   expect(omitted).toBe(false);
   expect(normalizeFeatures(rest)[id]).toBe(false);
  }
 });
 it("hands the three server switches to the game server and keeps the two agent ones",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  const offList=serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",");
  for(const id of SERVER)expect(offList).toContain(id);
  const on={...off,...Object.fromEntries(IDS.map(id=>[id,true]))};
  const onList=serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",");
  for(const id of IDS)expect(onList).not.toContain(id);
  expect(playHarnessFeatures(on,null).slice(-5)).toEqual([...IDS]);
  expect(dependencyProblems({...ALL_ON,"battle-text-auto-advance-v1":false,"battle-message-waiting-v1":false,"battle-decision-ready-v1":false})).toContain("effectiveness-heard-v1 needs battle-text-auto-advance-v1");
 });
});
