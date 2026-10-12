import { readFileSync } from "node:fs";
import type { RunEvent } from "@pokebench/agent/events";

export const RUN = "2026-10-11T22-00-00_think-swarm_test";
export const BASE_MS = Date.parse("2026-10-11T22:00:00.000-04:00");

type Body = RunEvent extends infer E ? (E extends RunEvent ? Omit<E, "v" | "run" | "seq" | "t"> : never) : never;

// Eastern (EDT, -04:00) timestamp `offsetMs` after BASE_MS.
export function tAt(offsetMs: number): string {
  const shifted = new Date(BASE_MS + offsetMs - 4 * 3600_000).toISOString();
  return `${shifted.slice(0, 23)}-04:00`;
}

export class Log {
  readonly events: RunEvent[] = [];

  add(offsetMs: number, body: Body): RunEvent {
    const event = { v: 1, run: RUN, seq: this.events.length, t: tAt(offsetMs), ...body } as RunEvent;
    this.events.push(event);
    return event;
  }
}

export const START: Body = {
  type: "run_start",
  turn: 0,
  model: { id: "think-swarm", context_window: 10_000, max_tokens: 4096, vision: true },
  sampling: { thinking_level: "medium", max_tokens: 4096 },
  system_prompt: "Play.",
  tools: ["screenshot", "press", "state"],
  harness: { commit: "0123456789abcdef0123456789abcdef01234567", dirty: false },
  vendor_pin: "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
  pi_version: "0.73.1",
  start_state: { kind: "boot" },
  harness_features: [],
  budgets: { max_turns: 10, max_wall_ms: 60_000 },
  isolation: { server_dir: "runs/x/server", run_data_id: "x", load_checkpoint_mode: false, port: 8011 },
};

export function state(overrides: Partial<Extract<Body, { type: "state" }>> = {}): Body {
  return {
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
    ...overrides,
  };
}

export function assistant(overrides: Partial<Extract<Body, { type: "assistant" }>> = {}): Body {
  return {
    type: "assistant",
    turn: 1,
    thinking: "Press A to start.",
    text: "",
    tool_calls: [{ id: "c1", name: "press", args: { buttons: ["A"] } }],
    usage: { input: 500, output: 100, cache_read: 0 },
    latency_ms: 2000,
    ttft_ms: 1990,
    stop_reason: "toolUse",
    ...overrides,
  };
}

// A short, complete run: two turns, a press with state, a frame, a retry.
export function fullRun(): Log {
  const log = new Log();
  log.add(0, START);
  log.add(10, { type: "milestone", turn: 0, name: "GAME_RUNNING", server_timestamp: 1 });
  log.add(20, { type: "disk_usage", turn: 0, bytes: 50 * 1024 * 1024, cap_bytes: 500 * 1024 * 1024, percent: 10 });
  log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 2500 } });
  log.add(3000, assistant());
  log.add(3001, { type: "tool_call", turn: 1, id: "c1", name: "press", args: { buttons: ["A"] } });
  log.add(3002, { type: "button_press", turn: 1, tool_call_id: "c1", buttons: ["A", "UP"], hold_frames: 10, release_frames: 8 });
  log.add(3100, { type: "milestone", turn: 1, name: "PLAYER_NAME_SET", server_timestamp: 2 });
  log.add(3150, state());
  log.add(3200, {
    type: "tool_result",
    turn: 1,
    id: "c1",
    name: "press",
    is_error: false,
    duration_ms: 199,
    text: "pressed A, UP",
    frames: [{ path: "frames/000009_0.png", sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709" }],
  });
  log.add(4000, { type: "turn_start", turn: 2, context: { messages: 3, images: 1, est_tokens: 5000 } });
  log.add(8000, assistant({ turn: 2, thinking: "Again.", usage: { input: 700, output: 300, cache_read: 0 }, latency_ms: 4000, ttft_ms: null }));
  log.add(8001, { type: "retry", turn: 2, reason: "invalid tool arguments", attempt: 1, limit: 3 });
  log.add(9000, {
    type: "run_end",
    turn: 2,
    reason: "budget",
    furthest_milestone: "PLAYER_NAME_SET",
    turns: 2,
    wall_ms: 9000,
    tokens: { input: 1200, output: 400 },
    frames: { saved: 1, bytes: 100 },
  });
  return log;
}

export function m4Run(): RunEvent[] {
  return readFileSync(new URL("../src/fixtures/m4-run.jsonl", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as RunEvent);
}
