import {expect,it} from "vitest";
import {parsePlayPreset} from "./play-preset.js";
const preset={version:1,id:"name-control",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
it("strictly accepts full explicit presets and ordinary no-target variants",()=>{expect(parsePlayPreset(preset)).toEqual(preset);expect(parsePlayPreset({...preset,target:null})).toEqual({...preset,target:null});});
it.each([{...preset,extra:true},{...preset,limits:{...preset.limits,maxWallMs:"600000"}},{...preset,flags:{...preset.flags,loopGuard:"false"}},{...preset,target:"PLAYER_NAME_SET"},{...preset,target:"invented"},{...preset,sampling:{thinkingLevel:"invented",maxTokens:4096}},{...preset,limits:{...preset.limits,failureLimit:0}}])("rejects unsupported or malformed contracts",value=>{expect(()=>parsePlayPreset(value)).toThrow(/preset/i);});

import {ALL_ON} from "./features.js";
import {presetFeatures,presetFlags} from "./play-preset.js";
const LEGACY_ALL_ON={...ALL_ON,"battle-refusal-loop-v1":false,"stale-story-goal-v2":false,"deterministic-warp-navigation-v1":false,"visited-terrain-navigation-v1":false,"battle-effective-damage-v1":false};
const v2={version:2,id:"viewer-next",target:null,limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...ALL_ON,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"mid-frame-readout-v1":false,"unset-dynamic-warp-v1":false,"status-names-v1":false,"dialogue-auto-advance-v1":false,"people-ledger-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"harness-trust-v1":false,"cited-destination-v1":false,"no-exit-here-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"battle-refusal-loop-v1":false,"stale-story-goal-v2":false,"deterministic-warp-navigation-v1":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false,"faced-interaction-history-v1":false,"save-state-task-truth-v1":false,"cache-aligned-window-v1":false,"harness-trust-v2":false,"exit-reachability-v1":false,"heal-before-trainers-v1":false,"people-id-cards-v1":false,"transition-coherence-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"script-line-presence-v1":false,"battle-text-auto-advance-v1":false,"battle-message-waiting-v1":false,"warp-arrival-settle-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"story-state-v1":false,"disproved-beliefs-v1":false}};
it("accepts a v2 preset with every switch explicit and exposes its feature set",()=>{
  const parsed=parsePlayPreset(v2);
  expect(presetFeatures(parsed)).toEqual(v2.features);
  expect(presetFlags(parsed)).toEqual({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true});
});
it("maps v1 flags onto the full switch set, objectives covering its three guards",()=>{
  const features=presetFeatures(parsePlayPreset(preset));
  expect(features).toEqual({...LEGACY_ALL_ON,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"tutorial-party-owner-v1":false,"mid-frame-readout-v1":false,"unset-dynamic-warp-v1":false,"status-names-v1":false,"surf-gated-exits-v2":false,"battle-move-tool-v1":false,"open-goal-prompt-v1":false,"pushback-loop-detection-v1":false,"pushback-press-result-v1":false,"battle-observation-loop-v1":false,"briefing-battle-outcomes-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"readout-truth-v1":false,"birch-speech-pages-v1":false,"blackout-readout-v1":false,"surf-gated-exits-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"harness-trust-v1":false,"cited-destination-v1":false,"no-exit-here-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"battle-refusal-loop-v1":false,"stale-story-goal-v2":false,"deterministic-warp-navigation-v1":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false,"faced-interaction-history-v1":false,"save-state-task-truth-v1":false,"cache-aligned-window-v1":false,"harness-trust-v2":false,"exit-reachability-v1":false,"heal-before-trainers-v1":false,"cross-map-goal-v1":false,"explorer-guidance-v2":false,"ineffective-loops-v1":false,"briefing-exits-v1":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"transition-coherence-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"battle-triage-guidance-v1":false,"displayed-place-names-v1":false,"blocked-batch-result-v1":false,"explorer-guidance-v1":false,"readout-rules-in-prompt-v1":false,"offscreen-objects-v1":false,"navigate-first-prompt-v1":false,"presence-penalty-v1":false,"levelup-box-v1":false,"disproved-beliefs-v1":false,"same-plan-breaker-v1":false,"navigation-truth-v1":false,"navigation-refusal-reasons-v2":false,"adjacent-tiles-v1":false,"script-line-presence-v1":false,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"warp-arrival-settle-v1":false,"dialogue-context-kept-v1":false,"transition-loop-detection-v1":false,"navigation-evidence-memory-v1":false,"in-game-naming-readout-v1":false,"no-nickname-guidance-v1":false,"battle-text-auto-advance-v1":false,"battle-message-waiting-v1":false,"connection-edge-tiles-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"deterministic-loop-guard-v1":false});
  const noObjectives=presetFeatures(parsePlayPreset({...preset,flags:{...preset.flags,objectives:false,activeUi:false}}));
  expect(noObjectives).toEqual({...LEGACY_ALL_ON,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"tutorial-party-owner-v1":false,"mid-frame-readout-v1":false,"unset-dynamic-warp-v1":false,"status-names-v1":false,"surf-gated-exits-v2":false,"battle-move-tool-v1":false,"open-goal-prompt-v1":false,"pushback-loop-detection-v1":false,"pushback-press-result-v1":false,"battle-observation-loop-v1":false,"briefing-battle-outcomes-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"readout-truth-v1":false,"birch-speech-pages-v1":false,"blackout-readout-v1":false,"surf-gated-exits-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"harness-trust-v1":false,"cited-destination-v1":false,"no-exit-here-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"battle-refusal-loop-v1":false,"stale-story-goal-v2":false,"deterministic-warp-navigation-v1":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false,"faced-interaction-history-v1":false,"save-state-task-truth-v1":false,"cache-aligned-window-v1":false,"harness-trust-v2":false,"exit-reachability-v1":false,"heal-before-trainers-v1":false,"cross-map-goal-v1":false,"explorer-guidance-v2":false,"ineffective-loops-v1":false,"briefing-exits-v1":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"transition-coherence-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"low-hp-trainer-warning-v2":false,"battle-triage-guidance-v1":false,"displayed-place-names-v1":false,"blocked-batch-result-v1":false,"explorer-guidance-v1":false,"readout-rules-in-prompt-v1":false,"offscreen-objects-v1":false,"navigate-first-prompt-v1":false,"presence-penalty-v1":false,"levelup-box-v1":false,"disproved-beliefs-v1":false,"same-plan-breaker-v1":false,"navigation-truth-v1":false,"navigation-refusal-reasons-v2":false,"adjacent-tiles-v1":false,"script-line-presence-v1":false,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"warp-arrival-settle-v1":false,"dialogue-context-kept-v1":false,"transition-loop-detection-v1":false,"navigation-evidence-memory-v1":false,"in-game-naming-readout-v1":false,"no-nickname-guidance-v1":false,"battle-text-auto-advance-v1":false,"battle-message-waiting-v1":false,"connection-edge-tiles-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"deterministic-loop-guard-v1":false,"active-ui-ownership-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false});
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

it("reads presets written before displayed place names as OFF and keeps an explicit ON",()=>{
  const older:Record<string,boolean>={...v2.features};delete older["displayed-place-names-v1"];
  expect(presetFeatures(parsePlayPreset({...v2,features:older}))["displayed-place-names-v1"]).toBe(false);
  expect(presetFeatures(parsePlayPreset({...v2,features:{...older,"displayed-place-names-v1":true}}))["displayed-place-names-v1"]).toBe(true);
  expect(presetFeatures(parsePlayPreset(preset))["displayed-place-names-v1"]).toBe(false);
});
