import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {MEASUREMENT_ONLY_MILESTONES,MILESTONES} from "./milestones.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,stateOnlyProblems,type FeatureSet} from "./features.js";
const closed={additionalProperties:false} as const;
const positive=Type.Integer({minimum:1});
const common={id:Type.String({minLength:1,maxLength:100}),target:Type.Union([Type.String({minLength:1}),Type.Null()]),limits:Type.Object({maxTurns:positive,maxWallMs:positive,failureLimit:positive,replyFailuresEndRun:Type.Optional(Type.Boolean())},closed),sampling:Type.Object({thinkingLevel:Type.Enum(["off","minimal","low","medium","high","xhigh"] as const),maxTokens:positive},closed)};
export const PlayFlagsSchema=Type.Object({loopGuard:Type.Boolean(),activeUi:Type.Boolean(),interfaceDocs:Type.Boolean(),objectives:Type.Boolean()},closed);
export const FeatureSetSchema=Type.Object({
 ...Object.fromEntries(SWITCHABLE_FEATURES.filter(id=>id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="save-state-task-truth-v1"&&id!=="navigation-evidence-memory-v1"&&id!=="pushback-loop-detection-v1"&&id!=="pushback-press-result-v1"&&id!=="battle-observation-loop-v1"&&id!=="in-game-naming-readout-v1"&&id!=="no-nickname-guidance-v1"&&id!=="battle-message-waiting-v1"&&id!=="connection-edge-tiles-v1"&&id!=="explorer-guidance-v1"&&id!=="automatic-running-v1"&&id!=="expanded-menu-battle-information-v1"&&id!=="field-dialogue-phase-v1"&&id!=="dialogue-safe-batches-v1"&&id!=="interaction-loop-detection-v1"&&id!=="state-only-decisions-v1"&&id!=="named-interactions-v1"&&id!=="world-destinations-v1"&&id!=="bounded-navigation-v1"&&id!=="ledge-hops-v1"&&id!=="one-way-tiles-v1"&&id!=="full-map-navigation-v1"&&id!=="grass-cost-navigation-v1"&&id!=="counter-talk-v1"&&id!=="walkable-floor-v1"&&id!=="elevation-transitions-v1"&&id!=="game-evidence-priority-v1"&&id!=="dialogue-log-v1"&&id!=="loop-guard-supervisor-v1"&&id!=="instruction-ledger-v1"&&id!=="next-milestone-hint-v1"&&id!=="double-context-window-v1"&&id!=="fresh-retry-v1"&&id!=="named-warp-destinations-v1"&&id!=="milestone-stall-stop-v1"&&id!=="text-only-supervisor-v1"&&id!=="character-presence-v1"&&id!=="navigation-refusal-reasons-v1"&&id!=="transition-press-result-v1"&&id!=="stall-briefing-v1"&&id!=="battle-details-v2"&&id!=="dialogue-auto-advance-v1"&&id!=="warp-arrival-settle-v1"&&id!=="dialogue-context-kept-v1"&&id!=="displayed-place-names-v1"&&id!=="transition-loop-detection-v1"&&id!=="blocked-batch-result-v1"&&id!=="adjacent-tiles-v1"&&id!=="script-line-presence-v1"&&id!=="offscreen-objects-v1"&&id!=="navigate-first-prompt-v1"&&id!=="presence-penalty-v1"&&id!=="levelup-box-v1"&&id!=="disproved-beliefs-v1"&&id!=="same-plan-breaker-v1"&&id!=="navigation-truth-v1"&&id!=="navigation-refusal-reasons-v2"&&id!=="low-hp-trainer-warning-v2"&&id!=="battle-triage-guidance-v1"&&id!=="readout-rules-in-prompt-v1"&&id!=="battle-text-auto-advance-v1"&&id!=="briefing-exits-v1"&&id!=="untaken-exits-v1"&&id!=="people-ledger-v1"&&id!=="trainer-heal-guidance-v1"&&id!=="low-hp-trainer-warning-v1"&&id!=="briefing-battle-outcomes-v1"&&id!=="blocked-exit-fact-v1"&&id!=="battle-loss-recap-v1"&&id!=="transition-coherence-v1"&&id!=="readout-truth-v1"&&id!=="birch-speech-pages-v1"&&id!=="blackout-readout-v1"&&id!=="open-goal-prompt-v1"&&id!=="surf-gated-exits-v1"&&id!=="story-destinations-v1"&&id!=="exit-reachability-v1"&&id!=="cross-map-goal-v1"&&id!=="explorer-guidance-v2"&&id!=="ineffective-loops-v1"&&id!=="people-id-cards-v1"&&id!=="heal-before-trainers-v1"&&id!=="harness-trust-v1"&&id!=="cited-destination-v1"&&id!=="harness-trust-v2"&&id!=="tutorial-party-owner-v1"&&id!=="mid-frame-readout-v1"&&id!=="unset-dynamic-warp-v1"&&id!=="status-names-v1"&&id!=="surf-gated-exits-v2"&&id!=="instruction-ledger-v2"&&id!=="no-exit-here-v1"&&id!=="bag-healing-items-v1"&&id!=="battle-menu-loop-v1"&&id!=="clock-view-loop-v1"&&id!=="stale-story-goal-v1"&&id!=="input-cuts-v1"&&id!=="loop-guard-screen-v1"&&id!=="reopened-dialogue-loop-v1"&&id!=="dialog-button-b-v1"&&id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1").map(id=>[id,Type.Boolean()])) as Record<Exclude<(typeof SWITCHABLE_FEATURES)[number],"scripted-place-guidance-v1"|"trigger-script-loop-v1"|"cache-aligned-window-v1"|"jit-guide-reuse-v1"|"save-state-task-truth-v1"|"navigation-evidence-memory-v1"|"explorer-guidance-v1"|"automatic-running-v1"|"expanded-menu-battle-information-v1"|"field-dialogue-phase-v1"|"dialogue-safe-batches-v1"|"interaction-loop-detection-v1"|"state-only-decisions-v1"|"named-interactions-v1"|"world-destinations-v1"|"bounded-navigation-v1"|"ledge-hops-v1"|"one-way-tiles-v1"|"full-map-navigation-v1"|"grass-cost-navigation-v1"|"counter-talk-v1"|"walkable-floor-v1"|"elevation-transitions-v1"|"game-evidence-priority-v1"|"dialogue-log-v1"|"loop-guard-supervisor-v1"|"instruction-ledger-v1"|"next-milestone-hint-v1"|"double-context-window-v1"|"fresh-retry-v1"|"named-warp-destinations-v1"|"milestone-stall-stop-v1"|"text-only-supervisor-v1"|"character-presence-v1"|"navigation-refusal-reasons-v1"|"transition-press-result-v1"|"stall-briefing-v1"|"battle-details-v2"|"dialogue-auto-advance-v1"|"warp-arrival-settle-v1"|"dialogue-context-kept-v1"|"displayed-place-names-v1"|"transition-loop-detection-v1"|"blocked-batch-result-v1"|"adjacent-tiles-v1"|"readout-rules-in-prompt-v1"|"connection-edge-tiles-v1"|"in-game-naming-readout-v1"|"no-nickname-guidance-v1"|"battle-text-auto-advance-v1"|"battle-message-waiting-v1"|"script-line-presence-v1"|"briefing-exits-v1"|"untaken-exits-v1"|"people-ledger-v1"|"trainer-heal-guidance-v1"|"low-hp-trainer-warning-v1"|"briefing-battle-outcomes-v1"|"blocked-exit-fact-v1"|"battle-loss-recap-v1"|"transition-coherence-v1"|"readout-truth-v1"|"birch-speech-pages-v1"|"blackout-readout-v1"|"surf-gated-exits-v1"|"story-destinations-v1"|"exit-reachability-v1"|"cross-map-goal-v1"|"explorer-guidance-v2"|"ineffective-loops-v1"|"people-id-cards-v1"|"open-goal-prompt-v1"|"heal-before-trainers-v1"|"harness-trust-v1"|"cited-destination-v1"|"harness-trust-v2"|"tutorial-party-owner-v1"|"mid-frame-readout-v1"|"unset-dynamic-warp-v1"|"status-names-v1"|"surf-gated-exits-v2"|"instruction-ledger-v2"|"no-exit-here-v1"|"bag-healing-items-v1"|"battle-menu-loop-v1"|"clock-view-loop-v1"|"stale-story-goal-v1"|"input-cuts-v1"|"reopened-dialogue-loop-v1"|"dialog-button-b-v1"|"just-in-time-prompt-v1"|"just-in-time-prompt-v2"|"faced-interaction-history-v1"|"battle-decision-ready-v1"|"deterministic-warp-navigation-v1">,ReturnType<typeof Type.Boolean>>,
 "navigation-evidence-memory-v1":Type.Optional(Type.Boolean()),
 "field-dialogue-phase-v1":Type.Optional(Type.Boolean()),
 "dialogue-safe-batches-v1":Type.Optional(Type.Boolean()),
 "interaction-loop-detection-v1":Type.Optional(Type.Boolean()),
 "automatic-running-v1":Type.Optional(Type.Boolean()),
 "expanded-menu-battle-information-v1":Type.Optional(Type.Boolean()),
 "state-only-decisions-v1":Type.Optional(Type.Boolean()),
 "named-interactions-v1":Type.Optional(Type.Boolean()),
 "world-destinations-v1":Type.Optional(Type.Boolean()),
 "bounded-navigation-v1":Type.Optional(Type.Boolean()),
 "ledge-hops-v1":Type.Optional(Type.Boolean()),
 "one-way-tiles-v1":Type.Optional(Type.Boolean()),
 "counter-talk-v1":Type.Optional(Type.Boolean()),
 "walkable-floor-v1":Type.Optional(Type.Boolean()),
 "full-map-navigation-v1":Type.Optional(Type.Boolean()),
 "grass-cost-navigation-v1":Type.Optional(Type.Boolean()),
 // Omitted means ON: presets written before the switch ran the game elevation rule.
 "elevation-transitions-v1":Type.Optional(Type.Boolean()),
 "game-evidence-priority-v1":Type.Optional(Type.Boolean()),
 "dialogue-log-v1":Type.Optional(Type.Boolean()),
 "loop-guard-supervisor-v1":Type.Optional(Type.Boolean()),
 "instruction-ledger-v1":Type.Optional(Type.Boolean()),
 "next-milestone-hint-v1":Type.Optional(Type.Boolean()),
 "double-context-window-v1":Type.Optional(Type.Boolean()),
 "fresh-retry-v1":Type.Optional(Type.Boolean()),
 "named-warp-destinations-v1":Type.Optional(Type.Boolean()),
 "milestone-stall-stop-v1":Type.Optional(Type.Boolean()),
 "text-only-supervisor-v1":Type.Optional(Type.Boolean()),
 "character-presence-v1":Type.Optional(Type.Boolean()),
 "navigation-refusal-reasons-v1":Type.Optional(Type.Boolean()),
 "transition-press-result-v1":Type.Optional(Type.Boolean()),
 "stall-briefing-v1":Type.Optional(Type.Boolean()),
 "battle-details-v2":Type.Optional(Type.Boolean()),
 "dialogue-auto-advance-v1":Type.Optional(Type.Boolean()),
 "warp-arrival-settle-v1":Type.Optional(Type.Boolean()),
 "dialogue-context-kept-v1":Type.Optional(Type.Boolean()),
 "displayed-place-names-v1":Type.Optional(Type.Boolean()),
 "transition-loop-detection-v1":Type.Optional(Type.Boolean()),
 "blocked-batch-result-v1":Type.Optional(Type.Boolean()),
 "explorer-guidance-v1":Type.Optional(Type.Boolean()),
 "battle-triage-guidance-v1":Type.Optional(Type.Boolean()),
 "adjacent-tiles-v1":Type.Optional(Type.Boolean()),
 "readout-rules-in-prompt-v1":Type.Optional(Type.Boolean()),
 "connection-edge-tiles-v1":Type.Optional(Type.Boolean()),
 "in-game-naming-readout-v1":Type.Optional(Type.Boolean()),
 "no-nickname-guidance-v1":Type.Optional(Type.Boolean()),
 "battle-text-auto-advance-v1":Type.Optional(Type.Boolean()),
 "briefing-exits-v1":Type.Optional(Type.Boolean()),
 "untaken-exits-v1":Type.Optional(Type.Boolean()),
 "people-ledger-v1":Type.Optional(Type.Boolean()),
 "trainer-heal-guidance-v1":Type.Optional(Type.Boolean()),
 "low-hp-trainer-warning-v1":Type.Optional(Type.Boolean()),
 "battle-message-waiting-v1":Type.Optional(Type.Boolean()),
 "script-line-presence-v1":Type.Optional(Type.Boolean()),
 "offscreen-objects-v1":Type.Optional(Type.Boolean()),
 "navigate-first-prompt-v1":Type.Optional(Type.Boolean()),
 "presence-penalty-v1":Type.Optional(Type.Boolean()),
 "disproved-beliefs-v1":Type.Optional(Type.Boolean()),
 "same-plan-breaker-v1":Type.Optional(Type.Boolean()),
 "levelup-box-v1":Type.Optional(Type.Boolean()),
 "briefing-battle-outcomes-v1":Type.Optional(Type.Boolean()),
 "blocked-exit-fact-v1":Type.Optional(Type.Boolean()),
 "battle-loss-recap-v1":Type.Optional(Type.Boolean()),
 "pushback-loop-detection-v1":Type.Optional(Type.Boolean()),
 "pushback-press-result-v1":Type.Optional(Type.Boolean()),
 "battle-observation-loop-v1":Type.Optional(Type.Boolean()),
 "transition-coherence-v1":Type.Optional(Type.Boolean()),
 "readout-truth-v1":Type.Optional(Type.Boolean()),
 "birch-speech-pages-v1":Type.Optional(Type.Boolean()),
 "blackout-readout-v1":Type.Optional(Type.Boolean()),
 "open-goal-prompt-v1":Type.Optional(Type.Boolean()),
 "surf-gated-exits-v1":Type.Optional(Type.Boolean()),
 "story-destinations-v1":Type.Optional(Type.Boolean()),
 "exit-reachability-v1":Type.Optional(Type.Boolean()),
 "heal-before-trainers-v1":Type.Optional(Type.Boolean()),
 "harness-trust-v1":Type.Optional(Type.Boolean()),
 "cited-destination-v1":Type.Optional(Type.Boolean()),
 "harness-trust-v2":Type.Optional(Type.Boolean()),
 "battle-move-tool-v1":Type.Optional(Type.Boolean()),
 "tutorial-party-owner-v1":Type.Optional(Type.Boolean()),
 "mid-frame-readout-v1":Type.Optional(Type.Boolean()),
 "unset-dynamic-warp-v1":Type.Optional(Type.Boolean()),
 "status-names-v1":Type.Optional(Type.Boolean()),
 "surf-gated-exits-v2":Type.Optional(Type.Boolean()),
 "instruction-ledger-v2":Type.Optional(Type.Boolean()),
 "no-exit-here-v1":Type.Optional(Type.Boolean()),
 "bag-healing-items-v1":Type.Optional(Type.Boolean()),
 "battle-menu-loop-v1":Type.Optional(Type.Boolean()),
 "clock-view-loop-v1":Type.Optional(Type.Boolean()),
 "stale-story-goal-v1":Type.Optional(Type.Boolean()),
 "input-cuts-v1":Type.Optional(Type.Boolean()),
 "loop-guard-screen-v1":Type.Optional(Type.Boolean()),
 "reopened-dialogue-loop-v1":Type.Optional(Type.Boolean()),
 "dialog-button-b-v1":Type.Optional(Type.Boolean()),
 "just-in-time-prompt-v1":Type.Optional(Type.Boolean()),
 "just-in-time-prompt-v2":Type.Optional(Type.Boolean()),
 "faced-interaction-history-v1":Type.Optional(Type.Boolean()),
 "save-state-task-truth-v1":Type.Optional(Type.Boolean()),
 "scripted-place-guidance-v1":Type.Optional(Type.Boolean()),
 "trigger-script-loop-v1":Type.Optional(Type.Boolean()),
 "cache-aligned-window-v1":Type.Optional(Type.Boolean()),
 "jit-guide-reuse-v1":Type.Optional(Type.Boolean()),
 "visited-terrain-navigation-v1":Type.Optional(Type.Boolean()),
 "battle-effective-damage-v1":Type.Optional(Type.Boolean()),
 "deterministic-warp-navigation-v1":Type.Optional(Type.Boolean()),
 "battle-decision-ready-v1":Type.Optional(Type.Boolean()),
 "cross-map-goal-v1":Type.Optional(Type.Boolean()),
 "explorer-guidance-v2":Type.Optional(Type.Boolean()),
 "navigation-truth-v1":Type.Optional(Type.Boolean()),
 "navigation-refusal-reasons-v2":Type.Optional(Type.Boolean()),
 "ineffective-loops-v1":Type.Optional(Type.Boolean()),
 "people-id-cards-v1":Type.Optional(Type.Boolean()),
 "low-hp-trainer-warning-v2":Type.Optional(Type.Boolean()),
 "stale-story-goal-v2":Type.Optional(Type.Boolean()),
},closed);
export function normalizeFeatures(features0:Static<typeof FeatureSetSchema>):FeatureSet {
 const features={...features0,"battle-decision-ready-v1":features0["battle-decision-ready-v1"]??false,"visited-terrain-navigation-v1":features0["visited-terrain-navigation-v1"]??false,"battle-effective-damage-v1":features0["battle-effective-damage-v1"]??false,"deterministic-warp-navigation-v1":features0["deterministic-warp-navigation-v1"]??false,"stale-story-goal-v2":features0["stale-story-goal-v2"]??false};
 const merged:FeatureSet={...features,"scripted-place-guidance-v1":features["scripted-place-guidance-v1"]??false,"trigger-script-loop-v1":features["trigger-script-loop-v1"]??false,"cache-aligned-window-v1":features["cache-aligned-window-v1"]??false,"jit-guide-reuse-v1":features["jit-guide-reuse-v1"]??false,"save-state-task-truth-v1":features["save-state-task-truth-v1"]??false,"navigation-evidence-memory-v1":features["navigation-evidence-memory-v1"]??false,"pushback-loop-detection-v1":features["pushback-loop-detection-v1"]??false,"pushback-press-result-v1":features["pushback-press-result-v1"]??false,"battle-observation-loop-v1":features["battle-observation-loop-v1"]??false,"in-game-naming-readout-v1":features["in-game-naming-readout-v1"]??false,"no-nickname-guidance-v1":features["no-nickname-guidance-v1"]??false,"battle-message-waiting-v1":features["battle-message-waiting-v1"]??false,"connection-edge-tiles-v1":features["connection-edge-tiles-v1"]??false,"explorer-guidance-v1":features["explorer-guidance-v1"]??false,"automatic-running-v1":features["automatic-running-v1"]??false,"expanded-menu-battle-information-v1":features["expanded-menu-battle-information-v1"]??false,"field-dialogue-phase-v1":features["field-dialogue-phase-v1"]??false,"dialogue-safe-batches-v1":features["dialogue-safe-batches-v1"]??false,"interaction-loop-detection-v1":features["interaction-loop-detection-v1"]??false,"state-only-decisions-v1":features["state-only-decisions-v1"]??false,"named-interactions-v1":features["named-interactions-v1"]??false,"world-destinations-v1":features["world-destinations-v1"]??false,"bounded-navigation-v1":features["bounded-navigation-v1"]??false,"ledge-hops-v1":features["ledge-hops-v1"]??false,"one-way-tiles-v1":features["one-way-tiles-v1"]??false,"counter-talk-v1":features["counter-talk-v1"]??false,"walkable-floor-v1":features["walkable-floor-v1"]??false,"full-map-navigation-v1":features["full-map-navigation-v1"]??false,"grass-cost-navigation-v1":features["grass-cost-navigation-v1"]??false,"elevation-transitions-v1":features["elevation-transitions-v1"]??true,"game-evidence-priority-v1":features["game-evidence-priority-v1"]??false,"dialogue-log-v1":features["dialogue-log-v1"]??false,"loop-guard-supervisor-v1":features["loop-guard-supervisor-v1"]??false,"instruction-ledger-v1":features["instruction-ledger-v1"]??false,"next-milestone-hint-v1":features["next-milestone-hint-v1"]??false,"double-context-window-v1":features["double-context-window-v1"]??false,"fresh-retry-v1":features["fresh-retry-v1"]??false,"named-warp-destinations-v1":features["named-warp-destinations-v1"]??false,"milestone-stall-stop-v1":features["milestone-stall-stop-v1"]??false,"text-only-supervisor-v1":features["text-only-supervisor-v1"]??false,"character-presence-v1":features["character-presence-v1"]??false,"navigation-refusal-reasons-v1":features["navigation-refusal-reasons-v1"]??false,"transition-press-result-v1":features["transition-press-result-v1"]??false,"stall-briefing-v1":features["stall-briefing-v1"]??false,"battle-details-v2":features["battle-details-v2"]??false,"dialogue-auto-advance-v1":features["dialogue-auto-advance-v1"]??false,"warp-arrival-settle-v1":features["warp-arrival-settle-v1"]??false,"dialogue-context-kept-v1":features["dialogue-context-kept-v1"]??false,"displayed-place-names-v1":features["displayed-place-names-v1"]??false,"transition-loop-detection-v1":features["transition-loop-detection-v1"]??false,"blocked-batch-result-v1":features["blocked-batch-result-v1"]??false,"adjacent-tiles-v1":features["adjacent-tiles-v1"]??false,"readout-rules-in-prompt-v1":features["readout-rules-in-prompt-v1"]??false,"script-line-presence-v1":features["script-line-presence-v1"]??false,"offscreen-objects-v1":features["offscreen-objects-v1"]??false,"navigate-first-prompt-v1":features["navigate-first-prompt-v1"]??false,"presence-penalty-v1":features["presence-penalty-v1"]??false,"levelup-box-v1":features["levelup-box-v1"]??false,"disproved-beliefs-v1":features["disproved-beliefs-v1"]??false,"same-plan-breaker-v1":features["same-plan-breaker-v1"]??false,"navigation-truth-v1":features["navigation-truth-v1"]??false,"navigation-refusal-reasons-v2":features["navigation-refusal-reasons-v2"]??false,"low-hp-trainer-warning-v2":features["low-hp-trainer-warning-v2"]??false,"battle-triage-guidance-v1":features["battle-triage-guidance-v1"]??false,"battle-text-auto-advance-v1":features["battle-text-auto-advance-v1"]??false,"briefing-exits-v1":features["briefing-exits-v1"]??false,"untaken-exits-v1":features["untaken-exits-v1"]??false,"people-ledger-v1":features["people-ledger-v1"]??false,"transition-coherence-v1":features["transition-coherence-v1"]??false,"trainer-heal-guidance-v1":features["trainer-heal-guidance-v1"]??false,"low-hp-trainer-warning-v1":features["low-hp-trainer-warning-v1"]??false,"briefing-battle-outcomes-v1":features["briefing-battle-outcomes-v1"]??false,"blocked-exit-fact-v1":features["blocked-exit-fact-v1"]??false,"battle-loss-recap-v1":features["battle-loss-recap-v1"]??false,"readout-truth-v1":features["readout-truth-v1"]??false,"birch-speech-pages-v1":features["birch-speech-pages-v1"]??false,"blackout-readout-v1":features["blackout-readout-v1"]??false,"open-goal-prompt-v1":features["open-goal-prompt-v1"]??false,"surf-gated-exits-v1":features["surf-gated-exits-v1"]??false,"story-destinations-v1":features["story-destinations-v1"]??false,"exit-reachability-v1":features["exit-reachability-v1"]??false,"cross-map-goal-v1":features["cross-map-goal-v1"]??false,"explorer-guidance-v2":features["explorer-guidance-v2"]??false,"ineffective-loops-v1":features["ineffective-loops-v1"]??false,"people-id-cards-v1":features["people-id-cards-v1"]??false,"heal-before-trainers-v1":features["heal-before-trainers-v1"]??false,"harness-trust-v1":features["harness-trust-v1"]??false,"cited-destination-v1":features["cited-destination-v1"]??false,"harness-trust-v2":features["harness-trust-v2"]??false,"battle-move-tool-v1":features["battle-move-tool-v1"]??false,"tutorial-party-owner-v1":features["tutorial-party-owner-v1"]??false,"mid-frame-readout-v1":features["mid-frame-readout-v1"]??false,"unset-dynamic-warp-v1":features["unset-dynamic-warp-v1"]??false,"status-names-v1":features["status-names-v1"]??false,"surf-gated-exits-v2":features["surf-gated-exits-v2"]??false,"instruction-ledger-v2":features["instruction-ledger-v2"]??false,"no-exit-here-v1":features["no-exit-here-v1"]??false,"bag-healing-items-v1":features["bag-healing-items-v1"]??false,"battle-menu-loop-v1":features["battle-menu-loop-v1"]??false,"clock-view-loop-v1":features["clock-view-loop-v1"]??false,"stale-story-goal-v1":features["stale-story-goal-v1"]??false,"input-cuts-v1":features["input-cuts-v1"]??false,"loop-guard-screen-v1":features["loop-guard-screen-v1"]??false,"reopened-dialogue-loop-v1":features["reopened-dialogue-loop-v1"]??false,"dialog-button-b-v1":features["dialog-button-b-v1"]??false,"just-in-time-prompt-v1":features["just-in-time-prompt-v1"]??false,"just-in-time-prompt-v2":features["just-in-time-prompt-v2"]??false,"faced-interaction-history-v1":features["faced-interaction-history-v1"]??false};
 // Registry order, whatever order the preset file lists them in.
 return Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,merged[id]])) as FeatureSet;
}
export const PlayPresetV1Schema=Type.Object({version:Type.Literal(1),...common,flags:PlayFlagsSchema},closed);
// v2 names every switch explicitly; viewer-queued runs use it.
export const PresetStartSchema=Type.Object({kind:Type.Literal("save_state"),path:Type.String({minLength:1,maxLength:4096}),sha1:Type.String({pattern:"^[0-9a-f]{40}$"})},closed);
export const PlayPresetV2Schema=Type.Object({version:Type.Literal(2),...common,features:FeatureSetSchema,start:Type.Optional(PresetStartSchema)},closed);
export const PlayPresetSchema=Type.Union([PlayPresetV1Schema,PlayPresetV2Schema]);
export type PlayPresetV1=Static<typeof PlayPresetV1Schema>;
export type PlayPresetV2=Omit<Static<typeof PlayPresetV2Schema>,"features"> & {features:FeatureSet};
export type PlayPreset=PlayPresetV1|PlayPresetV2;
export type PlayFlags=Static<typeof PlayFlagsSchema>;
export function parsePlayPreset(value:unknown):PlayPreset{
 const v2=typeof value==="object"&&value!==null&&"version" in value&&value.version===2;
 const schema=v2?PlayPresetV2Schema:PlayPresetV1Schema;
 if(!Value.Check(schema,value)){const [first]=Value.Errors(schema,value);throw new Error(`Invalid play preset: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);}
 const preset:PlayPreset=v2?{...value,features:normalizeFeatures(value.features)}:value;
 if(preset.target!==null&&!MILESTONES.some(item=>item.name===preset.target&&item.kind!=="legacy"))throw new Error(`Invalid play preset: target ${preset.target} is not a native milestone`);
 if(preset.target!==null&&MEASUREMENT_ONLY_MILESTONES.has(preset.target))throw new Error(`Invalid play preset: target ${preset.target} is measurement-only; a target is written into the model's goal`);
 if(preset.version===2){const problems=[...dependencyProblems(preset.features),...stateOnlyProblems(preset.features)];if(problems.length>0)throw new Error(`Invalid play preset: ${problems.join("; ")}`);}
 return preset;
}
// Frozen comparison manifests were written against the four-flag contract.
export function parsePlayPresetV1(value:unknown):PlayPresetV1{
 const preset=parsePlayPreset(value);
 if(preset.version!==1)throw new Error("Invalid play preset: comparison presets must be version 1");
 return preset;
}
export function presetFeatures(preset:PlayPreset):FeatureSet{
 return preset.version===2?{...preset.features}:flagFeatures(preset.flags);
}
function legacyFlagFeatures({loopGuard,activeUi,interfaceDocs,objectives}:PlayFlags):FeatureSet{
 return {...ALL_ON,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"cache-aligned-window-v1":false,"jit-guide-reuse-v1":false,"navigation-evidence-memory-v1":false,"pushback-loop-detection-v1":false,"pushback-press-result-v1":false,"battle-observation-loop-v1":false,"in-game-naming-readout-v1":false,"no-nickname-guidance-v1":false,"battle-message-waiting-v1":false,"connection-edge-tiles-v1":false,"explorer-guidance-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"warp-arrival-settle-v1":false,"transition-loop-detection-v1":false,"blocked-batch-result-v1":false,"adjacent-tiles-v1":false,"script-line-presence-v1":false,"offscreen-objects-v1":false,"navigate-first-prompt-v1":false,"presence-penalty-v1":false,"levelup-box-v1":false,"disproved-beliefs-v1":false,"same-plan-breaker-v1":false,"navigation-truth-v1":false,"navigation-refusal-reasons-v2":false,"low-hp-trainer-warning-v2":false,"battle-triage-guidance-v1":false,"displayed-place-names-v1":false,"dialogue-context-kept-v1":false,"readout-rules-in-prompt-v1":false,"deterministic-loop-guard-v1":loopGuard,"active-ui-ownership-v1":activeUi,"contextual-interface-docs-v1":interfaceDocs,"objective-tracking-v1":objectives,"repeat-attempt-guard-v1":objectives,"native-objective-completion-v1":objectives,"battle-text-auto-advance-v1":false,"briefing-exits-v1":false,"untaken-exits-v1":false,"people-ledger-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"briefing-battle-outcomes-v1":false,"blocked-exit-fact-v1":false,"battle-loss-recap-v1":false,"transition-coherence-v1":false,"readout-truth-v1":false,"birch-speech-pages-v1":false,"blackout-readout-v1":false,"open-goal-prompt-v1":false,"surf-gated-exits-v1":false,"story-destinations-v1":false,"exit-reachability-v1":false,"cross-map-goal-v1":false,"explorer-guidance-v2":false,"ineffective-loops-v1":false,"people-id-cards-v1":false,"heal-before-trainers-v1":false,"harness-trust-v1":false,"cited-destination-v1":false,"harness-trust-v2":false,"battle-move-tool-v1":false,"tutorial-party-owner-v1":false,"mid-frame-readout-v1":false,"unset-dynamic-warp-v1":false,"status-names-v1":false,"surf-gated-exits-v2":false,"instruction-ledger-v2":false,"no-exit-here-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"faced-interaction-history-v1":false,"save-state-task-truth-v1":false,"dialog-button-b-v1":false};
}
export function flagFeatures(flags:PlayFlags):FeatureSet{return {...legacyFlagFeatures(flags),"battle-decision-ready-v1":false,"visited-terrain-navigation-v1":false,"battle-effective-damage-v1":false,"deterministic-warp-navigation-v1":false,"stale-story-goal-v2":false};}
// The four legacy flags recorded in run_start evaluation for every preset.
export function presetFlags(preset:PlayPreset):PlayFlags{
 if(preset.version===1)return {...preset.flags};
 const f=preset.features;
 return {loopGuard:f["deterministic-loop-guard-v1"],activeUi:f["active-ui-ownership-v1"],interfaceDocs:f["contextual-interface-docs-v1"],objectives:f["objective-tracking-v1"]};
}

// A checkpoint start is verified against its recorded SHA-1 before the run launches.
export function presetStart(preset:PlayPreset,read:(path:string)=>Buffer):{kind:"boot"}|Static<typeof PresetStartSchema>{
 if(preset.version!==2||preset.start===undefined)return {kind:"boot"};
 // The launcher and server run in other directories, so the checked file and the loaded file must share one absolute path.
 const path=resolve(preset.start.path);
 const actual=createHash("sha1").update(read(path)).digest("hex");
 if(actual!==preset.start.sha1)throw new Error(`Checkpoint SHA-1 mismatch for ${path}: preset ${preset.start.sha1}, file ${actual}`);
 return {...preset.start,path};
}
