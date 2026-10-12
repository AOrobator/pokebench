import { Type, type Static } from "typebox";
import type { ButtonSchema } from "./events.js";
const closed = { additionalProperties: false } as const;
const text = Type.String({ maxLength: 2000 });
export const EvidenceSchema = Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, maxItems: 16, uniqueItems: true });
export const CompletionSchema = Type.Union([
  Type.Object({ kind: Type.Literal("state"), field: Type.Enum(["screen", "started", "name", "location", "money", "in_battle", "party_count", "badge"]), value: Type.Union([text, Type.Number(), Type.Boolean()]) }, closed),
  Type.Object({ kind: Type.Literal("visual"), description: Type.String({ minLength: 1, maxLength: 2000 }) }, closed),
]);
export const ObjectiveStatusSchema = Type.Enum(["active", "blocked", "completed", "reported_complete"]);
export const ObjectiveSchema = Type.Object({
  id: Type.String(), revision: Type.Integer({ minimum: 1 }), goal: text, title: Type.String({ minLength: 1, maxLength: 2000 }),
  supports_goal: Type.String({ minLength: 1, maxLength: 2000 }), evidence: EvidenceSchema, completion: CompletionSchema,
  obstacle: text, next_decision: Type.String({ minLength: 1, maxLength: 2000 }), status: ObjectiveStatusSchema,
  completion_evidence: Type.Array(Type.Integer({ minimum: 0 }), { maxItems: 16 }),
}, closed);
export function makeAttemptSchema(buttonSchema: typeof ButtonSchema) { return Type.Object({
  id: Type.String(), objective_id: Type.String(), buttons: Type.Array(buttonSchema, { minItems: 1, maxItems: 8 }),
  before_seq: Type.Integer({ minimum: 0 }), after_seq: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  outcome: Type.Enum(["moved", "turned", "progress", "no_change", "unavailable"]),
  failure_count: Type.Integer({ minimum: 0 }), warning: Type.Union([Type.String(), Type.Null()]),
  retry_justification: Type.Union([Type.String(), Type.Null()]),
}, closed);
}
export type ObjectiveRecord = Static<typeof ObjectiveSchema>;
export type ObjectiveAttempt = Static<ReturnType<typeof makeAttemptSchema>>;
export type Completion = Static<typeof CompletionSchema>;
