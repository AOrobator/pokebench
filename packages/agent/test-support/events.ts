import type { GameStateSnapshot } from "../src/game-state.js";
import type { EventBody } from "../src/events.js";
import type { RunStartMeta } from "../src/recorder.js";

export const RUN_START_META: RunStartMeta = {
  model: { id: "think-swarm", context_window: 65536, max_tokens: 16384, vision: true },
  sampling: { thinking_level: "medium", max_tokens: 16384 },
  system_prompt: "You play Pokémon Emerald.",
  tools: ["screenshot", "state", "press"],
  harness: { commit: "0123456789abcdef0123456789abcdef01234567", dirty: false },
  vendor_pin: "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
  pi_version: "0.73.1",
  start_state: { kind: "boot" },
  harness_features: [],
  budgets: { max_turns: 100, max_wall_ms: 3_600_000 },
  isolation: { server_dir: "runs/r/server", run_data_id: "r", load_checkpoint_mode: false, port: 8000 },
};

export const RUN_START: EventBody = { type: "run_start", turn: 0, ...RUN_START_META };

export const SAMPLES: readonly EventBody[] = [
  RUN_START,
  { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 12 } },
  {
    type: "assistant",
    turn: 1,
    thinking: "Look first.",
    text: "",
    tool_calls: [{ id: "call_1", name: "press", args: { buttons: ["A"] } }],
    usage: { input: 100, output: 20, cache_read: 0 },
    latency_ms: 900,
    ttft_ms: 120,
    stop_reason: "toolUse",
  },
  { type: "tool_call", turn: 1, id: "call_1", name: "press", args: { buttons: ["A"] } },
  { type: "button_press", turn: 1, tool_call_id: "call_1", buttons: ["A"] },
  {
    type: "tool_result",
    turn: 1,
    id: "call_1",
    name: "press",
    is_error: false,
    duration_ms: 140,
    text: "ok",
    frames: [{ path: "frames/000006_0.png", sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709" }],
  },
  { type: "milestone", turn: 1, name: "GAME_RUNNING", server_timestamp: 1791765012.4 },
  { type: "retry", turn: 1, reason: "invalid tool arguments", attempt: 1, limit: 3 },
  { type: "disk_usage", turn: 1, bytes: 52_428_800, cap_bytes: 524_288_000, percent: 10 },
  { type: "frames_evicted", turn: 1, from_run: "older-run", files: 3, bytes: 1500 },
  {
    type: "run_end",
    turn: 1,
    reason: "budget",
    furthest_milestone: "GAME_RUNNING",
    turns: 1,
    wall_ms: 5000,
    tokens: { input: 100, output: 20 },
    frames: { saved: 1, bytes: 500 },
  },
  {
    type: "state",
    turn: 1,
    screen: "overworld",
    started: true,
    name: "MAY",
    location: "LITTLEROOT TOWN",
    map_id: [0, 9],
    position: { x: 5, y: 8 },
    facing: "down",
    in_battle: false,
    party: [{ species: "TORCHIC", level: 5, hp: 18, max_hp: 20 }],
    money: 3000,
    badges: ["Stone"],
    play_time_s: 754,
  },
  { type: "compaction", turn: 1, from_tokens: 30_000, to_tokens: 4_000 },
  { type: "button_press", turn: 1, tool_call_id: "call_2", buttons: ["UP", "A"], hold_frames: 10, release_frames: 8 },
  { type: "telemetry_error", turn: 1, source: "state", message: "GET http://127.0.0.1:8000/state returned HTTP 503" },
  { type: "assistant_delta", turn: 1, thinking: "Look at the\nscreen", text: "" },
  { type: "objective_update", turn: 0, objective: { id: "o1", revision: 1, goal: "Reach gym", title: "Get starter", supports_goal: "Need a Pokémon", evidence: [1], completion: { kind: "state", field: "party_count", value: 1 }, obstacle: "", next_decision: "Observe", status: "active", completion_evidence: [] } },
  { type: "objective_attempt", turn: 1, attempt: { id: "a1", objective_id: "o1", buttons: ["A"], before_seq: 1, after_seq: 2, outcome: "no_change", failure_count: 1, warning: null, retry_justification: null } },

];

export function sample(index: number): EventBody {
  const body = SAMPLES[index];
  if (body === undefined) throw new Error(`no sample ${String(index)}`);
  return body;
}

export const IN_GAME: GameStateSnapshot = {
  screen: "overworld",
  started: true,
  name: "MAY",
  location: "LITTLEROOT TOWN",
  map_id: [0, 9],
  position: { x: 7, y: 9 },
  facing: "right",
  in_battle: false,
  party: [{ species: "TORCHIC", level: 5, hp: 18, max_hp: 20 }],
  money: 3000,
  badges: ["STONE"],
  play_time_s: 3723,
};

// Full pregame story readout: Birch's accepted-name flag, not editor text.
export const NAME_CONFIRMED = {
  screen:"birch_speech",started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null,
  story:{name_confirmed:true,intro_stage:null,rival_stage:null,birch_lab_stage:null,petalburg_gym_stage:null,woods_stage:null,clock_set:null,rival_battle_won:null,pokedex_received:null,running_shoes_received:null,starter_tutorial_complete:null,rustboro_gym_complete:null,stone_badge:null,rock_tomb_received:null},
} satisfies GameStateSnapshot;
