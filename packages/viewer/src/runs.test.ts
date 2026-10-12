import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Log, START, fullRun } from "../test-support/events.js";
import { RunsError, baselineOf, listRuns, liveScreenPort, readFrom, runDir } from "./runs.js";

function root(): string {
  return mkdtempSync(join(tmpdir(), "pokebench-viewer-runs-"));
}

function writeRun(runsRoot: string, id: string, log: Log): string {
  const dir = join(runsRoot, id);
  mkdirSync(dir, { recursive: true });
  const lines = log.events.map((event) => JSON.stringify({ ...event, run: id }));
  writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`);
  return join(dir, "events.jsonl");
}

function liveLog(): Log {
  const log = new Log();
  log.add(0, START);
  return log;
}

describe("listRuns", () => {
  it("lists runs newest first with their model and end state", () => {
    const runsRoot = root();
    writeRun(runsRoot, "2026-10-11T22-00-00_a", fullRun());
    writeRun(runsRoot, "2026-10-11T23-00-00_b", liveLog());
    mkdirSync(join(runsRoot, "smoke_no_events"));
    writeFileSync(join(runsRoot, "frames-evictions.jsonl"), "");
    mkdirSync(join(runsRoot, "2026-10-11T21-00-00_bad"));
    writeFileSync(join(runsRoot, "2026-10-11T21-00-00_bad", "events.jsonl"), "{not json\n");
    mkdirSync(join(runsRoot, "2026-10-11T20-00-00_empty"));
    writeFileSync(join(runsRoot, "2026-10-11T20-00-00_empty", "events.jsonl"), "");
    expect(listRuns(runsRoot)).toEqual([
      { id: "2026-10-11T23-00-00_b", model: "think-swarm", started: "2026-10-11T22:00:00.000-04:00", ended: false, reason: null, problem: null },
      { id: "2026-10-11T22-00-00_a", model: "think-swarm", started: "2026-10-11T22:00:00.000-04:00", ended: true, reason: "budget", problem: null },
      { id: "2026-10-11T21-00-00_bad", model: null, started: null, ended: false, reason: null, problem: expect.stringContaining("not JSON") as string },
      { id: "2026-10-11T20-00-00_empty", model: null, started: null, ended: false, reason: null, problem: "no run_start yet" },
    ]);
  });

  it("returns nothing when there is no runs directory", () => {
    expect(listRuns(join(root(), "missing"))).toEqual([]);
  });
});

describe("runDir", () => {
  it("rejects a run id that is not one safe path component", () => {
    expect(() => runDir("/r", "../etc")).toThrow(RunsError);
    expect(() => runDir("/r", "a/b")).toThrow(RunsError);
    expect(runDir("/r", "ok_1")).toBe(join("/r", "ok_1"));
  });
});

describe("readFrom", () => {
  it("reads complete lines from an offset and validates each", () => {
    const runsRoot = root();
    const path = writeRun(runsRoot, "r1", liveLog());
    appendFileSync(path, '{"v":1}\n{"partial":');
    const first = readFrom(path, 0, 0);
    expect(first.results.map((result) => result.ok)).toEqual([true, false]);
    expect(first.results[1]).toMatchObject({ ok: false, line: 2 });
    appendFileSync(path, '"rest"}\n');
    const second = readFrom(path, first.offset, first.lineNo);
    expect(second.results).toHaveLength(1);
    expect(second.results[0]).toMatchObject({ ok: false, line: 3 });
    expect(readFrom(path, second.offset, second.lineNo).results).toEqual([]);
  });

  it("handles multi-byte characters split across reads", () => {
    const runsRoot = root();
    const log = new Log();
    log.add(0, { ...START, system_prompt: "Pokémon ".repeat(3000) });
    const path = writeRun(runsRoot, "r2", log);
    const read = readFrom(path, 0, 0);
    expect(read.results[0]).toMatchObject({ ok: true });
  });

  it("reads nothing from a file that does not exist yet", () => {
    expect(readFrom(join(root(), "nope.jsonl"), 0, 0)).toEqual({ results: [], offset: 0, lineNo: 0 });
  });
});

describe("baselineOf", () => {
  it("returns milestone offsets from the run start", () => {
    const runsRoot = root();
    writeRun(runsRoot, "base", fullRun());
    expect(baselineOf(runsRoot, "base")).toEqual({
      run: "base",
      milestones: [
        { name: "GAME_RUNNING", offsetMs: 10 },
        { name: "PLAYER_NAME_SET", offsetMs: 3100 },
      ],
    });
  });

  it("fails for a run without a readable start", () => {
    const runsRoot = root();
    mkdirSync(join(runsRoot, "x"));
    writeFileSync(join(runsRoot, "x", "events.jsonl"), "");
    expect(() => baselineOf(runsRoot, "x")).toThrow(RunsError);
  });
});

describe("liveScreenPort", () => {
  it("is the run's own game server port only while the run has no run_end", () => {
    const runsRoot = root();
    writeRun(runsRoot, "live", liveLog());
    writeRun(runsRoot, "done", fullRun());
    expect(liveScreenPort(runsRoot, "live")).toBe(8011);
    expect(liveScreenPort(runsRoot, "done")).toBeNull();
    expect(() => liveScreenPort(runsRoot, "missing")).toThrow(RunsError);
  });
});
