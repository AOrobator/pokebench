import {expect,it} from "vitest";
import {parsePlayPreset} from "./play-preset.js";
const preset={version:1,id:"name-control",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
it("strictly accepts full explicit presets and ordinary no-target variants",()=>{expect(parsePlayPreset(preset)).toEqual(preset);expect(parsePlayPreset({...preset,target:null})).toEqual({...preset,target:null});});
it.each([{...preset,extra:true},{...preset,limits:{...preset.limits,maxWallMs:"600000"}},{...preset,flags:{...preset.flags,loopGuard:"false"}},{...preset,target:"PLAYER_NAME_SET"},{...preset,target:"invented"},{...preset,sampling:{thinkingLevel:"invented",maxTokens:4096}},{...preset,limits:{...preset.limits,failureLimit:0}}])("rejects unsupported or malformed contracts",value=>{expect(()=>parsePlayPreset(value)).toThrow(/preset/i);});

import {ALL_ON} from "./features.js";
import {presetFeatures,presetFlags} from "./play-preset.js";
const v2={version:2,id:"viewer-next",target:null,limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...ALL_ON,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"story-state-v1":false}};
it("accepts a v2 preset with every switch explicit and exposes its feature set",()=>{
  const parsed=parsePlayPreset(v2);
  expect(presetFeatures(parsed)).toEqual(v2.features);
  expect(presetFlags(parsed)).toEqual({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true});
});
it("maps v1 flags onto the full switch set, objectives covering its three guards",()=>{
  const features=presetFeatures(parsePlayPreset(preset));
  expect(features).toEqual({...ALL_ON,"navigation-evidence-memory-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"full-map-navigation-v1":false,"deterministic-loop-guard-v1":false});
  const noObjectives=presetFeatures(parsePlayPreset({...preset,flags:{...preset.flags,objectives:false,activeUi:false}}));
  expect(noObjectives).toEqual({...ALL_ON,"navigation-evidence-memory-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"full-map-navigation-v1":false,"deterministic-loop-guard-v1":false,"active-ui-ownership-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false});
  expect(presetFlags(parsePlayPreset(preset))).toEqual(preset.flags);
});
it.each([
  [{...v2,features:{...v2.features,"live-map-v1":false}},/needs live-map-v1/],
  [{...v2,features:{...v2.features,invented:true}},/preset/],
  [{...v2,features:{...v2.features,"ram-state-v1":undefined}},/preset/],
  [{...v2,flags:preset.flags},/preset/],
])("rejects v2 presets with missing, unknown or unmet switches",(value,message)=>{expect(()=>parsePlayPreset(value)).toThrow(message);});

it("defaults absent historical v2 named interactions OFF and records explicit treatment",()=>{
 const {"named-interactions-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["named-interactions-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(v2))["named-interactions-v1"]).toBe(true);
 expect(()=>parsePlayPreset({...v2,features:{...old,"named-interactions-v1":"true"}})).toThrow(/preset/);
});

it("defaults absent whole-map navigation OFF in every preset and records an explicit treatment",()=>{
 const {"full-map-navigation-v1":omitted,...old}=v2.features;expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["full-map-navigation-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(preset))["full-map-navigation-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset({...v2,features:{...old,"bounded-navigation-v1":true,"full-map-navigation-v1":true}}))["full-map-navigation-v1"]).toBe(true);
 expect(()=>parsePlayPreset({...v2,features:{...old,"bounded-navigation-v1":false,"full-map-navigation-v1":true}})).toThrow(/needs bounded-navigation-v1/);
});

it("defaults absent historical ledge hops OFF so frozen presets keep ledges as walls",()=>{
 const {"ledge-hops-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["ledge-hops-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(v2))["ledge-hops-v1"]).toBe(true);
 expect(presetFeatures(parsePlayPreset(preset))["ledge-hops-v1"]).toBe(false);
 expect(()=>parsePlayPreset({...v2,features:{...v2.features,"ledge-hops-v1":true,"live-map-v1":false,"world-coordinate-grid-v1":false,"bounded-navigation-v1":false,"warp-activation-guidance-v1":false}})).toThrow(/ledge-hops-v1 needs live-map-v1/);
});

it("rejects navigation memory when the RAM umbrella would suppress all ordinary observations",()=>{
 expect(()=>parsePlayPreset({...v2,features:{...v2.features,"ram-state-v1":false}})).toThrow(/navigation-evidence-memory-v1 needs ram-state-v1/);
});
