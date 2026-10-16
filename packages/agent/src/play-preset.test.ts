import {expect,it} from "vitest";
import {parsePlayPreset} from "./play-preset.js";
const preset={version:1,id:"name-control",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
it("strictly accepts full explicit presets and ordinary no-target variants",()=>{expect(parsePlayPreset(preset)).toEqual(preset);expect(parsePlayPreset({...preset,target:null})).toEqual({...preset,target:null});});
it.each([{...preset,extra:true},{...preset,limits:{...preset.limits,maxWallMs:"600000"}},{...preset,flags:{...preset.flags,loopGuard:"false"}},{...preset,target:"PLAYER_NAME_SET"},{...preset,target:"invented"},{...preset,sampling:{thinkingLevel:"invented",maxTokens:4096}},{...preset,limits:{...preset.limits,failureLimit:0}}])("rejects unsupported or malformed contracts",value=>{expect(()=>parsePlayPreset(value)).toThrow(/preset/i);});

import {ALL_ON} from "./features.js";
import {presetFeatures,presetFlags} from "./play-preset.js";
const v2={version:2,id:"viewer-next",target:null,limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...ALL_ON,"dialogue-auto-advance-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"story-state-v1":false}};
it("accepts a v2 preset with every switch explicit and exposes its feature set",()=>{
  const parsed=parsePlayPreset(v2);
  expect(presetFeatures(parsed)).toEqual(v2.features);
  expect(presetFlags(parsed)).toEqual({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true});
});
it("maps v1 flags onto the full switch set, objectives covering its three guards",()=>{
  const features=presetFeatures(parsePlayPreset(preset));
  expect(features).toEqual({...ALL_ON,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"transition-loop-detection-v1":false,"navigation-evidence-memory-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"deterministic-loop-guard-v1":false});
  const noObjectives=presetFeatures(parsePlayPreset({...preset,flags:{...preset.flags,objectives:false,activeUi:false}}));
  expect(noObjectives).toEqual({...ALL_ON,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"transition-loop-detection-v1":false,"navigation-evidence-memory-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"deterministic-loop-guard-v1":false,"active-ui-ownership-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false});
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

it("defaults absent historical one-way tiles OFF so frozen presets keep edge walls as walls",()=>{
 const {"one-way-tiles-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["one-way-tiles-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(v2))["one-way-tiles-v1"]).toBe(true);
 expect(presetFeatures(parsePlayPreset(preset))["one-way-tiles-v1"]).toBe(false);
 expect(()=>parsePlayPreset({...v2,features:{...v2.features,"one-way-tiles-v1":true,"ledge-hops-v1":false,"live-map-v1":false,"world-coordinate-grid-v1":false,"bounded-navigation-v1":false,"warp-activation-guidance-v1":false}})).toThrow(/one-way-tiles-v1 needs live-map-v1/);
});

it("defaults absent historical grass cost OFF so frozen presets price every step the same",()=>{
 const {"grass-cost-navigation-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["grass-cost-navigation-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(v2))["grass-cost-navigation-v1"]).toBe(true);
 expect(presetFeatures(parsePlayPreset(preset))["grass-cost-navigation-v1"]).toBe(false);
 expect(()=>parsePlayPreset({...v2,features:{...v2.features,"bounded-navigation-v1":false}})).toThrow(/grass-cost-navigation-v1 needs bounded-navigation-v1/);
});

it("rejects navigation memory when the RAM umbrella would suppress all ordinary observations",()=>{
 expect(()=>parsePlayPreset({...v2,features:{...v2.features,"ram-state-v1":false}})).toThrow(/navigation-evidence-memory-v1 needs ram-state-v1/);
});

it("keeps the game elevation rule for presets written before the switch existed",()=>{
 const {"elevation-transitions-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["elevation-transitions-v1"]).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:{...v2.features,"elevation-transitions-v1":false}}))["elevation-transitions-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(preset))["elevation-transitions-v1"]).toBe(true);
});

it("defaults absent historical counter talk OFF so frozen presets keep counters as walls",()=>{
 const {"counter-talk-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["counter-talk-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(v2))["counter-talk-v1"]).toBe(true);
 expect(presetFeatures(parsePlayPreset(preset))["counter-talk-v1"]).toBe(false);
});

it("defaults absent historical walkable floor OFF so frozen presets keep the legacy walkable list",()=>{
 const {"walkable-floor-v1":omitted,...old}=v2.features;
 expect(omitted).toBe(true);
 expect(presetFeatures(parsePlayPreset({...v2,features:old}))["walkable-floor-v1"]).toBe(false);
 expect(presetFeatures(parsePlayPreset(v2))["walkable-floor-v1"]).toBe(true);
 expect(presetFeatures(parsePlayPreset(preset))["walkable-floor-v1"]).toBe(false);
});

it("reads presets written before game evidence priority as OFF and keeps an explicit ON",()=>{
  const older:Record<string,boolean>={...v2.features};delete older["game-evidence-priority-v1"];
  expect(presetFeatures(parsePlayPreset({...v2,features:older}))["game-evidence-priority-v1"]).toBe(false);
  expect(presetFeatures(parsePlayPreset({...v2,features:{...older,"game-evidence-priority-v1":true}}))["game-evidence-priority-v1"]).toBe(true);
  expect(presetFeatures(parsePlayPreset(preset))["game-evidence-priority-v1"]).toBe(false);
});

it("reads presets written before named warp destinations as OFF and keeps an explicit ON",()=>{
  const older:Record<string,boolean>={...v2.features};delete older["named-warp-destinations-v1"];
  expect(presetFeatures(parsePlayPreset({...v2,features:older}))["named-warp-destinations-v1"]).toBe(false);
  expect(presetFeatures(parsePlayPreset({...v2,features:{...older,"named-warp-destinations-v1":true}}))["named-warp-destinations-v1"]).toBe(true);
  expect(presetFeatures(parsePlayPreset(preset))["named-warp-destinations-v1"]).toBe(false);
});

it("reads presets written before the milestone stall stop as OFF and keeps an explicit ON",()=>{
  const older:Record<string,boolean>={...v2.features};delete older["milestone-stall-stop-v1"];
  expect(presetFeatures(parsePlayPreset({...v2,features:older}))["milestone-stall-stop-v1"]).toBe(false);
  expect(presetFeatures(parsePlayPreset({...v2,features:{...older,"milestone-stall-stop-v1":true}}))["milestone-stall-stop-v1"]).toBe(true);
  expect(presetFeatures(parsePlayPreset(preset))["milestone-stall-stop-v1"]).toBe(false);
});
it("accepts limits.replyFailuresEndRun as an optional boolean only",()=>{
  const lenient={...preset,limits:{...preset.limits,replyFailuresEndRun:false}};
  expect(parsePlayPreset(lenient)).toEqual(lenient);
  expect(()=>parsePlayPreset({...preset,limits:{...preset.limits,replyFailuresEndRun:"false"}})).toThrow();
});
