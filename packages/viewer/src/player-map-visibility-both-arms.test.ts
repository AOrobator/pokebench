import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {armPreset,parseFixedDefinition,definitionProblems,controlBaseProblems} from "./fixed-design.js";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
const ID="player-map-visibility-v1";
it("disables V1 visibility in both generated current arms while preserving frozen historical defaults",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url))).definition;
 expect(def.onInBoth).not.toContain(ID);
 expect(def.offInBoth).toContain(ID);
 expect(def.switches).not.toContain(ID);
 expect(definitionProblems(def)).toEqual([]);
 const base=recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url));
 expect(controlBaseProblems(def,base)).toEqual([]);
 for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
  expect(presetFeatures(parsePlayPreset(armPreset(def,phase.id,arm)))[ID]).toBe(false);
 }
});

it("freezes the authorized replacement as one 24-hour bundle trial on GPU0 with V1 off",()=>{
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/qwen36-24h-visibility-off.json",import.meta.url))).definition;
 expect(definitionProblems(def)).toEqual([]);
 expect(def.plan).toEqual([{slot:1,phase:"cook",block:1,lane:"B",arm:"bundle"}]);
 expect(def.lanes.map(lane=>[lane.gpu,lane.modelUrl,lane.gamePort])).toEqual([["GPU0","http://127.0.0.1:8098",8076]]);
 expect(def.phases[0]?.maxWallMs).toBe(86_400_000);
 expect(def.phases[0]?.start).toEqual({kind:"save_state",path:"runs/launch-receipts/fast-text/MAIN_MENU.state",sha1:"b3a6cc1c19836600a15febf41b8f8b19661ce5d4"});
 expect(presetFeatures(parsePlayPreset(armPreset(def,"cook","bundle")))[ID]).toBe(false);
});

it("enables V2 only in future bundle arms while V1 and global defaults stay off",()=>{
 const id="player-map-visibility-v2";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url))).definition;
 expect(def.switches).toContain(id);
 expect(def.offInBoth).not.toContain(id);
 expect(def.onInBoth).not.toContain(id);
 expect(def.base.features[id]).toBe(false);
 expect(definitionProblems(def)).toEqual([]);
 const base=recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url));
 expect(controlBaseProblems(def,base)).toEqual([]);
 for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(def,phase.id,arm)));
  expect(features[id]).toBe(arm==="bundle");
  expect(features[ID]).toBe(false);
 }
});
