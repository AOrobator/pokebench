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





describe("probe", () => {
  it("validates manual commands and rejects an unrecordable press", () => {
    expect(parseProbeCommand('{"action":"observe"}')).toEqual({ action: "observe" });
    expect(parseProbeCommand('{"action":"end"}')).toEqual({ action: "end" });
    expect(() => parseProbeCommand('{"action":"press","buttons":["WAIT"]}')).toThrow(/probe command/);
    expect(() => parseProbeCommand('{"action":"press","buttons":[]}')).toThrow(/probe command/);
    expect(() => parseProbeCommand('bad JSON')).toThrow();
  });
});
