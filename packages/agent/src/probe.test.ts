import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IN_GAME, RUN_START_META } from "../test-support/events.js";
import { FrameStore } from "./frames.js";
import { RunRecorder } from "./recorder.js";
import { RunLog } from "./run-log.js";
import { driveProbe, parseProbeCommand, type ProbeCommand } from "./probe.js";
import { readRun, summarize, summaryLines } from "./summary.js";

async function* commands(...items: ProbeCommand[]): AsyncGenerator<ProbeCommand> { await Promise.resolve(); yield* items; }

function png(): string {
  const b = Buffer.alloc(33); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.write("IHDR", 12); b.writeUInt32BE(240, 16); b.writeUInt32BE(160, 20); return b.toString("base64");
}

function backend(fail = false): typeof fetch {
  return (input) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body: unknown = u.pathname === "/pokebench/observation"
      ? { state_text: "Field controls: locked", screenshot_base64: png(), state: IN_GAME }
      : u.pathname === "/queue_status" ? { queue_empty: true } : { status: "success" };
    return Promise.resolve(new Response(JSON.stringify(body), { status: fail ? 503 : 200 }));
  };
}

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "pokebench-probe-"));
  const log = RunLog.create(root, "test-probe");
  const recorder = new RunRecorder({ log, frames: new FrameStore(root), milestones: { poll: () => Promise.resolve([]) }, gameState: { read: () => Promise.resolve({ ...IN_GAME, field_controls_locked: true }) } });
  await recorder.start({ ...RUN_START_META, harness_features: ["probe"] });
  return { root, log, recorder };
}

describe("probe", () => {
  it("validates manual commands and rejects an unrecordable press", () => {
    expect(parseProbeCommand('{"action":"observe"}')).toEqual({ action: "observe" });
    expect(parseProbeCommand('{"action":"end"}')).toEqual({ action: "end" });
    expect(() => parseProbeCommand('{"action":"press","buttons":["WAIT"]}')).toThrow(/probe command/);
    expect(() => parseProbeCommand('{"action":"press","buttons":[]}')).toThrow(/probe command/);
    expect(() => parseProbeCommand('bad JSON')).toThrow();
  });
  it("records valid frames, exact press timing and authoritative state and excludes probes from benchmarks", async () => {
    const { root, log, recorder } = await setup();
    try {
      const reason = await driveProbe(recorder, "http://127.0.0.1:8032", commands({ action: "press", buttons: ["UP"] }, { action: "observe" }, { action: "end" }), backend());
      recorder.end(reason);
      const events = readRun(log.runDir);
      const presses = events.filter((e) => e.type === "button_press");
      expect(presses).toHaveLength(1);
      expect(presses[0]).toMatchObject({ buttons: ["UP"], hold_frames: 10, release_frames: 8 });
      expect(events.filter((e) => e.type === "state")).toHaveLength(3);
      expect(events.filter((e) => e.type === "state")).toEqual(expect.arrayContaining([expect.objectContaining({ field_controls_locked: true })]));
      expect(events.filter((e) => e.type === "tool_result").flatMap((e) => e.frames)).toHaveLength(3);
      const summary = summarize(events);
      expect(summary.probe).toBe(true);
      expect(summaryLines([summary])).toContain("0 runs: 0 incomplete");
      expect(summaryLines([summary])).toContain("1 probe sessions excluded from benchmark results");
    } finally { rmSync(root, { recursive: true }); }
  });
  it("records failed observations and propagates the failure", async () => {
    const { root, log, recorder } = await setup();
    try {
      await expect(driveProbe(recorder, "http://127.0.0.1:8032", commands(), backend(true))).rejects.toThrow(/503/);
      expect(readRun(log.runDir).at(-1)).toMatchObject({ type: "tool_result", is_error: true });
    } finally { rmSync(root, { recursive: true }); }
  });
  it("ends an exhausted command stream as an operator abort", async () => {
    const { root, recorder } = await setup();
    try { expect(await driveProbe(recorder, "http://127.0.0.1:8032", commands(), backend())).toBe("operator_abort"); }
    finally { rmSync(root, { recursive: true }); }
  });
});
