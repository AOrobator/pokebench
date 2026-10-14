import { appendFileSync, mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Log, START, assistant, state } from "../test-support/events.js";
import { workbenchSnapshot } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
import { ALL_ON, playHarnessFeatures } from "@pokebench/agent/features";
import { cohort } from "../test-support/workbench-cohort.js";
const root = (): string => { const p = join(mkdtempSync(join(tmpdir(), "workbench-")), "runs"); mkdirSync(p); return p; };
function write(r: string, id: string, log: Log): string {
  mkdirSync(join(r, id)); const p = join(r, id, "events.jsonl");
  writeFileSync(p, log.events.map(e => JSON.stringify({ ...e, run: id })).join("\n") + "\n"); return p;
}
function named(origin: "observed" | "present_at_start" = "observed", evidence = true): Log {
  const l = new Log(); l.add(0, START); l.add(1000, assistant());
  const s = l.add(3000, state({ story: { name_confirmed: true, intro_stage: null, rival_stage: null, birch_lab_stage: null, petalburg_gym_stage: null, woods_stage: null, clock_set: null, rival_battle_won: null, pokedex_received: null, running_shoes_received: null, starter_tutorial_complete: null, rustboro_gym_complete: null, stone_badge: null, rock_tomb_received: null } }));
  l.add(4000, { type: "milestone", turn: 1, name: "PLAYER_NAME_CONFIRMED", kind: "story", origin, server_timestamp: 4, evidence: evidence ? [s.seq] : [] }); return l;
}
describe("read-only workbench snapshot", () => {
  it("uses the native owner/evidence, and retains earned time/turn/token attribution", async () => {
    const r = root(); write(r, "native", named()); const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(true), { state: "idle" }, 2000000000000));
    expect(d.runs[0]?.splits).toMatchObject([{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 4000, segmentMs: 4000, seq: 3, turn: 1, inputTokens: 500, outputTokens: 100 }]);
    expect(d.runs[0]?.status).toBe("live"); expect(d.runs[0]?.config?.source).toBe(START.harness.commit);
    expect(d.runs[0]?.config?.features.find(f => f.id === "naming-cursor-v1")?.on).toBeNull();
    expect(JSON.stringify(d)).not.toContain('"system_prompt"');
  });
  it("excludes present-at-start, missing/invalid evidence and probes from earned splits", async () => {
    const r = root(); write(r, "present", named("present_at_start")); write(r, "unqualified", named("observed", false)); const p = named(); const first = p.events[0]; if (first?.type !== "run_start") throw new Error("fixture start missing"); p.events[0] = { ...first, harness_features: ["probe"] }; write(r, "probe", p);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 2000000000000);
    expect(d.runs).toHaveLength(3); expect(d.runs.every(x => x.splits.length === 0)).toBe(true);
    expect(d.runs.find(x => x.id === "probe")?.excluded).toContain("probe");
  });
  it("refuses an observed milestone whose existing evidence state contradicts the native predicate", async () => {
    const r = root(), log = named(); const evidence = log.events[2]; if (evidence?.type !== "state" || !("story" in evidence) || evidence.story == null) throw new Error("fixture state");
    log.events[2] = { ...evidence, story: { ...evidence.story, name_confirmed: false } }; write(r, "forged", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    expect(d.runs.find(x => x.id === "forged")?.splits).toEqual([]);
  });
  it("rejects a second run header rather than combining earned splits with replaced provenance", async () => {
    const r = root(), log = named(); log.add(5000, { ...START, model: { ...START.model, id: "replacement-model" }, harness: { ...START.harness, commit: "b".repeat(40) } });
    log.add(6000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "duplicate_header", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), { state: "idle" }, 42);
    expect(d.runs).toMatchObject([{ id: "duplicate_header", status: "invalid", model: START.model.id, config: { source: START.harness.commit }, splits: [] }]);
    expect(d.runs[0]?.problem).toContain("more than one run_start");
  });
  it("shows malformed logs instead of silently grading or hiding them", async () => {
    const r = root(), p = write(r, "broken", named()); appendFileSync(p, '{"bad":true}\n');
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), { state: "idle" }, 2000000000000); expect(d.runs[0]?.status).toBe("invalid"); expect(d.runs[0]?.problem).toBeTruthy(); expect(d.runs[0]?.splits).toEqual([]);
  });
  it("reflects cached log append changes and refuses to label an unhealthy unended run live", async () => {
    const r = root(), p = write(r, "r", named()); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 2000000000000)).runs[0]?.status).toBe("unresponsive");
    appendFileSync(p, JSON.stringify({ v: 1, run: "r", seq: 4, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "milestone", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }) + "\n");
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), { state: "queued", runId: "new-run", waitingFor: "lease" }, 2000000000000); expect(d.runs[0]?.status).toBe("ended"); expect(d.queue).toMatchObject([{ id: "new-run", status: "queued", reason: "lease" }]);
  });
  it("rejects fractional event identities and budget/count fields at the browser boundary", async () => {
    const r = root(); write(r, "integer", named()); const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    const run = d.runs[0]; if (run?.config === null || run === undefined) throw new Error("missing fixture");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, turn: 1.5 }] })).toThrow("Invalid workbench");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, splits: run.splits.map(s => ({ ...s, seq: 1.5 })) }] })).toThrow("Invalid workbench");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, config: { ...run.config, maxTurns: 1.5 } }] })).toThrow("Invalid workbench");
  });
  it.each(["operator_abort", "operator_stop"] as const)("preserves %s history while enforcing existing abort eligibility", async reason => {
    const r = root(), log = named(); log.add(5000, { type: "run_end", turn: 1, reason, furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 5000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "stopped", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    expect(d.runs[0]?.reason).toBe(reason); expect(d.runs[0]?.splits).toHaveLength(1);
    expect(d.runs[0]?.excluded).toBe(reason === "operator_abort" ? "Excluded operator-aborted run" : null);
  });
  it("validates the browser boundary and missing-root empty state", async () => {
    const d = await workbenchSnapshot(join(root(), "absent"), () => Promise.resolve(false), { state: "idle" }, 42); expect(parseWorkbench(d).runs).toEqual([]); expect(() => parseWorkbench({ ...d, at: -1 })).toThrow("Invalid workbench"); expect(() => parseWorkbench({ ...d, runs: [{ id: "fake" }] })).toThrow();
  });
});

describe("durable cohort queue and metadata boundaries", () => {
  it("does not let a different interrupted cohort contaminate the current scheduled queue", async () => {
    const r = root(); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "milestone" }]); cohort(r, [{ type: "launch", runId: "fresh_01" }], "fresh"); mkdirSync(join(r, ".naming-gameplay.lock")); writeFileSync(join(r, ".naming-gameplay.lock/owner.json"), JSON.stringify({ cohort: "fresh", pid: process.pid }));
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42); expect(d.queue.find(q => q.id === "fresh_02")?.status).toBe("queued"); expect(d.queue.find(q => q.id === "cohort_02")?.status).toBe("withheld");
  });
  it("qualifies scheduled trials from a matching manifest/ledger and a live exact cohort lease", async () => {
    const r = root(); cohort(r, [{ type: "launch", runId: "cohort_01" }]); mkdirSync(join(r, ".naming-gameplay.lock")); writeFileSync(join(r, ".naming-gameplay.lock/owner.json"), JSON.stringify({ cohort: "cohort", pid: process.pid }));
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 2000000000000); expect(d.queue).toHaveLength(24); expect(d.queue[0]?.status).toBe("launching"); expect(d.queue[1]?.status).toBe("queued"); expect(d.queue[0]?.model).toBe("alpha");
  });
  it("marks interrupted/coordinatorless trials withheld and retains infra failure qualification", async () => {
    const r = root(); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "milestone", failureCode: "launcher_error" }]); write(r, "cohort_01", named());
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 2000000000000); expect(d.queue).toHaveLength(23); expect(d.queue.every(q => q.status === "withheld")).toBe(true); expect(d.runs[0]?.excluded).toContain("launcher_error"); expect(d.runs[0]?.cohort).toBe("cohort");
    mkdirSync(join(r, ".naming-gameplay.lock")); writeFileSync(join(r, ".naming-gameplay.lock/owner.json"), JSON.stringify({ cohort: "cohort", pid: process.pid })); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 2000000000000)).queue.every(q => q.status === "withheld")).toBe(true);
  });
  it.each([
    [{ type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone" }],
    [{ type: "launch", runId: "foreign" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "launch", runId: "cohort_01" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: "0", reason: "milestone" }],
  ].map(rows => ({ rows })))("quarantines malformed or unordered ledger rows instead of scheduling them", async ({ rows }) => {
    const r = root(); cohort(r, rows); const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42); expect(d.queue).toEqual([]); expect(d.problems).not.toEqual([]);
  });
  it("rolls back all cohort annotations when a later ledger row is invalid", async () => {
    const r = root(), log = named(); log.add(5000, { type: "run_end", turn: 1, reason: "model_error", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 5000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "cohort_01", log);
    cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "model_error", failureCode: "launcher_error" }, { type: "launch", runId: "cohort_01" }]);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    expect(d.queue).toEqual([]); expect(d.problems).not.toEqual([]);
    expect(d.runs).toMatchObject([{ id: "cohort_01", cohort: null, excluded: null, status: "ended", reason: "model_error", splits: [{ name: "PLAYER_NAME_CONFIRMED" }] }]);
    expect(d.runs.filter(run => run.status === "ended" && run.excluded === null && run.problem === null)).toHaveLength(1);
  });
  it.each([
    [{ type: "launch", runId: "cohort_01", at: undefined }],
    [{ type: "launch", runId: "cohort_01", extra: true }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone", eventsSha256: undefined }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "infrastructure_failure", failureCode: "invented" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone", eventsSha256: null }, { type: "launch", runId: "cohort_02" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, reason: "invented" }, { type: "launch", runId: "cohort_02" }],
    [{ type: "launch", runId: "cohort_02" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "infrastructure_failure" }, { type: "launch", runId: "cohort_02" }],
    [{ type: "launch", runId: "cohort_01", at: "invalid" }],
    [{ type: "launch", runId: "cohort_01", at: "2026-10-14T12:00:00Z" }, { type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone", at: "2026-10-14T11:00:00Z" }],
  ].map(rows => ({ rows })))("rejects production-invalid ledger rows and serial ordering without annotating runs", async ({ rows }) => {
    const r = root(); write(r, "cohort_01", named()); cohort(r, rows);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    expect(d.queue).toEqual([]); expect(d.problems).not.toEqual([]);
    expect(d.runs).toMatchObject([{ id: "cohort_01", cohort: null, excluded: null }]);
  });
  it.each([{ reason: "milestone", eventsSha256: null }, { reason: "invented", eventsSha256: "a".repeat(64) }])("withholds remaining trials after a production-failed outcome even when its child exited zero", async outcome => {
    const r = root(); write(r, "cohort_01", named()); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, ...outcome }]);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    expect(d.problems).toEqual([]); expect(d.queue).toHaveLength(23); expect(d.queue.every(q => q.status === "withheld")).toBe(true);
    expect(d.runs[0]?.excluded).toContain("Infrastructure outcome");
  });
  it("accepts a production-shaped completed prefix and only its final pending launch", async () => {
    const r = root(); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone" }, { type: "launch", runId: "cohort_02" }]);
    mkdirSync(join(r, ".naming-gameplay.lock")); writeFileSync(join(r, ".naming-gameplay.lock/owner.json"), JSON.stringify({ cohort: "cohort", pid: process.pid }));
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42);
    expect(d.problems).toEqual([]); expect(d.queue).toHaveLength(23);
    expect(d.queue.slice(0, 2)).toMatchObject([{ id: "cohort_02", status: "launching" }, { id: "cohort_03", status: "queued" }]);
  });
  it("does not admit a wrong digest, empty ledger, unrelated metadata or stale lease", async () => {
    const r = root(), c = cohort(r); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42)).queue).toEqual([]);
    writeFileSync(c.ledger, JSON.stringify({ type: "launch", runId: "cohort_01", at: "2026-10-14T12:00:00Z", manifestSha256: "wrong" }) + "\n"); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42)).queue).toEqual([]);
    writeFileSync(c.ledger, JSON.stringify({ type: "launch", runId: "cohort_01", at: "2026-10-14T12:00:00Z", manifestSha256: c.digest }) + "\n"); mkdirSync(join(r, ".naming-gameplay.lock")); writeFileSync(join(r, ".naming-gameplay.lock/owner.json"), JSON.stringify({ cohort: "cohort", pid: 2147483647 })); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42)).queue[0]?.status).toBe("withheld");
    writeFileSync(c.path, '{"version":1}'); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42)).queue).toEqual([]);
  });
  it("rejects oversized and symlinked receipts/logs without reading arbitrary files", async () => {
    const r = root(), p = write(r, "large", named()); truncateSync(p, 65 * 1024 * 1024); const c = cohort(r, [{ type: "launch", runId: "cohort_01" }]); truncateSync(c.path, 2 * 1024 * 1024);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42); expect(d.runs[0]?.problem).toContain("64 MiB"); expect(d.problems[0]).toContain("metadata size");
    mkdirSync(join(r, "linked")); symlinkSync(p, join(r, "linked/events.jsonl")); expect((await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 42)).runs.find(x => x.id === "linked")?.status).toBe("invalid");
  });
  it("distinguishes recorded OFF flags from historical absence and surfaces paused objectives", async () => {
    const r = root(), l = named(); const first = l.events[0]; if (first?.type !== "run_start") throw new Error("fixture"); l.events[0] = { ...first, harness_features: playHarnessFeatures({ ...ALL_ON, "deterministic-loop-guard-v1": false }, null) };
    l.add(5000, { type: "operator_control", turn: 1, request: 1, action: "pause", status: "applied", emulator_frozen: true }); write(r, "paused", l);
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), { state: "failed", runId: "failed", error: "launch failed" }, 2000000000000); expect(d.runs[0]?.status).toBe("paused"); expect(d.runs[0]?.config?.features.find(f => f.id === "deterministic-loop-guard-v1")?.on).toBe(false); expect(d.queue[0]?.status).toBe("failed");
  });
  it("assigns experiment-queue trials to their experiment and lists unfinished ones", async () => {
    const r = root();
    write(r, "2026-10-14T20-00-00_think-fast_aaaa", named()); write(r, "2026-10-14T20-30-00_think-fast_bbbb", named());
    mkdirSync(join(r, "experiments", "full-map"), { recursive: true });
    writeFileSync(join(r, "experiments", "full-map", "trials.jsonl"), [
      { type: "launch", trial: 0, arm: "incumbent", run: "2026-10-14T20-00-00_think-fast_aaaa", at: "t", model: "think-fast" }, { type: "outcome", trial: 0, arm: "incumbent", run: "2026-10-14T20-00-00_think-fast_aaaa", at: "t", reason: "budget" },
      { type: "launch", trial: 1, arm: "candidate", run: "2026-10-14T20-30-00_think-fast_bbbb", at: "t", model: "think-fast" }, { type: "launcher_error", trial: 1, arm: "candidate", run: "2026-10-14T20-30-00_think-fast_bbbb", at: "t", message: "play exited with 1" },
      { type: "launch", trial: 1, arm: "candidate", run: "2026-10-14T21-00-00_think-fast_cccc", at: "t", model: "think-fast" },
    ].map(e => JSON.stringify(e)).join("\n") + "\n");
    mkdirSync(join(r, "experiments", "empty"), { recursive: true });
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), { state: "idle" }, 2000000000000));
    expect(d.runs.find(x => x.id === "2026-10-14T20-00-00_think-fast_aaaa")?.cohort).toBe("experiment:full-map");
    expect(d.runs.find(x => x.id === "2026-10-14T20-30-00_think-fast_bbbb")?.excluded).toContain("play exited with 1");
    expect(d.queue.filter(q => q.cohort === "experiment:full-map")).toEqual([{ id: "2026-10-14T21-00-00_think-fast_cccc", cohort: "experiment:full-map", model: "think-fast", arm: "candidate", status: "withheld", reason: "Experiment queue trial with no recorded outcome; the runner is not on it" }]);
  });
});
