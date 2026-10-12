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

  it("refuses a baseline with an invalid line or another run's events", () => {
    const runsRoot = root();
    const path = writeRun(runsRoot, "torn", fullRun());
    appendFileSync(path, "{broken\n");
    expect(() => baselineOf(runsRoot, "torn")).toThrow(/line 15/);
    const foreign = fullRun();
    const runsRoot2 = root();
    const dir = join(runsRoot2, "mixed");
    mkdirSync(dir);
    const lines = foreign.events.map((event) => JSON.stringify(event.type === "milestone" ? { ...event, run: "someone-else" } : { ...event, run: "mixed" }));
    writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`);
    expect(() => baselineOf(runsRoot2, "mixed")).toThrow(/someone-else/);
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

it("rejects manual probes and legacy vendor states as benchmark baselines", () => {
  const runsRoot = root();
  const probe = new Log(); probe.add(0, { ...START, harness_features: ["probe"] });
  writeRun(runsRoot, "probe", probe);
  expect(() => baselineOf(runsRoot, "probe")).toThrow(/probe sessions/);
  const legacy = liveLog(); legacy.add(1, { type: "state", turn: 1, mode: "overworld", location: "PETALBURG CITY", position: null, facing: null, in_battle: false, party: [], money: 3000, badges: [], play_time_s: 0 });
  writeRun(runsRoot, "legacy", legacy);
  expect(() => baselineOf(runsRoot, "legacy")).toThrow(/unverified historical/);
});

it("selects previous same-model baseline and deepest then fastest best, from valid completed same-start runs", async () => {
  const { comparisonsOf } = await import("./runs.js");
  const r = root();
  const logged = (offset: number, names: string[], model = "think-swarm", start_state = START.start_state) => {
    const log = new Log();
    log.add(offset, { ...START, harness_features: ["ram-state-v1"], model: { ...START.model, id: model }, start_state });
    log.add(offset + 1, { type: "milestone", turn: 0, name: "GAME_RUNNING", server_timestamp: 1 });
    names.forEach((name, i) => log.add(offset + (i + 1) * 1000, { type: "milestone", turn: 1, name, server_timestamp: 2 }));
    const end = fullRun().events.at(-1);
    if (end?.type !== "run_end") throw new Error("fixture end");
    log.add(offset + 10000, { type: end.type, turn: end.turn, reason: end.reason, furthest_milestone: end.furthest_milestone, turns: end.turns, wall_ms: end.wall_ms, tokens: end.tokens, frames: end.frames });
    return log;
  };
  writeRun(r, "current", logged(50000, ["PLAYER_NAME_SET"]));
  writeRun(r, "previous", logged(30000, ["PLAYER_NAME_SET"]));
  writeRun(r, "deepest", logged(0, ["PLAYER_NAME_SET", "PLAYER_BEDROOM"]));
  writeRun(r, "other-model", logged(40000, ["PLAYER_NAME_SET"], "other"));
  writeRun(r, "wrong-start", logged(45000, ["STONE_BADGE"], "think-swarm", {kind:"save_state",path:"a",sha1:"a".repeat(40)}));
  writeRun(r, "probe", logged(46000, ["STONE_BADGE"]));
  const probePath = join(r, "probe", "events.jsonl");
  const fs = await import("node:fs");
  const probeRows = fs.readFileSync(probePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  const first = probeRows[0];
  if (first === undefined) throw new Error("fixture start");
  first.harness_features = ["probe"];
  fs.writeFileSync(probePath, probeRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  writeRun(r, "live", liveLog());
  const slower = logged(10000, ["PLAYER_NAME_SET", "PLAYER_BEDROOM"]);
  const milestone = slower.events.find((e) => e.type === "milestone" && e.name === "PLAYER_BEDROOM");
  if (milestone === undefined) throw new Error("fixture split");
  const slowerPath = writeRun(r, "slower-deep", slower);
  fs.writeFileSync(slowerPath, fs.readFileSync(slowerPath, "utf8").replace(milestone.t, "2026-10-11T22:00:19.000-04:00"));
  const corruptPath = writeRun(r, "corrupt", logged(47000, ["STONE_BADGE"]));
  appendFileSync(corruptPath, "invalid\n");
  writeRun(r, "unknown", logged(47000, ["SOME_UNVERIFIED_PROGRESS"]));
  const result = comparisonsOf(r, "current");
  expect(result.baseline?.run).toBe("previous");
  expect(result.best?.run).toBe("deepest");
  expect(result.candidates.map((c) => c.run).sort()).toEqual(["deepest", "other-model", "previous", "slower-deep"]);
});


it("rejects progress-only historical logs with no RAM-state provenance", () => {
  const r = root();
  const log = fullRun();
  const statesRemoved = new Log();
  log.events.filter((e) => e.type !== "state").forEach((e) => { statesRemoved.events.push(e); });
  writeRun(r, "unverified", statesRemoved);
  expect(() => baselineOf(r, "unverified")).toThrow(/RAM-state provenance/);
});
