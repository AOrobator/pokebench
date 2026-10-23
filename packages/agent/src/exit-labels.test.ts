import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// exit-labels-v2: a default-off, bundle-only server observation switch that renames
// named-warp-destinations-v1's warp labels (the readout itself is env/pokebench_env/exit_labels.py).
import {describe,expect,it} from "vitest";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,dependencyProblems} from "./features.js";
const PENDING_BASE_ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
const ALL_ON={...PENDING_BASE_ALL_ON,"progress-aware-cycles-v1":false,"caught-dex-input-v1":false,"menu-refusal-recovery-v1":false,"pending-field-dialogue-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="exit-labels-v2";

describe("exit-labels-v2 registry",()=>{
 it("is appended last, an observation that needs named-warp-destinations-v1, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-100)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"named-warp-destinations-v1",switchable:true,title:"EXIT LABELS V2"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("Bundle arm only, default off.");
  expect(dependencyProblems({...ALL_ON,"named-warp-destinations-v1":false})).toContain(`${ID} needs named-warp-destinations-v1`);
 });
 it("is recorded last and hands the game server its own switch",()=>{
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-59)).toBe(ID);
  expect(featuresOf(playHarnessFeatures({...ALL_ON,[ID]:false},null))[ID]).toBe(false);
  expect(SERVER_FEATURES.at(-30)).toBe(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 });
 it("defaults off when a preset omits it and in the legacy flag presets",()=>{
  const {[ID]:_omitted,...without}=ALL_ON;
  expect(_omitted).toBe(true);
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(normalizeFeatures({...without,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
