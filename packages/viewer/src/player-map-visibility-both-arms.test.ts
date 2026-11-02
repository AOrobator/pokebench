import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {armPreset,parseFixedDefinition,definitionProblems,controlBaseProblems} from "./fixed-design.js";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
it("freezes the authorized replacement as one 24-hour bundle trial on GPU0 with visibility V2 bundle-only",()=>{
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/qwen36-24h-visibility-off.json",import.meta.url))).definition;
 expect(definitionProblems(def)).toEqual([]);
 expect(def.plan).toEqual([{slot:1,phase:"cook",block:1,lane:"B",arm:"bundle"}]);
 expect(def.lanes.map(lane=>[lane.gpu,lane.modelUrl,lane.gamePort])).toEqual([["GPU0","http://127.0.0.1:8098",8076]]);
 expect(def.phases[0]?.maxWallMs).toBe(86_400_000);
 expect(def.phases[0]?.start).toEqual({kind:"save_state",path:"runs/launch-receipts/fast-text/MAIN_MENU.state",sha1:"b3a6cc1c19836600a15febf41b8f8b19661ce5d4"});
 expect(presetFeatures(parsePlayPreset(armPreset(def,"cook","bundle")))).not.toHaveProperty("player-map-visibility-v1");
});

it("leaves V2 off in both future arms while global defaults stay off",()=>{
 const id="player-map-visibility-v2";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url))).definition;
 expect(def.offInBoth).toContain(id);
 expect(def.switches).not.toContain(id);
 expect(def.onInBoth).not.toContain(id);
 expect(def.base.features[id]).toBe(false);
 expect(definitionProblems(def)).toEqual([]);
 const base=recipeText(new URL(`../../../${def.controlBase.path}`,import.meta.url));
 expect(controlBaseProblems(def,base)).toEqual([]);
 for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
  const features=presetFeatures(parsePlayPreset(armPreset(def,phase.id,arm)));
  expect(features[id]).toBe(false);
  expect(features).not.toHaveProperty("player-map-visibility-v1");
 }
});

it("pins the GLM replacement to one Mac bundle trial with V2 following the maintained recipe and the existing start and cap",()=>{
 const def=parseFixedDefinition(recipeText(new URL("../../../experiments/fixed/glm53-24h-visibility-v2.json",import.meta.url))).definition;
 expect(definitionProblems(def)).toEqual([]);
 expect(def.plan).toEqual([{slot:1,phase:"cook",block:1,lane:"A",arm:"bundle"}]);
 expect(def.lanes.map(l=>[l.gpu,l.modelUrl,l.gamePort])).toEqual([["MAC","http://127.0.0.1:8099",8077]]);
 expect(def.serving).toMatchObject({contextTokens:131072,slots:2});
 expect(def.phases[0]?.maxWallMs).toBe(86_400_000);
 expect(def.phases[0]?.start).toEqual({kind:"save_state",path:"runs/launch-receipts/fast-text/MAIN_MENU.state",sha1:"b3a6cc1c19836600a15febf41b8f8b19661ce5d4"});
 const p=parsePlayPreset(armPreset(def,"cook","bundle"));
 expect(p.limits.maxTurns).toBe(20000);expect(p.sampling).toEqual({thinkingLevel:"medium",maxTokens:8192});
 expect(presetFeatures(p)["player-map-visibility-v2"]).toBe(false);
 expect(presetFeatures(p)).not.toHaveProperty("player-map-visibility-v1");
});
