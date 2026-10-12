import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EventBody, RunEvent } from "./events.js";
import { readRun, summarize, summaryLines, type RunSummary } from "./summary.js";

const START: EventBody = {
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

function events(run: string, bodies: [number, number, EventBody][]): RunEvent[] {
  return bodies.map(([seconds, turn, body], seq) => ({ v: 1, run, seq, t: stamp(seconds), ...body, turn }) as RunEvent);
}

function assistant(input: number, output: number): EventBody {
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

const press: EventBody = { type: "button_press", tool_call_id: "c", buttons: ["A"] };
const retry: EventBody = { type: "retry", reason: "text-only reply", attempt: 1, limit: 3 };
const toolError: EventBody = {
  type: "tool_result",
  id: "c",
  name: "press",
  is_error: true,
  duration_ms: 1,
  text: "bad",
  frames: [],
};

function milestone(name: string): EventBody {
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

describe("readRun", () => {
  it("parses every line of events.jsonl", () => {
    const runDir = mkdtempSync(join(tmpdir(), "pokebench-summary-"));
    writeFileSync(join(runDir, "events.jsonl"), FINISHED.map((e) => JSON.stringify(e)).join("\n") + "\n");
    expect(readRun(runDir)).toEqual(FINISHED);
  });

  it("names the line of an invalid event", () => {
    const runDir = mkdtempSync(join(tmpdir(), "pokebench-summary-"));
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "events.jsonl"), `${JSON.stringify(FINISHED[0])}\n{"type":"nope"}\n`);
    expect(() => readRun(runDir)).toThrow(/events.jsonl:2/);
  });
});
