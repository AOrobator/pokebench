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
    const r = root(); write(r, "native", named()); const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000));
    expect(d.runs[0]?.splits).toMatchObject([{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 4000, segmentMs: 4000, seq: 3, turn: 1, inputTokens: 500, outputTokens: 100 }]);
    expect(d.runs[0]?.status).toBe("live"); expect(d.runs[0]?.config?.source).toBe(START.harness.commit);
    expect(d.runs[0]?.config?.features.find(f => f.id === "naming-cursor-v1")?.on).toBeNull();
    expect(JSON.stringify(d)).not.toContain('"system_prompt"');
  });
  it("excludes present-at-start, missing/invalid evidence and probes from earned splits", async () => {
    const r = root(); write(r, "present", named("present_at_start")); write(r, "unqualified", named("observed", false)); const p = named(); const first = p.events[0]; if (first?.type !== "run_start") throw new Error("fixture start missing"); p.events[0] = { ...first, harness_features: ["probe"] }; write(r, "probe", p);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000);
    expect(d.runs).toHaveLength(3); expect(d.runs.every(x => x.splits.length === 0)).toBe(true);
    expect(d.runs.find(x => x.id === "probe")?.excluded).toContain("probe");
  });
  it("refuses an observed milestone whose existing evidence state contradicts the native predicate", async () => {
    const r = root(), log = named(); const evidence = log.events[2]; if (evidence?.type !== "state" || !("story" in evidence) || evidence.story == null) throw new Error("fixture state");
    log.events[2] = { ...evidence, story: { ...evidence.story, name_confirmed: false } }; write(r, "forged", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.runs.find(x => x.id === "forged")?.splits).toEqual([]);
  });
  it("rejects a second run header rather than combining earned splits with replaced provenance", async () => {
    const r = root(), log = named(); log.add(5000, { ...START, model: { ...START.model, id: "replacement-model" }, harness: { ...START.harness, commit: "b".repeat(40) } });
    log.add(6000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "duplicate_header", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), 42);
    expect(d.runs).toMatchObject([{ id: "duplicate_header", status: "invalid", model: START.model.id, config: { source: START.harness.commit }, splits: [] }]);
    expect(d.runs[0]?.problem).toContain("more than one run_start");
  });
  it("shows malformed logs instead of silently grading or hiding them", async () => {
    const r = root(), p = write(r, "broken", named()); appendFileSync(p, '{"bad":true}\n');
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000); expect(d.runs[0]?.status).toBe("invalid"); expect(d.runs[0]?.problem).toBeTruthy(); expect(d.runs[0]?.splits).toEqual([]);
  });
  it("reflects cached log append changes and refuses to label an unhealthy unended run live", async () => {
    const r = root(), p = write(r, "r", named()); expect((await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000)).runs[0]?.status).toBe("unresponsive");
    appendFileSync(p, JSON.stringify({ v: 1, run: "r", seq: 4, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "milestone", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }) + "\n");
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000); expect(d.runs[0]?.status).toBe("ended");
  });
  it("rejects fractional event identities and budget/count fields at the browser boundary", async () => {
    const r = root(); write(r, "integer", named()); const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    const run = d.runs[0]; if (run?.config === null || run === undefined) throw new Error("missing fixture");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, turn: 1.5 }] })).toThrow("Invalid workbench");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, splits: run.splits.map(s => ({ ...s, seq: 1.5 })) }] })).toThrow("Invalid workbench");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, config: { ...run.config, maxTurns: 1.5 } }] })).toThrow("Invalid workbench");
  });
  it("accepts a recorded config that omits resume and rejects a corrupt resume", async () => {
    const r = root(); write(r, "integer", named()); const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    const run = d.runs[0]; if (run?.config === null || run === undefined) throw new Error("missing fixture");
    const config = { ...run.config }; delete config.resume;
    expect(parseWorkbench({ ...d, runs: [{ ...run, config }] }).runs[0]?.config?.resume).toBeUndefined();
    expect(parseWorkbench({ ...d, runs: [{ ...run, config: { ...config, resume: "CLOCK_SET" } }] }).runs[0]?.config?.resume).toBe("CLOCK_SET");
    expect(() => parseWorkbench({ ...d, runs: [{ ...run, config: { ...config, resume: false } }] })).toThrow("Invalid workbench");
  });
  it.each(["operator_abort", "operator_stop"] as const)("preserves %s history while enforcing existing abort eligibility", async reason => {
    const r = root(), log = named(); log.add(5000, { type: "run_end", turn: 1, reason, furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 5000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "stopped", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.runs[0]?.reason).toBe(reason); expect(d.runs[0]?.splits).toHaveLength(1);
    expect(d.runs[0]?.excluded).toBe(reason === "operator_abort" ? "Excluded operator-aborted run" : null);
  });
  it("validates the browser boundary and missing-root empty state", async () => {
    const d = await workbenchSnapshot(join(root(), "absent"), () => Promise.resolve(false), 42); expect(parseWorkbench(d).runs).toEqual([]); expect(() => parseWorkbench({ ...d, at: -1 })).toThrow("Invalid workbench"); expect(() => parseWorkbench({ ...d, runs: [{ id: "fake" }] })).toThrow();
  });
});

describe("durable cohort membership and metadata boundaries", () => {
  it("retains infra failure qualification and cohort membership", async () => {
    const r = root(); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "milestone", failureCode: "launcher_error" }]); write(r, "cohort_01", named());
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000); expect(d.runs[0]?.excluded).toContain("launcher_error"); expect(d.runs[0]?.cohort).toBe("cohort");
  });
  it.each([
    [{ type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone" }],
    [{ type: "launch", runId: "foreign" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "launch", runId: "cohort_01" }],
    [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: "0", reason: "milestone" }],
  ].map(rows => ({ rows })))("quarantines malformed or unordered ledger rows", async ({ rows }) => {
    const r = root(); cohort(r, rows); const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42); expect(d.problems).not.toEqual([]);
  });
  it("rolls back all cohort annotations when a later ledger row is invalid", async () => {
    const r = root(), log = named(); log.add(5000, { type: "run_end", turn: 1, reason: "model_error", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 5000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "cohort_01", log);
    cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 1, reason: "model_error", failureCode: "launcher_error" }, { type: "launch", runId: "cohort_01" }]);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.problems).not.toEqual([]);
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
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.problems).not.toEqual([]);
    expect(d.runs).toMatchObject([{ id: "cohort_01", cohort: null, excluded: null }]);
  });
  it.each([{ reason: "milestone", eventsSha256: null }, { reason: "invented", eventsSha256: "a".repeat(64) }])("excludes a production-failed outcome even when its child exited zero", async outcome => {
    const r = root(); write(r, "cohort_01", named()); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, ...outcome }]);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.problems).toEqual([]);
    expect(d.runs[0]?.excluded).toContain("Infrastructure outcome");
  });
  it("accepts a production-shaped completed prefix and its pending launch into the cohort", async () => {
    const r = root(); write(r, "cohort_01", named()); write(r, "cohort_02", named()); cohort(r, [{ type: "launch", runId: "cohort_01" }, { type: "outcome", runId: "cohort_01", exitCode: 0, reason: "milestone" }, { type: "launch", runId: "cohort_02" }]);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.problems).toEqual([]); expect(d.runs.map(x => [x.id, x.cohort, x.excluded]).sort()).toEqual([["cohort_01", "cohort", null], ["cohort_02", "cohort", null]]);
  });
  it("does not admit a wrong digest, empty ledger or unrelated metadata", async () => {
    const r = root(), c = cohort(r); write(r, "cohort_01", named());
    const cohortOf = async (): Promise<string | null | undefined> => (await workbenchSnapshot(r, () => Promise.resolve(false), 42)).runs[0]?.cohort;
    expect(await cohortOf()).toBeNull();
    writeFileSync(c.ledger, JSON.stringify({ type: "launch", runId: "cohort_01", at: "2026-10-14T12:00:00Z", manifestSha256: "wrong" }) + "\n"); expect(await cohortOf()).toBeNull();
    writeFileSync(c.ledger, JSON.stringify({ type: "launch", runId: "cohort_01", at: "2026-10-14T12:00:00Z", manifestSha256: c.digest }) + "\n"); expect(await cohortOf()).toBe("cohort");
    writeFileSync(c.path, '{"version":1}'); expect(await cohortOf()).toBeNull();
  });
  it("names a Clock set save and leaves every other start unmarked", async () => {
    const r = root();
    const clock = named(); const clockStart = clock.events[0]; if (clockStart?.type !== "run_start") throw new Error("fixture");
    clock.events[0] = { ...clockStart, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) } };
    const other = named(); const otherStart = other.events[0]; if (otherStart?.type !== "run_start") throw new Error("fixture");
    other.events[0] = { ...otherStart, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state.bak", sha1: "b".repeat(40) } };
    write(r, "clock", clock); write(r, "other", other); write(r, "boot", named());
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.runs.find(x => x.id === "clock")?.config).toMatchObject({ start: "save_state", resume: "CLOCK_SET" });
    expect(d.runs.find(x => x.id === "other")?.config).toMatchObject({ start: "save_state", resume: null });
    expect(d.runs.find(x => x.id === "boot")?.config).toMatchObject({ start: "boot", resume: null });
  });
  it("rejects oversized and symlinked receipts/logs without reading arbitrary files", async () => {
    const r = root(), p = write(r, "large", named()); truncateSync(p, 513 * 1024 * 1024); const c = cohort(r, [{ type: "launch", runId: "cohort_01" }]); truncateSync(c.path, 2 * 1024 * 1024);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42); expect(d.runs[0]?.problem).toContain("streaming byte bound"); expect(d.problems[0]).toContain("metadata size");
    mkdirSync(join(r, "linked")); symlinkSync(p, join(r, "linked/events.jsonl")); expect((await workbenchSnapshot(r, () => Promise.resolve(false), 42)).runs.find(x => x.id === "linked")?.status).toBe("invalid");
  });
  it("distinguishes recorded OFF flags from historical absence and surfaces paused runs without objectives", async () => {
    const r = root(), l = named(); const first = l.events[0]; if (first?.type !== "run_start") throw new Error("fixture"); l.events[0] = { ...first, harness_features: playHarnessFeatures({ ...ALL_ON, "deterministic-loop-guard-v1": false }, null) };
    l.add(5000, { type: "operator_control", turn: 1, request: 1, action: "pause", status: "applied", emulator_frozen: true }); write(r, "paused", l);
    const d = await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000); expect(d.runs[0]?.status).toBe("paused"); expect(d.runs[0]).not.toHaveProperty("objective"); expect(d.runs[0]?.config?.features.find(f => f.id === "deterministic-loop-guard-v1")?.on).toBe(false);
  });
  it("assigns experiment-queue trials to their experiment", async () => {
    const r = root();
    write(r, "2026-10-14T20-00-00_think-fast_aaaa", named()); write(r, "2026-10-14T20-30-00_think-fast_bbbb", named()); write(r, "2026-10-14T21-00-00_think-fast_cccc", named());
    mkdirSync(join(r, "experiments", "full-map"), { recursive: true });
    writeFileSync(join(r, "experiments", "full-map", "trials.jsonl"), [
      { type: "launch", trial: 0, arm: "incumbent", run: "2026-10-14T20-00-00_think-fast_aaaa", at: "t", model: "think-fast" }, { type: "outcome", trial: 0, arm: "incumbent", run: "2026-10-14T20-00-00_think-fast_aaaa", at: "t", reason: "budget" },
      { type: "launch", trial: 1, arm: "candidate", run: "2026-10-14T20-30-00_think-fast_bbbb", at: "t", model: "think-fast" }, { type: "launcher_error", trial: 1, arm: "candidate", run: "2026-10-14T20-30-00_think-fast_bbbb", at: "t", message: "play exited with 1" },
      { type: "launch", trial: 1, arm: "candidate", run: "2026-10-14T21-00-00_think-fast_cccc", at: "t", model: "think-fast" },
    ].map(e => JSON.stringify(e)).join("\n") + "\n");
    mkdirSync(join(r, "experiments", "empty"), { recursive: true });
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(d.runs.find(x => x.id === "2026-10-14T20-00-00_think-fast_aaaa")?.cohort).toBe("experiment:full-map");
    expect(d.runs.find(x => x.id === "2026-10-14T20-30-00_think-fast_bbbb")?.excluded).toContain("play exited with 1");
    expect(d.runs.find(x => x.id === "2026-10-14T21-00-00_think-fast_cccc")).toMatchObject({ cohort: "experiment:full-map", excluded: null });
  });
  it("ingests an experiment ledger all or nothing, and only launched runs join the cohort", async () => {
    const r = root();
    write(r, "2026-10-14T20-00-00_think-fast_aaaa", named()); write(r, "2026-10-14T20-30-00_think-fast_bbbb", named());
    mkdirSync(join(r, "experiments", "full-map"), { recursive: true });
    const good = [{ type: "launch", trial: 0, arm: "incumbent", run: "2026-10-14T20-00-00_think-fast_aaaa", at: "t" }, { type: "outcome", trial: 0, arm: "incumbent", run: "2026-10-14T20-00-00_think-fast_aaaa", at: "t", reason: "budget" }].map(e => JSON.stringify(e)).join("\n") + "\n";
    const orphan = JSON.stringify({ type: "outcome", trial: 1, arm: "candidate", run: "2026-10-14T20-30-00_think-fast_bbbb", at: "t", reason: "budget" }) + "\n";
    writeFileSync(join(r, "experiments", "full-map", "trials.jsonl"), good + "not json\n");
    const broken = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(broken.runs.filter(x => x.cohort === "experiment:full-map")).toEqual([]);
    expect(broken.problems.some(p => p.includes("Experiment full-map ledger"))).toBe(true);
    writeFileSync(join(r, "experiments", "full-map", "trials.jsonl"), good + orphan);
    const orphaned = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(orphaned.runs.filter(x => x.cohort === "experiment:full-map")).toEqual([]);
    expect(orphaned.problems.some(p => p.includes("outcome without a launch"))).toBe(true);
    writeFileSync(join(r, "experiments", "full-map", "trials.jsonl"), good);
    const fixed = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(fixed.runs.find(x => x.id === "2026-10-14T20-00-00_think-fast_aaaa")?.cohort).toBe("experiment:full-map");
    expect(fixed.runs.find(x => x.id === "2026-10-14T20-30-00_think-fast_bbbb")?.cohort).toBeNull();
  });
  it("puts every finals arm, the incumbent and each finalist, in the experiment's finals cohort", async () => {
    const r = root(), ids = ["2026-10-15T11-03-44_think-fast_ab87", "2026-10-15T11-08-31_think-fast_504f", "2026-10-15T11-38-31_think-fast_c0de"];
    for (const id of ids) write(r, id, named());
    mkdirSync(join(r, "experiments", "full-map-navigation"), { recursive: true });
    const commit = "a".repeat(40);
    writeFileSync(join(r, "experiments", "full-map-navigation", "finals.jsonl"), [
      { type: "launch", trial: 0, arm: "incumbent", run: ids[0], at: "t", model: "think-fast", commit }, { type: "launcher_error", trial: 0, arm: "incumbent", run: ids[0], at: "t", message: "interrupted: no outcome was recorded" },
      { type: "launch", trial: 0, arm: "incumbent", run: ids[1], at: "t", model: "think-fast", commit }, { type: "outcome", trial: 0, arm: "incumbent", run: ids[1], at: "t", reason: "budget" },
      { type: "launch", trial: 1, arm: "whole", run: ids[2], at: "t", model: "think-fast", commit },
    ].map(e => JSON.stringify(e)).join("\n") + "\n");
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(ids.map(id => d.runs.find(x => x.id === id)?.cohort)).toEqual(Array(3).fill("experiment:full-map-navigation:finals"));
    expect(d.runs.find(x => x.id === ids[0])?.excluded).toContain("interrupted");
    expect(d.runs.find(x => x.id === ids[2])?.excluded).toBeNull();
    writeFileSync(join(r, "experiments", "full-map-navigation", "finals.jsonl"), "not json\n");
    const broken = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(broken.runs.filter(x => x.cohort !== null)).toEqual([]);
    expect(broken.problems.some(p => p.includes("full-map-navigation finals"))).toBe(true);
  });
  it("names hand-run cohorts from their launch-receipt ledgers and manifests", async () => {
    const r = root(), receipts = join(r, "launch-receipts");
    const a = "2026-10-14T18-29-33_think-fast_0dda", b = "2026-10-14T19-00-02_think-fast_fa38", c = "2026-10-14T19-30-06_think-fast_26e0", q = "2026-10-12T17-02-42_Qwen3.8-Flash-Next-UD-IQ4_XS_eece", o = "2026-10-13T16-22-31_think-fast_fc9b";
    for (const id of [a, b, c, q, o]) write(r, id, named());
    mkdirSync(join(receipts, "navigation-factorial-think-fast-n4"), { recursive: true });
    writeFileSync(join(receipts, "navigation-factorial-think-fast-n4", "manifest.json"), JSON.stringify({ id: "factorial-2x2-think-fast", presets: { control: "x", whole: "y" } }));
    writeFileSync(join(receipts, "navigation-factorial-think-fast-n4", "trials.jsonl"), [
      { type: "launch", trial: "01", arm: "control", at: 1 }, { type: "outcome", trial: "01", arm: "control", run: a, exit: 0, adopted: true, at: 2 },
      { type: "launch", trial: "02", arm: "whole", at: 3 }, { type: "outcome", trial: "02", arm: "whole", run: b, exit: 1, at: 4 },
      { type: "outcome", trial: "03", arm: "whole", run: "2026-10-14T20-00-00_think-fast_gone", exit: 0, at: 5 },
    ].map(e => JSON.stringify(e)).join("\n") + "\n" + '{"type": "launch", "tri');
    mkdirSync(join(receipts, "dialogue-information-think-fast-n4"), { recursive: true });
    writeFileSync(join(receipts, "dialogue-information-think-fast-n4", "trials.jsonl"), [
      { type: "launch", trial: 1, arm: "dialogue", run: c }, { type: "process_outcome", trial: 1, arm: "dialogue", run: c, code: null, signal: "SIGTERM" }, { type: "launcher_error", error: "no run named" },
    ].map(e => JSON.stringify(e)).join("\n") + "\n");
    mkdirSync(join(receipts, "interface-docs-resumed"), { recursive: true });
    writeFileSync(join(receipts, "interface-docs-resumed", "manifest.json"), JSON.stringify({ status: "complete", attempts: [{ run_id: q, exit_code: 0 }, { run_id: "../escape" }] }));
    mkdirSync(join(receipts, "think-fast-objectives-off-30m"), { recursive: true });
    writeFileSync(join(receipts, "think-fast-objectives-off-30m", "trials.jsonl"), [{ type: "launch", trial: 1, run: o }, { type: "launcher_error", trial: 1, run: o, error: "gateway down" }].map(e => JSON.stringify(e)).join("\n") + "\n");
    mkdirSync(join(receipts, "review-notes"), { recursive: true });
    writeFileSync(join(receipts, "review-notes", "notes.md"), `mentions ${a}`);
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000)), of = (id: string) => d.runs.find(x => x.id === id);
    expect([a, b].map(id => of(id)?.cohort)).toEqual(["factorial-2x2-think-fast", "factorial-2x2-think-fast"]);
    expect(of(a)?.excluded).toBeNull(); expect(of(b)?.excluded).toContain("exit 1");
    expect(of(c)).toMatchObject({ cohort: "dialogue-information-think-fast-n4" }); expect(of(c)?.excluded).toContain("SIGTERM");
    expect(of(q)).toMatchObject({ cohort: "interface-docs-resumed", excluded: null });
    expect(of(o)?.cohort).toBe("think-fast-objectives-off-30m"); expect(of(o)?.excluded).toContain("gateway down");
    expect(d.problems).toEqual([]);
    writeFileSync(join(receipts, "dialogue-information-think-fast-n4", "trials.jsonl"), "not json\n" + JSON.stringify({ type: "launch", run: c }) + "\n");
    const broken = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(broken.runs.find(x => x.id === c)?.cohort).toBeNull();
    expect(broken.problems.some(p => p.includes("dialogue-information-think-fast-n4"))).toBe(true);
  });
  it("never lets a hand-run ledger relabel a run a verified receipt or the experiment queue already owns", async () => {
    const r = root(), id = "2026-10-14T20-00-00_think-fast_aaaa"; write(r, id, named());
    mkdirSync(join(r, "experiments", "full-map"), { recursive: true });
    writeFileSync(join(r, "experiments", "full-map", "trials.jsonl"), JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: id, at: "t" }) + "\n");
    mkdirSync(join(r, "launch-receipts", "copy"), { recursive: true });
    writeFileSync(join(r, "launch-receipts", "copy", "trials.jsonl"), JSON.stringify({ type: "launcher_error", run: id, error: "not mine" }) + "\n");
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(d.runs[0]).toMatchObject({ cohort: "experiment:full-map", excluded: null });
  });
});
