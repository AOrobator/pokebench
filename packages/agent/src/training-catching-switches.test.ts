import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import { describe, expect, it } from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, FEATURES, SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, serverFeatureEnv } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { LEGACY_ALL_ON } from "../test-support/legacy-features.js";
import { parseGameState } from "./game-state.js";
import { IN_GAME } from "../test-support/events.js";

export const TRAINING_CATCHING_IDS=["exp-next-level-v1","pokedex-own-v1","exp-earned-ledger-v1","leader-attempt-ledger-v1","seen-trainers-ledger-v1","party-coverage-v1","said-type-matches-v1"] as const;
const SERVER=TRAINING_CATCHING_IDS.slice(0,2);
const TITLES=["EXP NEXT LEVEL","POKéDEX OWN","EXP EARNED LEDGER","LEADER ATTEMPT LEDGER","SEEN TRAINERS LEDGER","PARTY COVERAGE","SAID TYPE MATCHES"];
const NEEDS=["ram-state-v1","ram-state-v1","battle-text-auto-advance-v1",null,"heal-before-trainers-v2","battle-text-auto-advance-v1",null];

describe("training and catching switches (the operator 2026-10-21: \"both sets\")",()=>{
 it("are appended in order to every registry list as default-off observations",()=>{
  expect(SWITCHABLE_FEATURES.slice(-49,-42)).toEqual([...TRAINING_CATCHING_IDS]);
  expect(FEATURES.filter(f=>f.switchable).slice(-49,-42).map(f=>f.id)).toEqual([...TRAINING_CATCHING_IDS]);
  expect(SERVER_FEATURES.slice(-11,-9)).toEqual([...SERVER]);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).slice(-31,-24)).toEqual([...TRAINING_CATCHING_IDS]);
  TRAINING_CATCHING_IDS.forEach((id,i)=>{
   expect(featureInfo(id)).toMatchObject({group:"observation",switchable:true,title:TITLES[i],needs:NEEDS[i]});
   expect(featureInfo(id).description).toContain("Bundle arm only, default off");
   expect(featureInfo(id).description).toContain(" Off: ");
  });
 });
 it("default off in presets, legacy flags, the frozen legacy all-on set",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  for(const id of TRAINING_CATCHING_IDS){
   expect(off[id]).toBe(false);
   expect(LEGACY_ALL_ON[id]).toBe(false);
   const {[id]:omitted,...rest}=off;
   expect(omitted).toBe(false);
   expect(normalizeFeatures(rest)[id]).toBe(false);
  }
 });
 it("hands the two server switches to the game server and keeps the five agent ones",()=>{
  const off=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  const offList=serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",");
  for(const id of SERVER)expect(offList).toContain(id);
  for(const id of TRAINING_CATCHING_IDS.slice(2))expect(offList).not.toContain(id);
  const on={...off,...Object.fromEntries(TRAINING_CATCHING_IDS.map(id=>[id,true]))};
  const onList=serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",");
  for(const id of TRAINING_CATCHING_IDS)expect(onList).not.toContain(id);
  expect(dependencyProblems({...ALL_ON,"heal-before-trainers-v2":false,"story-battle-heal-gate-v1":false})).toContain("seen-trainers-ledger-v1 needs heal-before-trainers-v2");
 });
});

describe("exp-next-level-v1 state field",()=>{
 it("accepts the game server's party_next_level and keeps it",()=>{
  expect(parseGameState({...IN_GAME,party_next_level:[416,25]}).party_next_level).toEqual([416,25]);
  expect(parseGameState({...IN_GAME,party_next_level:[null]}).party_next_level).toEqual([null]);
  expect(()=>parseGameState({...IN_GAME,party_next_level:[-1]})).toThrow();
 });
});
