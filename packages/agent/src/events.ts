import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { ObjectiveSchema, makeAttemptSchema } from "./objective-schema.js";

// v1.1 is additive (state, compaction, press timing), so the envelope stays 1
// and every v1.0 log still validates.
export const SCHEMA_VERSION = 1;
export const RUN_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$";
const EASTERN_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}-0[45]:00$";

export class EventError extends Error {
  override readonly name = "EventError";
}

const NonNegativeInt = Type.Integer({ minimum: 0 });
const Sha1 = Type.String({ pattern: "^[0-9a-f]{40}$" });

export const BUTTONS = ["A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT"] as const;
export const ButtonSchema = Type.Enum(BUTTONS);
export type Button = Static<typeof ButtonSchema>;

export const RUN_END_REASONS = ["completed", "milestone", "budget", "stuck", "crash", "model_error", "operator_abort"] as const;
const RunEndReason = Type.Enum(RUN_END_REASONS);
export type RunEndReason = Static<typeof RunEndReason>;

const StopReason = Type.Enum(["stop", "length", "toolUse", "error", "aborted"] as const);

const Envelope = {
  v: Type.Literal(SCHEMA_VERSION),
  run: Type.String({ pattern: RUN_ID_PATTERN }),
  seq: NonNegativeInt,
  t: Type.String({ pattern: EASTERN_TIMESTAMP_PATTERN }),
  turn: NonNegativeInt,
};

function event<T extends string, P extends Record<string, TSchema>>(type: T, payload: P) {
  return Type.Object({ ...Envelope, type: Type.Literal(type), ...payload }, { additionalProperties: false });
}

const closed = { additionalProperties: false } as const;
const Args = Type.Record(Type.String(), Type.Unknown());

const RunStart = event("run_start", {
  model: Type.Object(
    { id: Type.String({ minLength: 1 }), context_window: NonNegativeInt, max_tokens: NonNegativeInt, vision: Type.Boolean() },
    closed,
  ),
  sampling: Type.Object({ thinking_level: Type.String(), max_tokens: NonNegativeInt }, closed),
  system_prompt: Type.String(),
  tools: Type.Array(Type.String()),
  harness: Type.Object({ commit: Sha1, dirty: Type.Boolean() }, closed),
  vendor_pin: Sha1,
  pi_version: Type.String({ minLength: 1 }),
  start_state: Type.Union([
    Type.Object({ kind: Type.Literal("boot") }, closed),
    Type.Object({ kind: Type.Literal("save_state"), path: Type.String(), sha1: Sha1 }, closed),
  ]),
  harness_features: Type.Array(Type.String()),
  budgets: Type.Object(
    {
      max_turns: Type.Optional(NonNegativeInt),
      max_tokens: Type.Optional(NonNegativeInt),
      max_wall_ms: Type.Optional(NonNegativeInt),
    },
    closed,
  ),
  isolation: Type.Object(
    {
      server_dir: Type.String(),
      run_data_id: Type.String({ pattern: RUN_ID_PATTERN }),
      load_checkpoint_mode: Type.Literal(false),
      port: Type.Integer({ minimum: 1024, maximum: 65535 }),
    },
    closed,
  ),
});

const TurnStart = event("turn_start", {
  context: Type.Object({ messages: NonNegativeInt, images: NonNegativeInt, est_tokens: NonNegativeInt }, closed),
});

const Assistant = event("assistant", {
  thinking: Type.String(),
  text: Type.String(),
  tool_calls: Type.Array(Type.Object({ id: Type.String(), name: Type.String(), args: Args }, closed)),
  usage: Type.Object({ input: NonNegativeInt, output: NonNegativeInt, cache_read: NonNegativeInt }, closed),
  latency_ms: NonNegativeInt,
  ttft_ms: Type.Union([NonNegativeInt, Type.Null()]),
  stop_reason: StopReason,
  error: Type.Optional(Type.String()),
});

// Reply text as it streams, batched by the recorder; the full reply still
// lands in the turn's `assistant` event.
const AssistantDelta = event("assistant_delta", { thinking: Type.String(), text: Type.String() });

const ToolCall = event("tool_call", { id: Type.String(), name: Type.String(), args: Args });

const Frames = Type.Integer({ minimum: 1, maximum: 255 });

const ButtonPress = event("button_press", {
  tool_call_id: Type.String(),
  buttons: Type.Array(ButtonSchema, { minItems: 1 }),
  hold_frames: Type.Optional(Frames),
  release_frames: Type.Optional(Frames),
});

const ToolResult = event("tool_result", {
  id: Type.String(),
  name: Type.String(),
  is_error: Type.Boolean(),
  duration_ms: NonNegativeInt,
  text: Type.String(),
  frames: Type.Array(Type.Object({ path: Type.String({ pattern: "^frames/\\d{6}_\\d+\\.png$" }), sha1: Sha1 }, closed)),
});

const Milestone = event("milestone", {
  name: Type.String({ minLength: 1 }), server_timestamp: Type.Number(),
  kind: Type.Optional(Type.Enum(["story", "navigation", "legacy"])),
  origin: Type.Optional(Type.Enum(["observed", "present_at_start"])),
  evidence: Type.Optional(Type.Array(NonNegativeInt, {minItems:1,maxItems:2})),
});

const Retry = event("retry", { reason: Type.String(), attempt: Type.Integer({ minimum: 1 }), limit: Type.Integer({ minimum: 1 }) });

const DiskUsage = event("disk_usage", {
  bytes: NonNegativeInt,
  cap_bytes: Type.Integer({ minimum: 1 }),
  percent: Type.Enum([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const),
});

const FramesEvicted = event("frames_evicted", {
  from_run: Type.String({ pattern: RUN_ID_PATTERN }),
  files: Type.Integer({ minimum: 1 }),
  bytes: NonNegativeInt,
});

// PokeBench's own RAM reader (env/pokebench_env/game_state.py). Save-block
// fields are null before the game starts: they hold defaults, not the player's state.
export const StateBodySchema = Type.Object(
  {
    screen: Type.String(),
    story: Type.Optional(Type.Union([Type.Object({
      name_confirmed: Type.Union([Type.Boolean(), Type.Null()]),
      intro_stage: Type.Union([Type.Integer({minimum:0,maximum:7}), Type.Null()]),
      rival_stage: Type.Union([Type.Integer({minimum:0,maximum:4}), Type.Null()]),
      birch_lab_stage: Type.Union([Type.Integer({minimum:0,maximum:5}), Type.Null()]),
      petalburg_gym_stage: Type.Union([Type.Integer({minimum:0,maximum:8}), Type.Null()]),
      woods_stage: Type.Union([Type.Integer({minimum:0,maximum:1}), Type.Null()]),
      clock_set: Type.Union([Type.Boolean(), Type.Null()]),
      rival_battle_won: Type.Union([Type.Boolean(), Type.Null()]),
      pokedex_received: Type.Union([Type.Boolean(), Type.Null()]),
      running_shoes_received: Type.Union([Type.Boolean(), Type.Null()]),
      starter_tutorial_complete: Type.Union([Type.Boolean(), Type.Null()]),
      rustboro_gym_complete: Type.Union([Type.Boolean(), Type.Null()]),
      stone_badge: Type.Union([Type.Boolean(), Type.Null()]),
      rock_tomb_received: Type.Union([Type.Boolean(), Type.Null()]),
    }, closed), Type.Null()])),
    naming: Type.Optional(Type.Union([Type.Object({
      text: Type.String(), page: Type.Enum(["symbols", "uppercase", "lowercase"]),
      column: Type.Integer({ minimum: 0, maximum: 8 }), row: Type.Integer({ minimum: 0, maximum: 3 }),
      key: Type.String(), ready: Type.Boolean(),
    }, closed), Type.Null()])),
    world_context: Type.Optional(Type.Union([Type.Object({
      objects: Type.Array(Type.Object({local_id: NonNegativeInt, map_id: Type.Tuple([Type.Integer(), Type.Integer()]), graphics_id: NonNegativeInt, sprite_kind: Type.Union([Type.String(), Type.Null()]), x: Type.Integer(), y: Type.Integer()}, closed)),
      triggers: Type.Array(Type.Object({x: Type.Integer(), y: Type.Integer(), elevation: NonNegativeInt, variable: NonNegativeInt, required_value: NonNegativeInt, current_value: Type.Union([NonNegativeInt, Type.Null()]), condition_met: Type.Union([Type.Boolean(), Type.Null()]), script_pointer: NonNegativeInt}, closed)),
      dialogue: Type.Union([Type.String(), Type.Null()]),
    }, closed), Type.Null()])),
    interaction_targets: Type.Optional(Type.Union([Type.Array(Type.Object({
      kind: Type.String(), x: Type.Integer(), y: Type.Integer(), elevation: Type.Integer(),
      activation: Type.String(), availability: Type.String(), facing: Type.Union([Type.String(), Type.Null()]),
      local_id: Type.Union([Type.Integer(), Type.Null()]),
      destination: Type.Union([Type.Tuple([Type.Integer(), Type.Integer(), Type.Integer()]), Type.Null()]),
    }, closed)), Type.Null()])),
    local_map: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    field_controls_locked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    started: Type.Boolean(),
    name: Type.Union([Type.String(), Type.Null()]),
    location: Type.Union([Type.String(), Type.Null()]),
    map_id: Type.Union([Type.Tuple([Type.Integer(), Type.Integer()]), Type.Null()]),
    position: Type.Union([Type.Object({ x: Type.Integer(), y: Type.Integer() }, closed), Type.Null()]),
    facing: Type.Union([Type.String(), Type.Null()]),
    in_battle: Type.Boolean(),
    party: Type.Array(
      Type.Object(
        { species: Type.String(), level: NonNegativeInt, hp: NonNegativeInt, max_hp: NonNegativeInt },
        closed,
      ),
    ),
    money: Type.Union([NonNegativeInt, Type.Null()]),
    badges: Type.Array(Type.String()),
    play_time_s: Type.Union([NonNegativeInt, Type.Null()]),
  },
  closed,
);

const State = event("state", StateBodySchema.properties);

// Read-only historical compatibility: old vendor-derived state stays identifiable
// by its mode field and is never promoted to the authoritative RAM readout.
const LegacyState = event("state", {
  location: Type.String(),
  position: StateBodySchema.properties.position,
  facing: StateBodySchema.properties.facing,
  mode: Type.String(),
  in_battle: Type.Boolean(),
  party: StateBodySchema.properties.party,
  money: NonNegativeInt,
  badges: StateBodySchema.properties.badges,
  play_time_s: NonNegativeInt,
});

const Compaction = event("compaction", { from_tokens: NonNegativeInt, to_tokens: NonNegativeInt });

// A post-press read that failed after the press landed (operator 2026-10-12:
// the press still succeeds; the failure is logged, not shown to the model).
const TelemetryError = event("telemetry_error", {
  source: Type.Enum(["milestones", "state"] as const),
  message: Type.String(),
});

const RunEnd = event("run_end", {
  reason: RunEndReason,
  furthest_milestone: Type.Union([Type.String(), Type.Null()]),
  turns: NonNegativeInt,
  wall_ms: NonNegativeInt,
  tokens: Type.Object({ input: NonNegativeInt, output: NonNegativeInt }, closed),
  frames: Type.Object({ saved: NonNegativeInt, bytes: NonNegativeInt }, closed),
});

const ObjectiveUpdate = event("objective_update", { objective: ObjectiveSchema });
const ObjectiveAttempt = event("objective_attempt", { attempt: makeAttemptSchema(ButtonSchema) });

export const RunEventSchema = Type.Union([
  ObjectiveUpdate,
  ObjectiveAttempt,
  RunStart,
  TurnStart,
  Assistant,
  ToolCall,
  ButtonPress,
  ToolResult,
  Milestone,
  Retry,
  DiskUsage,
  FramesEvicted,
  RunEnd,
  State,
  LegacyState,
  Compaction,
  TelemetryError,
  AssistantDelta,
]);

export type RunEvent = Static<typeof RunEventSchema>;
type EnvelopeKey = "v" | "run" | "seq" | "t";
export type EventBody = RunEvent extends infer E ? (E extends RunEvent ? Omit<E, EnvelopeKey> : never) : never;
export type BodyOf<T extends RunEvent["type"]> = Omit<Extract<RunEvent, { type: T }>, EnvelopeKey>;

export function eventProblem(value: unknown): string | null {
  if (Value.Check(RunEventSchema, value)) return null;
  const [first] = Value.Errors(RunEventSchema, value);
  return `invalid event at ${first?.instancePath ?? ""}: ${first?.message ?? "does not match the schema"}`;
}

export function checkEvent(value: unknown): RunEvent {
  const problem = eventProblem(value);
  if (problem !== null) throw new EventError(problem);
  return value as RunEvent;
}

export function parseEvent(line: string): RunEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new EventError(`event line is not JSON: ${String(error)}`, { cause: error });
  }
  return checkEvent(value);
}

export function eventsJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://pokebench.example/schemas/events.v1.json",
    title: "PokeBench run event (v1.1)",
    description: "One line of runs/<id>/events.jsonl. Generated from packages/agent/src/events.ts; do not edit.",
    ...(JSON.parse(JSON.stringify(RunEventSchema)) as Record<string, unknown>),
  };
}

export function renderEventsJsonSchema(): string {
  return `${JSON.stringify(eventsJsonSchema(), null, 2)}\n`;
}
