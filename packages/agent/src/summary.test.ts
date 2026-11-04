import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EventBody, RunEvent } from "./events.js";
import { readRun, summarize, summaryLines, type RunSummary } from "./summary.js";

type Body = EventBody extends infer E ? (E extends EventBody ? Omit<E, "turn"> : never) : never;

const START: Body = {
  type: "run_start",
  model: { id: "think-swarm", context_window: 131072, max_tokens: 4096, vision: true },
  sampling: { thinking_level: "medium", max_tokens: 4096 },
  system_prompt: "play",
  tools: ["observe", "press"],
  harness: { commit: "a".repeat(40), dirty: false },
  vendor_pin: "b".repeat(40),
  pi_version: "0.73.1",
  start_state: { kind: "boot" },
  harness_features: [],
  budgets: { max_turns: 300, max_wall_ms: 3_600_000 },
  isolation: { server_dir: "runs/r/server", run_data_id: "r", load_checkpoint_mode: false, port: 8000 },
};

function stamp(seconds: number): string {
  return `2026-10-11T23:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.000-04:00`;
}

function events(run: string, bodies: [number, number, Body][]): RunEvent[] {
  return bodies.map(([seconds, turn, body], seq) => ({ v: 1, run, seq, t: stamp(seconds), ...body, turn }));
}

function assistant(input: number, output: number): Body {
  return {
    type: "assistant",
    thinking: "",
    text: "",
    tool_calls: [],
    usage: { input, output, cache_read: 0 },
    latency_ms: 10,
    ttft_ms: 5,
    stop_reason: "toolUse",
  };
}

const press: Body = { type: "button_press", tool_call_id: "c", buttons: ["A"] };
const retry: Body = { type: "retry", reason: "text-only reply", attempt: 1, limit: 3 };
const toolError: Body = {
  type: "tool_result",
  id: "c",
  name: "press",
  is_error: true,
  duration_ms: 1,
  text: "bad",
  frames: [],
};

function milestone(name: string): Body {
  return { type: "milestone", name, server_timestamp: 1 };
}

const FINISHED = events("run-a", [
  [0, 0, START],
  [0, 0, milestone("GAME_RUNNING")],
  [5, 1, assistant(100, 10)],
  [6, 1, press],
  [90, 2, milestone("PLAYER_NAME_SET")],
  [95, 2, retry],
  [96, 2, toolError],
  [
    120,
    3,
    {
      type: "run_end",
      reason: "budget",
      furthest_milestone: "PLAYER_NAME_SET",
      turns: 3,
      wall_ms: 120_000,
      tokens: { input: 300, output: 30 },
      frames: { saved: 2, bytes: 100 },
    },
  ],
]);

describe("summarize", () => {
  it("reads the terminal record and counts presses, retries, tool errors and milestone times", () => {
    expect(summarize(FINISHED)).toEqual({
      run: "run-a",
      model: "think-swarm",
      reason: "budget",
      furthest: "PLAYER_NAME_SET",
      turns: 3,
      wallMs: 120_000,
      tokens: { input: 300, output: 30 },
      presses: 1,
      retries: 1,
      toolErrors: 1,
      milestones: [
        { name: "GAME_RUNNING", turn: 0, wallMs: 0 },
        { name: "PLAYER_NAME_SET", turn: 2, wallMs: 90_000 },
      ],
    } satisfies RunSummary);
  });

  it("marks a run without a terminal record incomplete and estimates from its events", () => {
    const partial = events("run-b", [
      [0, 0, START],
      [10, 1, assistant(50, 5)],
      [20, 2, assistant(60, 6)],
    ]);
    expect(summarize(partial)).toMatchObject({
      reason: "incomplete",
      furthest: null,
      turns: 2,
      wallMs: 20_000,
      tokens: { input: 110, output: 11 },
    });
  });

  it("ranks an incomplete run's furthest milestone by story depth, not by the last one logged", () => {
    const partial = events("run-c", [
      [0, 0, START],
      [10, 1, { type: "milestone", name: "ROUTE_103", server_timestamp: 1, kind: "navigation", origin: "observed", evidence: [1] }],
      [20, 2, { type: "milestone", name: "FIRST_POKECENTER_HEAL", server_timestamp: 2, kind: "story", origin: "observed", evidence: [1, 2, 3] }],
    ]);
    expect(summarize(partial)).toMatchObject({ reason: "incomplete", furthest: "ROUTE_103" });
  });

  it("rejects a log that does not start with run_start", () => {
    expect(() => summarize(events("run-c", [[0, 1, assistant(1, 1)]]))).toThrow(/run_start/);
    expect(() => summarize([])).toThrow(/run_start/);
  });
});

describe("summaryLines", () => {
  const other: RunSummary = {
    ...summarize(FINISHED),
    run: "run-z",
    reason: "model_error",
    furthest: "GAME_RUNNING",
    milestones: [{ name: "GAME_RUNNING", turn: 0, wallMs: 0 }],
  };

  it("prints one row per run, then milestone reach rates with median times", () => {
    const lines = summaryLines([summarize(FINISHED), other]);
    expect(lines[0]).toMatch(/^run\s+model\s+reason\s+furthest/);
    expect(lines[1]).toContain("run-a");
    expect(lines[1]).toContain("budget");
    expect(lines[1]).toContain("2m00s");
    expect(lines[1]).toContain("300→30");
    expect(lines[2]).toContain("model_error");
    expect(lines.slice(3)).toEqual([
      "",
      "2 runs: 0 incomplete",
      "GAME_RUNNING      reached 2/2  median turn 0  median wall 0m00s",
      "PLAYER_NAME_SET   reached 1/2  median turn 2  median wall 1m30s",
    ]);
  });

  it("flags incomplete runs", () => {
    const lines = summaryLines([{ ...other, reason: "incomplete", milestones: [] }]);
    expect(lines).toContain("1 runs: 1 incomplete (no run_end: live, or lost — PB2)");
  });

  it("averages the two middle values for an even count", () => {
    const at = (wallMs: number, turn: number): RunSummary => ({
      ...other,
      milestones: [{ name: "X", turn, wallMs }],
    });
    expect(summaryLines([at(60_000, 2), at(120_000, 5)]).at(-1)).toBe(
      "X                 reached 2/2  median turn 3.5  median wall 1m30s",
    );
  });
});

it("keeps human outcomes inspectable but outside all model aggregate reach rates", () => {
  const humanEvents = FINISHED.map((e) => e.type === "run_start" ? { ...e, model: { ...e.model, id: "Human · Operator" }, controller: { kind: "human", name: "Operator", rom_sha1: "c".repeat(40), input_policy: "frame-held-v1", sample_ms: 100, nominal_fps: 59.7275 } as const } : { ...e, run: "human" });
  const human = summarize(humanEvents);
  expect(human).toMatchObject({ human: true, model: "Human · Operator", reason: "budget" });
  const lines = summaryLines([summarize(FINISHED), human]);
  expect(lines).toContain("1 runs: 0 incomplete");
  expect(lines).toContain("PLAYER_NAME_SET   reached 1/1  median turn 2  median wall 1m30s");
  expect(lines.join("\n")).toContain("Human · Operator");
  expect(lines.join("\n")).toContain("1 human sessions excluded from model benchmark results");
});
