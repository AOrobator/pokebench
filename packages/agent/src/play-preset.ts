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
 ...Object.fromEntries(SWITCHABLE_FEATURES.filter(id=>id!=="navigation-evidence-memory-v1"&&id!=="explorer-guidance-v1"&&id!=="automatic-running-v1"&&id!=="expanded-menu-battle-information-v1"&&id!=="field-dialogue-phase-v1"&&id!=="dialogue-safe-batches-v1"&&id!=="interaction-loop-detection-v1"&&id!=="state-only-decisions-v1"&&id!=="named-interactions-v1"&&id!=="world-destinations-v1"&&id!=="bounded-navigation-v1"&&id!=="ledge-hops-v1"&&id!=="one-way-tiles-v1"&&id!=="full-map-navigation-v1"&&id!=="grass-cost-navigation-v1"&&id!=="counter-talk-v1"&&id!=="walkable-floor-v1"&&id!=="elevation-transitions-v1"&&id!=="game-evidence-priority-v1"&&id!=="dialogue-log-v1"&&id!=="loop-guard-supervisor-v1"&&id!=="instruction-ledger-v1"&&id!=="next-milestone-hint-v1"&&id!=="double-context-window-v1"&&id!=="fresh-retry-v1"&&id!=="named-warp-destinations-v1"&&id!=="milestone-stall-stop-v1"&&id!=="text-only-supervisor-v1"&&id!=="character-presence-v1"&&id!=="navigation-refusal-reasons-v1"&&id!=="transition-press-result-v1"&&id!=="stall-briefing-v1"&&id!=="battle-details-v2"&&id!=="dialogue-auto-advance-v1"&&id!=="warp-arrival-settle-v1"&&id!=="dialogue-context-kept-v1"&&id!=="displayed-place-names-v1"&&id!=="transition-loop-detection-v1"&&id!=="blocked-batch-result-v1"&&id!=="adjacent-tiles-v1"&&id!=="battle-triage-guidance-v1"&&id!=="readout-rules-in-prompt-v1"&&id!=="briefing-exits-v1"&&id!=="untaken-exits-v1").map(id=>[id,Type.Boolean()])) as Record<Exclude<(typeof SWITCHABLE_FEATURES)[number],"navigation-evidence-memory-v1"|"explorer-guidance-v1"|"automatic-running-v1"|"expanded-menu-battle-information-v1"|"field-dialogue-phase-v1"|"dialogue-safe-batches-v1"|"interaction-loop-detection-v1"|"state-only-decisions-v1"|"named-interactions-v1"|"world-destinations-v1"|"bounded-navigation-v1"|"ledge-hops-v1"|"one-way-tiles-v1"|"full-map-navigation-v1"|"grass-cost-navigation-v1"|"counter-talk-v1"|"walkable-floor-v1"|"elevation-transitions-v1"|"game-evidence-priority-v1"|"dialogue-log-v1"|"loop-guard-supervisor-v1"|"instruction-ledger-v1"|"next-milestone-hint-v1"|"double-context-window-v1"|"fresh-retry-v1"|"named-warp-destinations-v1"|"milestone-stall-stop-v1"|"text-only-supervisor-v1"|"character-presence-v1"|"navigation-refusal-reasons-v1"|"transition-press-result-v1"|"stall-briefing-v1"|"battle-details-v2"|"dialogue-auto-advance-v1"|"warp-arrival-settle-v1"|"dialogue-context-kept-v1"|"displayed-place-names-v1"|"transition-loop-detection-v1"|"blocked-batch-result-v1"|"adjacent-tiles-v1"|"readout-rules-in-prompt-v1"|"briefing-exits-v1"|"untaken-exits-v1">,ReturnType<typeof Type.Boolean>>,
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
 "briefing-exits-v1":Type.Optional(Type.Boolean()),
 "untaken-exits-v1":Type.Optional(Type.Boolean()),
},closed);
export function normalizeFeatures(features:Static<typeof FeatureSetSchema>):FeatureSet {
 return {...features,"navigation-evidence-memory-v1":features["navigation-evidence-memory-v1"]??false,"explorer-guidance-v1":features["explorer-guidance-v1"]??false,"automatic-running-v1":features["automatic-running-v1"]??false,"expanded-menu-battle-information-v1":features["expanded-menu-battle-information-v1"]??false,"field-dialogue-phase-v1":features["field-dialogue-phase-v1"]??false,"dialogue-safe-batches-v1":features["dialogue-safe-batches-v1"]??false,"interaction-loop-detection-v1":features["interaction-loop-detection-v1"]??false,"state-only-decisions-v1":features["state-only-decisions-v1"]??false,"named-interactions-v1":features["named-interactions-v1"]??false,"world-destinations-v1":features["world-destinations-v1"]??false,"bounded-navigation-v1":features["bounded-navigation-v1"]??false,"ledge-hops-v1":features["ledge-hops-v1"]??false,"one-way-tiles-v1":features["one-way-tiles-v1"]??false,"counter-talk-v1":features["counter-talk-v1"]??false,"walkable-floor-v1":features["walkable-floor-v1"]??false,"full-map-navigation-v1":features["full-map-navigation-v1"]??false,"grass-cost-navigation-v1":features["grass-cost-navigation-v1"]??false,"elevation-transitions-v1":features["elevation-transitions-v1"]??true,"game-evidence-priority-v1":features["game-evidence-priority-v1"]??false,"dialogue-log-v1":features["dialogue-log-v1"]??false,"loop-guard-supervisor-v1":features["loop-guard-supervisor-v1"]??false,"instruction-ledger-v1":features["instruction-ledger-v1"]??false,"next-milestone-hint-v1":features["next-milestone-hint-v1"]??false,"double-context-window-v1":features["double-context-window-v1"]??false,"fresh-retry-v1":features["fresh-retry-v1"]??false,"named-warp-destinations-v1":features["named-warp-destinations-v1"]??false,"milestone-stall-stop-v1":features["milestone-stall-stop-v1"]??false,"text-only-supervisor-v1":features["text-only-supervisor-v1"]??false,"character-presence-v1":features["character-presence-v1"]??false,"navigation-refusal-reasons-v1":features["navigation-refusal-reasons-v1"]??false,"transition-press-result-v1":features["transition-press-result-v1"]??false,"stall-briefing-v1":features["stall-briefing-v1"]??false,"battle-details-v2":features["battle-details-v2"]??false,"dialogue-auto-advance-v1":features["dialogue-auto-advance-v1"]??false,"warp-arrival-settle-v1":features["warp-arrival-settle-v1"]??false,"dialogue-context-kept-v1":features["dialogue-context-kept-v1"]??false,"displayed-place-names-v1":features["displayed-place-names-v1"]??false,"transition-loop-detection-v1":features["transition-loop-detection-v1"]??false,"blocked-batch-result-v1":features["blocked-batch-result-v1"]??false,"adjacent-tiles-v1":features["adjacent-tiles-v1"]??false,"readout-rules-in-prompt-v1":features["readout-rules-in-prompt-v1"]??false,"briefing-exits-v1":features["briefing-exits-v1"]??false,"untaken-exits-v1":features["untaken-exits-v1"]??false,"battle-triage-guidance-v1":features["battle-triage-guidance-v1"]??false};
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
export function flagFeatures({loopGuard,activeUi,interfaceDocs,objectives}:PlayFlags):FeatureSet{
 return {...ALL_ON,"navigation-evidence-memory-v1":false,"explorer-guidance-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"one-way-tiles-v1":false,"full-map-navigation-v1":false,"grass-cost-navigation-v1":false,"counter-talk-v1":false,"walkable-floor-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false,"double-context-window-v1":false,"fresh-retry-v1":false,"named-warp-destinations-v1":false,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":false,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"warp-arrival-settle-v1":false,"transition-loop-detection-v1":false,"blocked-batch-result-v1":false,"adjacent-tiles-v1":false,"battle-triage-guidance-v1":false,"displayed-place-names-v1":false,"dialogue-context-kept-v1":false,"readout-rules-in-prompt-v1":false,"briefing-exits-v1":false,"untaken-exits-v1":false,"deterministic-loop-guard-v1":loopGuard,"active-ui-ownership-v1":activeUi,"contextual-interface-docs-v1":interfaceDocs,"objective-tracking-v1":objectives,"repeat-attempt-guard-v1":objectives,"native-objective-completion-v1":objectives};
}
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
