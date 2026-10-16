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
export const HUMAN_BUTTONS = [...BUTTONS, "L", "R"] as const;
export const HumanButtonSchema = Type.Enum(HUMAN_BUTTONS);
export type HumanButton = Static<typeof HumanButtonSchema>;

export const RUN_END_REASONS = ["completed", "milestone", "budget", "stuck", "crash", "model_error", "operator_abort", "operator_stop", "stalled"] as const;
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

const Evaluation = Type.Object({preset_id:Type.String({minLength:1}),target:Type.Union([Type.String({minLength:1}),Type.Null()]),failure_limit:Type.Integer({minimum:1}),reply_failures_end_run:Type.Optional(Type.Boolean()),flags:Type.Object({loopGuard:Type.Boolean(),activeUi:Type.Boolean(),interfaceDocs:Type.Boolean(),objectives:Type.Boolean()},closed),features:Type.Optional(Type.Record(Type.String({pattern:"^[a-z0-9-]+$"}),Type.Boolean())),experiment:Type.Optional(Type.Object({id:Type.String({minLength:1,maxLength:100}),arm:Type.String({minLength:1,maxLength:60}),trial:Type.Integer({minimum:1}),of:Type.Integer({minimum:1})},closed))},closed);
const TargetProof = Type.Object({name:Type.String({minLength:1}),milestone_seq:NonNegativeInt,state_evidence:Type.Array(NonNegativeInt,{minItems:1,maxItems:3})},closed);
const RunStart = event("run_start", {
  rom_sha1: Type.Optional(Sha1),
  controller: Type.Optional(Type.Object({ kind: Type.Literal("human"), name: Type.String({minLength:1}), rom_sha1: Sha1, input_policy: Type.Literal("frame-held-v1"), sample_ms: Type.Literal(100), screenshot_ms: Type.Optional(Type.Literal(500)), nominal_fps: Type.Literal(59.7275) }, closed)),
  evaluation:Type.Optional(Evaluation),
  model: Type.Object(
    { id: Type.String({ minLength: 1 }), context_window: NonNegativeInt, max_tokens: NonNegativeInt, vision: Type.Boolean() },
    closed,
  ),
  sampling: Type.Object({ thinking_level: Type.String(), max_tokens: NonNegativeInt, presence_penalty: Type.Optional(Type.Number()) }, closed),
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
  tool_calls: Type.Array(Type.Union([Type.Object({id:Type.String(),name:Type.Literal("act"),args:Type.Unknown()},closed),Type.Object({ id: Type.String(), name: Type.String(), args: Args }, closed)])),
  usage: Type.Object({ input: NonNegativeInt, output: NonNegativeInt, cache_read: NonNegativeInt }, closed),
  latency_ms: NonNegativeInt,
  ttft_ms: Type.Union([NonNegativeInt, Type.Null()]),
  stop_reason: StopReason,
  error: Type.Optional(Type.String()),
});

// Reply text as it streams, batched by the recorder; the full reply still
// lands in the turn's `assistant` event.
const AssistantDelta = event("assistant_delta", { thinking: Type.String(), text: Type.String() });

const ToolCall = Type.Union([event("tool_call",{id:Type.String(),name:Type.Literal("act"),args:Type.Unknown()}),event("tool_call", { id: Type.String(), name: Type.String(), args: Args })]);

const DecisionInput = event("decision_input",{decision_turn:Type.Integer({minimum:1}),state_seq:NonNegativeInt,text:Type.String(),frames:Type.Array(Type.Object({path:Type.String(),sha1:Sha1},closed),{minItems:1,maxItems:1})});
const WaitInput = event("wait_input",{tool_call_id:Type.String(),duration_ms:Type.Integer({minimum:1,maximum:2000})});

const Frames = Type.Integer({ minimum: 1, maximum: 255 });

const ButtonPress = event("button_press", {
  tool_call_id: Type.String(),
  before_state_seq: Type.Optional(NonNegativeInt),
  automatic_running:Type.Optional(Type.Boolean()),
  walking:Type.Optional(Type.Boolean()),
  requested_held_buttons:Type.Optional(Type.Array(ButtonSchema,{maxItems:1})),
  buttons: Type.Array(ButtonSchema, { minItems: 1 }),
  hold_frames: Type.Optional(Frames),
  release_frames: Type.Optional(Frames),
});

const HumanInput = event("human_input", {
  id: Type.Integer({minimum:1}), start_frame: NonNegativeInt, end_frame: NonNegativeInt,
  buttons: Type.Array(HumanButtonSchema, {uniqueItems:true}), start_ms: NonNegativeInt, end_ms: NonNegativeInt,
  request_seq: NonNegativeInt, session: Type.String({minLength:1}),
});
const HumanSample = event("human_sample", {
  frame: NonNegativeInt, paused: Type.Boolean(),
  screenshot: Type.Object({path: Type.String({pattern:"^frames/\\d{6}_\\d+\\.png$"}), sha1: Sha1}, closed),
});

const NavigationContext = event("navigation_context", {text:Type.String(),evidence:Type.Array(NonNegativeInt,{maxItems:36,uniqueItems:true})});
const MilestoneHintContext = event("milestone_hint", {text:Type.String({maxLength:1000}),milestone:Type.String({minLength:1})});
const LedgerContext = event("ledger_context", {text:Type.String(),evidence:Type.Array(NonNegativeInt,{maxItems:64,uniqueItems:true})});
// disproved-beliefs-v1: the ledger delivered before a model call, whole, with its entry count and cited events.
const BeliefLedger = event("belief_ledger", {text:Type.String({minLength:1}),entries:Type.Integer({minimum:1}),evidence:Type.Array(NonNegativeInt,{uniqueItems:true})});

const ToolResult = event("tool_result", {
  state_seq: Type.Optional(NonNegativeInt),
  id: Type.String(),
  name: Type.String(),
  is_error: Type.Boolean(),
  duration_ms: NonNegativeInt,
  text: Type.String(),
  frames: Type.Array(Type.Object({ path: Type.String({ pattern: "^frames/\\d{6}_\\d+\\.png$" }), sha1: Sha1 }, closed)),
});

const Milestone = event("milestone", {
  emulator_frame: Type.Optional(NonNegativeInt),
  emulator_frame_kind: Type.Optional(Type.Literal("sample_upper_bound")),
  name: Type.String({ minLength: 1 }), server_timestamp: Type.Number(),
  kind: Type.Optional(Type.Enum(["story", "navigation", "legacy"])),
  origin: Type.Optional(Type.Enum(["observed", "present_at_start"])),
  evidence: Type.Optional(Type.Array(NonNegativeInt, {minItems:1,maxItems:3})),
});

export const BattleBattlerSchema = Type.Object({
  battler: Type.Integer({minimum:0,maximum:3}), position:Type.Integer({minimum:0,maximum:3}),
  party_slot:Type.Integer({minimum:0,maximum:5}), species_id:Type.Integer({minimum:1,maximum:411}),
  species:Type.String({minLength:1}), identity:Type.String({pattern:"^[0-9a-f]{8}:[0-9a-f]{8}$"}),
  level:Type.Integer({minimum:1,maximum:100}),hp:NonNegativeInt,max_hp:Type.Integer({minimum:1}),
},closed);
export const BattleChoiceFields = {
  id:Type.Integer({minimum:1}),frame:NonNegativeInt,recorded_ms:NonNegativeInt,
  battle:Type.Integer({minimum:1}),battle_turn:Type.Integer({minimum:1,maximum:256}),
  action:Type.Enum(["move","item","switch","run","other","safari_watch_carefully","safari_ball","safari_pokeblock","safari_go_near","safari_run"] as const), action_id:Type.Integer({minimum:0,maximum:255}),
  origin:Type.Enum(["selected","automatic","scripted","remote"] as const), actor:Type.Union([BattleBattlerSchema,Type.Object({kind:Type.Literal("trainer"),battler:Type.Integer({minimum:0,maximum:3}),position:Type.Integer({minimum:0,maximum:3})},closed)]),
  safari_pokeblock:Type.Optional(Type.Union([Type.Object({preference_code:Type.Integer({minimum:1,maximum:3}),color:Type.Integer({minimum:0,maximum:14})},closed),Type.Null()])),
  move:Type.Union([Type.Null(),Type.Object({id:Type.Integer({minimum:1,maximum:354}),name:Type.String({minLength:1}),slot:Type.Integer({minimum:0,maximum:3}),pp:Type.Integer({minimum:0,maximum:255})},closed)]),
  target:Type.Union([Type.Null(),BattleBattlerSchema]),item_id:Type.Union([Type.Null(),Type.Integer({minimum:1,maximum:376})]),
  switch_party_slot:Type.Union([Type.Null(),Type.Integer({minimum:0,maximum:5})]),
  source:Type.Object({main_func:Type.Literal(0x0803D2E9),communication:Type.Array(Type.Literal(5),{minItems:2,maxItems:4}),battle_type:NonNegativeInt},closed),
};
export const BattleChoiceSchema = Type.Object(BattleChoiceFields,closed);
export const BattleJournalSchema = Type.Object({frame:NonNegativeInt,last_id:NonNegativeInt,entries:Type.Array(BattleChoiceSchema,{maxItems:4096})},closed);
const BattleChoice = event("battle_choice", BattleChoiceFields);

const Activity = event("activity", {
  kind: Type.Enum(["capture", "heal", "evolution", "level_up", "save_attempt", "blackout"] as const),
  count: Type.Integer({minimum:1}), server_timestamp: Type.Number(),
  evidence: Type.Array(NonNegativeInt,{minItems:2,maxItems:2}),
  emulator_frame: Type.Optional(NonNegativeInt),
  emulator_frame_kind: Type.Optional(Type.Literal("sample_upper_bound")),
  pokemon: Type.Optional(Type.Object({identity:Type.String(),species:Type.String(),from_level:NonNegativeInt,to_level:NonNegativeInt},closed)),
});

const LoopFields = {
  kind: Type.Enum(["planning", "observation", "ineffective", "cycle", "rejection", "map_cycle", "milestone_drought", "interface_dwell", "same_plan"] as const),
  message: Type.String(), calls: NonNegativeInt,
  evidence: Type.Array(NonNegativeInt, {minItems:1,maxItems:2}),
};
const LoopGuard = Type.Union([
  event("loop_guard", {...LoopFields, phase:Type.Enum(["warning","recovered","stop"] as const)}),
  event("loop_guard", {...LoopFields, mode:Type.Literal("enforced"), phase:Type.Enum(["warning","recovered","stop","supervisor"] as const)}),
  event("loop_guard", {...LoopFields, mode:Type.Literal("diagnostic"), phase:Type.Enum(["would_warn","would_recover","would_stop"] as const)}),
]);

const Retry = event("retry", { reason: Type.String(), attempt: Type.Integer({ minimum: 1 }), limit: Type.Integer({ minimum: 1 }) });
// text-only-supervisor-v1: the note sent to the model instead of ending the run at the failure limit.
const TextOnlySupervisor = event("text_only_supervisor", { replies: Type.Integer({ minimum: 1 }), note: Type.Integer({ minimum: 1 }), limit: Type.Integer({ minimum: 1 }), text: Type.String({ minLength: 1 }) });

// low-hp-trainer-warning-v1: the SUPERVISOR paragraph a game-tool result gained, with the state facts it states.
const LowHpTrainerWarning = event("low_hp_trainer_warning", {
  tool: Type.String({ minLength: 1 }), species: Type.String({ minLength: 1 }), hp: Type.Integer({ minimum: 1 }), max_hp: Type.Integer({ minimum: 2 }),
  rival: Type.Enum(["MAY", "BRENDAN"]), x: Type.Integer(), y: Type.Integer(), map_id: Type.Tuple([Type.Integer(), Type.Integer()]),
  money: Type.Union([NonNegativeInt, Type.Null()]),
  items: Type.Array(Type.Object({ name: Type.String({ minLength: 1 }), quantity: Type.Integer({ minimum: 1 }) }, closed), { maxItems: 186 }),
  text: Type.String({ minLength: 1 }),
});

// dialogue-auto-advance-v1: the harness advanced field dialogue to the next decision point within one tool call.
// battle-text-auto-advance-v1 adds the battle_* stops and paused; its pages carry battle_turn and battle_message_id.
export const DIALOGUE_AUTO_ADVANCE_STOPS = ["field_free", "menu", "naming", "battle", "screen_change", "locked_no_message", "interface_not_ready", "message_not_ready", "press_cap", "time_cap", "error", "battle_input", "battle_prompt", "battle_busy", "battle_unreadable", "paused"] as const;
const DialoguePageSchema = Type.Object({
  state_seq: Type.Union([NonNegativeInt, Type.Null()]),
  map: Type.Union([Type.String(), Type.Null()]),
  map_display: Type.Optional(Type.String({ minLength: 1 })),
  map_id: Type.Union([Type.Tuple([Type.Integer(), Type.Integer()]), Type.Null()]),
  position: Type.Union([Type.Object({ x: Type.Integer(), y: Type.Integer() }, closed), Type.Null()]),
  speaker: Type.Union([Type.String(), Type.Null()]),
  speaker_source: Type.Union([Type.Enum(["name_prefix", "faced_sprite", "faced_target"] as const), Type.Null()]),
  text: Type.String({ minLength: 1 }),
  battle_turn: Type.Optional(Type.Integer({ minimum: 1, maximum: 256 })),
  battle_message_id: Type.Optional(Type.Integer({ minimum: 1 })),
  // script-line-presence-v1 ON only, on a page with no speaker: the live objects on screen at state_seq
  // (null when that state did not say), with the story character character-presence-v1 names, if any.
  on_screen: Type.Optional(Type.Union([Type.Array(Type.Object({
    local_id: NonNegativeInt, graphics_id: NonNegativeInt, sprite_kind: Type.Union([Type.String(), Type.Null()]),
    x: Type.Integer(), y: Type.Integer(), character: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  }, closed), { maxItems: 16 }), Type.Null()])),
}, closed);
const DialogueAutoAdvance = event("dialogue_auto_advance", {
  tool_call_id: Type.String(),
  tool: Type.Enum(["press", "navigate_to"] as const),
  requested: Type.Array(ButtonSchema),
  sent: Type.Array(ButtonSchema),
  dropped: Type.Array(ButtonSchema),
  auto_presses: NonNegativeInt,
  battle_auto_presses: Type.Optional(NonNegativeInt),
  pages: Type.Array(DialoguePageSchema),
  stop: Type.Enum(DIALOGUE_AUTO_ADVANCE_STOPS),
  detail: Type.String(),
  duration_ms: NonNegativeInt,
});

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
const MenuScalar = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]);
export const NativeDetailsSchema = Type.Record(Type.String(), Type.Union([MenuScalar, Type.Array(MenuScalar, {maxItems:512})]));
export const PokemonSchema = Type.Object({
  identity:Type.Optional(Type.Union([Type.String(),Type.Null()])),
  language:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),nickname:Type.Optional(Type.Union([Type.String(),Type.Null()])),nickname_diagnostic:Type.Optional(Type.Union([Type.String(),Type.Null()])),
  species:Type.Union([Type.String(),Type.Null()]),level:Type.Union([Type.Integer({minimum:0,maximum:100}),Type.Null()]),
  hp:Type.Union([NonNegativeInt,Type.Null()]),max_hp:Type.Union([NonNegativeInt,Type.Null()]),
  species_id:Type.Optional(Type.Union([Type.Integer({minimum:1,maximum:411}),Type.Null()])),
  personality:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),ot_id:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),
  is_egg:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),status:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),
  held_item:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),held_item_name:Type.Optional(Type.Union([Type.String(),Type.Null()])),experience:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),
  moves:Type.Optional(Type.Union([Type.Array(Type.Object({move_id:NonNegativeInt,name:Type.Optional(Type.Union([Type.String(),Type.Null()])),pp:NonNegativeInt,max_pp:Type.Optional(Type.Union([NonNegativeInt,Type.Null()])),pp_bonus:Type.Integer({minimum:0,maximum:3})},closed),{maxItems:4}),Type.Null()])),
  decode_mode:Type.Optional(Type.Union([Type.Enum(["encrypted","plaintext"]),Type.Null()])),
  cpu_context:Type.Optional(Type.Union([Type.Object({gprs:Type.Array(NonNegativeInt,{minItems:16,maxItems:16}),cpsr:NonNegativeInt,stack_address:NonNegativeInt,stack_hex:Type.String({maxLength:256})},closed),Type.Null()])),
  diagnostic:Type.Optional(Type.Union([Type.String(),Type.Null()])),raw_hex:Type.Optional(Type.Union([Type.String({maxLength:200}),Type.Null()])),
},closed);
const NullableInt=Type.Union([NonNegativeInt,Type.Null()]);
const NullableString=Type.Union([Type.String(),Type.Null()]);
const BattleMoveSchema=Type.Object({slot:Type.Integer({minimum:0,maximum:3}),move_id:Type.Integer({minimum:0,maximum:354}),name:NullableString,pp:NonNegativeInt,max_pp:NonNegativeInt,move_type:NullableInt,power:NullableInt,accuracy:NullableInt,effect:NullableInt},closed);
const ContinuousBattleBattlerSchema=Type.Object({battler:Type.Integer({minimum:0,maximum:3}),position:Type.Integer({minimum:0,maximum:3}),party_slot:Type.Integer({minimum:0,maximum:5}),identity:Type.String(),species_id:Type.Integer({minimum:1,maximum:411}),species:Type.String(),level:Type.Integer({minimum:1,maximum:100}),hp:NonNegativeInt,max_hp:NonNegativeInt,status1:NonNegativeInt,status2:NonNegativeInt,status3:NonNegativeInt,stat_stages:Type.Array(Type.Integer({minimum:0,maximum:12}),{minItems:8,maxItems:8}),stats:Type.Array(NonNegativeInt,{minItems:5,maxItems:5}),types:Type.Array(Type.Integer({minimum:0,maximum:17}),{minItems:2,maxItems:2}),ability:NonNegativeInt,held_item:NonNegativeInt,moves:Type.Array(BattleMoveSchema,{minItems:4,maxItems:4}),absent:Type.Boolean()},closed);
const BattleInputSchema=Type.Object({battler:Type.Integer({minimum:0,maximum:3}),controller:NonNegativeInt,phase:Type.String(),ready:Type.Boolean(),action_cursor:NullableInt,move_cursor:NullableInt,target_cursor:NullableInt,selected:NullableString,selected_move_id:NullableInt,displayed_pp:NullableInt,displayed_max_pp:NullableInt,communication:NullableInt},closed);
const BattleSignalSchema=Type.Object({kind:Type.String(),battler:Type.Integer({minimum:0,maximum:3}),command:NonNegativeInt,request:NullableInt,party_mask:NullableInt,string_id:NullableInt,move_id:NullableInt,originally_used_move:NullableInt,hp:NullableInt,status:NullableInt,raw_hex:NullableString},closed);
const BattleExecutionSchema=Type.Object({attacker:Type.Integer({minimum:0,maximum:3}),target:Type.Integer({minimum:0,maximum:3}),move_id:NonNegativeInt,phase:Type.String(),script_pc:NonNegativeInt,move_result_flags:NonNegativeInt,hit_marker:NonNegativeInt,damage:Type.Integer(),hp_dealt:Type.Integer(),current_action:NonNegativeInt,turn_action:NonNegativeInt},closed);
// battle-text-auto-advance-v1 reads these; always recorded (env/pokebench_env/battle_text.py).
export const BattleMessageSchema=Type.Object({state:Type.Enum(["printing","waiting_for_input","idle"] as const),render_state:NullableString,text:NullableString,cursor:Type.Union([NonNegativeInt,Type.Null()]),identity:NullableString,diagnostic:NullableString,page:Type.Optional(NullableString)},closed);
export const BattlePromptSchema=Type.Object({kind:Type.Enum(["learn_move","stop_learning_move","yes_no","nickname_caught"] as const),ready:Type.Boolean(),selected:Type.Union([Type.Enum(["YES","NO"] as const),Type.Null()])},closed);
// levelup-box-v1 reads this; always recorded (env/pokebench_env/battle_text.py read_levelup_box).
export const LevelUpBoxSchema=Type.Object({state:Type.Integer({minimum:0,maximum:255}),page:Type.Union([Type.Literal(1),Type.Literal(2),Type.Null()]),waiting:Type.Boolean(),party_slot:Type.Union([Type.Integer({minimum:0,maximum:5}),Type.Null()]),labels:Type.Array(Type.String(),{maxItems:6}),before:Type.Array(NonNegativeInt,{maxItems:6}),after:Type.Array(NonNegativeInt,{maxItems:6}),text:NullableString,diagnostic:NullableString},closed);
export const BATTLE_TEXT_PHASES=["message_waiting","input","prompt","busy","screen"] as const;
export const BattleStateSchema=Type.Object({message:Type.Optional(Type.Union([BattleMessageSchema,Type.Null()])),prompt:Type.Optional(Type.Union([BattlePromptSchema,Type.Null()])),text_phase:Type.Optional(Type.Union([Type.Enum(BATTLE_TEXT_PHASES),Type.Null()])),levelup_box:Type.Optional(Type.Union([LevelUpBoxSchema,Type.Null()])),playback:Type.Optional(Type.Union([Type.Object({stoppable:Type.Boolean(),finished:Type.Boolean(),controls:Type.String()},closed),Type.Null()])),non_pokemon_battlers:Type.Optional(Type.Array(Type.Integer({minimum:0,maximum:3}),{maxItems:4})),active:Type.Boolean(),initialized:Type.Boolean(),phase:Type.String(),ready:Type.Union([Type.Boolean(),Type.Null()]),main_func:NullableInt,script_pc:NullableInt,battle_type:NullableInt,turn:NullableInt,outcome_code:NullableInt,outcome:NullableString,battlers:Type.Union([Type.Array(ContinuousBattleBattlerSchema,{maxItems:4}),Type.Null()]),player_inputs:Type.Union([Type.Array(BattleInputSchema,{maxItems:4}),Type.Null()]),controller_exec_flags:NullableInt,signals:Type.Array(BattleSignalSchema,{maxItems:4}),current_execution:Type.Union([BattleExecutionSchema,Type.Null()]),diagnostic:NullableString,raw_hex:NullableString},closed);
const NullableBool=Type.Union([Type.Boolean(),Type.Null()]);
export const RunningPermissionSchema=Type.Object({permitted:NullableBool,controllable:NullableBool,reason:Type.String(),shoes:NullableBool,allow_running:NullableBool,avatar_flags:NullableInt,metatile:NullableInt,elevation:NullableInt,map_type:NullableInt,callback1:NullableInt,callback2:NullableInt,diagnostic:NullableString,raw_hex:NullableString},closed);
const ResourceItemSchema=Type.Object({slot:NonNegativeInt,item_id:NonNegativeInt,quantity:NonNegativeInt,pocket:Type.Union([Type.String(),Type.Null()]),name:Type.Optional(Type.Union([Type.String(),Type.Null()]))},closed);
export const NativeActionFields={
 id:Type.Integer({minimum:1}),frame:NonNegativeInt,server_timestamp:Type.Number(),
 kind:Type.Enum(["menu_changed","pokemon_captured","pokemon_acquired","pokemon_moved","move_learned","move_forgotten","held_item_changed","status_changed","item_quantity_changed","berry_tree_changed","berry_harvested","berry_planted","berry_watered","harness_bug","battle_started","battle_ended","battle_outcome","battle_signal","battle_hp_changed","battle_status_changed","battle_pp_changed","native_input","pokemon_evolved","pokemon_egg_changed","pokemon_level_changed","pokemon_hp_changed","pokemon_max_hp_changed","pokemon_experience_changed","pokemon_pp_changed","daycare_training"]),
 details:NativeDetailsSchema,
};
export const NativeActionSchema=Type.Object(NativeActionFields,closed);
const NativeAction=event("native_action",NativeActionFields);
export const NativeActionJournalSchema=Type.Object({frame:NonNegativeInt,last_id:NonNegativeInt,entries:Type.Array(NativeActionSchema,{maxItems:16384})},closed);
export const ResourcesSchema=Type.Object({
 daycare:Type.Optional(Type.Union([Type.Array(Type.Object({slot:Type.Integer({minimum:0,maximum:1}),pokemon:PokemonSchema,steps:NonNegativeInt,displayed_level:Type.Union([Type.Integer({minimum:0,maximum:100}),Type.Null()])},closed),{maxItems:2}),Type.Null()])),
 bag:Type.Union([Type.Array(ResourceItemSchema,{maxItems:186}),Type.Null()]),
 pc_items:Type.Union([Type.Array(ResourceItemSchema,{maxItems:50}),Type.Null()]),
 storage:Type.Union([Type.Object({current_box:Type.Integer({minimum:0,maximum:13}),occupied:Type.Array(Type.Object({box:Type.Integer({minimum:0,maximum:13}),slot:Type.Integer({minimum:0,maximum:29}),pokemon:PokemonSchema},closed),{maxItems:420})},closed),Type.Null()]),
 berry_trees:Type.Union([Type.Array(Type.Object({tree_id:Type.Integer({minimum:0,maximum:127}),berry:NonNegativeInt,item_id:Type.Union([NonNegativeInt,Type.Null()]),stage:Type.Integer({minimum:0,maximum:5}),stop_growth:Type.Boolean(),minutes_until_next_stage:NonNegativeInt,yield_count:NonNegativeInt,regrowth_count:NonNegativeInt,watered:Type.Array(Type.Boolean(),{minItems:4,maxItems:4})},closed),{maxItems:128}),Type.Null()]),
 planted_berries:Type.Union([NonNegativeInt,Type.Null()]),
 diagnostics:Type.Array(Type.Object({owner:Type.String(),message:Type.String(),raw_hex:Type.Union([Type.String({maxLength:4096}),Type.Null()])},closed)),
 script_pc:Type.Union([NonNegativeInt,Type.Null()]),script_mode:Type.Union([NonNegativeInt,Type.Null()]),script_status:Type.Union([NonNegativeInt,Type.Null()]),
 selected_tree_id:Type.Union([NonNegativeInt,Type.Null()]),berry_script_owner:Type.Union([Type.Enum(["harvest","water","plant"]),Type.Null()]),
},closed);
export const RawRamReferenceSchema = Type.Object({v:Type.Literal(1), sequence:NonNegativeInt, frame:NonNegativeInt, path:Type.String({pattern:"^raw-ram/[0-9]{8,}\\.json\\.gz$"}), sha256:Type.String({pattern:"^[0-9a-f]{64}$"})},closed);
export const StateBodySchema = Type.Object(
  {
    raw_ram: Type.Optional(RawRamReferenceSchema),
    // warp-arrival-settle-v1 ON only: emulated frames the observation waited and why the wait ended.
    settle: Type.Optional(Type.Object({ frames: NonNegativeInt, reason: Type.Enum(["immediate", "paused", "fade", "warp", "fade_bound", "warp_bound"]) }, closed)),
    screen: Type.String(),
    active_ui: Type.Optional(Type.Union([Type.Object({
      phase: Type.String(), selected: Type.Union([Type.String(),Type.Null()]),
      ready: Type.Union([Type.Boolean(),Type.Null()]), controls: Type.String(),
      diagnostic: Type.Union([Type.String(),Type.Null()]),
      value: Type.Optional(Type.Union([Type.String(),Type.Null()])),
      details:Type.Optional(Type.Union([NativeDetailsSchema,Type.Null()])),
    },closed),Type.Null()])),
    story: Type.Optional(Type.Union([Type.Object({
      name_confirmed: Type.Union([Type.Boolean(), Type.Null()]),
      intro_stage: Type.Union([Type.Integer({minimum:0,maximum:7}), Type.Null()]),
      rival_stage: Type.Union([Type.Integer({minimum:0,maximum:4}), Type.Null()]),
      birch_lab_stage: Type.Union([Type.Integer({minimum:0,maximum:5}), Type.Null()]),
      petalburg_gym_stage: Type.Union([Type.Integer({minimum:0,maximum:8}), Type.Null()]),
      woods_stage: Type.Union([Type.Integer({minimum:0,maximum:1}), Type.Null()]),
      town_stage: Type.Optional(Type.Union([Type.Integer({minimum:0,maximum:4}), Type.Null()])),
      clock_set: Type.Union([Type.Boolean(), Type.Null()]),
      rival_battle_won: Type.Union([Type.Boolean(), Type.Null()]),
      pokedex_received: Type.Union([Type.Boolean(), Type.Null()]),
      running_shoes_received: Type.Union([Type.Boolean(), Type.Null()]),
      starter_tutorial_complete: Type.Union([Type.Boolean(), Type.Null()]),
      rustboro_gym_complete: Type.Union([Type.Boolean(), Type.Null()]),
      stone_badge: Type.Union([Type.Boolean(), Type.Null()]),
      rock_tomb_received: Type.Union([Type.Boolean(), Type.Null()]),
      rustboro_josh_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      rustboro_tommy_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      rustboro_marc_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      roxanne_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route102_calvin_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route102_rick_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route102_tiana_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route102_allen_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_ivan_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_billy_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_haley_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_winston_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_cindy_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_gina_mia_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      route104_darian_defeated: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
      petalburg_woods_lyle_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      petalburg_woods_james_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      petalburg_woods_aqua_grunt_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_joey_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_jose_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_jerry_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_clark_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_janice_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_karen_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_sarah_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_dawson_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_devan_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
      route116_johnson_defeated:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),

    }, closed), Type.Null()])),
    running:Type.Optional(Type.Union([RunningPermissionSchema,Type.Null()])),
    party_ownership:Type.Optional(Type.Union([Type.Object({owner:NullableString,source:Type.String(),original_identities:Type.Array(Type.String(),{maxItems:6}),rental_personalities:Type.Array(NonNegativeInt,{maxItems:3}),diagnostic:NullableString,raw_hex:Type.Union([Type.String({maxLength:4096}),Type.Null()])},closed),Type.Null()])),
    battle:Type.Optional(Type.Union([BattleStateSchema,Type.Null()])),
    resources:Type.Optional(Type.Union([ResourcesSchema,Type.Null()])),
    route103_rival:Type.Optional(Type.Union([Type.Object({battle_active:Type.Boolean(),defeated:Type.Boolean(),oldale_stage:Type.Union([Type.Integer({minimum:0,maximum:2}),Type.Null()])},closed),Type.Null()])),
    // trainer-opponent-v1: gTrainerBattleOpponent_A, its ROM name and class, its defeated flag, and a trainer battle on now.
    trainer_opponent:Type.Optional(Type.Union([Type.Object({trainer_id:Type.Integer({minimum:1,maximum:854}),trainer_class:Type.Integer({minimum:0,maximum:255}),name:Type.Union([Type.String({maxLength:40}),Type.Null()]),defeated:Type.Boolean(),battle_active:Type.Boolean()},closed),Type.Null()])),
    blackout_active:Type.Optional(Type.Union([Type.Boolean(),Type.Null()])),
    game_stats: Type.Optional(Type.Union([Type.Object({
      pokemon_captures:Type.Union([NonNegativeInt,Type.Null()]),
      evolved_pokemon:Type.Union([NonNegativeInt,Type.Null()]),
      used_pokecenter:Type.Union([NonNegativeInt,Type.Null()]),
      saved_game:Type.Union([NonNegativeInt,Type.Null()]),
    },closed),Type.Null()])),
    naming: Type.Optional(Type.Union([Type.Object({
      text: Type.String(), page: Type.Enum(["symbols", "uppercase", "lowercase"]),
      column: Type.Integer({ minimum: 0, maximum: 8 }), row: Type.Integer({ minimum: 0, maximum: 3 }),
      key: Type.String(), ready: Type.Boolean(),
    }, closed), Type.Null()])),
    world_context: Type.Optional(Type.Union([Type.Object({
      objects: Type.Array(Type.Object({local_id: NonNegativeInt, map_id: Type.Tuple([Type.Integer(), Type.Integer()]), graphics_id: NonNegativeInt, sprite_kind: Type.Union([Type.String(), Type.Null()]), x: Type.Integer(), y: Type.Integer()}, closed)),
      triggers: Type.Array(Type.Object({x: Type.Integer(), y: Type.Integer(), elevation: NonNegativeInt, variable: NonNegativeInt, required_value: NonNegativeInt, current_value: Type.Union([NonNegativeInt, Type.Null()]), condition_met: Type.Union([Type.Boolean(), Type.Null()]), script_pointer: NonNegativeInt}, closed)),
      dialogue: Type.Union([Type.String(), Type.Null()]),
      message_diagnostic: Type.Optional(Type.String({maxLength:1000})),
      field_activity: Type.Optional(Type.Object({
        phase: Type.Enum(["message_initializing", "script_pause", "movement_wait", "message_close_wait", "script_running", "other_interface"]),
        owner: NonNegativeInt,
      }, closed)),
      message: Type.Optional(Type.Union([Type.Object({
        phase: Type.Enum(["dismiss_wait", "printing", "button_wait", "page_wait", "scroll_wait", "scrolling", "audio_wait", "printing_pause"]),
        cursor: Type.Integer({minimum:0, maximum:999}), ready:Type.Boolean(),
        identity: Type.Optional(Type.Union([Type.String({pattern:"^[a-f0-9]{64}$"}),Type.Null()])),
      }, closed), Type.Null()])),
    }, closed), Type.Null()])),
    interaction_targets: Type.Optional(Type.Union([Type.Array(Type.Object({
      name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      kind: Type.String(), x: Type.Integer(), y: Type.Integer(), elevation: Type.Integer(),
      activation: Type.String(), availability: Type.String(), facing: Type.Union([Type.String(), Type.Null()]),
      local_id: Type.Union([Type.Integer(), Type.Null()]),
      destination: Type.Union([Type.Tuple([Type.Integer(), Type.Integer(), Type.Integer()]), Type.Null()]),
    }, closed)), Type.Null()])),
    navigation_grid: Type.Optional(Type.Union([Type.Object({elevation:Type.Integer({minimum:0,maximum:15}),
      tiles:Type.Array(Type.Object({x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0}),collision:Type.Integer({minimum:0,maximum:3}),behavior:Type.Integer({minimum:0,maximum:255}),elevation:Type.Integer({minimum:0,maximum:15})},closed),{minItems:1,maxItems:225}),
      objects:Type.Array(Type.Object({x:Type.Integer(),y:Type.Integer()},closed),{maxItems:16}),warps:Type.Array(Type.Object({x:Type.Integer(),y:Type.Integer()},closed),{maxItems:255})},closed),Type.Null()])),
    // Whole current map, present only with full-map-navigation-v1. One 4-hex-digit
    // cell per tile: collision<<12 | elevation<<8 | behavior.
    map_grid: Type.Optional(Type.Union([Type.Object({width:Type.Integer({minimum:1,maximum:256}),height:Type.Integer({minimum:1,maximum:256}),elevation:Type.Integer({minimum:0,maximum:15}),
      rows:Type.Array(Type.String({pattern:"^([0-9a-f]{4})+$",maxLength:1024}),{minItems:1,maxItems:256}),
      objects:Type.Array(Type.Object({x:Type.Integer(),y:Type.Integer()},closed),{maxItems:16}),warps:Type.Array(Type.Object({x:Type.Integer(),y:Type.Integer()},closed),{maxItems:255})},closed),Type.Null()])),
    topology: Type.Optional(Type.Union([Type.Object({
      width: Type.Integer({minimum:1}), height: Type.Integer({minimum:1}),
      // connection-edge-tiles-v1: the current-map edge tiles a player can walk off, present only with that switch.
      connections: Type.Array(Type.Object({direction:Type.Enum(["NORTH","SOUTH","EAST","WEST","DIVE","EMERGE"]), offset:Type.Integer(), destination:Type.Tuple([Type.Integer(),Type.Integer()]),destination_name:Type.String(),
        edges:Type.Optional(Type.Array(Type.Object({x:Type.Integer({minimum:0,maximum:255}),y:Type.Integer({minimum:0,maximum:255})},closed),{maxItems:256}))},closed),{maxItems:16}),
    },closed),Type.Null()])),
    local_map: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    field_controls_locked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    started: Type.Boolean(),
    name: Type.Union([Type.String(), Type.Null()]),
    location: Type.Union([Type.String(), Type.Null()]),
    // displayed-place-names-v1: the name the readout shows for this map; absent when off. Identity stays on location.
    location_display: Type.Optional(Type.String({ minLength: 1 })),
    map_id: Type.Union([Type.Tuple([Type.Integer(), Type.Integer()]), Type.Null()]),
    position: Type.Union([Type.Object({ x: Type.Integer(), y: Type.Integer() }, closed), Type.Null()]),
    facing: Type.Union([Type.String(), Type.Null()]),
    in_battle: Type.Boolean(),
    party_owner:Type.Optional(Type.Enum(["player","tutorial","rental"])),
    party:Type.Array(PokemonSchema,{maxItems:6}),
    money: Type.Union([NonNegativeInt, Type.Null()]),
    badges: Type.Array(Type.String()),
    play_time_s: Type.Union([NonNegativeInt, Type.Null()]),
    // surf-gated-exits-v1: exits reachable from the player only across water, and whether field Surf works now
    // (Balance Badge and a party Pokémon that knows SURF, or already surfing); null where unread. Present only with the switch.
    surf_gate: Type.Optional(Type.Object({
      can_surf: Type.Union([Type.Boolean(), Type.Null()]),
      balance_badge: Type.Union([Type.Boolean(), Type.Null()]),
      party_surf: Type.Union([Type.Boolean(), Type.Null()]),
      surfing: Type.Union([Type.Boolean(), Type.Null()]),
      warps: Type.Array(Type.Object({x:Type.Integer({minimum:0,maximum:255}),y:Type.Integer({minimum:0,maximum:255})},closed),{maxItems:255}),
      connections: Type.Array(Type.Enum(["NORTH","SOUTH","EAST","WEST"]),{maxItems:16}),
    },closed)),
  },
  closed,
);

const State = event("state", StateBodySchema.properties);

// battle-text-auto-advance-v1: pages the battle message window showed, recorded per emulated frame,
// and the state on the first frame the battle needs input or ends (bounded in frames).
export const BattleTextEntrySchema=Type.Object({id:Type.Integer({minimum:1}),frame:NonNegativeInt,recorded_ms:NonNegativeInt,battle:Type.Integer({minimum:1}),battle_turn:Type.Integer({minimum:1,maximum:256}),text:Type.String({minLength:1}),waited_for_input:Type.Boolean()},closed);
export const BattleTextJournalSchema=Type.Object({frame:NonNegativeInt,first_id:Type.Integer({minimum:1}),last_id:NonNegativeInt,errors:NonNegativeInt,last_error:Type.Union([Type.String(),Type.Null()]),entries:Type.Array(BattleTextEntrySchema,{maxItems:512})},closed);
export const BattleWaitSchema=Type.Object({reason:Type.Enum(["message_waiting","input","prompt","screen","field","levelup_box","bound","paused"] as const),frames:NonNegativeInt,state:StateBodySchema},closed);

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
  source: Type.Enum(["milestones", "state", "battle", "actions"] as const),
  message: Type.String(),
});

const RunEnd = event("run_end", {
  target_proof:Type.Optional(TargetProof),
  reason: RunEndReason,
  furthest_milestone: Type.Union([Type.String(), Type.Null()]),
  turns: NonNegativeInt,
  wall_ms: NonNegativeInt,
  tokens: Type.Object({ input: NonNegativeInt, output: NonNegativeInt }, closed),
  frames: Type.Object({ saved: NonNegativeInt, bytes: NonNegativeInt }, closed),
});

// Operator run control from runs/<id>/control.jsonl (see run-control.ts).
export const CONTROL_ACTIONS = ["pause", "resume", "stop", "cancel_stop", "abort"] as const;
const OperatorControl = event("operator_control", {
  action: Type.Enum(CONTROL_ACTIONS),
  status: Type.Enum(["pending", "applied", "ignored", "failed"] as const),
  request: Type.Integer({ minimum: 1 }),
  paused_ms: Type.Optional(NonNegativeInt),
  emulator_frozen: Type.Optional(Type.Boolean()),
});

const ObjectiveUpdate = event("objective_update", { objective: ObjectiveSchema });
const ObjectiveAttempt = event("objective_attempt", { attempt: makeAttemptSchema(ButtonSchema) });

export const RunEventSchema = Type.Union([
  OperatorControl,
  LoopGuard,
  ObjectiveUpdate,
  ObjectiveAttempt,
  RunStart,
  TurnStart,
  Assistant,
  ToolCall,
  ButtonPress,
  NavigationContext,
  LedgerContext,
  BeliefLedger,
  MilestoneHintContext,
  DecisionInput,
  WaitInput,
  HumanInput,
  HumanSample,
  ToolResult,
  Milestone,
  Activity,
  NativeAction,
  BattleChoice,
  Retry,
  TextOnlySupervisor,
  LowHpTrainerWarning,
  DialogueAutoAdvance,
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

// The union members for each event type, so a problem is reported against the event's own schema.
const MEMBERS = new Map<string, TSchema[]>();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function addMembers(schema: unknown): void {
  if (!isRecord(schema)) return;
  if (Array.isArray(schema.anyOf)) { for (const member of schema.anyOf) addMembers(member); return; }
  const type = isRecord(schema.properties) && isRecord(schema.properties.type) ? schema.properties.type.const : undefined;
  if (typeof type === "string") MEMBERS.set(type, [...(MEMBERS.get(type) ?? []), schema]);
}
addMembers(RunEventSchema);

const unescapePointer = (segment: string): string => segment.replace(/~1/g, "/").replace(/~0/g, "~");
function describeError(error: { instancePath: string; schemaPath: string; message: string }): string {
  if (error.schemaPath.endsWith("/additionalProperties")) {
    const cut = error.instancePath.lastIndexOf("/");
    return `${error.instancePath.slice(0, cut) || "/"}: unexpected property ${unescapePointer(error.instancePath.slice(cut + 1))}`;
  }
  return `${error.instancePath || "/"}: ${error.message}`;
}

export function eventProblem(value: unknown): string | null {
  if (Value.Check(RunEventSchema, value)) return null;
  if (!isRecord(value)) return "invalid event: not a JSON object";
  if (typeof value.type !== "string") return "invalid event: no string type field";
  const members = MEMBERS.get(value.type);
  if (members === undefined) return `unknown event type ${JSON.stringify(value.type)}: this build of the schema does not know it`;
  // A type with several members (state and legacy state, tool_call) is judged by the closest one.
  const [first] = members.map(member => [...Value.Errors(member, value)]).reduce((best, errors) => (errors.length < best.length ? errors : best));
  return `invalid ${value.type} event at ${first === undefined ? "/: does not match the schema" : describeError(first)}`;
}

const EnvelopeSchema = Type.Object({ ...Envelope, type: Type.String({ minLength: 1 }) });
export interface EventEnvelope { run: string; seq: number; t: string; turn: number; type: string }
// The envelope of a line, even when its body fails the schema: lets a reader keep order checks on events it skips.
export function eventEnvelope(value: unknown): EventEnvelope | null {
  if (!Value.Check(EnvelopeSchema, value)) return null;
  return { run: value.run, seq: value.seq, t: value.t, turn: value.turn, type: value.type };
}

export interface StartIdentity { run: string; t: string; commit: string; dirty: boolean; model: string | null; port: number | null }
const fields = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
// A run_start's identity read without the closed schema, so a viewer can tell which build wrote a
// run_start it cannot validate. Null unless the envelope, harness.commit and harness.dirty all read.
export function startIdentity(value: unknown): StartIdentity | null {
  const envelope = eventEnvelope(value), body = fields(value);
  if (envelope === null || body === null || envelope.type !== "run_start" || envelope.seq !== 0) return null;
  const harness = fields(body.harness);
  if (harness === null || !Value.Check(Sha1, harness.commit) || typeof harness.dirty !== "boolean") return null;
  const model = fields(body.model)?.id, port = fields(body.isolation)?.port;
  return {
    run: envelope.run, t: envelope.t, commit: harness.commit, dirty: harness.dirty,
    model: typeof model === "string" ? model : null,
    port: typeof port === "number" && Number.isSafeInteger(port) && port > 0 && port < 65536 ? port : null,
  };
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
