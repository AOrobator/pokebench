import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_START, SAMPLES } from "../test-support/events.js";
import { parseEvent } from "./events.js";
import { RunLog, RunLogError, easternTimestamp } from "./run-log.js";

function root(): string {
  return mkdtempSync(join(tmpdir(), "pokebench-runs-"));
}

const FIXED = (): Date => new Date("2026-10-12T01:40:05.123Z");

function lines(log: RunLog): unknown[] {
  return readFileSync(log.eventsPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => parseEvent(line));
}

describe("easternTimestamp", () => {
  it("formats daylight time with a -04:00 offset", () => {
    expect(easternTimestamp(new Date("2026-10-12T01:40:05.123Z"))).toBe("2026-10-11T21:40:05.123-04:00");
  });

  it("formats standard time with a -05:00 offset", () => {
    expect(easternTimestamp(new Date("2026-12-01T17:00:00.007Z"))).toBe("2026-12-01T12:00:00.007-05:00");
  });
});

describe("RunLog", () => {
  it("creates runs/<id>/events.jsonl and appends gap-free, validated events", () => {
    const runsRoot = root();
    const log = RunLog.create(runsRoot, "2026-10-11T21-40-05_think-swarm_a1b2", FIXED);
    expect(log.runDir).toBe(join(runsRoot, "2026-10-11T21-40-05_think-swarm_a1b2"));
    const first = log.append(RUN_START);
    const second = log.append(SAMPLES[1]!);
    expect(first).toMatchObject({ v: 1, seq: 0, t: "2026-10-11T21:40:05.123-04:00", type: "run_start" });
    expect(second.seq).toBe(1);
    expect(lines(log)).toEqual([first, second]);
    expect(log.nextSeq).toBe(2);
  });

  it("is on disk as soon as append returns", () => {
    const log = RunLog.create(root(), "r1", FIXED);
    log.append(RUN_START);
    expect(readFileSync(log.eventsPath, "utf8")).toContain('"type":"run_start"');
  });

  it("never reuses a run directory", () => {
    const runsRoot = root();
    RunLog.create(runsRoot, "r1", FIXED);
    expect(() => RunLog.create(runsRoot, "r1", FIXED)).toThrow(/already exists/);
  });

  it.each(["", "../x", "a/b", ".hidden", "with space"])("rejects run id %j", (runId) => {
    expect(() => RunLog.create(root(), runId, FIXED)).toThrow(RunLogError);
  });

  it("requires run_start first", () => {
    const log = RunLog.create(root(), "r1", FIXED);
    expect(() => log.append(SAMPLES[1]!)).toThrow(/run_start/);
  });

  it("allows only one run_start", () => {
    const log = RunLog.create(root(), "r1", FIXED);
    log.append(RUN_START);
    expect(() => log.append(RUN_START)).toThrow(/run_start/);
  });

  it("rejects an invalid event without consuming a seq or writing", () => {
    const log = RunLog.create(root(), "r1", FIXED);
    log.append(RUN_START);
    const bad = { ...SAMPLES[4]!, buttons: ["NOPE"] } as unknown as typeof RUN_START;
    expect(() => log.append(bad)).toThrow(RunLogError);
    expect(log.nextSeq).toBe(1);
    expect(lines(log)).toHaveLength(1);
  });

  it("closes after run_end", () => {
    const log = RunLog.create(root(), "r1", FIXED);
    log.append(RUN_START);
    log.append(SAMPLES[10]!);
    expect(log.ended).toBe(true);
    expect(() => log.append(SAMPLES[1]!)).toThrow(/ended/);
  });
});
