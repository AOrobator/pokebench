import { afterEach, describe, expect, it, vi } from "vitest";
import { Governor } from "./harness.js";
import { BudgetTimer, RunControl, parseControlRequest, type ControlBody } from "./run-control.js";
import type { AssistantMessage } from "@mariozechner/pi-ai";
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(
  calls: string[] = ["press"],
  stopReason: AssistantMessage["stopReason"] = calls.length > 0 ? "toolUse" : "stop",
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "thinking aloud" },
      ...calls.map((name, i) => ({ type: "toolCall" as const, id: `c${String(i)}`, name, arguments: {} })),
    ],
    api: "openai-completions",
    provider: "local-gateway",
    model: "think-swarm",
    usage,
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: 0,
  };
}



const request = (seq: number, action = "extend_30m") => parseControlRequest(JSON.stringify({ v: 1, seq, at: new Date().toISOString(), action }));
afterEach(() => vi.useRealTimers());

describe("finite run extensions through production controls", () => {
  it("rearms the deadline and feeds the same limit to the governor, deduplicating requests", async () => {
    vi.useFakeTimers();
    let now = 0;
    const records: ControlBody[] = [];
    const stop = vi.fn();
    const control = new RunControl({ now: () => now, record: body => records.push(body), freeze: () => Promise.resolve(), end: stop, budget: { maxWallMs: 1000, activeMs: () => now, stopped: () => false } });
    const timer = new BudgetTimer(control, 1000, () => now, stop);
    const governor = new Governor({ limits: { maxTurns: 20000, maxWallMs: 1000, failureLimit: 3 }, now: () => now, abort: stop, retry: vi.fn(), wallLimit: () => control.wallLimit(1000) });
    now = 900;
    control.apply(request(1));
    control.apply(request(1));
    expect(control.wallLimit(1000)).toBe(1801000);
    expect(records.filter(e => e.status === "applied")).toEqual([{ action: "extend_30m", status: "applied", request: 1, previous_max_wall_ms: 1000, max_wall_ms: 1801000 }]);
    now = 1100;
    expect(governor.afterTurn(assistant(), [])).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stop).not.toHaveBeenCalled();
    control.apply(request(2, "extend_60m"));
    expect(control.wallLimit(1000)).toBe(5401000);
    now = 5401000;
    await vi.advanceTimersByTimeAsync(5401000);
    expect(stop).toHaveBeenCalledTimes(1);
    timer.clear();
  });

  it("preserves pauses, does not resurrect a timed-out run and rejects unsupported/terminal controls", async () => {
    let now = 0;
    let stopped = false;
    const records: ControlBody[] = [];
    const control: RunControl = new RunControl({ now: () => now, record: b => records.push(b), freeze: () => Promise.resolve(), end: vi.fn(), budget: { maxWallMs: 1000, activeMs: () => now - control.pausedMs(), stopped: () => stopped } });
    control.apply(request(1, "pause"));
    const held = control.gate();
    await Promise.resolve();
    now = 5000;
    control.apply(request(2));
    expect(control.state).toBe("paused");
    expect(control.pausedMs()).toBe(5000);
    control.apply(request(3, "resume"));
    await held;
    expect(control.state).toBe("running");
    stopped = true;
    control.apply(request(4));
    expect(records.at(-1)?.status).toBe("ignored");
    const unsupported = new RunControl({ now: () => 0, record: b => records.push(b), freeze: () => Promise.resolve(), end: vi.fn() });
    unsupported.apply(request(1));
    expect(records.at(-1)?.status).toBe("ignored");
    stopped = false; now = 1806000;
    control.apply(request(5));
    expect(records.at(-1)?.status).toBe("ignored");
  });

  it("never accepts arbitrary durations or changes the turn cap", () => {
    expect(() => request(1, "extend_indefinitely")).toThrow();
    expect(() => parseControlRequest(JSON.stringify({ ...request(1), minutes: -1 }))).toThrow();
    const governor = new Governor({ limits: { maxTurns: 1, maxWallMs: 1000, failureLimit: 3 }, now: () => 0, abort: vi.fn(), retry: vi.fn(), wallLimit: () => 3601000 });
    expect(governor.afterTurn(assistant(), [])).toBe(true);
    expect(governor.stopReason).toBe("budget");
  });
});
