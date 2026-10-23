import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// map-wide-triggers-v1: the game server's state lists every coordinate trigger on the map (the readout text keeps the
// nearby ones). Run 2026-10-21T01-16-23_glm53-mac_e9ee planned a stride from (10,17) through LITTLEROOT TOWN's (10,9)
// trigger, which the 7-tile list did not include, and stopped at (10,10) (seq 1985-2017).
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {planStride} from "./navigation.js";
import {IN_GAME} from "../test-support/events.js";
import type {GameStateSnapshot} from "./game-state.js";

const ID="map-wide-triggers-v1" as const;

describe("registry",()=>{
 it("is the server's last switch: a default-off server observation that needs coordinate-script-conditions-v1, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-45)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-45)?.id).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-17)).toBe(ID);
  expect(playHarnessFeatures(LEGACY_ALL_ON,null)).not.toContain(ID);
  expect(SERVER_FEATURES.at(-10)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"coordinate-script-conditions-v1",switchable:true,title:"MAP-WIDE TRIGGERS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(LEGACY_ALL_ON[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const omitted=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>k!==ID));
  expect(normalizeFeatures(omitted as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(serverFeatureEnv(LEGACY_ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 });
});

describe("what the planner does with a far trigger",()=>{
 // LITTLEROOT TOWN column 10 from (10,17) north: open floor; the trigger at (10,9) is 8 rows up.
 const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});
 const state=(triggers:{x:number;y:number}[]):GameStateSnapshot=>({...IN_GAME,screen:"overworld",started:true,map_id:[0,9],position:{x:10,y:17},facing:"up",field_controls_locked:false,
  navigation_grid:{elevation:3,tiles:Array.from({length:18},(_,y)=>tile(10,y)),objects:[],warps:[]},
  world_context:{objects:[],dialogue:null,triggers:triggers.map(t=>({...t,elevation:3,variable:0x4050,required_value:3,current_value:0,condition_met:false,script_pointer:0x081E81E1}))}} as unknown as GameStateSnapshot);
 const up=Array.from({length:8},()=>"UP" as const);
 it("with the 7-tile list (no trigger yet) the stride runs 8 tiles into the trigger; listed, it stops one tile short",()=>{
  expect(planStride(state([]),up,{mode:"local"})?.path.at(-1)).toEqual({x:10,y:9});
  expect(planStride(state([{x:10,y:9}]),up,{mode:"local"})?.path.at(-1)).toEqual({x:10,y:10});
 });
});
