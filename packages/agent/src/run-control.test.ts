import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkEvent, type RunEvent } from "./events.js";
import { BudgetTimer, STALL_STOP_MS, StallStop, ControlFile, RunControl, controlLine, freezeGame, parseControlRequest, watchControl, type ControlBody } from "./run-control.js";

function harness(start = 1_000) {
  let now = start;
  const records: ControlBody[] = [];
  const frozen: boolean[] = [];
  const ended: string[] = [];
  const control = new RunControl({
    record: (body) => { records.push(body); },
    freeze: (paused) => { frozen.push(paused); return Promise.resolve(); },
    end: (reason) => { ended.push(reason); },
    now: () => now,
  });
  return { control, records, frozen, ended, advance: (ms: number) => { now += ms; } };
}
const req = (seq: number, action: Parameters<typeof controlLine>[1]) => parseControlRequest(controlLine(seq, action, "2026-10-13T15:00:00.000Z"));

describe("control requests", () => {
  it("round-trips a typed line and rejects anything else", () => {
    expect(req(3, "pause")).toEqual({ v: 1, seq: 3, at: "2026-10-13T15:00:00.000Z", action: "pause" });
    for (const bad of ["", "{}", '{"v":1,"seq":0,"at":"x","action":"pause"}', '{"v":1,"seq":1,"at":"2026-10-13T15:00:00.000Z","action":"explode"}', '{"v":1,"seq":1,"at":"2026-10-13T15:00:00.000Z","action":"pause","extra":1}', "not json"])
      expect(() => parseControlRequest(bad)).toThrow(/control request/);
  });
});

describe("pause", () => {
  it("holds the next model call until resume, freezes the emulator and excludes the gap", async () => {
    const h = harness();
    h.control.apply(req(1, "pause"));
    expect(h.records).toEqual([{ action: "pause", status: "pending", request: 1 }]);
    expect(h.control.state).toBe("pause_pending");
    let released = false;
    const gate = h.control.gate().then(() => { released = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(released).toBe(false);
    expect(h.frozen).toEqual([true]);
    expect(h.control.state).toBe("paused");
    expect(h.records.at(-1)).toEqual({ action: "pause", status: "applied", request: 1, emulator_frozen: true });
    h.advance(5_000);
    expect(h.control.pausedMs()).toBe(5_000);
    h.control.apply(req(2, "resume"));
    await gate;
    expect(released).toBe(true);
    expect(h.frozen).toEqual([true, false]);
    expect(h.records.at(-1)).toEqual({ action: "resume", status: "applied", request: 2, paused_ms: 5_000 });
    h.advance(1_000);
    expect(h.control.pausedMs()).toBe(5_000);
    expect(h.control.state).toBe("running");
  });

  it("does not hold a model call when resume arrives before the turn ends", async () => {
    const h = harness();
    h.control.apply(req(1, "pause"));
    h.control.apply(req(2, "resume"));
    await h.control.gate();
    expect(h.frozen).toEqual([]);
    expect(h.records.map((r) => [r.action, r.status])).toEqual([["pause", "pending"], ["resume", "applied"]]);
  });

  it("records a pause whose emulator freeze failed instead of pretending", async () => {
    const records: ControlBody[] = [];
    const control = new RunControl({ record: (b) => { records.push(b); }, freeze: (paused) => paused ? Promise.reject(new Error("down")) : Promise.resolve(), end: () => undefined, now: () => 0 });
    control.apply(req(1, "pause"));
    const gate = control.gate();
    await vi.waitFor(() => { expect(records.at(-1)).toEqual({ action: "pause", status: "applied", request: 1, emulator_frozen: false }); });
    control.apply(req(2, "resume"));
    await gate;
  });

  it("ignores requests that do not apply to the current state", () => {
    const h = harness();
    h.control.apply(req(1, "resume"));
    h.control.apply(req(2, "cancel_stop"));
    h.control.apply(req(3, "pause"));
    h.control.apply(req(4, "pause"));
    expect(h.records.map((r) => [r.action, r.status])).toEqual([["resume", "ignored"], ["cancel_stop", "ignored"], ["pause", "pending"], ["pause", "ignored"]]);
  });
});

describe("stop and abort", () => {
  it("stops after the current turn, and can be cancelled before then", () => {
    const h = harness();
    h.control.apply(req(1, "stop"));
    expect(h.control.state).toBe("stop_pending");
    h.control.apply(req(2, "cancel_stop"));
    expect(h.control.takeStop()).toBe(false);
    h.control.apply(req(3, "stop"));
    expect(h.control.takeStop()).toBe(true);
    expect(h.control.takeStop()).toBe(true);
    expect(h.records.map((r) => [r.action, r.status])).toEqual([["stop", "pending"], ["cancel_stop", "applied"], ["stop", "pending"], ["stop", "applied"]]);
    h.control.apply(req(4, "cancel_stop"));
    expect(h.records.at(-1)).toEqual({ action: "cancel_stop", status: "ignored", request: 4 });
    expect(h.ended).toEqual([]);
  });

  it("ends a paused run at once with operator_stop and releases the gate", async () => {
    const h = harness();
    h.control.apply(req(1, "pause"));
    const gate = h.control.gate();
    await vi.waitFor(() => { expect(h.control.state).toBe("paused"); });
    h.advance(2_000);
    h.control.apply(req(2, "stop"));
    await gate;
    expect(h.ended).toEqual(["operator_stop"]);
    expect(h.records.at(-1)).toEqual({ action: "stop", status: "applied", request: 2, paused_ms: 2_000 });
    expect(h.control.pausedMs()).toBe(2_000);
  });

  it("aborts immediately in any state", async () => {
    const h = harness();
    h.control.apply(req(1, "pause"));
    const gate = h.control.gate();
    await vi.waitFor(() => { expect(h.control.state).toBe("paused"); });
    h.control.apply(req(2, "abort"));
    await gate;
    expect(h.ended).toEqual(["operator_abort"]);
    expect(h.records.at(-1)).toEqual({ action: "abort", status: "applied", request: 2, paused_ms: 0 });
    h.control.apply(req(3, "pause"));
    expect(h.records.at(-1)).toEqual({ action: "pause", status: "ignored", request: 3 });
  });
});

describe("budget timer", () => {
  it("fires only after the active (unpaused) budget is spent", async () => {
    vi.useFakeTimers({ now: 0 });
    try {
      let elapsed = 0;
      const h = harness(0);
      const expired = vi.fn();
      const timer = new BudgetTimer(h.control, 10_000, () => elapsed, expired);
      vi.advanceTimersByTime(4_000); elapsed = 4_000;
      h.control.apply(req(1, "pause"));
      void h.control.gate();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(h.control.holding).toBe(true);
      h.advance(60_000); elapsed += 60_000; vi.advanceTimersByTime(60_000);
      expect(expired).not.toHaveBeenCalled();
      h.control.apply(req(2, "resume"));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(h.control.state).toBe("running");
      vi.advanceTimersByTime(5_999); elapsed += 5_999;
      expect(expired).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(expired).toHaveBeenCalledOnce();
      timer.clear();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("game server and control file wiring", () => {
  it("posts the pause state and requires the server to confirm it", async () => {
    const calls: [string, string][] = [];
    const ok: typeof fetch = (input, init) => { const body = typeof init?.body === "string" ? init.body : ""; calls.push([typeof input === "string" ? input : "", body]); return Promise.resolve(new Response(body)); };
    await freezeGame("http://127.0.0.1:8070", true, ok);
    expect(calls).toEqual([["http://127.0.0.1:8070/pokebench/pause", '{"paused":true}']]);
    await expect(freezeGame("http://127.0.0.1:8070", false, () => Promise.resolve(new Response('{"paused":true}')))).rejects.toThrow(/did not confirm paused=false/);
    await expect(freezeGame("http://127.0.0.1:8070", true, () => Promise.resolve(new Response("no", { status: 404 })))).rejects.toThrow(/HTTP 404/);
  });
});

describe("review round 1 behaviours", () => {
  it("turns a stop during a pending pause into a stop at the end of this turn", async () => {
    const h = harness();
    h.control.apply(req(1, "pause"));
    h.control.apply(req(2, "stop"));
    expect(h.control.state).toBe("stop_pending");
    await h.control.gate();
    expect(h.frozen).toEqual([]);
    expect(h.control.takeStop()).toBe(true);
    expect(h.records.map((r) => [r.action, r.status])).toEqual([["pause", "pending"], ["stop", "pending"], ["stop", "applied"]]);
  });

  it("keeps the run paused and records a failed resume when the emulator does not unfreeze", async () => {
    const records: ControlBody[] = [];
    let unfreeze = false;
    const control = new RunControl({ record: (b) => { records.push(b); }, freeze: (paused) => paused || unfreeze ? Promise.resolve() : Promise.reject(new Error("down")), end: () => undefined, now: () => 0 });
    control.apply(req(1, "pause"));
    let released = false;
    const gate = control.gate().then(() => { released = true; });
    await vi.waitFor(() => { expect(control.holding).toBe(true); });
    control.apply(req(2, "resume"));
    await vi.waitFor(() => { expect(records.at(-1)).toEqual({ action: "resume", status: "failed", request: 2, emulator_frozen: true }); });
    expect(released).toBe(false);
    expect(control.state).toBe("paused");
    unfreeze = true;
    control.apply(req(3, "resume"));
    await gate;
    expect(records.at(-1)).toMatchObject({ action: "resume", status: "applied", request: 3 });
  });

  it("ignores a second resume while the first is still unfreezing", async () => {
    const h = harness();
    h.control.apply(req(1, "pause"));
    const gate = h.control.gate();
    await vi.waitFor(() => { expect(h.control.holding).toBe(true); });
    h.control.apply(req(2, "resume"));
    h.control.apply(req(3, "resume"));
    await gate;
    expect(h.records.filter((r) => r.action === "resume").map((r) => [r.request, r.status])).toEqual([[3, "ignored"], [2, "applied"]]);
  });

  it("starts counting paused time once the emulator freeze has been answered", async () => {
    let now = 0;
    let answer: () => void = () => undefined;
    const records: ControlBody[] = [];
    const control = new RunControl({ record: (b) => { records.push(b); }, freeze: (paused) => paused ? new Promise((resolve) => { answer = resolve; }) : Promise.resolve(), end: () => undefined, now: () => now });
    control.apply(req(1, "pause"));
    const gate = control.gate();
    now = 5_000;
    expect(control.pausedMs()).toBe(0);
    answer();
    await vi.waitFor(() => { expect(control.holding).toBe(true); });
    now = 8_000;
    control.apply(req(2, "resume"));
    await gate;
    expect(records.at(-1)).toEqual({ action: "resume", status: "applied", request: 2, paused_ms: 3_000 });
  });

  it("is released by the run's abort signal while paused", async () => {
    const h = harness();
    const controller = new AbortController();
    h.control.apply(req(1, "pause"));
    const gate = h.control.gate(controller.signal);
    await vi.waitFor(() => { expect(h.control.holding).toBe(true); });
    h.advance(1_000);
    controller.abort();
    await gate;
    expect(h.control.state).toBe("ended");
    expect(h.control.pausedMs()).toBe(1_000);
    const late = harness();
    late.control.apply(req(1, "pause"));
    const aborted = new AbortController(); aborted.abort();
    await late.control.gate(aborted.signal);
    expect(late.records.map((r) => r.status)).toEqual(["pending"]);
  });

  it("records no paused time for an abort or stop that was never paused", () => {
    const h = harness();
    h.control.apply(req(1, "abort"));
    expect(h.records).toEqual([{ action: "abort", status: "applied", request: 1 }]);
  });
});


describe("review round 2 behaviours", () => {
  it("applies a resume that arrives while the freeze is still in flight once the freeze is answered", async () => {
    let answer: () => void = () => undefined;
    const frozen: boolean[] = [];
    const records: ControlBody[] = [];
    const control = new RunControl({ record: (b) => { records.push(b); }, freeze: (paused) => { frozen.push(paused); return paused ? new Promise((resolve) => { answer = resolve; }) : Promise.resolve(); }, end: () => undefined, now: () => 0 });
    control.apply(req(1, "pause"));
    const gate = control.gate();
    control.apply(req(2, "resume"));
    control.apply(req(3, "resume"));
    expect(frozen).toEqual([true]);
    answer();
    await gate;
    expect(frozen).toEqual([true, false]);
    expect(control.state).toBe("running");
    expect(records.map((r) => [r.action, r.status, r.request])).toEqual([["pause", "pending", 1], ["resume", "ignored", 3], ["pause", "applied", 1], ["resume", "applied", 2]]);
  });

  it("detaches from the run's abort signal once a pause is released", async () => {
    const h = harness();
    const controller = new AbortController();
    h.control.apply(req(1, "pause"));
    const gate = h.control.gate(controller.signal);
    await vi.waitFor(() => { expect(h.control.holding).toBe(true); });
    h.control.apply(req(2, "resume"));
    await gate;
    controller.abort();
    expect(h.control.state).toBe("running");
  });

  it("ends, rather than stays paused, when the run is aborted during the freeze", async () => {
    const controller = new AbortController();
    const control = new RunControl({ record: () => undefined, freeze: () => { controller.abort(); return Promise.resolve(); }, end: () => undefined, now: () => 0 });
    control.apply(req(1, "pause"));
    await control.gate(controller.signal);
    expect(control.state).toBe("ended");
  });
});

describe("review round 3 behaviours", () => {
  it("records a resume held during the freeze as ignored when the run ends first", async () => {
    let answer: () => void = () => undefined;
    const records: ControlBody[] = [];
    const control = new RunControl({ record: (b) => { records.push(b); }, freeze: (paused) => paused ? new Promise((resolve) => { answer = resolve; }) : Promise.resolve(), end: () => undefined, now: () => 0 });
    control.apply(req(1, "pause"));
    const gate = control.gate();
    control.apply(req(2, "resume"));
    control.apply(req(3, "stop"));
    answer();
    await gate;
    expect(records.map((r) => [r.action, r.status, r.request])).toEqual([["pause", "pending", 1], ["resume", "ignored", 2], ["stop", "applied", 3]]);
    const aborted = new AbortController();
    const signalled: ControlBody[] = [];
    const other = new RunControl({ record: (b) => { signalled.push(b); }, freeze: () => { aborted.abort(); return Promise.resolve(); }, end: () => undefined, now: () => 0 });
    other.apply(req(1, "pause"));
    const held = other.gate(aborted.signal);
    other.apply(req(2, "resume"));
    await held;
    expect(signalled.map((r) => [r.action, r.status, r.request])).toEqual([["pause", "pending", 1], ["resume", "ignored", 2]]);
  });
});

describe("milestone stall stop", () => {
  const milestone = (seq: number, name: string, origin?: "observed" | "present_at_start"): RunEvent =>
    checkEvent({ v: 1, run: "r", t: "2026-10-15T12:00:00.000-04:00", turn: 1, seq, type: "milestone", name, server_timestamp: 0, ...(origin === undefined ? {} : { origin }) });
  function clocked() {
    vi.useFakeTimers();
    let elapsed = 0;
    const h = harness(0);
    const expired = vi.fn();
    const step = (ms: number): void => { h.advance(ms); elapsed += ms; vi.advanceTimersByTime(ms); };
    return { h, expired, step, stop: new StallStop(h.control, STALL_STOP_MS, () => elapsed, expired) };
  }

  it("is ten minutes", () => { expect(STALL_STOP_MS).toBe(600_000); });

  it("expires after ten minutes from run start with no milestone", () => {
    try {
      const { expired, step, stop } = clocked();
      step(STALL_STOP_MS - 1);
      expect(expired).not.toHaveBeenCalled();
      step(1);
      expect(expired).toHaveBeenCalledOnce();
      stop.clear();
    } finally { vi.useRealTimers(); }
  });

  it("restarts the ten minutes at each newly observed milestone, legacy events without an origin included", () => {
    try {
      const { expired, step, stop } = clocked();
      step(9 * 60_000);
      stop.observe(milestone(1, "NEW_GAME_CREATED", "observed"));
      step(STALL_STOP_MS - 1);
      expect(expired).not.toHaveBeenCalled();
      stop.observe(milestone(2, "PLAYER_NAME_CONFIRMED"));
      step(STALL_STOP_MS - 1);
      expect(expired).not.toHaveBeenCalled();
      step(1);
      expect(expired).toHaveBeenCalledOnce();
      stop.clear();
    } finally { vi.useRealTimers(); }
  });

  it("ignores milestones present at start and events that are not milestones", () => {
    try {
      const { expired, step, stop } = clocked();
      step(5 * 60_000);
      stop.observe(milestone(1, "LITTLEROOT_TOWN", "present_at_start"));
      stop.observe(checkEvent({ v: 1, run: "r", t: "2026-10-15T12:00:00.000-04:00", turn: 1, seq: 2, type: "turn_start", context: { messages: 1, images: 0, est_tokens: 10 } }));
      step(5 * 60_000);
      expect(expired).toHaveBeenCalledOnce();
      stop.clear();
    } finally { vi.useRealTimers(); }
  });

  it("does not restart the clock for a measurement-only split", () => {
    try {
      const { expired, step, stop } = clocked();
      step(5 * 60_000);
      stop.observe(milestone(1, "ROUTE_101_AFTER_HANDOFF", "observed"));
      step(5 * 60_000);
      expect(expired).toHaveBeenCalledOnce();
      stop.clear();
    } finally { vi.useRealTimers(); }
  });

  it("excludes operator pauses, like the wall budget", async () => {
    try {
      const { h, expired, step, stop } = clocked();
      step(4 * 60_000);
      h.control.apply(req(1, "pause"));
      void h.control.gate();
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(h.control.holding).toBe(true);
      step(60 * 60_000);
      expect(expired).not.toHaveBeenCalled();
      h.control.apply(req(2, "resume"));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(h.control.state).toBe("running");
      step(6 * 60_000 - 1);
      expect(expired).not.toHaveBeenCalled();
      step(1);
      expect(expired).toHaveBeenCalledOnce();
      stop.clear();
    } finally { vi.useRealTimers(); }
  });

  it("does not repeat an expired notice on pause/resume and re-arms only on progress", async () => {
    try {
      const { h, expired, step, stop } = clocked();
      step(STALL_STOP_MS);expect(expired).toHaveBeenCalledOnce();
      h.control.apply(req(1,"pause"));void h.control.gate();
      for(let i=0;i<5;i++)await Promise.resolve();
      step(STALL_STOP_MS);h.control.apply(req(2,"resume"));
      for(let i=0;i<5;i++)await Promise.resolve();
      step(STALL_STOP_MS);expect(expired).toHaveBeenCalledOnce();
      stop.observe(milestone(1,"NEW_GAME_CREATED","observed"));
      step(STALL_STOP_MS);expect(expired).toHaveBeenCalledTimes(2);stop.clear();
    } finally { vi.useRealTimers(); }
  });

  it("never fires once cleared, even if a milestone arrives afterwards", () => {
    try {
      const { expired, step, stop } = clocked();
      step(60_000);
      stop.clear();
      stop.observe(milestone(1, "NEW_GAME_CREATED", "observed"));
      step(2 * STALL_STOP_MS);
      expect(expired).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("does not arm once the run has ended", () => {
    try {
      const { h, expired, step, stop } = clocked();
      h.control.apply(req(1, "abort"));
      stop.observe(milestone(1, "NEW_GAME_CREATED", "observed"));
      step(2 * STALL_STOP_MS);
      expect(expired).not.toHaveBeenCalled();
      stop.clear();
    } finally { vi.useRealTimers(); }
  });
});
