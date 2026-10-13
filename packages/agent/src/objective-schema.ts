import { Type, type Static } from "typebox";
import type { ButtonSchema } from "./events.js";
const closed = { additionalProperties: false } as const;
const text = Type.String({ maxLength: 2000 });
export const EvidenceSchema = Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, maxItems: 16, uniqueItems: true });
export const NATIVE_OBJECTIVES = {
 NEW_GAME_CREATED: "Create a new game", PLAYER_NAME_CONFIRMED: "Confirm the player name", FIRST_TRUCK_EXIT: "Exit the opening truck",
 MOM_CLOCK_INSTRUCTION: "Receive Mom's clock instruction", CLOCK_SET: "Set the clock", MOM_RIVAL_INSTRUCTION: "Receive Mom's rival instruction", RIVAL_MET: "Meet the rival",
 STARTER_CHOSEN: "Receive a starter", BIRCH_RESCUE_COMPLETE: "Rescue Birch", BIRCH_STARTER_HANDOFF_COMPLETE: "Complete Birch's starter handoff", RIVAL_BATTLE_WON: "Win the first rival battle",
 RECEIVED_POKEDEX: "Receive the Pokedex", STARTER_TUTORIAL_COMPLETE: "Complete the starter tutorial", RUNNING_SHOES_RECEIVED: "Receive running shoes", DAD_FIRST_MEETING: "Meet Dad", WALLY_TUTORIAL_COMPLETE: "Complete Wally's tutorial", TEAM_AQUA_WOODS_EVENT_COMPLETE: "Complete the woods encounter",
 RUSTBORO_GYM_COMPLETE: "Defeat the Rustboro Gym", STONE_BADGE: "Receive the Stone Badge", ROCK_TOMB_RECEIVED: "Receive Rock Tomb",
 LITTLEROOT_TOWN: "Reach Littleroot Town", PLAYER_HOUSE_ENTERED: "Enter the player's house", PLAYER_BEDROOM: "Reach the player's bedroom", ROUTE_101: "Reach Route 101", OLDALE_TOWN: "Reach Oldale Town", ROUTE_103: "Reach Route 103", ROUTE_102: "Reach Route 102", PETALBURG_CITY: "Reach Petalburg City", ROUTE_104: "Reach Route 104", PETALBURG_WOODS: "Reach Petalburg Woods", RUSTBORO_CITY: "Reach Rustboro City", RUSTBORO_CITY_GYM: "Enter the Rustboro Gym",
} as const;
export const NativeCompletionSchema = Type.Object({ kind: Type.Literal("milestone"), name: Type.Enum(Object.keys(NATIVE_OBJECTIVES) as (keyof typeof NATIVE_OBJECTIVES)[]) }, closed);
export const CompletionSchema = Type.Union([
  NativeCompletionSchema,
  Type.Object({ kind: Type.Literal("state"), field: Type.Enum(["screen", "started", "name", "location", "money", "in_battle", "party_count", "badge"]), value: Type.Union([text, Type.Number(), Type.Boolean()]) }, closed),
  Type.Object({ kind: Type.Literal("visual"), description: Type.String({ minLength: 1, maxLength: 2000 }) }, closed),
]);
const stringFields = ["screen", "name", "location", "badge"] as const;
const booleanFields = ["started", "in_battle"] as const;
const numberFields = ["money", "party_count"] as const;
export const CompletionInputSchema = Type.Union([
  Type.Object({ kind: Type.Literal("state"), field: Type.Enum(stringFields), value: text }, closed),
  Type.Object({ kind: Type.Literal("state"), field: Type.Enum(booleanFields), value: Type.Boolean() }, closed),
  Type.Object({ kind: Type.Literal("state"), field: Type.Enum(numberFields), value: Type.Number() }, closed),
  CompletionSchema.anyOf[2],
  NativeCompletionSchema,
]);
export function validateCompletionType(completion: Completion): void {
  if (completion.kind !== "state") return;
  const expected = stringFields.some((field) => field === completion.field) ? "string" : booleanFields.some((field) => field === completion.field) ? "boolean" : "number";
  if (typeof completion.value !== expected) throw new Error(`Completion field "${completion.field}" requires ${expected}; received ${JSON.stringify(completion.value)} (${typeof completion.value}). Revise set_objective with a ${expected} value; values are not coerced.`);
}
export const ObjectiveStatusSchema = Type.Enum(["active", "blocked", "completed", "reported_complete"]);
export const ObjectiveSchema = Type.Object({
  id: Type.String(), revision: Type.Integer({ minimum: 1 }), goal: text, title: Type.String({ minLength: 1, maxLength: 2000 }),
  supports_goal: Type.String({ minLength: 1, maxLength: 2000 }), evidence: EvidenceSchema, completion: CompletionSchema,
  obstacle: text, next_decision: Type.String({ minLength: 1, maxLength: 2000 }), status: ObjectiveStatusSchema,
  verification: Type.Optional(Type.Object({ origin: Type.Enum(["observed", "present_at_start"]), milestone_seq: Type.Integer({ minimum: 0 }), state_evidence: Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, maxItems: 2 }) }, closed)),
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
