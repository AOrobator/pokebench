import {Type,type Static} from "typebox";
const closed={additionalProperties:false};
const text=Type.String({minLength:1,maxLength:1000});
const refs=Type.Array(Type.Integer({minimum:0}),{minItems:1,maxItems:16,uniqueItems:true});
export const GoalSourceSchema=Type.Object({episode:Type.Integer({minimum:0}),page:Type.Integer({minimum:0})},closed);
export const InstructionGoalSchema=Type.Object({
 id:Type.String({minLength:1,maxLength:80,pattern:"^[a-zA-Z0-9_-]+$"}),title:text,
 sources:Type.Array(GoalSourceSchema,{minItems:1,maxItems:8}),parent:Type.Union([Type.String({minLength:1,maxLength:80}),Type.Null()]),
 status:Type.Enum(["open","active","deferred","blocked","reported_complete","superseded","abandoned"]),reason:text,completion:text,
 evidence:Type.Optional(refs),superseded_by:Type.Optional(Type.String({minLength:1,maxLength:80})),
},closed);
export const GoalReviewSchema=Type.Object({
 reviewed:Type.Array(Type.Object({episode:Type.Integer({minimum:0}),interpretation:text},closed),{maxItems:16}),
 updates:Type.Array(InstructionGoalSchema,{maxItems:16}),
},closed);
export const GoalArchiveArgs=Type.Object({episode:Type.Optional(Type.Integer({minimum:0})),goal:Type.Optional(Type.String({minLength:1,maxLength:80}))},closed);
export type InstructionGoal=Static<typeof InstructionGoalSchema>;
export type GoalReview=Static<typeof GoalReviewSchema>;
