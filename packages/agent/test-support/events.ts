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
    location: "LITTLEROOT TOWN",
    position: { x: 5, y: 8 },
    facing: null,
    mode: "overworld",
    in_battle: false,
    party: [{ species: "TORCHIC", level: 5, hp: 18, max_hp: 20 }],
    money: 3000,
    badges: ["Stone"],
    play_time_s: 754,
  },
  { type: "compaction", turn: 1, from_tokens: 30_000, to_tokens: 4_000 },
  { type: "button_press", turn: 1, tool_call_id: "call_2", buttons: ["UP", "A"], hold_frames: 10, release_frames: 8 },
  { type: "telemetry_error", turn: 1, source: "state", message: "GET http://127.0.0.1:8000/state returned HTTP 503" },
];

export function sample(index: number): EventBody {
  const body = SAMPLES[index];
  if (body === undefined) throw new Error(`no sample ${String(index)}`);
  return body;
}
