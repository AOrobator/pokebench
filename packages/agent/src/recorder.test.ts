import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { RUN_START_META as START_META } from "../test-support/events.js";
import { assistant, toolCall, userImage, userText } from "../test-support/pi.js";
import { parseEvent, type RunEvent } from "./events.js";
import { FrameStore } from "./frames.js";
import type { GameStateSnapshot } from "./game-state.js";
import type { SeenMilestone } from "./milestones.js";
import { RecorderError, RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";


const STATE: GameStateSnapshot = {
  location: "LITTLEROOT TOWN",
  position: { x: 5, y: 8 },
  facing: null,
  mode: "overworld",
  in_battle: false,
  party: [],
  money: 0,
  badges: [],
  play_time_s: 12,
};

function harness(milestoneBatches: SeenMilestone[][] = [], capBytes = 1_000_000): {
  recorder: RunRecorder;
  log: RunLog;
  advance: (ms: number) => void;
} {
  const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-rec-"));
  const log = RunLog.create(runsRoot, "2026-10-11T22-00-00_think-swarm_rrrr");
  const frames = new FrameStore(runsRoot, capBytes, () => undefined);
  let clock = 1000;
  const batches = [...milestoneBatches];
  const recorder = new RunRecorder({
    log,
    frames,
    milestones: { poll: () => Promise.resolve(batches.shift() ?? []) },
    gameState: { read: () => Promise.resolve(STATE) },
    now: () => clock,
  });
  return {
    recorder,
    log,
    advance: (ms) => {
      clock += ms;
    },
  };
}

function events(log: RunLog): RunEvent[] {
  return readFileSync(log.eventsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => parseEvent(line));
}

function update(): AgentEvent {
  const partial = assistant({ text: "" });
  return {
    type: "message_update",
    message: partial,
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "x", partial },
  };
}

function delta(kind: "thinking_delta" | "text_delta" | "toolcall_delta", text: string): AgentEvent {
  const partial = assistant({ text: "" });
  return { type: "message_update", message: partial, assistantMessageEvent: { type: kind, contentIndex: 0, delta: text, partial } };
}

describe("RunRecorder streaming", () => {
  it("writes thinking and text as batched deltas while the reply streams, then the full reply", async () => {
    const { recorder, log, advance } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    advance(100);
    await recorder.emit(delta("thinking_delta", "Look"));
    advance(100);
    await recorder.emit(delta("thinking_delta", " at"));
    advance(60);
    await recorder.emit(delta("thinking_delta", " it."));
    await recorder.emit(delta("toolcall_delta", '{"buttons"'));
    advance(10);
    await recorder.emit(delta("text_delta", "Go"));
    await recorder.emit({ type: "message_end", message: assistant({ thinking: "Look at it.", text: "Go" }) });
    const streamed = events(log).filter((e) => e.type === "assistant_delta" || e.type === "assistant");
    expect(streamed.map((e) => (e.type === "assistant_delta" ? [e.type, e.thinking, e.text] : [e.type]))).toEqual([
      ["assistant_delta", "Look at it.", ""],
      ["assistant_delta", "", "Go"],
      ["assistant"],
    ]);
  });

  it("drops an unflushed tail from a turn that never finished, without leaking it into the next turn", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit(delta("thinking_delta", "half a thou"));
    await recorder.transformContext([userText("go")]);
    await recorder.emit({ type: "message_end", message: assistant({ thinking: "fresh", text: "" }) });
    expect(events(log).filter((e) => e.type === "assistant_delta")).toEqual([]);
  });
});

describe("RunRecorder", () => {
  it("records a full turn: context, assistant, tool call, press, milestone, frame result", async () => {
    const { recorder, log, advance } = harness([
      [{ name: "GAME_RUNNING", serverTimestamp: 10 }],
      [{ name: "PLAYER_NAME_SET", serverTimestamp: 20 }],
    ]);
    await recorder.start(START_META);
    await recorder.emit({ type: "message_end", message: userText("x".repeat(48)) });
    expect(await recorder.transformContext([userText("x".repeat(48)), userImage()])).toHaveLength(2);
    advance(120);
    await recorder.emit(update());
    advance(780);
    const reply = assistant({
      thinking: "Press A.",
      text: "Pressing.",
      toolCalls: [toolCall("call_1", "press", { buttons: ["A"] })],
      stopReason: "toolUse",
      input: 100,
      output: 20,
    });
    await recorder.emit({ type: "message_end", message: reply });
    await recorder.emit({ type: "tool_execution_start", toolCallId: "call_1", toolName: "press", args: { buttons: ["A"] } });
    recorder.buttonPress("call_1", ["A"], { hold_frames: 10, release_frames: 8 });
    await recorder.afterPress();
    advance(140);
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "call_1",
      toolName: "press",
      result: {
        content: [
          { type: "text", text: "pressed" },
          { type: "image", data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png" },
        ],
        details: undefined,
      },
      isError: false,
    });
    recorder.end("budget");

    const log_ = events(log);
    expect(log_.map((event) => event.type)).toEqual([
      "run_start",
      "milestone",
      "disk_usage",
      "turn_start",
      "assistant",
      "tool_call",
      "button_press",
      "milestone",
      "state",
      "tool_result",
      "run_end",
    ]);
    expect(log_[1]).toMatchObject({ turn: 0, name: "GAME_RUNNING", server_timestamp: 10 });
    expect(log_[3]).toMatchObject({ turn: 1, context: { messages: 2, images: 1, est_tokens: 14 } });
    expect(log_[4]).toMatchObject({
      turn: 1,
      thinking: "Press A.",
      text: "Pressing.",
      tool_calls: [{ id: "call_1", name: "press", args: { buttons: ["A"] } }],
      usage: { input: 100, output: 20, cache_read: 3 },
      latency_ms: 900,
      ttft_ms: 120,
      stop_reason: "toolUse",
    });
    expect(log_[5]).toMatchObject({ turn: 1, id: "call_1", name: "press", args: { buttons: ["A"] } });
    expect(log_[6]).toMatchObject({ turn: 1, tool_call_id: "call_1", buttons: ["A"], hold_frames: 10, release_frames: 8 });
    expect(log_[7]).toMatchObject({ name: "PLAYER_NAME_SET", server_timestamp: 20 });
    expect(log_[8]).toMatchObject({ type: "state", turn: 1, ...STATE });
    expect(log_[9]).toMatchObject({
      id: "call_1",
      name: "press",
      is_error: false,
      duration_ms: 140,
      text: "pressed",
    });
    const result = log_[9];
    expect(result?.type === "tool_result" ? result.frames.map((frame) => frame.path) : []).toEqual([
      "frames/000009_0.png",
    ]);
    expect(readFileSync(join(log.runDir, "frames", "000009_0.png"), "utf8")).toBe("png-bytes");
    expect(log_[10]).toMatchObject({
      reason: "budget",
      furthest_milestone: "PLAYER_NAME_SET",
      turns: 1,
      wall_ms: 1040,
      tokens: { input: 100, output: 20 },
      frames: { saved: 1, bytes: 9 },
    });
  });

  it("records a model error and a failed tool", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit({
      type: "message_end",
      message: assistant({ stopReason: "error", errorMessage: "HTTP 500" }),
    });
    await recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "state", args: {} });
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "c",
      toolName: "state",
      result: { content: [{ type: "text", text: "malformed /state payload" }], details: {} },
      isError: true,
    });
    recorder.end("model_error");
    const log_ = events(log);
    expect(log_.find((event) => event.type === "assistant")).toMatchObject({
      stop_reason: "error",
      error: "HTTP 500",
      ttft_ms: null,
      thinking: "",
      text: "",
      tool_calls: [],
    });
    expect(log_.find((event) => event.type === "tool_result")).toMatchObject({
      is_error: true,
      text: "malformed /state payload",
      frames: [],
    });
    expect(log_.at(-1)).toMatchObject({ reason: "model_error", furthest_milestone: null });
  });

  it("records bounded retries", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    recorder.retry("invalid tool arguments", 1, 3);
    expect(events(log).at(-1)).toMatchObject({ type: "retry", reason: "invalid tool arguments", attempt: 1, limit: 3 });
  });

  it("records a context compaction", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    recorder.compaction(30_000, 4_000);
    expect(events(log).at(-1)).toMatchObject({ type: "compaction", from_tokens: 30_000, to_tokens: 4_000 });
  });

  it("logs post-press telemetry failures as events instead of failing the press", async () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-rec-"));
    const log = RunLog.create(runsRoot, "2026-10-11T22-00-00_think-swarm_tttt");
    let calls = 0;
    const recorder = new RunRecorder({
      log,
      frames: new FrameStore(runsRoot, 1_000_000, () => undefined),
      milestones: {
        poll: () => {
          calls += 1;
          return calls === 1 ? Promise.resolve([]) : Promise.reject(new Error("milestones down"));
        },
      },
      gameState: { read: () => Promise.reject(new Error("state down")) },
    });
    await recorder.start(START_META);
    await expect(recorder.afterPress()).resolves.toBeUndefined();
    expect(events(log).filter((event) => event.type === "telemetry_error")).toMatchObject([
      { source: "milestones", message: "milestones down" },
      { source: "state", message: "state down" },
    ]);
  });

  it("checks milestones before reading state after a press", async () => {
    const order: string[] = [];
    const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-rec-"));
    const log = RunLog.create(runsRoot, "2026-10-11T22-00-00_think-swarm_ssss");
    const recorder = new RunRecorder({
      log,
      frames: new FrameStore(runsRoot, 1_000_000, () => undefined),
      milestones: {
        poll: () => {
          order.push("milestones");
          return Promise.resolve([]);
        },
      },
      gameState: {
        read: () => {
          order.push("state");
          return Promise.resolve(STATE);
        },
      },
    });
    await recorder.start(START_META);
    order.length = 0;
    await recorder.afterPress();
    expect(order).toEqual(["milestones", "state"]);
  });

  it("ignores events that carry nothing to record", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    for (const event of [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: userText("hi") },
      { type: "turn_end", message: assistant(), toolResults: [] },
      { type: "agent_end", messages: [] },
      { type: "tool_execution_update", toolCallId: "c", toolName: "x", args: {}, partialResult: {} },
    ] satisfies AgentEvent[]) {
      await recorder.emit(event);
    }
    expect(events(log).map((event) => event.type)).toEqual(["run_start", "disk_usage"]);
  });

  it("rejects a tool result for a call it never saw start", async () => {
    const { recorder } = harness();
    await recorder.start(START_META);
    await expect(
      recorder.emit({
        type: "tool_execution_end",
        toolCallId: "ghost",
        toolName: "x",
        result: { content: [], details: {} },
        isError: false,
      }),
    ).rejects.toThrow(RecorderError);
  });

  it("rejects non-object tool arguments", async () => {
    const { recorder } = harness();
    await recorder.start(START_META);
    await expect(
      recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "x", args: "A" }),
    ).rejects.toThrow(RecorderError);
  });
});

describe("RunRecorder tool results", () => {
  it("rejects a tool result without a content list", async () => {
    const { recorder } = harness();
    await recorder.start(START_META);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "x", args: {} });
    await expect(
      recorder.emit({ type: "tool_execution_end", toolCallId: "c", toolName: "x", result: "oops", isError: false }),
    ).rejects.toThrow(/content list/);
  });
});

const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString("base64");

describe("RunRecorder frame retention", () => {
  it("moves PNG base64 found in tool text into frames and leaves only a reference", async () => {
    const { recorder, log } = harness();
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "s", toolName: "state", args: {} });
    const body = JSON.stringify({ visual: { screenshot_base64: PNG_B64 }, player: { location: "LITTLEROOT" } });
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "s",
      toolName: "state",
      result: { content: [{ type: "text", text: body }], details: {} },
      isError: false,
    });
    const result = events(log).find((event) => event.type === "tool_result");
    expect(result?.type).toBe("tool_result");
    if (result?.type !== "tool_result") return;
    expect(result.text).not.toContain(PNG_B64.slice(0, 40));
    expect(result.text).toContain(`<frame ${result.frames[0]?.path ?? "missing"}>`);
    expect(result.text).toContain("LITTLEROOT");
    expect(result.frames).toHaveLength(1);
    expect(readFileSync(join(log.runDir, result.frames[0]?.path ?? "")).equals(Buffer.from(PNG_B64, "base64"))).toBe(true);
  });

  it("names frames after their tool_result's seq even when disk reports fire", async () => {
    const { recorder, log } = harness([], 1000);
    await recorder.start(START_META);
    await recorder.transformContext([userText("go")]);
    await recorder.emit({ type: "tool_execution_start", toolCallId: "c", toolName: "screenshot", args: {} });
    await recorder.emit({
      type: "tool_execution_end",
      toolCallId: "c",
      toolName: "screenshot",
      result: { content: [{ type: "image", data: Buffer.alloc(110, 2).toString("base64"), mimeType: "image/png" }], details: {} },
      isError: false,
    });
    const all = events(log);
    const resultIndex = all.findIndex((event) => event.type === "tool_result");
    const result = all[resultIndex];
    if (result?.type !== "tool_result") throw new Error("no tool_result");
    expect(result.frames[0]?.path).toBe(`frames/${String(result.seq).padStart(6, "0")}_0.png`);
    expect(all[resultIndex + 1]).toMatchObject({ type: "disk_usage", percent: 10, turn: 1 });
  });
});

