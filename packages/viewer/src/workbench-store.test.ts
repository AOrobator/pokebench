import { RUN_LOG_MAX_BYTES } from "./run-log.js";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Log, START, assistant, state } from "../test-support/events.js";
import { frontierReferences } from "./frontier.js";
import { workbenchSnapshot } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
import { ALL_ON, playHarnessFeatures } from "@pokebench/agent/features";
import { cohort } from "../test-support/workbench-cohort.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
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
  it.each(["operator_abort", "operator_stop"] as const)("keeps %s earned progress eligible for the frontier", async reason => {
    const r = root(), log = named(); log.add(5000, { type: "run_end", turn: 1, reason, furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 5000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, "stopped", log);
    const d = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(d.runs[0]?.reason).toBe(reason); expect(d.runs[0]?.splits).toHaveLength(1);
    expect(d.runs[0]?.excluded).toBeNull();
    expect(frontierReferences(d.runs).best?.id).toBe("stopped");
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
  it.each(["PETALBURG_CITY", "RUSTBORO_CITY"])("recognizes the exact %s checkpoint filename", async checkpoint => {
    const r = root(), log = named(), start = log.events[0];
    if (start?.type !== "run_start") throw new Error("fixture");
    log.events[0] = { ...start, start_state: { kind: "save_state", path: `/saves/${checkpoint}.state`, sha1: "a".repeat(40) } };
    write(r, "saved", log);
    expect((await workbenchSnapshot(r, () => Promise.resolve(false), 42)).runs[0]?.config?.resume).toBe(checkpoint);
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
    const r = root(), p = write(r, "large", named()); truncateSync(p, RUN_LOG_MAX_BYTES + 1); const c = cohort(r, [{ type: "launch", runId: "cohort_01" }]); truncateSync(c.path, 2 * 1024 * 1024);
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
  it("names the start save of a run that loaded a Clock set or main-menu checkpoint", async () => {
    const r = root();
    for (const [id, file] of [["clockrun", "CLOCK_SET.state"], ["menurun", "MAIN_MENU.state"], ["otherrun", "OTHER.state"]] as const) {
      const log = named(); const first = log.events[0]; if (first?.type !== "run_start") throw new Error("fixture");
      log.events[0] = { ...first, start_state: { kind: "save_state", path: `/saves/fast-text/${file}`, sha1: "a".repeat(40) } };
      write(r, id, log);
    }
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(["clockrun", "menurun", "otherrun"].map(id => d.runs.find(x => x.id === id)?.config?.resume)).toEqual(["CLOCK_SET", "MAIN_MENU", null]);
  });
  it("keeps dry-run trials in their experiment after the ledger is moved aside to runs/dryruns", async () => {
    const r = root(), ids = ["2026-10-15T19-42-50_qwen36-gpu1_ab75", "2026-10-15T19-42-50_qwen36-gpu0_c205", "2026-10-15T22-32-40_qwen36-gpu1_ad45"];
    for (const id of ids) write(r, id, named());
    const launch = (slot: number, run: string): Record<string, unknown> => ({ kind: "launch", slot, lane: slot % 2 === 1 ? "A" : "B", phase: "dry-run", arm: "control", run, at: "t", commit: "c", sources: "s", presetSha256: "p", serving: "f" });
    const outcome = (slot: number, run: string, valid: boolean): Record<string, unknown> => ({ kind: "outcome", slot, run, at: "t", valid, reason: valid ? "wall cap" : "no run_end: the play process died mid-run", endReason: valid ? "budget" : null, primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: null, turns: null });
    const archive = (name: string, rows: Record<string, unknown>[]): void => { mkdirSync(join(r, "dryruns", name), { recursive: true }); writeFileSync(join(r, "dryruns", name, "trials.jsonl"), rows.map(e => JSON.stringify(e)).join("\n") + "\n"); };
    archive("bundle-v-control-dryrun-20261015-3bab974", [launch(1, ids[0] ?? ""), outcome(1, ids[0] ?? "", true), launch(2, ids[1] ?? ""), outcome(2, ids[1] ?? "", false)]);
    archive("bundle-v-control-dryrun-20261016-ca37a39", [launch(1, ids[2] ?? ""), outcome(1, ids[2] ?? "", true)]);
    mkdirSync(join(r, "dryruns", "notes"), { recursive: true }); writeFileSync(join(r, "dryruns", "notes", "trials.jsonl"), JSON.stringify({ run: ids[0] }) + "\n");
    writeFileSync(join(r, "dryruns", "README"), "loose file"); mkdirSync(join(r, "dryruns", "empty"));
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(ids.map(id => d.runs.find(x => x.id === id)?.cohort)).toEqual(["experiment:bundle-v-control-dryrun-20261015-3bab974", "experiment:bundle-v-control-dryrun-20261015-3bab974", "experiment:bundle-v-control-dryrun-20261016-ca37a39"]);
    expect(d.runs.find(x => x.id === ids[0])?.excluded).toBeNull();
    expect(d.runs.find(x => x.id === ids[1])?.excluded).toContain("died mid-run");
    expect(d.problems).toEqual([]);
    mkdirSync(join(r, "dryruns", "linked")); symlinkSync(join(r, "dryruns", "bundle-v-control-dryrun-20261016-ca37a39", "trials.jsonl"), join(r, "dryruns", "linked", "trials.jsonl"));
    const linked = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(linked.problems).toEqual(["Dry run linked: ledger exceeds metadata bounds"]);
    rmSync(join(r, "dryruns", "linked"), { recursive: true });
    mkdirSync(join(r, "dryruns", "aa-copy")); writeFileSync(join(r, "dryruns", "aa-copy", "trials.jsonl"), [launch(1, ids[2] ?? "")].map(e => JSON.stringify(e)).join("\n") + "\n");
    const duplicate = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(duplicate.runs.find(x => x.id === ids[2])?.cohort).toBe("experiment:aa-copy");
    expect(duplicate.problems).toEqual([`Dry runs aa-copy and bundle-v-control-dryrun-20261016-ca37a39 both name run ${ids[2] ?? ""}; it stays in aa-copy`]);
  });
  it("lets a live experiment ledger keep a run that an archived dry run also names", async () => {
    const r = root(), id = "2026-10-15T23-47-41_qwen36-gpu1_3f21";
    write(r, id, named());
    const rows = [{ kind: "launch", slot: 1, lane: "A", phase: "dry-run", arm: "bundle", run: id, at: "t", commit: "c", sources: "s", presetSha256: "p", serving: "f" }];
    for (const dir of [join(r, "experiments", "bundle-v-control-dryrun-cook"), join(r, "dryruns", "copy")]) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "trials.jsonl"), rows.map(e => JSON.stringify(e)).join("\n") + "\n"); }
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(d.runs.find(x => x.id === id)?.cohort).toBe("experiment:bundle-v-control-dryrun-cook");
  });
  it.each(["operator_abort", "operator_stop"] as const)("keeps a fixed-trial %s frontier without rewriting experimental validity", async endReason => {
    const r = root(), id = "stopped-fixed", log = named();
    log.add(5000, { type: "run_end", turn: 1, reason: endReason, furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 5000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }); write(r, id, log);
    const folder = join(r, "experiments", "early-stop"); mkdirSync(folder, { recursive: true });
    const launch = { kind: "launch", slot: 1, lane: "A", phase: "confirmatory", arm: "bundle", run: id, at: "t", commit: "c", sources: "s", presetSha256: "p", serving: "f" };
    const outcome = { kind: "outcome", slot: 1, run: id, at: "t", valid: false, reason: `the operator stopped the trial (${endReason})`, endReason, primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: 5000, turns: 1 };
    const ledger = join(folder, "trials.jsonl"), text = [launch, outcome].map(e => JSON.stringify(e)).join("\n") + "\n"; writeFileSync(ledger, text);
    const snapshot = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(snapshot.problems).toEqual([]); expect(snapshot.runs[0]?.cohort).toBe("experiment:early-stop");
    expect(snapshot.runs[0]?.reason).toBe(endReason); expect(snapshot.runs[0]?.excluded).toBeNull();
    expect(frontierReferences(snapshot.runs).best?.id).toBe(id); expect(readFileSync(ledger, "utf8")).toBe(text);
    // A separate plan mismatch remains excluded even when the recording ended at an operator stop.
    writeFileSync(ledger, [launch, { ...outcome, reason: "run_start does not match the plan: source", endReason }].map(e => JSON.stringify(e)).join("\n") + "\n");
    const mismatch = await workbenchSnapshot(r, () => Promise.resolve(false), 42);
    expect(mismatch.runs[0]?.excluded).toContain("does not match the plan"); expect(frontierReferences(mismatch.runs).best).toBeNull();
  });
  it("assigns fixed-run trials to their experiment and excludes the invalid ones", async () => {
    const r = root(), ids = ["2026-10-15T21-45-05_qwen36-gpu1_7b2a", "2026-10-15T21-45-05_qwen36-gpu0_a753", "2026-10-15T22-00-05_qwen36-gpu1_9999"];
    for (const id of ids) write(r, id, named());
    mkdirSync(join(r, "experiments", "bundle-v-control"), { recursive: true });
    const launch = (slot: number, lane: string, arm: string, run: string): Record<string, unknown> => ({ kind: "launch", slot, lane, phase: "confirmatory", arm, run, at: "t", commit: "c", sources: "s", presetSha256: "p", serving: "f" });
    const outcome = (slot: number, run: string, valid: boolean, reason: string): Record<string, unknown> => ({ kind: "outcome", slot, run, at: "t", valid, reason, endReason: valid ? "budget" : null, primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: null, turns: null });
    const ledger = [
      launch(1, "A", "control", ids[0] ?? ""), { kind: "started", slot: 1, run: ids[0], pid: 10, at: "t" }, outcome(1, ids[0] ?? "", true, "wall cap"),
      launch(2, "B", "bundle", ids[1] ?? ""), { kind: "started", slot: 2, run: ids[1], pid: 11, at: "t" }, outcome(2, ids[1] ?? "", false, "no run_end: the play process died mid-run"),
      launch(3, "A", "bundle", ids[2] ?? ""), { kind: "started", slot: 3, run: ids[2], pid: 12, at: "t" },
    ];
    writeFileSync(join(r, "experiments", "bundle-v-control", "trials.jsonl"), ledger.map(e => JSON.stringify(e)).join("\n") + "\n");
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(d.problems).toEqual([]);
    expect(ids.map(id => d.runs.find(x => x.id === id)?.cohort)).toEqual(Array(3).fill("experiment:bundle-v-control"));
    expect(d.runs.find(x => x.id === ids[0])?.excluded).toBeNull();
    expect(d.runs.find(x => x.id === ids[1])?.excluded).toContain("died mid-run");
    expect(d.runs.find(x => x.id === ids[2])?.excluded).toBeNull();
    writeFileSync(join(r, "experiments", "bundle-v-control", "trials.jsonl"), ledger.map(e => JSON.stringify(e)).join("\n") + "\n" + JSON.stringify({ kind: "outcome", slot: 9 }) + "\n");
    const broken = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(broken.runs.filter(x => x.cohort !== null)).toEqual([]);
    expect(broken.problems.some(p => p.includes("Experiment bundle-v-control ledger"))).toBe(true);
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
  it("hardens hand-run cohorts: provenance plans, verified names, duplicates, torn lines and rejected receipts", async () => {
    const r = root(), receipts = join(r, "launch-receipts"), ids = ["2026-10-14T20-00-00_think-fast_aaaa", "2026-10-14T20-30-00_think-fast_bbbb", "2026-10-14T21-00-00_think-fast_cccc", "2026-10-14T21-30-00_think-fast_dddd"] as const;
    for (const id of [...ids, "cohort_01"]) write(r, id, named());
    const dir = (name: string): string => { mkdirSync(join(receipts, name), { recursive: true }); return join(receipts, name); };
    writeFileSync(join(dir("planned"), "plan.json"), JSON.stringify({ order: ["off"], presets: {} })); writeFileSync(join(dir("planned"), "trials.jsonl"), JSON.stringify({ type: "launch", trial: 1, run: ids[0] }) + "\n");
    writeFileSync(join(dir("serial-plan"), "plan.json"), JSON.stringify({ preset: "x", count: 2 })); writeFileSync(join(dir("serial-plan"), "trials.jsonl"), JSON.stringify({ type: "launch", trial: 1, run: "cohort_02" }) + "\n");
    write(r, "cohort_02", named()); write(r, "cohort_03", named());
    writeFileSync(join(dir("nav-copy"), "manifest.json"), JSON.stringify({ id: "navigation-memory-think-fast-n4" })); writeFileSync(join(dir("nav-copy"), "trials.jsonl"), JSON.stringify({ run: "cohort_03" }) + "\n");
    mkdirSync(join(receipts, "prep", "nav"), { recursive: true }); writeFileSync(join(receipts, "prep", "nav", "manifest.json"), JSON.stringify({ id: "navigation-memory-think-fast-n4", order: [] }));
    cohort(r, [{ type: "outcome", runId: "cohort_01", run: "cohort_01" }]);
    writeFileSync(join(dir("impostor"), "manifest.json"), JSON.stringify({ id: "experiment:full-map" })); writeFileSync(join(dir("impostor"), "trials.jsonl"), JSON.stringify({ run: ids[1] }) + "\n");
    writeFileSync(join(dir("a-first"), "trials.jsonl"), JSON.stringify({ type: "launch", run: ids[2] }) + "\n" + '{"type": "outc');
    writeFileSync(join(dir("b-second"), "manifest.json"), JSON.stringify({ attempts: [{ run_id: ids[2] }, { run_id: ids[3], exit_code: 2 }] }));
    writeFileSync(join(dir("middle"), "trials.jsonl"), "{bad\n" + JSON.stringify({ run: ids[0] }) + "\n");
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000)), of = (id: string) => d.runs.find(x => x.id === id);
    expect(of(ids[0])?.cohort).toBeNull(); expect(of("cohort_01")?.cohort).toBeNull(); expect(of(ids[1])?.cohort).toBeNull();
    expect(of("cohort_02")?.cohort).toBe("serial-plan"); expect(of("cohort_03")?.cohort).toBeNull();
    expect(d.problems.some(p => p.includes("navigation-memory-think-fast-n4 belongs to"))).toBe(true);
    expect(of(ids[2])?.cohort).toBe("a-first"); expect(of(ids[3])).toMatchObject({ cohort: "b-second" }); expect(of(ids[3])?.excluded).toContain("exit 2");
    expect(d.problems.some(p => p.includes("experiment:full-map belongs to"))).toBe(true);
    expect(d.problems.some(p => p.includes("a-first and b-second both name run"))).toBe(true);
    expect(d.problems.some(p => p.includes("middle") && p.includes("line 1"))).toBe(true);
  });
  it("reads a finals ledger the runner is still appending to", async () => {
    const r = root(), id = "2026-10-15T11-08-31_think-fast_504f"; write(r, id, named());
    mkdirSync(join(r, "experiments", "full-map-navigation"), { recursive: true });
    writeFileSync(join(r, "experiments", "full-map-navigation", "finals.jsonl"), JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: id, at: "t", model: "think-fast", commit: "a".repeat(40) }) + "\n" + '{"type":"outco');
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(d.runs[0]).toMatchObject({ cohort: "experiment:full-map-navigation:finals", excluded: null }); expect(d.problems).toEqual([]);
  });
  it("still checks a complete last ledger line that has no newline yet", async () => {
    const r = root(), id = "2026-10-15T11-08-31_think-fast_504f"; write(r, id, named());
    mkdirSync(join(r, "experiments", "full-map-navigation"), { recursive: true });
    const launch = JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: id, at: "t", model: "think-fast", commit: "a".repeat(40) });
    writeFileSync(join(r, "experiments", "full-map-navigation", "finals.jsonl"), launch + "\n" + JSON.stringify({ type: "launcher_error", trial: 0, arm: "incumbent", run: id, at: "t", message: "boom" }));
    expect((await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000)).runs[0]?.excluded).toContain("boom");
    writeFileSync(join(r, "experiments", "full-map-navigation", "finals.jsonl"), launch + "\n" + JSON.stringify({ type: "unknown" }));
    const bad = await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000);
    expect(bad.runs[0]?.cohort).toBeNull(); expect(bad.problems.some(p => p.includes("finals ledger"))).toBe(true);
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
describe("run-tagged experiment cohorts", () => {
  const C1 = "3bab9746".padEnd(40, "1"), C2 = "ca37a392".padEnd(40, "2"), C3 = "014f1853".padEnd(40, "3");
  function tagged(r: string, id: string, experiment: string, commit: string, at: string, arm = "control"): void {
    const log = named(); const first = log.events[0]; if (first?.type !== "run_start") throw new Error("fixture");
    log.events[0] = { ...first, t: at, harness: { commit, dirty: false }, evaluation: { preset_id: "p", target: null, failure_limit: 3, flags: { loopGuard: false, activeUi: false, interfaceDocs: false, objectives: false }, experiment: { id: experiment, arm, trial: 1, of: 4 } } };
    write(r, id, log);
  }
  function definitions(r: string): void {
    const repo = join(r, ".."); mkdirSync(join(repo, "experiments", "fixed"), { recursive: true });
    writeFileSync(join(repo, "experiments", "fixed", "bundle-v-control.json"), JSON.stringify({ id: "bundle-v-control", title: "Bundle vs control" }));
    writeFileSync(join(repo, "experiments", "full-map-navigation.json"), JSON.stringify({ id: "full-map-navigation", title: "Whole-map navigation" }));
    writeFileSync(join(repo, "experiments", "broken.json"), "{not json");
    writeFileSync(join(repo, "experiments", "untitled.json"), JSON.stringify({ id: "untitled" }));
  }
  const snap = async (r: string) => parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
  it("groups tagged runs by experiment and build wherever their ledgers live, with readable labels", async () => {
    const r = root(); definitions(r);
    tagged(r, "2026-10-15T19-42-50_qwen36-gpu1_ab75", "bundle-v-control-dryrun", C1, "2026-10-15T19:42:50.000-04:00");
    tagged(r, "2026-10-15T19-42-51_qwen36-gpu0_c205", "bundle-v-control-dryrun", C1, "2026-10-15T19:42:51.000-04:00", "bundle");
    tagged(r, "2026-10-16T02-32-40_qwen36-gpu1_ad45", "bundle-v-control-dryrun", C2, "2026-10-16T02:32:40.000-04:00");
    tagged(r, "2026-10-16T03-43-30_qwen36-gpu1_cook", "bundle-v-control-dryrun-cook", C2, "2026-10-16T03:43:30.000-04:00");
    tagged(r, "2026-10-16T05-00-00_qwen36-gpu1_main", "bundle-v-control", C2, "2026-10-16T05:00:00.000-04:00");
    tagged(r, "2026-10-16T06-00-00_qwen36-gpu1_loose", "checkpoint-start-check", C3, "2026-10-16T06:00:00.000-04:00");
    const d = await snap(r), of = (id: string) => d.runs.find(x => x.id === id);
    const v1 = `experiment:bundle-v-control-dryrun@${C1.slice(0, 12)}`, v2 = `experiment:bundle-v-control-dryrun@${C2.slice(0, 12)}`;
    expect(["2026-10-15T19-42-50_qwen36-gpu1_ab75", "2026-10-15T19-42-51_qwen36-gpu0_c205"].map(id => of(id)?.cohort)).toEqual([v1, v1]);
    expect(of("2026-10-16T02-32-40_qwen36-gpu1_ad45")?.cohort).toBe(v2);
    expect(["2026-10-15T19-42-50_qwen36-gpu1_ab75", "2026-10-15T19-42-51_qwen36-gpu0_c205"].map(id => of(id)?.arm)).toEqual(["control", "bundle"]);
    expect(of("2026-10-16T03-43-30_qwen36-gpu1_cook")?.cohort).toBe(`experiment:bundle-v-control-dryrun-cook@${C2.slice(0, 12)}`);
    expect(of("2026-10-16T05-00-00_qwen36-gpu1_main")?.cohort).toBe(`experiment:bundle-v-control@${C2.slice(0, 12)}`);
    expect(of("2026-10-16T06-00-00_qwen36-gpu1_loose")?.cohort).toBe(`experiment:checkpoint-start-check@${C3.slice(0, 12)}`);
    const label = (id: string) => d.cohorts?.find(c => c.id === id);
    expect(label(v1)).toEqual({ id: v1, label: "Bundle vs control (dry run) · build 3bab974, first trial Oct 15, 7:42 PM ET", experiment: "bundle-v-control-dryrun", build: C1, dryRun: true });
    expect(label(v2)?.label).toBe("Bundle vs control (dry run) · build ca37a39, first trial Oct 16, 2:32 AM ET");
    expect(label(`experiment:bundle-v-control-dryrun-cook@${C2.slice(0, 12)}`)).toMatchObject({ label: "Bundle vs control (dry run, cook)", dryRun: true });
    expect(label(`experiment:bundle-v-control@${C2.slice(0, 12)}`)).toMatchObject({ label: "Bundle vs control", experiment: "bundle-v-control", dryRun: false });
    expect(label(`experiment:checkpoint-start-check@${C3.slice(0, 12)}`)).toMatchObject({ label: "checkpoint-start-check", experiment: "checkpoint-start-check" });
    expect(d.problems).toEqual([]);
  });
  it("lets ledgers anywhere exclude a tagged run but never move it, and keeps legacy cohorts for untagged runs", async () => {
    const r = root(); definitions(r);
    const ok = "2026-10-15T19-42-50_qwen36-gpu1_ab75", died = "2026-10-15T19-42-51_qwen36-gpu0_c205", erred = "2026-10-15T20-00-00_think-fast_err1", exited = "2026-10-15T20-10-00_think-fast_exit", legacy = "2026-10-14T20-00-00_think-fast_aaaa", finals = "2026-10-14T21-00-00_think-fast_fin1";
    tagged(r, ok, "bundle-v-control-dryrun", C1, "2026-10-15T19:42:50.000-04:00"); tagged(r, died, "bundle-v-control-dryrun", C1, "2026-10-15T19:42:51.000-04:00");
    tagged(r, erred, "full-map-navigation", C3, "2026-10-15T20:00:00.000-04:00"); tagged(r, exited, "Whole-map × memory", C3, "2026-10-15T20:10:00.000-04:00");
    write(r, legacy, named()); write(r, finals, named());
    const launch = (slot: number, run: string): Record<string, unknown> => ({ kind: "launch", slot, lane: "A", phase: "dry-run", arm: "control", run, at: "t", commit: "c", sources: "s", presetSha256: "p", serving: "f" });
    const outcome = (slot: number, run: string, valid: boolean): Record<string, unknown> => ({ kind: "outcome", slot, run, at: "t", valid, reason: valid ? "wall cap" : "no run_end: the play process died mid-run", endReason: valid ? "budget" : null, primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: null, turns: null });
    for (const dir of [join(r, "dryruns", "renamed-archive"), join(r, "dryruns", "second-copy")]) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "trials.jsonl"), [launch(1, ok), outcome(1, ok, true), launch(2, died), outcome(2, died, false)].map(e => JSON.stringify(e)).join("\n") + "\n"); }
    mkdirSync(join(r, "experiments", "full-map-navigation"), { recursive: true });
    writeFileSync(join(r, "experiments", "full-map-navigation", "trials.jsonl"), [{ type: "launch", trial: 0, arm: "incumbent", run: erred, at: "t" }, { type: "launcher_error", trial: 0, arm: "incumbent", run: erred, at: "t", message: "play exited with 1" }, { type: "launch", trial: 1, arm: "incumbent", run: legacy, at: "t" }].map(e => JSON.stringify(e)).join("\n") + "\n");
    writeFileSync(join(r, "experiments", "full-map-navigation", "finals.jsonl"), JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: finals, at: "t", model: "think-fast", commit: "a".repeat(40) }) + "\n");
    mkdirSync(join(r, "launch-receipts", "factorial"), { recursive: true });
    writeFileSync(join(r, "launch-receipts", "factorial", "manifest.json"), JSON.stringify({ id: "factorial-2x2", label: "Whole-map × memory" }));
    writeFileSync(join(r, "launch-receipts", "factorial", "trials.jsonl"), JSON.stringify({ type: "outcome", trial: "01", run: exited, exit: 1 }) + "\n");
    const d = await snap(r), of = (id: string) => d.runs.find(x => x.id === id);
    const dry = `experiment:bundle-v-control-dryrun@${C1.slice(0, 12)}`;
    expect(of(ok)).toMatchObject({ cohort: dry, excluded: null });
    expect(of(died)?.cohort).toBe(dry); expect(of(died)?.excluded).toContain("died mid-run");
    expect(of(erred)?.cohort).toBe(`experiment:full-map-navigation@${C3.slice(0, 12)}`); expect(of(erred)?.excluded).toContain("play exited with 1");
    expect(of(exited)?.cohort).toBe(`experiment:factorial-2x2@${C3.slice(0, 12)}`); expect(of(exited)?.excluded).toContain("exit 1");
    expect(of(legacy)).toMatchObject({ cohort: "experiment:full-map-navigation", arm: null, excluded: null });
    expect(of(finals)?.cohort).toBe("experiment:full-map-navigation:finals");
    const label = (id: string) => d.cohorts?.find(c => c.id === id)?.label;
    expect(label(`experiment:factorial-2x2@${C3.slice(0, 12)}`)).toBe("Whole-map × memory");
    expect(label(`experiment:full-map-navigation@${C3.slice(0, 12)}`)).toBe("Whole-map navigation");
    expect(label("experiment:full-map-navigation")).toBe("Whole-map navigation (experiment:full-map-navigation)");
    expect(label("experiment:full-map-navigation:finals")).toBe("Whole-map navigation — finals");
    expect(d.cohorts?.find(c => c.id === "experiment:full-map-navigation")).toMatchObject({ experiment: "full-map-navigation", build: null, dryRun: false });
  });
  it("labels legacy cohorts it cannot resolve with their raw value and reports a legacy value a tagged cohort also uses", async () => {
    const r = root(); definitions(r);
    const t = "2026-10-15T19-42-50_qwen36-gpu1_ab75", u = "2026-10-14T20-00-00_think-fast_aaaa", h = "2026-10-14T20-30-00_think-fast_bbbb";
    tagged(r, t, "solo", C1, "2026-10-15T19:42:50.000-04:00"); write(r, u, named()); write(r, h, named());
    const clash = `experiment:solo@${C1.slice(0, 12)}`;
    mkdirSync(join(r, "experiments", `solo@${C1.slice(0, 12)}`), { recursive: true });
    writeFileSync(join(r, "experiments", `solo@${C1.slice(0, 12)}`, "trials.jsonl"), JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: u, at: "t" }) + "\n");
    mkdirSync(join(r, "launch-receipts", "hand-run"), { recursive: true });
    writeFileSync(join(r, "launch-receipts", "hand-run", "trials.jsonl"), JSON.stringify({ type: "launch", run: h }) + "\n");
    const d = await snap(r);
    expect(d.cohorts?.find(c => c.id === "hand-run")).toEqual({ id: "hand-run", label: "hand-run", experiment: null, build: null, dryRun: false });
    expect(d.runs.find(x => x.id === u)?.cohort).toBe(clash); expect(d.runs.find(x => x.id === t)?.cohort).toBe(clash);
    expect(d.problems).toContain(`Legacy cohort ${clash} has the value of a run-tagged cohort; run ${u} is not tagged`);
  });
  it("takes a tagged run's failure from a plan-based or verified-name receipt that legacy membership skips", async () => {
    const r = root(), planned = "2026-10-15T20-00-00_think-fast_plan", signalled = "2026-10-15T20-10-00_think-fast_sigs", errored = "2026-10-15T20-20-00_think-fast_lerr";
    for (const id of [planned, signalled, errored]) tagged(r, id, "plan-cohort", C1, "2026-10-15T20:00:00.000-04:00");
    const dir = (name: string): string => { mkdirSync(join(r, "launch-receipts", name), { recursive: true }); return join(r, "launch-receipts", name); };
    writeFileSync(join(dir("planned"), "plan.json"), JSON.stringify({ order: ["off"], presets: {} }));
    writeFileSync(join(dir("planned"), "trials.jsonl"), [{ type: "launch", trial: 1, run: planned }, { type: "outcome", trial: 1, run: planned, exit: 1 }, { type: "outcome", trial: 2, run: signalled, code: null, signal: "SIGKILL" }].map(e => JSON.stringify(e)).join("\n") + "\n");
    writeFileSync(join(dir("impostor"), "manifest.json"), JSON.stringify({ id: "experiment:taken", attempts: [{ run_id: errored }] }));
    writeFileSync(join(dir("impostor"), "trials.jsonl"), JSON.stringify({ type: "launcher_error", run: errored, error: "gateway down" }) + "\n");
    const d = await snap(r), of = (id: string) => d.runs.find(x => x.id === id);
    expect(of(planned)).toMatchObject({ cohort: `experiment:plan-cohort@${C1.slice(0, 12)}` }); expect(of(planned)?.excluded).toContain("exit 1");
    expect(of(signalled)?.excluded).toContain("SIGKILL"); expect(of(errored)?.excluded).toContain("gateway down");
  });
  it("excludes a tagged run that an unreadable ledger names, since its validity cannot be checked", async () => {
    const r = root(), ids = ["2026-10-15T20-00-00_think-fast_q001", "2026-10-15T20-01-00_think-fast_f001", "2026-10-15T20-02-00_think-fast_d001", "2026-10-15T20-03-00_think-fast_h001", "2026-10-15T20-04-00_think-fast_c001", "2026-10-15T20-05-00_think-fast_free"] as const;
    for (const id of ids) tagged(r, id, "corrupt", C1, "2026-10-15T20:00:00.000-04:00");
    const untagged = "2026-10-14T20-00-00_think-fast_untg"; write(r, untagged, named());
    const at = (path: string, text: string): void => { mkdirSync(join(r, path, ".."), { recursive: true }); writeFileSync(join(r, path), text); };
    at("experiments/queue/trials.jsonl", JSON.stringify({ type: "launch", trial: 0, arm: "a", run: ids[0], at: "t" }) + "\n" + JSON.stringify({ type: "launch", trial: 0, arm: "a", run: untagged, at: "t" }) + "\nnot json\n");
    const launch = { kind: "launch", slot: 1, lane: "A", phase: "dry-run", arm: "control", run: ids[1], at: "t", commit: "c", sources: "s", presetSha256: "p", serving: "f" };
    at("experiments/fixed-one/trials.jsonl", JSON.stringify(launch) + "\n" + JSON.stringify({ kind: "outcome", slot: 9 }) + "\n");
    at("dryruns/archive/trials.jsonl", JSON.stringify({ ...launch, run: ids[2] }) + "\n" + `{"kind": "outcome", "run": "${ids[2]}", broken\n` + JSON.stringify({ kind: "outcome", slot: 9 }) + "\n");
    at("launch-receipts/hand/trials.jsonl", `{bad "run_id": "${ids[3]}"\n` + JSON.stringify({ run: ids[3] }) + "\n");
    cohort(r, [{ type: "outcome", runId: ids[4], run: ids[4], exitCode: 0, reason: "budget" }]);
    const d = await snap(r), of = (id: string) => d.runs.find(x => x.id === id);
    for (const id of ids.slice(0, 5)) { expect(of(id)?.cohort).toBe(`experiment:corrupt@${C1.slice(0, 12)}`); expect(of(id)?.excluded).toMatch(/^Unverified: ledger .+ is unreadable/); }
    expect(of(ids[0])?.excluded).toContain("experiments/queue/trials.jsonl");
    expect(of(ids[5])?.excluded).toBeNull(); expect(of(untagged)).toMatchObject({ cohort: null, excluded: null });
  });
});

describe("recovered route103_rival side file", () => {
  const scratch = mkdtempSync(join(tmpdir(), "ram-"));
  const ram = (n: 1 | 2 | 3) => writeArchive(scratch, n, [rivalRam(false, false), rivalRam(true, false), rivalRam(false, true)][n - 1] ?? []);
  const copyRam = (dir: string) => { cpSync(join(scratch, "raw-ram"), join(dir, "raw-ram"), { recursive: true }); };
  const battle = (): Log => {
    const l = new Log();
    l.add(0, { ...START, harness_features: ["ram-state-v1"] });
    l.add(1000, state({ location: "ROUTE103", raw_ram: ram(1) }));
    l.add(2000, state({ location: "ROUTE103", in_battle: true, raw_ram: ram(2) }));
    l.add(3000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 3000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    return l;
  };
  it("re-grades a cached run when the side file is written or removed", async () => {
    const r = root(), p = write(r, "rv", battle());
    const names = async () => (await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000)).runs[0]?.splits.map((s) => s.name) ?? [];
    expect(await names()).not.toContain("RIVAL_BATTLE_STARTED");
    mkdirSync(join(r, "rv", "derived"));
    copyRam(join(r, "rv"));
    const side = join(r, "rv", "derived", "route103_rival.jsonl");
    writeFileSync(side, [{ v: 1, run: "rv", source: "raw-ram-route103-v1" }, ...([[1, false], [2, true]] as const).map(([n, active]) => ({ seq: n, raw_ram: ram(n).path, sha256: ram(n).sha256, route103_rival: { battle_active: active, defeated: false, oldale_stage: 0 } }))].map((row) => JSON.stringify(row)).join("\n") + "\n");
    expect(await names()).toContain("RIVAL_BATTLE_STARTED");
    rmSync(side);
    expect(await names()).not.toContain("RIVAL_BATTLE_STARTED");
    expect(p.endsWith("events.jsonl")).toBe(true);
  });
});

describe("trainer card data", () => {
  it("carries the trainer name, place and party from the run's last state", async () => {
    const r = root(), log = named();
    log.add(5000, state({ name: "RED", location: "OLDALE TOWN", party: [{ species: "TORCHIC", level: 7, hp: 20, max_hp: 22, species_id: 280, is_egg: false }, { species: "TORCHIC", level: 1, hp: 0, max_hp: 0, species_id: 280, is_egg: true }] }));
    write(r, "card", log);
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000));
    expect(d.runs[0]?.card).toEqual({ name: "RED", location: "OLDALE TOWN", party: [{ speciesId: 280, level: 7, egg: false }, { speciesId: 280, level: 1, egg: true }] });
  });
  it("has no card before the game reports a state, and a null species id when the readout lacks one", async () => {
    const r = root(), bare = new Log(); bare.add(0, START); bare.add(1000, assistant()); write(r, "bare", bare); write(r, "old", named());
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000));
    expect(d.runs.find(x => x.id === "bare")?.card).toBeNull();
    expect(d.runs.find(x => x.id === "old")?.card).toEqual({ name: "MAY", location: "LITTLEROOT TOWN", party: [{ speciesId: null, level: 5, egg: false }] });
  });
  it("leaves out a party slot the readout gives level 0, so one odd state cannot fail the whole snapshot", async () => {
    const r = root(), log = named();
    log.add(5000, state({ party: [{ species: "TORCHIC", level: 0, hp: 0, max_hp: 0, species_id: 280, is_egg: false }, { species: "TORCHIC", level: 6, hp: 20, max_hp: 20, species_id: 280, is_egg: false }] }));
    write(r, "zero", log);
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000));
    expect(d.runs[0]?.card?.party).toEqual([{ speciesId: 280, level: 6, egg: false }]);
  });
  it("carries the run's experiment, arm and trial from its header, and null without one", async () => {
    const r = root(), log = named(), first = log.events[0];
    if (first?.type !== "run_start") throw new Error("fixture start");
    log.events[0] = { ...first, evaluation: { preset_id: "bundle-v-control", target: null, failure_limit: 3, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true }, experiment: { id: "exp-a", arm: "bundle", trial: 2, of: 4 } } };
    write(r, "tagged", log); write(r, "plain", named());
    const d = parseWorkbench(await workbenchSnapshot(r, () => Promise.resolve(true), 2000000000000));
    expect(d.runs.find(x => x.id === "tagged")?.experiment).toEqual({ id: "exp-a", arm: "bundle", trial: 2, of: 4 });
    expect(d.runs.find(x => x.id === "plain")?.experiment).toBeNull();
    const run = d.runs[0]; if (run === undefined) throw new Error("fixture");
    for (const experiment of [{ id: 1, arm: "a", trial: 1, of: 2 }, { id: "x", arm: "a", trial: 0, of: 2 }, { id: "x", arm: "a", trial: 1.5, of: 2 }]) expect(() => parseWorkbench({ ...d, runs: [{ ...run, experiment }] })).toThrow("Invalid workbench");
  });
  it("rejects a malformed card at the browser boundary", async () => {
    const r = root(); write(r, "card", named()); const d = await workbenchSnapshot(r, () => Promise.resolve(true), 42);
    const run = d.runs[0]; if (run === undefined) throw new Error("missing fixture");
    for (const card of [{ name: 1, location: null, party: [] }, { name: null, location: null, party: [{ speciesId: 999, level: 5, egg: false }] }, { name: null, location: null, party: [{ speciesId: 1, level: 0, egg: false }] }, { name: null, location: null, party: Array.from({ length: 7 }, () => ({ speciesId: 1, level: 5, egg: false })) }])
      expect(() => parseWorkbench({ ...d, runs: [{ ...run, card }] })).toThrow("Invalid workbench");
    expect(parseWorkbench({ ...d, runs: [{ ...run, card: undefined }] }).runs[0]?.card).toBeUndefined();
  });
});


it("refreshes cached extension projections only for applied acknowledgements and preserves the original horizon", async () => {
  const r = root(), log = new Log();
  log.add(0, { ...START, extend_run: true });
  const path = write(r, "extended", log);
  const snapshot = () => workbenchSnapshot(r, () => Promise.resolve(true), 2_000_000_000_000).then(data => data.runs[0]);
  const append = (event: Parameters<Log["add"]>[1]): void => {
    const recorded = log.add(1000 + log.events.length * 1000, event);
    appendFileSync(path, JSON.stringify({ ...recorded, run: "extended" }) + "\n");
  };
  expect((await snapshot())?.config?.extendedWallMs).toBeUndefined();
  append({ type: "operator_control", turn: 0, action: "extend_30m", status: "ignored", request: 1 });
  expect((await snapshot())?.config?.extendedWallMs).toBeUndefined();
  append({ type: "operator_control", turn: 0, action: "extend_30m", status: "applied", request: 2, previous_max_wall_ms: 60_000, max_wall_ms: 1_860_000 });
  expect((await snapshot())?.config).toMatchObject({ maxWallMs: 60_000, extendedWallMs: 1_860_000 });
  append({ type: "operator_control", turn: 0, action: "extend_60m", status: "failed", request: 3 });
  expect((await snapshot())?.config?.extendedWallMs).toBe(1_860_000);
  append({ type: "operator_control", turn: 0, action: "extend_60m", status: "applied", request: 4, previous_max_wall_ms: 1_860_000, max_wall_ms: 5_460_000 });
  expect((await snapshot())?.config).toMatchObject({ maxWallMs: 60_000, extendedWallMs: 5_460_000 });
});
