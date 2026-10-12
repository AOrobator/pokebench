import { describe, expect, it } from "vitest";
import { BASE_MS, Log, START, assistant, fullRun, m4Run, state } from "../test-support/events.js";
import { ASSUMED_TIMING, RunView, foldUntil, isRunEvent } from "./model.js";

function fold(log: Log): RunView {
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  return view;
}

describe("RunView", () => {
  it("folds a complete run into panel data", () => {
    const view = fold(fullRun());
    expect(view.start?.model.id).toBe("think-swarm");
    expect(view.startMs).toBe(BASE_MS);
    expect(view.end?.reason).toBe("budget");
    expect(view.turn).toBe(2);
    expect(view.isThinking).toBe(false);
    expect(view.lastThought).toEqual({ turn: 2, thinking: "Again.", reply: "", latencyMs: 4000 });
    expect(view.frame).toBe("frames/000009_0.png");
    expect(view.tokens).toEqual({ input: 1200, output: 400 });
    expect(view.latencies).toEqual([2000, 4000]);
    expect(view.lastTps).toBe(75);
    expect(view.context).toEqual({ messages: 3, images: 1, est_tokens: 5000 });
    expect(view.disk).toEqual({ bytes: 50 * 1024 * 1024, cap_bytes: 500 * 1024 * 1024, percent: 10 });
    expect(view.retry).toEqual({ count: 1, attempt: 1, limit: 3 });
    expect(view.modelErrors).toBe(0);
    expect(view.toolErrors).toBe(0);
    expect(view.compactions).toBe(0);
    expect(view.milestones).toEqual([
      { name: "GAME_RUNNING", ms: BASE_MS + 10, seq: 1 },
      { name: "PLAYER_NAME_SET", ms: BASE_MS + 3100, seq: 7 },
    ]);
    expect(view.state?.location).toBe("LITTLEROOT TOWN");
    expect(view.presses).toEqual([
      { seq: 6, ms: BASE_MS + 3002, buttons: ["A", "UP"], hold: 10, release: 8, assumed: false },
    ]);
    expect(view.thinkingSpans).toEqual([
      { startMs: BASE_MS + 1000, endMs: BASE_MS + 3000 },
      { startMs: BASE_MS + 4000, endMs: BASE_MS + 8000 },
    ]);
    expect(view.toolSpans).toEqual([{ startMs: BASE_MS + 3001, endMs: BASE_MS + 3200, name: "press", error: false }]);
    expect(view.errors).toEqual([{ ms: BASE_MS + 8001, kind: "retry", label: "retry 1/3: invalid tool arguments" }]);
    expect(view.bySeq(4)?.type).toBe("assistant");
    expect(view.bySeq(99)).toBeUndefined();
    expect(view.lastMs).toBe(BASE_MS + 9000);
  });

  it("assumes the vendor's normal preset for presses logged without timing", () => {
    const log = new Log();
    log.add(0, START);
    log.add(5, { type: "button_press", turn: 0, tool_call_id: "c", buttons: ["B"] });
    expect(fold(log).presses[0]).toMatchObject({ hold: ASSUMED_TIMING.hold_frames, release: ASSUMED_TIMING.release_frames, assumed: true });
  });

  it("is thinking between turn_start and the assistant reply", () => {
    const log = new Log();
    log.add(0, START);
    log.add(100, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    const view = fold(log);
    expect(view.isThinking).toBe(true);
    expect(view.turnStartMs).toBe(BASE_MS + 100);
    expect(view.lastThought).toBeNull();
    expect(view.thinkingSpans).toEqual([{ startMs: BASE_MS + 100, endMs: null }]);
  });

  it("counts presses that leave location and position unchanged as stuck", () => {
    const log = new Log();
    log.add(0, START);
    expect(fold(log).stuck).toBeNull();
    log.add(1, state());
    log.add(2, state());
    log.add(3, state());
    expect(fold(log).stuck).toEqual({ now: 2, max: 2 });
    log.add(4, state({ position: { x: 6, y: 8 } }));
    expect(fold(log).stuck).toEqual({ now: 0, max: 2 });
    log.add(5, state({ position: { x: 6, y: 8 }, location: "ROUTE 101" }));
    expect(fold(log).stuck).toEqual({ now: 0, max: 2 });
  });

  it("tracks model errors, tool errors and compactions as errors-lane marks", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, assistant({ stop_reason: "error", error: "HTTP 500", tool_calls: [], latency_ms: 0 }));
    log.add(2, { type: "tool_call", turn: 1, id: "c9", name: "state", args: {} });
    log.add(3, { type: "tool_result", turn: 1, id: "c9", name: "state", is_error: true, duration_ms: 1, text: "malformed", frames: [] });
    log.add(4, { type: "compaction", turn: 1, from_tokens: 9000, to_tokens: 1000 });
    const view = fold(log);
    expect(view.modelErrors).toBe(1);
    expect(view.toolErrors).toBe(1);
    expect(view.compactions).toBe(1);
    expect(view.lastTps).toBeNull();
    expect(view.context).toBeNull();
    expect(view.errors.map((mark) => mark.kind)).toEqual(["model", "tool", "compaction"]);
    expect(view.errors.map((mark) => mark.label)).toEqual([
      "model error: HTTP 500",
      "state failed: malformed",
      "compacted 9,000 → 1,000",
    ]);
    expect(view.toolSpans).toEqual([{ startMs: BASE_MS + 2, endMs: BASE_MS + 3, name: "state", error: true }]);
  });

  it("marks telemetry failures in the errors lane", () => {
    const log = new Log();
    log.add(0, START);
    log.add(7, { type: "telemetry_error", turn: 1, source: "state", message: "HTTP 503" });
    expect(fold(log).errors).toEqual([{ ms: BASE_MS + 7, kind: "telemetry", label: "state read failed: HTTP 503" }]);
  });

  it("labels a model error without a message", () => {
    const log = new Log();
    log.add(0, START);
    log.add(1, assistant({ stop_reason: "error", tool_calls: [] }));
    expect(fold(log).errors[0]?.label).toBe("model error: unknown");
  });

  it("closes open thinking and tool spans when the run ends mid-turn", () => {
    const log = new Log();
    log.add(0, START);
    log.add(100, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(200, { type: "tool_call", turn: 1, id: "c1", name: "press", args: {} });
    log.add(900, { type: "run_end", turn: 1, reason: "crash", furthest_milestone: null, turns: 1, wall_ms: 900, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    const view = fold(log);
    expect(view.isThinking).toBe(false);
    expect(view.thinkingSpans).toEqual([{ startMs: BASE_MS + 100, endMs: BASE_MS + 900 }]);
    expect(view.toolSpans).toEqual([{ startMs: BASE_MS + 200, endMs: BASE_MS + 900, name: "press", error: false }]);
  });

  it("ignores an event it has already applied", () => {
    const log = fullRun();
    const view = fold(log);
    const first = log.events[0];
    if (first === undefined) throw new Error("no events");
    view.apply(first);
    expect(view.events).toHaveLength(log.events.length);
  });

  it("folds only the events at or before a moment", () => {
    const events = fullRun().events;
    const view = foldUntil(events, BASE_MS + 3001);
    expect(view.events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(foldUntil(events, BASE_MS - 1).events).toEqual([]);
  });

  it("replays the recorded M4 run", () => {
    const view = new RunView();
    for (const event of m4Run()) view.apply(event);
    expect(view.turn).toBe(4);
    expect(view.frame).toBe("frames/000015_0.png");
    expect(view.state).toBeNull();
    expect(view.stuck).toBeNull();
    expect(view.end?.reason).toBe("budget");
    expect(view.milestones.map((milestone) => milestone.name)).toEqual(["GAME_RUNNING"]);
    expect(view.presses).toHaveLength(1);
    expect(view.presses[0]?.assumed).toBe(true);
    expect(view.toolSpans.map((span) => span.name)).toEqual(["screenshot", "press", "state"]);
  });
});

describe("isRunEvent", () => {
  it("accepts an enveloped event and rejects anything else", () => {
    const [first] = fullRun().events;
    expect(isRunEvent(first)).toBe(true);
    expect(isRunEvent({ ...first, type: "telemetry" })).toBe(false);
    expect(isRunEvent({ ...first, type: "assistant_delta", thinking: "Look", text: "" })).toBe(true);
    expect(isRunEvent({ ...first, seq: "1" })).toBe(false);
    expect(isRunEvent(null)).toBe(false);
    expect(isRunEvent([])).toBe(false);
  });
});
