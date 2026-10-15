import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionHash, parseExperiment, trialOrder, type ReadinessRun } from "@pokebench/agent/experiments";
import { FINALS_MAX_TURNS, finalsOrder } from "@pokebench/agent/experiment-gate";
import { playHarnessFeatures, type FeatureSet } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { activeCohort, pidCommand, productionHost } from "./experiment-cli.js";
import { ApprovalError, setFinalsWithdrawn } from "./experiment-approval.js";
import { ExperimentAutoRun } from "./experiment-autorun.js";
import { effectiveExperiment, findCohort, finalsLedgerPath, finalsResultPath, nominationPath, pinnedPromotion, promotionOverlay, promotionsPath, readPromotions, reusableRuns } from "./experiment-gate-store.js";
import { nextStep, runQueue, type RunnerHost, type TrialLaunch } from "./experiment-runner.js";
import { experimentDir, queueSnapshot, winnerGateOn, type QueuePaths, type RunSource, type TrialMetrics } from "./experiment-store.js";
import { LEASE } from "./next-run.js";

const FINALS = { runsPerArm: 4, maxWallMs: 600_000 };
const HOUSE = ["CLOCK_SET", "MOM_RIVAL_INSTRUCTION", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED"];
const MET = [...HOUSE, "RIVAL_BEDROOM_REACHED", "RIVAL_MET"];
const reach = (names: readonly string[]): TrialMetrics => ({ reached: names, milestoneMs: Object.fromEntries(names.map((n, i) => [n, 60_000 * (i + 1)])), turns: 50, wallMs: 600_000 });
const nothing: TrialMetrics = { reached: [], milestoneMs: {}, turns: 50, wallMs: 600_000 };

interface World { paths: QueuePaths; metrics: Map<string, TrialMetrics>; source: RunSource; recent: ReadinessRun[]; root: string }
function world(gate = true): World {
  const root = mkdtempSync(join(tmpdir(), "pokebench-gate-"));
  const paths: QueuePaths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "none.md"), winnerGate: gate };
  mkdirSync(paths.runsRoot, { recursive: true });
  const metrics = new Map<string, TrialMetrics>();
  const recent: ReadinessRun[] = ["r1", "r2", "r3", "r4"].map((id) => ({ id, model: "think-fast", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT", "CLOCK_SET"] }));
  return { root, paths, metrics, recent, source: { recent: () => recent, trial: (id) => metrics.get(id) ?? null } };
}
function approve(paths: QueuePaths, value: Record<string, unknown>): void {
  const id = String(value["id"]);
  mkdirSync(experimentDir(paths.runsRoot, id), { recursive: true });
  writeFileSync(join(experimentDir(paths.runsRoot, id), "approval.json"), JSON.stringify({ experiment: id, sha256: definitionHash(parseExperiment(value)), approvedAt: "t", approvedBy: "operator" }));
}
const presetOf = (id: string, features: FeatureSet): Record<string, unknown> => ({ version: 2, id, target: null, limits: { maxTurns: 1500, maxWallMs: 1_800_000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features, start: { kind: "save_state", path: "/x/CLOCK_SET.state", sha1: "a".repeat(40) } });
// A four-arm cohort like the Think Fast 2×2: control, whole, memory, both.
function cohort(w: World, status: string, outcomes: Record<string, readonly TrialMetrics[]>): string {
  const dir = join(w.paths.runsRoot, "launch-receipts", "factorial");
  mkdirSync(dir, { recursive: true });
  const control: FeatureSet = { ...QUEUE_FEATURES, "navigation-evidence-memory-v1": false };
  const arms: Record<string, FeatureSet> = { control, whole: { ...control, "full-map-navigation-v1": true }, memory: { ...control, "navigation-evidence-memory-v1": true }, both: { ...control, "full-map-navigation-v1": true, "navigation-evidence-memory-v1": true } };
  for (const [arm, features] of Object.entries(arms)) writeFileSync(join(dir, `preset-${arm}.json`), JSON.stringify(presetOf(`f-${arm}`, features)));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ id: "cohort-2x2", presets: Object.fromEntries(Object.keys(arms).map((a) => [a, "x"])) }));
  writeFileSync(join(dir, "queue.json"), JSON.stringify({ status }));
  const rows = Object.entries(outcomes).flatMap(([arm, list]) => list.map((m, i) => { const run = `c-${arm}-${String(i)}`; w.metrics.set(run, m); return JSON.stringify({ type: "outcome", trial: "01", arm, run, exit: 0 }); }));
  writeFileSync(join(dir, "trials.jsonl"), `${rows.join("\n")}\n{"torn`);
  return dir;
}

interface Fake extends RunnerHost { launches: TrialLaunch[]; lines: string[] }
let n = 0;
function writeRun(paths: QueuePaths, runId: string, features: FeatureSet, reason = "budget"): void {
  const log = new Log();
  log.add(0, { ...START, harness_features: playHarnessFeatures(features, null) });
  log.add(60_000, { type: "run_end", turn: 9, reason: reason as "budget", furthest_milestone: null, turns: 9, wall_ms: 60_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  mkdirSync(join(paths.runsRoot, runId), { recursive: true });
  writeFileSync(join(paths.runsRoot, runId, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: runId })).join("\n") + "\n");
}
// Whole-map on reaches the rival; everything else stops at the rival's house.
function host(w: World, over: Partial<RunnerHost> = {}, outcome: (features: FeatureSet) => TrialMetrics = (f) => reach(f["full-map-navigation-v1"] ? MET : HOUSE)): Fake {
  const launches: TrialLaunch[] = [], lines: string[] = [];
  return {
    launches, lines,
    now: () => new Date("2026-10-15T08:00:00Z"),
    runId: (model) => `2026-10-15T08-00-${String(n++).padStart(4, "0")}_${model}_gate`,
    head: () => Promise.resolve("e".repeat(40)),
    verifySource: () => Promise.resolve(null),
    liveRuns: () => Promise.resolve([]),
    discover: (lane) => Promise.resolve({ id: lane, fingerprint: "f".repeat(64) }),
    launch: (trial) => {
      launches.push(trial);
      expect(existsSync(join(w.paths.runsRoot, LEASE, "owner.json"))).toBe(true);
      const preset = JSON.parse(readFileSync(trial.presetPath, "utf8")) as { features: FeatureSet };
      writeRun(w.paths, trial.runId, preset.features);
      w.metrics.set(trial.runId, outcome(preset.features));
      return Promise.resolve(0);
    },
    log: (line) => { lines.push(line); },
    activeCohort: () => Promise.resolve(null),
    ...over,
  };
}
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const lines = <T>(path: string): T[] => readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l) as T);

// The full-map experiment measured in the 2×2, an approved hint experiment behind it, and one that tests whole-map again.
function gated(w: World): void {
  writeDefinition(w.paths.experimentsDir, definition("full-map", { externalCohort: "cohort-2x2", finals: FINALS, primaryMilestone: "RIVAL_HOUSE_ENTERED" }));
  const hint = definition("hint", { changedFeature: "next-milestone-hint-v1", queuePosition: 2, trialsPerArm: 4 });
  writeDefinition(w.paths.experimentsDir, hint);
  approve(w.paths, hint);
  writeDefinition(w.paths.experimentsDir, definition("again", { queuePosition: 3 }));
}
const COHORT = { control: [reach(HOUSE), nothing, nothing, nothing], whole: [reach(MET), reach(HOUSE), reach(HOUSE), nothing], memory: [nothing, nothing, nothing, nothing], both: [reach(HOUSE), reach(HOUSE), nothing, nothing] };

describe("winner gate", () => {
  it("is on unless POKEBENCH_WINNER_GATE=off", () => {
    expect(winnerGateOn({})).toBe(true);
    expect(winnerGateOn({ POKEBENCH_WINNER_GATE: "off" })).toBe(false);
  });

  it("holds every new experiment while the cohort runs, nominates its finalists, runs them from boot, then promotes the winner (INV-G1, G2, G3)", async () => {
    const w = world();
    gated(w);
    const dir = cohort(w, "running", COHORT);
    let s = queueSnapshot(w.paths, w.source);
    expect(s.gate).toMatchObject([{ experiment: "full-map", state: "waiting" }]);
    expect(s.gateBlock).toMatch(/waiting for the cohort-2x2 cohort to finish \(running\)/);
    expect(s.queue.find((v) => v.id === "full-map")?.state).toBe("running");
    expect(nextStep(s)).toEqual({ kind: "blocked", reason: expect.stringMatching(/^full-map: waiting/) as string });
    const idle = host(w);
    expect((await runQueue({ paths: w.paths, source: w.source, host: idle })).stopped).toMatch(/^waiting: full-map: waiting for the cohort-2x2 cohort/);
    expect(idle.launches).toEqual([]);

    writeFileSync(join(dir, "queue.json"), JSON.stringify({ status: "done" }));
    s = queueSnapshot(w.paths, w.source);
    expect(s.gate).toMatchObject([{ state: "nominating" }]);
    expect(s.closed.find((v) => v.id === "full-map")).toMatchObject({ state: "done", reason: expect.stringMatching(/its finalists go to the winner gate/) as string });
    expect(await runQueue({ paths: w.paths, source: w.source, host: host(w), dryRun: true })).toEqual({ ran: 0, stopped: "dry run: full-map nominates its cohort's finalists next" });

    // The chain behind the cohort still runs: nominate, but never take the machine.
    const busy = host(w, { activeCohort: () => Promise.resolve("factorial-chain") });
    await expect(runQueue({ paths: w.paths, source: w.source, host: busy })).rejects.toThrow("cohort factorial-chain is still running");
    expect(busy.launches).toEqual([]);
    const nomination = (read(nominationPath(w.paths.runsRoot, "full-map")) as { finalists: { arm: string; switches: Record<string, boolean> }[]; ranking: { arm: string }[]; incumbent: { limits: { maxTurns: number; maxWallMs: number }; start?: unknown; target: unknown }; reusedIncumbent: string[] });
    expect(nomination.ranking.map((r) => r.arm)).toEqual(["whole", "both", "control", "memory"]);
    expect(nomination.finalists).toEqual([{ arm: "whole", switches: { "full-map-navigation-v1": true } }, { arm: "both", switches: { "full-map-navigation-v1": true, "navigation-evidence-memory-v1": true } }]);
    expect(nomination.incumbent).toMatchObject({ target: null, limits: { maxTurns: FINALS_MAX_TURNS, maxWallMs: 600_000 } });
    expect(nomination.incumbent.start).toBeUndefined();
    expect(nomination.reusedIncumbent).toEqual([]);
    s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]).toMatchObject({ state: "finals", reason: "2 finalist(s) wait for 12 runs from boot" });
    expect(s.gate[0]?.trials).toHaveLength(12);
    // A nomination recorded while finals still turned the stall stop on plays the full wall limit too.
    const recorded = read(nominationPath(w.paths.runsRoot, "full-map")) as { incumbent: { features: Record<string, boolean> } };
    recorded.incumbent.features["milestone-stall-stop-v1"] = true;
    writeFileSync(nominationPath(w.paths.runsRoot, "full-map"), JSON.stringify(recorded));

    const fake = host(w);
    const outcome = await runQueue({ paths: w.paths, source: w.source, host: fake, stopRequested: () => fake.launches.length >= 14 });
    expect(fake.launches.slice(0, 12).map((l) => l.presetPath.replace(/.*finals-/, "").replace(".json", ""))).toEqual(finalsOrder(["incumbent", "whole", "both"], 4));
    const finalsPreset = (read(join(experimentDir(w.paths.runsRoot, "full-map"), "presets", "finals-both.json")) as { features: Record<string, boolean>; limits: { maxWallMs: number } });
    expect(finalsPreset).toMatchObject({ limits: { maxWallMs: 600_000 }, features: { "navigation-evidence-memory-v1": true, "full-map-navigation-v1": true } });
    for (const arm of ["incumbent", "whole", "both"]) expect((read(join(experimentDir(w.paths.runsRoot, "full-map"), "presets", `finals-${arm}.json`)) as { features: Record<string, boolean> }).features["milestone-stall-stop-v1"]).toBe(false);
    const result = (read(finalsResultPath(w.paths.runsRoot, "full-map")) as { decision: { winner: string; verdicts: { arm: string; pass: boolean }[] }; promotion: string });
    expect(result).toMatchObject({ promotion: "full-map:whole", decision: { winner: "whole", verdicts: [{ arm: "whole", pass: true }, { arm: "both", pass: true }] } });
    expect(readPromotions(w.paths.runsRoot)).toMatchObject([{ id: "full-map:whole", from: "full-map", arm: "whole", features: { "full-map-navigation-v1": true } }]);
    expect(readPromotions(w.paths.runsRoot)[0]?.finals).toHaveLength(4);
    expect(outcome.stopped).toMatch(/full-map finals: whole won and is now the incumbent/);

    // The approved hint experiment then runs on the promoted incumbent; its approval carried over (INV-G4).
    const hintLaunch = fake.launches[12];
    expect(hintLaunch?.presetPath).toMatch(/hint[/\\]presets[/\\]incumbent\.json$/);
    expect((read(hintLaunch?.presetPath ?? "") as { features: Record<string, boolean> }).features["full-map-navigation-v1"]).toBe(true);
    expect(lines<{ type: string; promotion?: string }>(join(experimentDir(w.paths.runsRoot, "hint"), "trials.jsonl"))[0]).toMatchObject({ type: "launch", promotion: "full-map:whole" });
    s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]).toMatchObject({ state: "declared", winner: "whole", reason: "whole won the finals and is now the incumbent" });
    expect(s.gateBlock).toBeNull();
    expect(s.incumbent).toMatchObject({ from: "full-map", arm: "whole" });
    expect(s.queue.find((v) => v.id === "hint")).toMatchObject({ incumbentOn: true, approved: true });
    expect(s.queue.find((v) => v.id === "again")).toMatchObject({ state: "blocked", reason: expect.stringMatching(/full-map-navigation-v1 was decided by the full-map finals \(now on in the incumbent\)/) as string });
    // Settling twice never appends the promotion twice.
    writeFileSync(finalsResultPath(w.paths.runsRoot, "full-map"), "{}");
    await runQueue({ paths: w.paths, source: w.source, host: host(w), stopRequested: () => true });
    expect(readPromotions(w.paths.runsRoot)).toHaveLength(1);
  });

  it("leaves the incumbent alone when no finalist beats it from boot", async () => {
    const w = world();
    gated(w);
    cohort(w, "done", COHORT);
    const fake = host(w, {}, () => reach(HOUSE));
    await runQueue({ paths: w.paths, source: w.source, host: fake, stopRequested: () => fake.launches.length >= 12 });
    expect((read(finalsResultPath(w.paths.runsRoot, "full-map")) as { decision: { winner: null }; promotion: null })).toMatchObject({ promotion: null, decision: { winner: null } });
    expect(existsSync(promotionsPath(w.paths.runsRoot))).toBe(false);
    const s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]).toMatchObject({ state: "inconclusive", reason: "no finalist beat the incumbent from boot; the incumbent stays" });
    expect(s.queue.find((v) => v.id === "again")?.state).not.toBe("blocked");
  });

  it("with the gate off, runs the queue exactly as before (INV-G5)", async () => {
    const w = world(false);
    gated(w);
    cohort(w, "running", COHORT);
    const s = queueSnapshot(w.paths, w.source);
    expect(s).toMatchObject({ gate: [], incumbent: null, gateBlock: null });
    expect(nextStep(s)).toMatchObject({ kind: "experiment", view: { id: "hint" } });
    const fake = host(w, { activeCohort: () => Promise.reject(new Error("never asked")) });
    await runQueue({ paths: w.paths, source: w.source, host: fake, once: true });
    expect(fake.launches).toHaveLength(1);
    expect(lines<Record<string, unknown>>(join(experimentDir(w.paths.runsRoot, "hint"), "trials.jsonl"))[0]).not.toHaveProperty("promotion");
  });

  it("nominates a finished queue experiment's candidate only when it ranks above the incumbent, reusing matching incumbent runs", async () => {
    for (const better of [true, false]) {
      const w = world();
      const value = definition("full-map", { finals: FINALS });
      writeDefinition(w.paths.experimentsDir, value);
      approve(w.paths, value);
      // Two recorded boot runs that already match the finals incumbent count toward its four.
      const finalsFeatures = { ...QUEUE_FEATURES, "milestone-stall-stop-v1": false };
      w.recent.push(...["old-a", "old-b"].map((id) => ({ id, model: "think-fast", start: "boot" as const, maxTurns: FINALS_MAX_TURNS, maxWallMs: 600_000, features: finalsFeatures, reached: HOUSE })));
      w.recent.push({ id: "other-lane", model: "qwen", start: "boot", maxTurns: FINALS_MAX_TURNS, maxWallMs: 600_000, features: finalsFeatures, reached: HOUSE });
      w.metrics.set("old-a", reach(HOUSE));
      w.metrics.set("old-b", reach(HOUSE));
      const fake = host(w, {}, (f) => (f["full-map-navigation-v1"] === better ? reach(MET) : reach(HOUSE)));
      await runQueue({ paths: w.paths, source: w.source, host: fake });
      const nomination = (read(nominationPath(w.paths.runsRoot, "full-map")) as { finalists: { arm: string }[]; reusedIncumbent: string[]; reason: string });
      const s = queueSnapshot(w.paths, w.source);
      if (better) {
        expect(nomination).toMatchObject({ finalists: [{ arm: "candidate" }], reusedIncumbent: ["old-b", "old-a"] });
        // 8 screening trials, then 2 incumbent + 4 candidate finals runs.
        expect(fake.launches).toHaveLength(14);
        expect(s.gate[0]).toMatchObject({ state: "declared", winner: "candidate" });
        expect(readPromotions(w.paths.runsRoot)[0]?.features).toEqual({ "full-map-navigation-v1": true });
      } else {
        expect(nomination).toMatchObject({ finalists: [], reusedIncumbent: [], reason: "no arm beat the incumbent in more than half of all run pairs; the incumbent stays" });
        expect(fake.launches).toHaveLength(8);
        expect(s.gate[0]).toMatchObject({ state: "no-finalists" });
        expect(s.gateBlock).toBeNull();
      }
    }
  });

  it("holds finals on a failed launch or an operator stop and resumes them; withdrawing them keeps the queue waiting", async () => {
    const w = world();
    gated(w);
    cohort(w, "done", COHORT);
    await runQueue({ paths: w.paths, source: w.source, host: host(w), stopRequested: () => true });
    expect(() => { setFinalsWithdrawn(w.paths, w.source, "hint", true, "op", new Date()); }).toThrow(ApprovalError);
    expect(() => { setFinalsWithdrawn(w.paths, w.source, "full-map", false, "op", new Date()); }).toThrow("full-map has no withdrawn finals to resume");
    const throws = host(w, { launch: () => Promise.reject(new Error("spawn failed")) });
    expect((await runQueue({ paths: w.paths, source: w.source, host: throws })).stopped).toBe("held: finals run 1 failed to launch");
    let s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]?.trials[0]?.state).toBe("failed");
    const aborts = host(w, { launch: (t) => { writeRun(w.paths, t.runId, QUEUE_FEATURES, "operator_abort"); return Promise.resolve(0); } });
    expect((await runQueue({ paths: w.paths, source: w.source, host: aborts })).stopped).toBe("held: finals run 1 was stopped by the operator; it will be rerun");
    const silent = host(w, { launch: () => Promise.resolve(1) });
    expect((await runQueue({ paths: w.paths, source: w.source, host: silent })).stopped).toBe("held: finals run 1 ended without a recorded run_end");
    const once = host(w);
    expect((await runQueue({ paths: w.paths, source: w.source, host: once, once: true })).stopped).toBe("one finals run (--once)");
    s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]).toMatchObject({ state: "held", reason: "finals stopped after 1 of 12 runs; the queue resumes them" });
    expect(lines<{ type: string }>(finalsLedgerPath(w.paths.runsRoot, "full-map")).map((e) => e.type)).toEqual(["launch", "launcher_error", "launch", "launcher_error", "launch", "launcher_error", "launch", "outcome"]);

    setFinalsWithdrawn(w.paths, w.source, "full-map", true, "op", new Date("2026-10-15T09:00:00Z"));
    s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]).toMatchObject({ state: "withdrawn" });
    expect(s.gateBlock).toMatch(/finals withdrawn after 1 of 12 runs/);
    expect((await runQueue({ paths: w.paths, source: w.source, host: host(w) })).stopped).toMatch(/^waiting: full-map: finals withdrawn/);
    expect(() => { setFinalsWithdrawn(w.paths, w.source, "full-map", true, "op", new Date()); }).toThrow("full-map has no finals to withdraw (withdrawn)");
    setFinalsWithdrawn(w.paths, w.source, "full-map", false, "op", new Date());
    expect(queueSnapshot(w.paths, w.source).gate[0]?.state).toBe("held");
    expect(lines<{ type: string }>(join(experimentDir(w.paths.runsRoot, "full-map"), "approvals.jsonl")).map((e) => e.type)).toEqual(["finals-withdraw", "finals-resume"]);

    // A withdrawal between runs stops the finals before the next one.
    const stopper = host(w, { launch: (t) => { setFinalsWithdrawn(w.paths, w.source, "full-map", true, "op", new Date()); writeRun(w.paths, t.runId, QUEUE_FEATURES); w.metrics.set(t.runId, reach(HOUSE)); return Promise.resolve(0); } });
    expect((await runQueue({ paths: w.paths, source: w.source, host: stopper })).stopped).toBe("held: the finals were withdrawn");
  });

  it("drops a discarded experiment from the gate whatever stage it reached, so its finals never run", async () => {
    for (const stage of ["waiting", "finals", "withdrawn"] as const) {
      const w = world();
      gated(w);
      cohort(w, stage === "waiting" ? "running" : "done", COHORT);
      if (stage !== "waiting") await runQueue({ paths: w.paths, source: w.source, host: host(w), stopRequested: () => true });
      if (stage === "withdrawn") setFinalsWithdrawn(w.paths, w.source, "full-map", true, "op", new Date());
      expect(queueSnapshot(w.paths, w.source).gateBlock).not.toBeNull();
      writeDefinition(w.paths.experimentsDir, definition("full-map", { externalCohort: "cohort-2x2", finals: FINALS, discarded: "dropped" }));
      const s = queueSnapshot(w.paths, w.source);
      expect(s.gate).toEqual([]);
      expect(nextStep(s)).toMatchObject({ kind: "experiment", view: { id: "hint" } });
      const fake = host(w);
      await runQueue({ paths: w.paths, source: w.source, host: fake, once: true });
      expect(fake.launches.map((l) => l.presetPath)).toEqual([expect.stringMatching(/hint[/\\]presets[/\\]incumbent\.json$/) as string]);
    }
  });

  it("scores a finals run whose log is gone as reaching nothing", async () => {
    const w = world();
    gated(w);
    cohort(w, "done", COHORT);
    const fake = host(w);
    await runQueue({ paths: w.paths, source: w.source, host: fake, stopRequested: () => fake.launches.length >= 11 });
    // Every whole-map run's log disappears before the last run: whole fails, both still wins.
    for (const l of fake.launches) if (l.presetPath.endsWith("finals-whole.json")) w.metrics.delete(l.runId);
    const last = host(w, {}, (f) => (f["full-map-navigation-v1"] && !f["navigation-evidence-memory-v1"] ? nothing : reach(f["full-map-navigation-v1"] ? MET : HOUSE)));
    await runQueue({ paths: w.paths, source: w.source, host: last, once: true });
    expect(last.launches).toHaveLength(1);
    expect((read(finalsResultPath(w.paths.runsRoot, "full-map")) as { decision: { winner: string } }).decision.winner).toBe("both");
  });

  it("refuses finals that cannot run on one build or with a live run or a changed preset", async () => {
    const w = world();
    gated(w);
    cohort(w, "done", COHORT);
    await runQueue({ paths: w.paths, source: w.source, host: host(w), stopRequested: () => true });
    await expect(runQueue({ paths: w.paths, source: w.source, host: host(w, { liveRuns: () => Promise.resolve(["live"]) }) })).rejects.toThrow("live run live is still running");
    await expect(runQueue({ paths: w.paths, source: w.source, host: host(w, { verifySource: () => Promise.resolve("dirty tree") }) })).rejects.toThrow("full-map: dirty tree");
    let calls = 0;
    expect((await runQueue({ paths: w.paths, source: w.source, host: host(w, { verifySource: () => Promise.resolve(calls++ === 0 ? null : "main moved") }) })).stopped).toBe("held: main moved");
    const one = host(w);
    await runQueue({ paths: w.paths, source: w.source, host: one, once: true });
    writeFileSync(join(experimentDir(w.paths.runsRoot, "full-map"), "presets", "finals-incumbent.json"), "{}\n");
    writeFileSync(join(experimentDir(w.paths.runsRoot, "full-map"), "presets", "finals-whole.json"), "{}\n");
    await expect(runQueue({ paths: w.paths, source: w.source, host: host(w) })).rejects.toThrow(/finals (whole|incumbent) preset on disk differs from the nomination/);
  });

  it("reports why the autorun waits or what it runs", async () => {
    const w = world();
    gated(w);
    const dir = cohort(w, "held", COHORT);
    const ran: string[] = [];
    const auto = new ExperimentAutoRun({ paths: w.paths, source: w.source, host: host(w), now: () => 0, run: (o) => { ran.push(String(o.paths.winnerGate)); return Promise.resolve({ ran: 0, stopped: "x" }); } });
    await auto.tick();
    expect(auto.status()).toEqual({ state: "idle", message: expect.stringMatching(/^Waiting: full-map: waiting for the cohort-2x2 cohort to finish \(held\)/) as string });
    writeFileSync(join(dir, "queue.json"), JSON.stringify({ status: "done" }));
    void auto.tick();
    expect(auto.status()).toEqual({ state: "running", message: "Nominating full-map's finalists." });
    await new Promise((r) => setTimeout(r, 0));
    await runQueue({ paths: w.paths, source: w.source, host: host(w), stopRequested: () => true });
    void auto.tick();
    expect(auto.status()).toEqual({ state: "running", message: "Running the full-map finals from boot." });
    expect(ran).toEqual(["true", "true"]);
  });

  it("finds cohorts read only and tolerates partial or foreign receipts (INV-G6)", () => {
    const w = world();
    expect(findCohort(w.paths.runsRoot, "nope")).toBeNull();
    const receipts = join(w.paths.runsRoot, "launch-receipts");
    mkdirSync(join(receipts, "a-broken"), { recursive: true });
    writeFileSync(join(receipts, "a-broken", "manifest.json"), "not json");
    mkdirSync(join(receipts, "b-other"), { recursive: true });
    writeFileSync(join(receipts, "b-other", "manifest.json"), JSON.stringify({ id: "other", presets: {} }));
    expect(findCohort(w.paths.runsRoot, "cohort-2x2")).toBeNull();
    const dir = cohort(w, "running", { control: [nothing] });
    writeFileSync(join(dir, "queue.json"), "torn");
    writeFileSync(join(dir, "trials.jsonl"), `${JSON.stringify({ type: "launch", arm: "control" })}\n${JSON.stringify({ type: "outcome", arm: "ghost", run: "g" })}\n${JSON.stringify({ type: "outcome", arm: "control", run: "c" })}\n\n`);
    expect(findCohort(w.paths.runsRoot, "cohort-2x2")).toMatchObject({ status: "missing", done: false, outcomes: [{ arm: "control", run: "c" }] });
    const before = readFileSync(join(dir, "trials.jsonl"), "utf8");
    queueSnapshot(w.paths, w.source);
    expect(readFileSync(join(dir, "trials.jsonl"), "utf8")).toBe(before);
  });

  it("names a missing cohort and an unreadable nomination or promotion as problems", () => {
    const w = world();
    writeDefinition(w.paths.experimentsDir, definition("full-map", { externalCohort: "ghost" }));
    let s = queueSnapshot(w.paths, w.source);
    expect(s.gate[0]?.reason).toMatch(/no manifest found under runs\/launch-receipts/);
    mkdirSync(experimentDir(w.paths.runsRoot, "full-map"), { recursive: true });
    writeFileSync(nominationPath(w.paths.runsRoot, "full-map"), "{}");
    writeFileSync(promotionsPath(w.paths.runsRoot), "bad\n");
    s = queueSnapshot(w.paths, w.source);
    expect(s.problems.join("\n")).toMatch(/full-map: nomination.json: Invalid nomination/);
    expect(s.problems.join("\n")).toMatch(/promotions.jsonl line 1: not JSON/);
  });

  it("pins a started experiment to the promotion its first trial ran under", () => {
    const p1 = { id: "a:x", from: "a", arm: "x", features: { "full-map-navigation-v1": true }, at: "t", finals: [] };
    const p2 = { id: "b:y", from: "b", arm: "y", features: { "ledge-hops-v1": false }, at: "t", finals: [] };
    expect(promotionOverlay([], undefined)).toBeNull();
    expect(promotionOverlay([p1, p2], null)).toBeNull();
    expect(promotionOverlay([p1, p2], undefined)?.features).toEqual({ "full-map-navigation-v1": true, "ledge-hops-v1": false });
    expect(promotionOverlay([p1, p2], "a:x")?.features).toEqual({ "full-map-navigation-v1": true });
    expect(pinnedPromotion([])).toBeUndefined();
    expect(pinnedPromotion([{ type: "launch", trial: 0, arm: "incumbent", run: "r", at: "t" }])).toBeNull();
    expect(pinnedPromotion([{ type: "outcome", trial: 0, arm: "incumbent", run: "r", at: "t", reason: "budget" }, { type: "launch", trial: 0, arm: "incumbent", run: "r", at: "t", promotion: "a:x" }])).toBe("a:x");
    const e = parseExperiment(definition("hint", { changedFeature: "next-milestone-hint-v1" }));
    const legacy = effectiveExperiment(e, [{ type: "launch", trial: 0, arm: "incumbent", run: "r", at: "t" }], [p1]);
    expect(legacy).toMatchObject({ promotion: null, superseded: null });
    expect(legacy.experiment.incumbent.features["full-map-navigation-v1"]).toBe(false);
    expect(effectiveExperiment(e, [], [p1, p2]).experiment.incumbent.features).toMatchObject({ "full-map-navigation-v1": true, "ledge-hops-v1": false });
    expect(reusableRuns(e.incumbent, "think-fast", [{ id: "x", model: "think-fast", start: "save_state", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: [] }], 4)).toEqual([]);
  });

  it("detects a live cohort driver or chain from its pid file and command line", () => {
    const w = world();
    expect(activeCohort(w.paths.runsRoot, () => null)).toBeNull();
    const receipts = join(w.paths.runsRoot, "launch-receipts");
    for (const [name, file, pid] of [["chain", "chain-pid.txt", "41"], ["old", "driver-pid.txt", "42"], ["junk", "driver-pid.txt", "x"]] as const) {
      mkdirSync(join(receipts, name), { recursive: true });
      writeFileSync(join(receipts, name, file), `${pid}\n`);
    }
    mkdirSync(join(receipts, "empty"), { recursive: true });
    const commands: Record<number, string> = { 41: `/bin/bash runs/launch-receipts/chain/run-all-2.sh`, 42: "/usr/bin/some-other-process" };
    expect(activeCohort(w.paths.runsRoot, (pid) => commands[pid] ?? null)).toBe("chain");
    expect(activeCohort(w.paths.runsRoot, (pid) => (pid === 42 ? commands[42] ?? null : null))).toBeNull();
    expect(pidCommand(process.pid)).toMatch(/node|vitest/);
    expect(pidCommand(2 ** 30)).toBeNull();
    const prod = productionHost({ root: w.root, runsRoot: w.paths.runsRoot, git: () => "", fetchFn: fetch, node: process.execPath, env: {}, log: () => undefined, pidCommand: (pid) => commands[pid] ?? null });
    return expect(prod.activeCohort?.()).resolves.toBe("chain");
  });

  it("keeps the lease free and blocked trials untouched while waiting", () => {
    const w = world();
    gated(w);
    cohort(w, "running", COHORT);
    expect(queueSnapshot(w.paths, w.source).queue.find((v) => v.id === "hint")?.state).toBe("approved");
    expect(existsSync(join(w.paths.runsRoot, LEASE))).toBe(false);
    expect(trialOrder(parseExperiment(definition("x"))).length).toBe(8);
  });
});
