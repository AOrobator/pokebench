import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionHash, parseExperiment, type ReadinessRun } from "@pokebench/agent/experiments";
import { playHarnessFeatures } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { experimentDir, runnerPath, type QueuePaths, type RunSource, type TrialMetrics } from "./experiment-store.js";
import { RunnerError, gradeExperiment, nextExperiment, runQueue, type RunnerHost, type TrialLaunch } from "./experiment-runner.js";
import { LEASE } from "./next-run.js";

function setup(over: Record<string, unknown> = {}, approve = true): { paths: QueuePaths; metrics: Map<string, TrialMetrics>; source: RunSource } {
  const root = mkdtempSync(join(tmpdir(), "pokebench-runner-"));
  const paths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "none.md") };
  mkdirSync(paths.runsRoot, { recursive: true });
  const value = definition("full-map", over);
  writeDefinition(paths.experimentsDir, value);
  if (approve) {
    mkdirSync(experimentDir(paths.runsRoot, "full-map"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "approval.json"), JSON.stringify({ experiment: "full-map", sha256: definitionHash(parseExperiment(value)), approvedAt: "t", approvedBy: "operator" }));
  }
  const metrics = new Map<string, TrialMetrics>();
  const recent: ReadinessRun[] = ["r1", "r2", "r3", "r4"].map((id) => ({ id, model: "think-fast", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT"] }));
  return { paths, metrics, source: { recent: () => recent, trial: (id) => metrics.get(id) ?? null } };
}

interface Fake extends RunnerHost { launches: TrialLaunch[]; lines: string[] }
let n = 0;
function host(paths: QueuePaths, metrics: Map<string, TrialMetrics>, over: Partial<RunnerHost> = {}): Fake {
  const launches: TrialLaunch[] = [], lines: string[] = [];
  return {
    launches, lines,
    now: () => new Date("2026-10-14T20:00:00Z"),
    runId: (model) => `2026-10-14T20-00-${String(n++).padStart(3, "0")}_${model}_beef`,
    verifySource: () => Promise.resolve(null),
    liveRuns: () => Promise.resolve([]),
    discover: (lane) => Promise.resolve({ id: lane, fingerprint: "f".repeat(64) }),
    launch: (trial) => {
      launches.push(trial);
      expect(existsSync(join(paths.runsRoot, LEASE, "owner.json"))).toBe(true);
      expect(JSON.parse(readFileSync(runnerPath(paths.runsRoot), "utf8"))).toMatchObject({ experiment: "full-map" });
      const preset = JSON.parse(readFileSync(trial.presetPath, "utf8")) as { features: Record<string, boolean> };
      const log = new Log();
      log.add(0, { ...START, harness_features: playHarnessFeatures(preset.features as typeof QUEUE_FEATURES, null) });
      log.add(60_000, { type: "run_end", turn: 9, reason: "budget", furthest_milestone: null, turns: 9, wall_ms: 60_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
      mkdirSync(join(paths.runsRoot, trial.runId), { recursive: true });
      writeFileSync(join(paths.runsRoot, trial.runId, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: trial.runId })).join("\n") + "\n");
      metrics.set(trial.runId, { reached: [], milestoneMs: {}, turns: 9, wallMs: 60_000 });
      return Promise.resolve(0);
    },
    log: (line) => { lines.push(line); },
    ...over,
  };
}
const ledger = (paths: QueuePaths): { type: string; trial: number; arm: string; run: string; message?: string; reason?: string; environment?: string }[] =>
  readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { type: string; trial: number; arm: string; run: string });

describe("experiment runner", () => {
  it("runs nothing that is unapproved, not ready or stale", async () => {
    const draft = setup({}, false);
    expect(await runQueue({ paths: draft.paths, source: draft.source, host: host(draft.paths, draft.metrics) })).toEqual({ ran: 0, stopped: "nothing to run: full-map is draft" });
    const notReady = setup();
    expect((await runQueue({ paths: notReady.paths, source: { ...notReady.source, recent: () => [] }, host: host(notReady.paths, notReady.metrics) })).stopped).toBe("nothing to run: full-map is not-ready");
    const stale = setup();
    writeDefinition(stale.paths.experimentsDir, definition("full-map", { trialsPerArm: 5 }));
    expect((await runQueue({ paths: stale.paths, source: stale.source, host: host(stale.paths, stale.metrics) })).stopped).toBe("nothing to run: full-map is stale");
    const empty = setup();
    writeDefinition(empty.paths.experimentsDir, definition("full-map", { queuePosition: undefined }));
    expect((await runQueue({ paths: empty.paths, source: empty.source, host: host(empty.paths, empty.metrics) })).stopped).toBe("nothing to run: the queue is empty");
    expect(existsSync(join(draft.paths.runsRoot, LEASE))).toBe(false);
  });

  it("prints the plan on a dry run without launching or writing", async () => {
    const { paths, metrics, source } = setup();
    const fake = host(paths, metrics);
    expect(await runQueue({ paths, source, host: fake, dryRun: true })).toEqual({ ran: 0, stopped: "dry run" });
    expect(fake.lines).toEqual(["full-map: approved; 8 of 8 trials to run (1A 2B 3B 4A 5A 6B 7B 8A)"]);
    expect(fake.launches).toEqual([]);
    expect(existsSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"))).toBe(false);
  });

  it("runs every trial in ABBA order on its own run id, then grades and releases the lease", async () => {
    const { paths, metrics, source } = setup();
    const fake = host(paths, metrics);
    const outcome = await runQueue({ paths, source, host: fake });
    expect(outcome.ran).toBe(8);
    expect(outcome.stopped).toMatch(/^full-map finished; result in /);
    expect(fake.launches.map((l) => l.presetPath.endsWith("incumbent.json") ? "A" : "B").join("")).toBe("ABBAABBA");
    expect(new Set(fake.launches.map((l) => l.runId)).size).toBe(8);
    expect(ledger(paths).map((e) => e.type)).toEqual(Array.from({ length: 8 }, () => ["launch", "outcome"]).flat());
    expect(ledger(paths)[0]).toMatchObject({ environment: "f".repeat(64), model: "think-fast" });
    const preset = (arm: string): { features: Record<string, boolean>; id: string } => JSON.parse(readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "presets", `${arm}.json`), "utf8")) as { features: Record<string, boolean>; id: string };
    expect(Object.keys(preset("incumbent").features).filter((k) => preset("incumbent").features[k] !== preset("candidate").features[k])).toEqual(["full-map-navigation-v1"]);
    const result = JSON.parse(readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"), "utf8")) as { result: { verdict: string; incumbent: { launched: number } } | null };
    expect(result.result?.incumbent.launched).toBe(4);
    expect(existsSync(join(paths.runsRoot, LEASE))).toBe(false);
    expect(existsSync(runnerPath(paths.runsRoot))).toBe(false);
    expect((await runQueue({ paths, source, host: fake })).stopped).toBe("nothing to run: the queue is empty");
  });

  it("resumes from the ledger without repeating a finished trial and retires an interrupted one", async () => {
    const { paths, metrics, source } = setup();
    const lines = [{ type: "launch", trial: 0, arm: "incumbent", run: "old0", at: "t" }, { type: "outcome", trial: 0, arm: "incumbent", run: "old0", at: "t", reason: "budget" }, { type: "launch", trial: 1, arm: "candidate", run: "old1", at: "t" }];
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const fake = host(paths, metrics);
    expect((await runQueue({ paths, source, host: fake, once: true })).stopped).toBe("one trial run (--once)");
    expect(fake.launches).toHaveLength(1);
    expect(ledger(paths).slice(3)).toMatchObject([{ type: "launcher_error", trial: 1, run: "old1", message: "interrupted: no outcome was recorded" }, { type: "launch", trial: 1 }, { type: "outcome", trial: 1 }]);
  });

  it("refuses to start on a source problem, a live run or a held lease", async () => {
    const a = setup();
    await expect(runQueue({ paths: a.paths, source: a.source, host: host(a.paths, a.metrics, { verifySource: () => Promise.resolve("main moved") }) })).rejects.toThrow("full-map: main moved");
    await expect(runQueue({ paths: a.paths, source: a.source, host: host(a.paths, a.metrics, { liveRuns: () => Promise.resolve(["someone"]) }) })).rejects.toThrow("live run someone is still running");
    mkdirSync(join(a.paths.runsRoot, LEASE));
    await expect(runQueue({ paths: a.paths, source: a.source, host: host(a.paths, a.metrics) })).rejects.toThrow(RunnerError);
    expect(existsSync(join(a.paths.runsRoot, "experiments", "full-map", "trials.jsonl"))).toBe(false);
  });

  it("holds on launch failures, exits, budget, a moved source and stop requests", async () => {
    const failing = setup();
    expect((await runQueue({ paths: failing.paths, source: failing.source, host: host(failing.paths, failing.metrics, { launch: () => Promise.reject(new Error("spawn failed")) }) })).stopped).toBe("held: trial 1 failed to launch");
    expect(ledger(failing.paths).at(-1)).toMatchObject({ type: "launcher_error", message: "spawn failed" });
    expect(existsSync(join(failing.paths.runsRoot, LEASE))).toBe(false);
    const crashing = setup();
    expect((await runQueue({ paths: crashing.paths, source: crashing.source, host: host(crashing.paths, crashing.metrics, { launch: () => Promise.resolve(2) }) })).stopped).toBe("held: trial 1 exited with 2");
    expect(ledger(crashing.paths).at(-1)).toMatchObject({ type: "launcher_error", message: "play exited with 2" });
    const tight = setup({ budget: { maxWallMs: 1_800_000 } }, false);
    mkdirSync(experimentDir(tight.paths.runsRoot, "full-map"), { recursive: true });
    writeFileSync(join(experimentDir(tight.paths.runsRoot, "full-map"), "approval.json"), JSON.stringify({ experiment: "full-map", sha256: definitionHash(parseExperiment(definition("full-map", { budget: { maxWallMs: 1_800_000 } }))), approvedAt: "t", approvedBy: "o" }));
    const fake = host(tight.paths, tight.metrics);
    expect(await runQueue({ paths: tight.paths, source: tight.source, host: fake })).toEqual({ ran: 1, stopped: "held: the next trial could exceed the experiment budget" });
    const moving = setup();
    let checks = 0;
    expect(await runQueue({ paths: moving.paths, source: moving.source, host: host(moving.paths, moving.metrics, { verifySource: () => Promise.resolve(checks++ < 2 ? null : "main moved") }) })).toEqual({ ran: 1, stopped: "held: main moved" });
    const stopping = setup();
    expect(await runQueue({ paths: stopping.paths, source: stopping.source, host: host(stopping.paths, stopping.metrics), stopRequested: () => true })).toEqual({ ran: 0, stopped: "stop requested" });
  });

  it("never resumes or continues without a matching approval (INV-Q2)", async () => {
    const { paths, metrics, source } = setup();
    expect((await runQueue({ paths, source, host: host(paths, metrics), once: true })).ran).toBe(1);
    rmSync(join(experimentDir(paths.runsRoot, "full-map"), "approval.json"));
    const fake = host(paths, metrics);
    expect(await runQueue({ paths, source, host: fake })).toEqual({ ran: 0, stopped: "nothing to run: full-map is stale" });
    expect(fake.launches).toEqual([]);
    const midway = setup();
    let launched = 0;
    const revoking = host(midway.paths, midway.metrics);
    const launch = revoking.launch.bind(revoking);
    const outcome = await runQueue({ paths: midway.paths, source: midway.source, host: { ...revoking, launch: async (t) => { const code = await launch(t); if (++launched === 2) rmSync(join(experimentDir(midway.paths.runsRoot, "full-map"), "approval.json")); return code; } } });
    expect(outcome).toEqual({ ran: 2, stopped: "held: the approval no longer matches the definition" });
  });

  it("counts a run that ended with a recorded crash as a finished trial, and keeps going (PB2)", async () => {
    const { paths, metrics, source } = setup();
    const base = host(paths, metrics);
    let n = 0;
    const crashing = { ...base, launch: async (t: TrialLaunch) => { await base.launch(t); if (n++ !== 0) return 0; const file = join(paths.runsRoot, t.runId, "events.jsonl"); writeFileSync(file, readFileSync(file, "utf8").replace('"reason":"budget"', '"reason":"crash"')); return 1; } };
    const outcome = await runQueue({ paths, source, host: crashing });
    expect(outcome.ran).toBe(8);
    expect(ledger(paths).slice(0, 2)).toMatchObject([{ type: "launch", trial: 0 }, { type: "outcome", trial: 0, reason: "crash" }]);
    const result = JSON.parse(readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"), "utf8")) as { result: { incumbent: { stopReasons: Record<string, number> } } };
    expect(result.result.incumbent.stopReasons["crash"]).toBe(1);
  });

  it("treats an operator stop during a trial as unfinished: logged, rerun, never graded", async () => {
    const { paths, metrics, source } = setup();
    const base = host(paths, metrics);
    let stop = false, first = true;
    const stopping = { ...base, launch: async (t: TrialLaunch) => { await base.launch(t); if (first) { first = false; stop = true; const file = join(paths.runsRoot, t.runId, "events.jsonl"); writeFileSync(file, readFileSync(file, "utf8").replace('"reason":"budget"', '"reason":"operator_abort"')); } return 0; } };
    expect(await runQueue({ paths, source, host: stopping, stopRequested: () => stop })).toEqual({ ran: 0, stopped: "held: trial 1 was stopped by the operator; it will be rerun" });
    expect(ledger(paths).at(-1)).toMatchObject({ type: "launcher_error", trial: 0, message: "operator stopped the trial" });
    stop = false;
    expect((await runQueue({ paths, source, host: stopping })).ran).toBe(8);
    expect(ledger(paths).filter((e) => e.type === "launch" && e.trial === 0)).toHaveLength(2);
    const result = JSON.parse(readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"), "utf8")) as { result: { incumbent: { stopReasons: Record<string, number>; launched: number } } };
    expect(result.result.incumbent.stopReasons["operator_abort"]).toBeUndefined();
    expect(result.result.incumbent.launched).toBe(4);
  });

  it("grades the experiment when --once runs its last trial", async () => {
    const { paths, metrics, source } = setup();
    for (let i = 0; i < 7; i++) expect((await runQueue({ paths, source, host: host(paths, metrics), once: true })).ran).toBe(1);
    expect(existsSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"))).toBe(false);
    expect((await runQueue({ paths, source, host: host(paths, metrics), once: true })).stopped).toMatch(/^full-map finished; result in /);
    expect(existsSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"))).toBe(true);
  });

  it("holds when play exits cleanly without recording run_end", async () => {
    const { paths, metrics, source } = setup();
    const base = host(paths, metrics);
    const silent = { ...base, launch: async (t: TrialLaunch) => { await base.launch(t); const file = join(paths.runsRoot, t.runId, "events.jsonl"); writeFileSync(file, readFileSync(file, "utf8").split("\n")[0] + "\n"); return 0; } };
    expect(await runQueue({ paths, source, host: silent })).toEqual({ ran: 0, stopped: "held: trial 1 ended without a recorded run_end" });
    expect(ledger(paths).at(-1)).toMatchObject({ type: "launcher_error", message: "play exited with 0 but recorded no run_end" });
  });

  it("runs every approved experiment in queue order in one invocation", async () => {
    const { paths, metrics, source } = setup();
    const second = definition("second", { queuePosition: 2, changedFeature: "one-way-tiles-v1", activationMilestone: "FIRST_TRUCK_EXIT" });
    writeDefinition(paths.experimentsDir, second);
    mkdirSync(experimentDir(paths.runsRoot, "second"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "second"), "approval.json"), JSON.stringify({ experiment: "second", sha256: definitionHash(parseExperiment(second)), approvedAt: "t", approvedBy: "o" }));
    const fake = host(paths, metrics);
    const outcome = await runQueue({ paths, source, host: fake });
    expect(outcome.ran).toBe(16);
    expect(outcome.stopped).toMatch(/second finished/);
    expect(existsSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"))).toBe(true);
    expect(existsSync(join(experimentDir(paths.runsRoot, "second"), "result.json"))).toBe(true);
    expect(fake.launches.slice(0, 8).every((l) => l.presetPath.includes("/full-map/"))).toBe(true);
  });

  it("refuses a preset on disk that no longer matches the definition", async () => {
    const { paths, metrics, source } = setup();
    mkdirSync(join(experimentDir(paths.runsRoot, "full-map"), "presets"), { recursive: true });
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "presets", "incumbent.json"), "{}");
    await expect(runQueue({ paths, source, host: host(paths, metrics) })).rejects.toThrow("full-map: incumbent preset on disk differs from the definition");
    expect(existsSync(join(paths.runsRoot, LEASE))).toBe(false);
  });

  it("reports grading problems instead of a verdict and picks held before later approved entries", () => {
    const { paths } = setup();
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"), JSON.stringify({ type: "outcome", trial: 0, arm: "incumbent", run: "missing", at: "t", reason: "budget" }) + "\n");
    const graded = gradeExperiment(paths, parseExperiment(definition("full-map")), new Date("2026-10-14T00:00:00Z"));
    expect(graded).toMatchObject({ experiment: "full-map", gradedAt: "2026-10-14T00:00:00.000Z", result: null });
    expect(graded.problem).toMatch(/ENOENT/);
    const view = (id: string, state: string) => ({ id, state }) as unknown as Parameters<typeof nextExperiment>[0][number];
    expect(nextExperiment([view("a", "draft"), view("b", "held"), view("c", "approved")])?.id).toBe("b");
    expect(nextExperiment([view("a", "done")])).toBeNull();
  });
});
