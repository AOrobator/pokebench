import {expect,it} from "vitest";
import {parsePlayPreset} from "./play-preset.js";
const preset={version:1,id:"name-control",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
it("strictly accepts full explicit presets and ordinary no-target variants",()=>{expect(parsePlayPreset(preset)).toEqual(preset);expect(parsePlayPreset({...preset,target:null})).toEqual({...preset,target:null});});
it.each([{...preset,extra:true},{...preset,limits:{...preset.limits,maxWallMs:"600000"}},{...preset,flags:{...preset.flags,loopGuard:"false"}},{...preset,target:"PLAYER_NAME_SET"},{...preset,target:"invented"},{...preset,sampling:{thinkingLevel:"invented",maxTokens:4096}},{...preset,limits:{...preset.limits,failureLimit:0}}])("rejects unsupported or malformed contracts",value=>{expect(()=>parsePlayPreset(value)).toThrow(/preset/i);});

import {ALL_ON} from "./features.js";
import {presetFeatures,presetFlags} from "./play-preset.js";
const v2={version:2,id:"viewer-next",target:null,limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...ALL_ON,"story-state-v1":false}};
it("accepts a v2 preset with every switch explicit and exposes its feature set",()=>{
  const parsed=parsePlayPreset(v2);
  expect(presetFeatures(parsed)).toEqual(v2.features);
  expect(presetFlags(parsed)).toEqual({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true});
});
it("maps v1 flags onto the full switch set, objectives covering its three guards",()=>{
  const features=presetFeatures(parsePlayPreset(preset));
  expect(features).toEqual({...ALL_ON,"deterministic-loop-guard-v1":false});
  const noObjectives=presetFeatures(parsePlayPreset({...preset,flags:{...preset.flags,objectives:false,activeUi:false}}));
  expect(noObjectives).toEqual({...ALL_ON,"deterministic-loop-guard-v1":false,"active-ui-ownership-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false});
  expect(presetFlags(parsePlayPreset(preset))).toEqual(preset.flags);
});
it.each([
  [{...v2,features:{...v2.features,"live-map-v1":false}},/needs live-map-v1/],
  [{...v2,features:{...v2.features,invented:true}},/preset/],
  [{...v2,features:{...v2.features,"ram-state-v1":undefined}},/preset/],
  [{...v2,flags:preset.flags},/preset/],
])("rejects v2 presets with missing, unknown or unmet switches",(value,message)=>{expect(()=>parsePlayPreset(value)).toThrow(message);});
