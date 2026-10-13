import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {MILESTONES} from "./milestones.js";
const closed={additionalProperties:false} as const;
const positive=Type.Integer({minimum:1});
export const PlayFlagsSchema=Type.Object({loopGuard:Type.Boolean(),activeUi:Type.Boolean(),interfaceDocs:Type.Boolean(),objectives:Type.Boolean()},closed);
export const PlayPresetSchema=Type.Object({version:Type.Literal(1),id:Type.String({minLength:1,maxLength:100}),target:Type.Union([Type.String({minLength:1}),Type.Null()]),limits:Type.Object({maxTurns:positive,maxWallMs:positive,failureLimit:positive},closed),sampling:Type.Object({thinkingLevel:Type.Enum(["off","minimal","low","medium","high","xhigh"] as const),maxTokens:positive},closed),flags:PlayFlagsSchema},closed);
export type PlayPreset=Static<typeof PlayPresetSchema>;
export function parsePlayPreset(value:unknown):PlayPreset{
 if(!Value.Check(PlayPresetSchema,value)){const [first]=Value.Errors(PlayPresetSchema,value);throw new Error(`Invalid play preset: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);}
 if(value.target!==null&&!MILESTONES.some(item=>item.name===value.target&&item.kind!=="legacy"))throw new Error(`Invalid play preset: target ${value.target} is not a native milestone`);
 return value;
}
