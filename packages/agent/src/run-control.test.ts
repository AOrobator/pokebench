import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BudgetTimer, ControlFile, RunControl, controlLine, freezeGame, parseControlRequest, watchControl, type ControlBody } from "./run-control.js";

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

  it("reads only complete new lines, in order, from a file that may not exist yet", () => {
    const dir = mkdtempSync(join(tmpdir(), "control-"));
    const path = join(dir, "control.jsonl");
    const file = new ControlFile(path);
    expect(file.poll()).toEqual([]);
    writeFileSync(path, controlLine(1, "pause", "2026-10-13T15:00:00.000Z") + "\n" + controlLine(2, "resume", "2026-10-13T15:00:01.000Z").slice(0, 10));
    expect(file.poll().map((r) => r.action)).toEqual(["pause"]);
    appendFileSync(path, controlLine(2, "resume", "2026-10-13T15:00:01.000Z").slice(10) + "\nnot json\n" + controlLine(2, "stop", "2026-10-13T15:00:02.000Z") + "\n" + controlLine(3, "stop", "2026-10-13T15:00:03.000Z") + "\n");
    expect(file.poll().map((r) => [r.seq, r.action])).toEqual([[2, "resume"], [3, "stop"]]);
    expect(file.problems).toEqual(["line 3: invalid control request", "line 4: control request 2 is not after 2"]);
    expect(file.poll()).toEqual([]);
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
    const control = new RunControl({ record: (b) => { records.push(b); }, freeze: () => Promise.reject(new Error("down")), end: () => undefined, now: () => 0 });
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
      await Promise.resolve();
      expect(h.control.state).toBe("paused");
      h.advance(60_000); elapsed += 60_000; vi.advanceTimersByTime(60_000);
      expect(expired).not.toHaveBeenCalled();
      h.control.apply(req(2, "resume"));
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

  it("applies requests appended to the control file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "control-"));
    const path = join(dir, "control.jsonl");
    const h = harness();
    const stop = watchControl(new ControlFile(path), h.control, 5);
    try {
      appendFileSync(path, controlLine(1, "stop", "2026-10-13T15:00:00.000Z") + "\n");
      await vi.waitFor(() => { expect(h.control.state).toBe("stop_pending"); });
    } finally { stop(); }
  });
});
