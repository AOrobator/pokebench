import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionHash, parseExperiment, type ReadinessRun } from "@pokebench/agent/experiments";
import { playHarnessFeatures } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { experimentDir, parseReadinessDoc, pidAlive, queueSnapshot, readRunner, recordedRuns, runnerPath, type RunSource, type TrialMetrics } from "./experiment-store.js";

const READINESS = `# Experiment readiness

| Patch | Activation milestone | Verdict | Evidence (checked) |
|---|---|---|---|
| \`full-map-navigation-v1\` | \`FIRST_TRUCK_EXIT\` | READY | 4 of 4 |
| \`counter-talk-v1\` | \`OLDALE_TOWN\` (first Pokémon Center) | BLOCKED: models do not yet reach Oldale | 0 of 124 |
| not a row |
`;

function roots(): { experimentsDir: string; runsRoot: string; readinessPath: string } {
  const root = mkdtempSync(join(tmpdir(), "pokebench-queue-"));
  const paths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "readiness.md") };
  mkdirSync(paths.runsRoot, { recursive: true });
  return paths;
}
const reachedRun = (id: string): ReadinessRun => ({ id, model: "think-fast", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT"] });
const fake = (metrics: Record<string, TrialMetrics>, recent: ReadinessRun[] = ["r1", "r2", "r3", "r4"].map(reachedRun)): RunSource => ({ recent: () => recent, trial: (id) => metrics[id] ?? null });
const reached = (turns: number, ms: number): TrialMetrics => ({ reached: ["FIRST_TRUCK_EXIT", "RIVAL_HOUSE_ENTERED"], milestoneMs: { RIVAL_HOUSE_ENTERED: ms }, turns, wallMs: ms + 1000 });
const missed = (turns: number): TrialMetrics => ({ reached: ["FIRST_TRUCK_EXIT"], milestoneMs: {}, turns, wallMs: 1_800_000 });

describe("experiment queue store", () => {
  it("parses the readiness table by switch id", () => {
    const rows = parseReadinessDoc(READINESS);
    expect([...rows.keys()]).toEqual(["full-map-navigation-v1", "counter-talk-v1"]);
    expect(rows.get("counter-talk-v1")).toEqual({ verdict: "BLOCKED: models do not yet reach Oldale", evidence: "0 of 124" });
  });

  it("reads the runner position only while its process is alive", () => {
    const { runsRoot } = roots();
    expect(readRunner(runsRoot)).toBeNull();
    mkdirSync(join(runsRoot, "experiments"), { recursive: true });
    writeFileSync(runnerPath(runsRoot), "{");
    expect(readRunner(runsRoot)).toBeNull();
    writeFileSync(runnerPath(runsRoot), JSON.stringify({ pid: 0, experiment: "x", trial: 0 }));
    expect(readRunner(runsRoot, () => true)).toBeNull();
    writeFileSync(runnerPath(runsRoot), JSON.stringify({ pid: 42, experiment: "x", trial: 2 }));
    expect(readRunner(runsRoot, () => false)).toBeNull();
    expect(readRunner(runsRoot, () => true)).toEqual({ experiment: "x", trial: 2 });
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(2 ** 22 + 7)).toBe(false);
  });

  it("splits queued from pending entries, folds trials and reports bad records", () => {
    const paths = roots();
    writeDefinition(paths.experimentsDir, definition("full-map"));
    writeDefinition(paths.experimentsDir, definition("second", { queuePosition: 1 }));
    writeDefinition(paths.experimentsDir, definition("counter", { changedFeature: "counter-talk-v1", activationMilestone: "OLDALE_TOWN", primaryMilestone: "ROUTE_103", queuePosition: undefined }));
    writeDefinition(paths.experimentsDir, definition("misnamed"), "wrong.json");
    writeDefinition(paths.experimentsDir, definition("dropped", { queuePosition: undefined, discarded: "no longer needed" }));
    writeDefinition(paths.experimentsDir, definition("halted", { queuePosition: undefined, blocked: "needs a fix" }));
    writeDefinition(paths.experimentsDir, definition("joins", { queuePosition: undefined, changedFeature: "one-way-tiles-v1" }));
    writeDefinition(paths.experimentsDir, definition("partial", { queuePosition: 7 }));
    mkdirSync(experimentDir(paths.runsRoot, "partial"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "partial"), "result.json"), JSON.stringify({ experiment: "partial", result: {} }));
    writeFileSync(join(experimentDir(paths.runsRoot, "partial"), "approval.json"), JSON.stringify({ experiment: "partial", sha256: definitionHash(parseExperiment(definition("partial", { queuePosition: 7 }))), approvedAt: "t", approvedBy: "o" }));
    writeFileSync(join(experimentDir(paths.runsRoot, "partial"), "trials.jsonl"), Array.from({ length: 8 }, (_, i) => [JSON.stringify({ type: "launch", trial: i, arm: i % 4 === 0 || i % 4 === 3 ? "incumbent" : "candidate", run: `p${String(i)}`, at: "t" }), JSON.stringify({ type: "outcome", trial: i, arm: i % 4 === 0 || i % 4 === 3 ? "incumbent" : "candidate", run: `p${String(i)}`, at: "t", reason: "budget" })].join("\n")).join("\n"));
    writeDefinition(paths.experimentsDir, definition("finished", { queuePosition: 9 }));
    mkdirSync(experimentDir(paths.runsRoot, "finished"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "finished"), "result.json"), JSON.stringify({ experiment: "finished", definitionSha256: definitionHash(parseExperiment(definition("finished", { queuePosition: 9 }))), gradedAt: "t", result: { verdict: "inconclusive", recommendation: "retain", eligible: false, problems: ["prompt differs"], incumbent: { launched: 4, reached: 0 }, candidate: { launched: 4, reached: 0 } }, problem: null }));
    writeFileSync(join(experimentDir(paths.runsRoot, "finished"), "trials.jsonl"), Array.from({ length: 8 }, (_, i) => [JSON.stringify({ type: "launch", trial: i, arm: i % 4 === 0 || i % 4 === 3 ? "incumbent" : "candidate", run: `f${String(i)}`, at: "t" }), JSON.stringify({ type: "outcome", trial: i, arm: i % 4 === 0 || i % 4 === 3 ? "incumbent" : "candidate", run: `f${String(i)}`, at: "t", reason: "budget" })].join("\n")).join("\n"));
    writeDefinition(paths.experimentsDir, { version: 9 }, "broken.json");
    writeFileSync(paths.readinessPath, READINESS);
    const full = parseExperiment(definition("full-map"));
    mkdirSync(experimentDir(paths.runsRoot, "full-map"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "approval.json"), JSON.stringify({ experiment: "full-map", sha256: definitionHash(full), approvedAt: "t", approvedBy: "operator" }));
    const ledger = [
      { type: "launch", trial: 0, arm: "incumbent", run: "a", at: "t" }, { type: "outcome", trial: 0, arm: "incumbent", run: "a", at: "t", reason: "budget" },
      { type: "launch", trial: 1, arm: "candidate", run: "b", at: "t" }, { type: "outcome", trial: 1, arm: "candidate", run: "b", at: "t", reason: "budget" },
      { type: "launch", trial: 2, arm: "candidate", run: "c", at: "t" }, { type: "outcome", trial: 2, arm: "candidate", run: "c", at: "t", reason: "budget" },
      { type: "launch", trial: 3, arm: "incumbent", run: "d", at: "t" },
    ];
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"), [...ledger.map((e) => JSON.stringify(e)), "junk"].join("\n"));
    mkdirSync(experimentDir(paths.runsRoot, "second"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "second"), "approval.json"), JSON.stringify({ experiment: "other" }));
    writeFileSync(runnerPath(paths.runsRoot), JSON.stringify({ pid: 7, experiment: "full-map", trial: 3 }));
    const snapshot = queueSnapshot(paths, fake({ a: reached(600, 900_000), b: reached(400, 600_000), c: missed(1500), d: missed(10) }), () => true);
    expect(snapshot.queue.map((v) => [v.id, v.state])).toEqual([["full-map", "running"], ["second", "draft"], ["partial", "held"], ["joins", "draft"]]);
    expect(snapshot.pending.map((v) => [v.id, v.state])).toContainEqual(["halted", "blocked"]);
    expect(snapshot.queue.map((v) => v.approved)).toEqual([true, false, true, false]);
    // Not-ready and blocked experiments stay pending.
    expect(snapshot.pending.map((v) => [v.id, v.state, v.recorded?.verdict ?? null])).toEqual([["counter", "pending", "BLOCKED: models do not yet reach Oldale"], ["halted", "blocked", "READY"]]);
    expect(snapshot.closed.map((v) => [v.id, v.state])).toEqual([["dropped", "discarded"], ["finished", "done"]]);
    expect(snapshot.closed[1]?.result).toEqual({ verdict: "inconclusive", recommendation: "retain", eligible: false, problems: ["prompt differs"] });
    expect(snapshot.queue[0]?.result).toBeNull();
    expect(snapshot.runner).toEqual({ experiment: "full-map", trial: 3 });
    expect(snapshot.problems.some((p) => p.startsWith("broken.json: Invalid experiment"))).toBe(true);
    expect(snapshot.problems).toContain("wrong.json: file name must be misnamed.json");
    expect(snapshot.problems).toContain("full-map: trials.jsonl line 8: not JSON");
    expect(snapshot.problems).toContain("second: approval.json is not a valid approval; treated as unapproved");
    expect(snapshot.problems).toContain("second: queue position 1 is also used by full-map");
    const view = snapshot.queue[0];
    if (view === undefined) throw new Error("missing view");
    expect(view.trials.slice(0, 4).map((t) => [t.state, t.reachedPrimary, t.turns])).toEqual([["done", true, 600], ["done", true, 400], ["done", false, 1500], ["running", null, null]]);
    expect(view.arms.incumbent).toEqual({ finished: 1, reached: 1, medianPrimaryMs: 900_000, medianTurns: 600, reachedPer1kTurns: 1000 / 600 });
    expect(view.arms.candidate).toEqual({ finished: 2, reached: 1, medianPrimaryMs: 600_000, medianTurns: 950, reachedPer1kTurns: 1000 / 1900 });
    expect(view.usedMs).toBe(901_000 + 601_000 + 1_800_000 + 1_800_000);
    expect(view).toMatchObject({ approved: true, incumbentOn: false, queuePosition: 1, notes: null, readiness: { ready: true, reached: 4 } });
  });

  it("is empty without an experiments directory and summarizes unfinished arms as empty", () => {
    const paths = roots();
    expect(queueSnapshot(paths, fake({}))).toEqual({ queue: [], pending: [], closed: [], runner: null, problems: [] });
    writeDefinition(paths.experimentsDir, definition("solo", { notes: "n" }));
    const [view] = queueSnapshot(paths, fake({}, [])).queue;
    expect(view).toMatchObject({ state: "not-ready", notes: "n", recorded: null, usedMs: 0, arms: { incumbent: { finished: 0, reached: 0, medianPrimaryMs: null, medianTurns: null, reachedPer1kTurns: null } } });
  });
});

describe("recorded runs as readiness and trial evidence", () => {
  function run(root: string, id: string, opts: { milestones?: string[]; ended?: boolean; reason?: string; harness?: string[]; checkpoint?: boolean } = {}): void {
    const log = new Log();
    log.add(0, { ...START, ...(opts.checkpoint === true ? { start_state: { kind: "save_state" as const, path: "clock_set.state", sha1: "1".repeat(40) } } : {}), harness_features: opts.harness ?? playHarnessFeatures(QUEUE_FEATURES, null), budgets: { max_turns: 1500, max_wall_ms: 1_800_000 } });
    for (const [i, name] of (opts.milestones ?? []).entries()) log.add(1000 * (i + 1), { type: "milestone", turn: i + 1, name, server_timestamp: i, kind: "story", origin: "observed" });
    if (opts.ended !== false) log.add(60_000, { type: "run_end", turn: 9, reason: (opts.reason ?? "budget") as "budget", furthest_milestone: null, turns: 9, wall_ms: 60_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    mkdirSync(join(root, id), { recursive: true });
    writeFileSync(join(root, id, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
  }
  it("lists ended registry runs oldest first and reads each trial's milestones and turns", () => {
    const { runsRoot } = roots();
    run(runsRoot, "2026-10-14T01-00-00_think-fast_aaaa", { milestones: ["FIRST_TRUCK_EXIT"] });
    run(runsRoot, "2026-10-14T02-00-00_think-fast_bbbb", { milestones: ["FIRST_TRUCK_EXIT", "RIVAL_HOUSE_ENTERED"] });
    run(runsRoot, "2026-10-14T03-00-00_think-fast_cccc", { ended: false });
    run(runsRoot, "2026-10-14T04-00-00_think-fast_dddd", { reason: "operator_abort" });
    run(runsRoot, "2026-10-14T05-00-00_think-fast_eeee", { harness: ["probe"] });
    run(runsRoot, "2026-10-14T06-00-00_think-fast_ffff", { milestones: ["RIVAL_HOUSE_ENTERED"], checkpoint: true });
    const source = recordedRuns(runsRoot);
    expect(source.recent()[0]).toMatchObject({ model: "think-swarm", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000 });
    // A checkpoint start (CLOCK_SET save state) never stands in for a boot run.
    expect(source.recent().map((r) => r.id)).not.toContain("2026-10-14T06-00-00_think-fast_ffff");
    expect(source.recent().map((r) => [r.id, r.reached])).toEqual([["2026-10-14T01-00-00_think-fast_aaaa", ["FIRST_TRUCK_EXIT"]], ["2026-10-14T02-00-00_think-fast_bbbb", ["FIRST_TRUCK_EXIT", "RIVAL_HOUSE_ENTERED"]]]);
    expect(source.trial("2026-10-14T02-00-00_think-fast_bbbb")).toEqual({ reached: ["FIRST_TRUCK_EXIT", "RIVAL_HOUSE_ENTERED"], milestoneMs: { FIRST_TRUCK_EXIT: 1000, RIVAL_HOUSE_ENTERED: 2000 }, turns: 9, wallMs: 60_000 });
    expect(source.trial("2026-10-14T02-00-00_think-fast_bbbb")).toBe(source.trial("2026-10-14T02-00-00_think-fast_bbbb"));
    expect(source.trial("2026-10-14T03-00-00_think-fast_cccc")).toMatchObject({ turns: 0 });
    expect(source.trial("2026-10-14T09-00-00_think-fast_none")).toBeNull();
    expect(source.trial("not a run id")).toBeNull();
  });
});

describe("scanning run logs for readiness and trial metrics", () => {
  it("matches summarize() on a recorded fixture and rejects a log without run_start", async () => {
    const { readFileSync } = await import("node:fs");
    const { summarize } = await import("@pokebench/agent/summary");
    const { parseEvent } = await import("@pokebench/agent/events");
    const text = readFileSync(join(import.meta.dirname, "fixtures", "m4-run.jsonl"), "utf8");
    const full = summarize(text.split("\n").filter((l) => l.trim() !== "").map((l) => parseEvent(l)));
    const { scanRun } = await import("./experiment-store.js");
    const scanned = scanRun(text);
    expect(scanned.metrics.reached).toEqual(full.milestones.map((m) => m.name));
    expect(scanned.metrics.turns).toBe(full.turns);
    expect(scanned.metrics.wallMs).toBe(full.wallMs);
    expect(scanned.ended).toBe(full.reason !== "incomplete");
    expect(() => scanRun("")).toThrow("event log does not begin with run_start");
    expect(() => scanRun(text.split("\n").slice(1).join("\n"))).toThrow("event log does not begin with run_start");
  });
});

describe("graded results are bound to the definition they graded", () => {
  it("ignores partial arms and results for another definition", async () => {
    const { gradedResult } = await import("./experiment-store.js");
    const root = mkdtempSync(join(tmpdir(), "pokebench-graded-"));
    const hash = definitionHash(parseExperiment(definition("x")));
    const write = (value: unknown): string => { const p = join(root, `${String(Math.random())}.json`); writeFileSync(p, JSON.stringify(value)); return p; };
    const full = { verdict: "improve", recommendation: "confirm", eligible: true, problems: [], incumbent: { launched: 4, reached: 1 }, candidate: { launched: 4, reached: 3 } };
    expect(gradedResult(write({ definitionSha256: hash, result: full }), hash)).toMatchObject({ verdict: "improve" });
    expect(gradedResult(write({ definitionSha256: hash, result: { ...full, incumbent: {}, candidate: {} } }), hash)).toBeNull();
    expect(gradedResult(write({ definitionSha256: "0".repeat(64), result: full }), hash)).toBeNull();
    expect(gradedResult(write({ result: full }), hash)).toBeNull();
  });
});
