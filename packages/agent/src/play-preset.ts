import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {MILESTONES} from "./milestones.js";
import {ALL_ON,SWITCHABLE_FEATURES,dependencyProblems,stateOnlyProblems,type FeatureSet} from "./features.js";
const closed={additionalProperties:false} as const;
const positive=Type.Integer({minimum:1});
const common={id:Type.String({minLength:1,maxLength:100}),target:Type.Union([Type.String({minLength:1}),Type.Null()]),limits:Type.Object({maxTurns:positive,maxWallMs:positive,failureLimit:positive},closed),sampling:Type.Object({thinkingLevel:Type.Enum(["off","minimal","low","medium","high","xhigh"] as const),maxTokens:positive},closed)};
export const PlayFlagsSchema=Type.Object({loopGuard:Type.Boolean(),activeUi:Type.Boolean(),interfaceDocs:Type.Boolean(),objectives:Type.Boolean()},closed);
export const FeatureSetSchema=Type.Object({
 ...Object.fromEntries(SWITCHABLE_FEATURES.filter(id=>id!=="navigation-evidence-memory-v1"&&id!=="automatic-running-v1"&&id!=="expanded-menu-battle-information-v1"&&id!=="field-dialogue-phase-v1"&&id!=="dialogue-safe-batches-v1"&&id!=="interaction-loop-detection-v1"&&id!=="state-only-decisions-v1"&&id!=="named-interactions-v1"&&id!=="world-destinations-v1"&&id!=="bounded-navigation-v1"&&id!=="ledge-hops-v1"&&id!=="full-map-navigation-v1").map(id=>[id,Type.Boolean()])) as Record<Exclude<(typeof SWITCHABLE_FEATURES)[number],"navigation-evidence-memory-v1"|"automatic-running-v1"|"expanded-menu-battle-information-v1"|"field-dialogue-phase-v1"|"dialogue-safe-batches-v1"|"interaction-loop-detection-v1"|"state-only-decisions-v1"|"named-interactions-v1"|"world-destinations-v1"|"bounded-navigation-v1"|"ledge-hops-v1"|"full-map-navigation-v1">,ReturnType<typeof Type.Boolean>>,
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
 "full-map-navigation-v1":Type.Optional(Type.Boolean()),
},closed);
export function normalizeFeatures(features:Static<typeof FeatureSetSchema>):FeatureSet {
 return {...features,"navigation-evidence-memory-v1":features["navigation-evidence-memory-v1"]??false,"automatic-running-v1":features["automatic-running-v1"]??false,"expanded-menu-battle-information-v1":features["expanded-menu-battle-information-v1"]??false,"field-dialogue-phase-v1":features["field-dialogue-phase-v1"]??false,"dialogue-safe-batches-v1":features["dialogue-safe-batches-v1"]??false,"interaction-loop-detection-v1":features["interaction-loop-detection-v1"]??false,"state-only-decisions-v1":features["state-only-decisions-v1"]??false,"named-interactions-v1":features["named-interactions-v1"]??false,"world-destinations-v1":features["world-destinations-v1"]??false,"bounded-navigation-v1":features["bounded-navigation-v1"]??false,"ledge-hops-v1":features["ledge-hops-v1"]??false,"full-map-navigation-v1":features["full-map-navigation-v1"]??false};
}
export const PlayPresetV1Schema=Type.Object({version:Type.Literal(1),...common,flags:PlayFlagsSchema},closed);
// v2 names every switch explicitly; viewer-queued runs use it.
export const PlayPresetV2Schema=Type.Object({version:Type.Literal(2),...common,features:FeatureSetSchema},closed);
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
 return {...ALL_ON,"navigation-evidence-memory-v1":false,"automatic-running-v1":false,"expanded-menu-battle-information-v1":false,"field-dialogue-phase-v1":false,"dialogue-safe-batches-v1":false,"interaction-loop-detection-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"ledge-hops-v1":false,"full-map-navigation-v1":false,"deterministic-loop-guard-v1":loopGuard,"active-ui-ownership-v1":activeUi,"contextual-interface-docs-v1":interfaceDocs,"objective-tracking-v1":objectives,"repeat-attempt-guard-v1":objectives,"native-objective-completion-v1":objectives};
}
// The four legacy flags recorded in run_start evaluation for every preset.
export function presetFlags(preset:PlayPreset):PlayFlags{
 if(preset.version===1)return {...preset.flags};
 const f=preset.features;
 return {loopGuard:f["deterministic-loop-guard-v1"],activeUi:f["active-ui-ownership-v1"],interfaceDocs:f["contextual-interface-docs-v1"],objectives:f["objective-tracking-v1"]};
}
