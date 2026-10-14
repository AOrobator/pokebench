import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReadinessRun } from "@pokebench/agent/experiments";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { ExperimentAutoRun, RETRY_MS } from "./experiment-autorun.js";
import { approveExperiment } from "./experiment-approval.js";
import type { RunSource } from "./experiment-store.js";
import type { RunnerHost, RunnerOptions, RunnerOutcome } from "./experiment-runner.js";

const READY: ReadinessRun[] = ["a", "b", "c", "d"].map((id) => ({ id, model: "think-fast", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT"] }));
const source: RunSource = { recent: () => READY, trial: () => null };
function setup() {
  const root = mkdtempSync(join(tmpdir(), "pokebench-autorun-"));
  const paths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "none.md") };
  mkdirSync(paths.runsRoot, { recursive: true });
  writeDefinition(paths.experimentsDir, definition("full-map"));
  return paths;
}
const host = {} as RunnerHost;

describe("the viewer runs approved experiments on its own", () => {
  it("stays idle until something is approved, then runs it once at a time", async () => {
    const paths = setup();
    let now = 0, release: (o: RunnerOutcome) => void = () => undefined;
    const calls: RunnerOptions[] = [];
    const auto = new ExperimentAutoRun({ paths, source, host, now: () => now, run: (o) => { calls.push(o); return new Promise((r) => { release = r; }); } });
    await auto.tick();
    expect(calls).toEqual([]);
    expect(auto.status()).toEqual({ state: "idle", message: "Nothing is approved to run." });
    approveExperiment(paths, source, "full-map", "viewer", new Date(), "a".repeat(40));
    await auto.tick();
    expect(calls).toHaveLength(1);
    expect(auto.status()).toEqual({ state: "running", message: "Running full-map." });
    await auto.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.stopRequested?.()).toBe(false);
    auto.stop();
    expect(calls[0]?.stopRequested?.()).toBe(true);
    release({ ran: 3, stopped: "stop requested" });
    await Promise.resolve(); await Promise.resolve();
    expect(auto.status()).toEqual({ state: "idle", message: "3 trial(s) run; stop requested" });
    now = 1;
    await auto.tick();
    expect(calls).toHaveLength(1);
  });

  it("reports a failure and waits before trying again", async () => {
    const paths = setup();
    approveExperiment(paths, source, "full-map", "viewer", new Date(), "a".repeat(40));
    let now = 0, calls = 0;
    const auto = new ExperimentAutoRun({ paths, source, host, now: () => now, run: () => { calls += 1; return Promise.reject(new Error("full-map: main is at bbbbbbb, not the approved aaaaaaa")); } });
    await auto.tick();
    await Promise.resolve(); await Promise.resolve();
    expect(auto.status()).toEqual({ state: "error", message: "full-map: main is at bbbbbbb, not the approved aaaaaaa" });
    now = RETRY_MS - 1;
    await auto.tick();
    expect(calls).toBe(1);
    now = RETRY_MS;
    await auto.tick();
    expect(calls).toBe(2);
  });

  it("waits quietly while another run or cohort holds the machine", async () => {
    const paths = setup();
    approveExperiment(paths, source, "full-map", "viewer", new Date(), "a".repeat(40));
    let now = 0, calls = 0;
    const auto = new ExperimentAutoRun({ paths, source, host, now: () => now, run: () => { calls += 1; return Promise.reject(new Error("the gameplay lease is held (another run, cohort or queue is active)")); } });
    await auto.tick();
    await Promise.resolve(); await Promise.resolve();
    expect(auto.status()).toEqual({ state: "idle", message: "Waiting: the gameplay lease is held (another run, cohort or queue is active)" });
    now = 5_000;
    await auto.tick();
    expect(calls).toBe(2);
  });

  it("never throws out of a tick when the queue cannot be read", async () => {
    const paths = setup();
    let now = 0;
    const auto = new ExperimentAutoRun({ paths, source: { recent: () => { throw new Error("runs unreadable"); }, trial: () => null }, host, now: () => now, run: () => Promise.resolve({ ran: 0, stopped: "x" }) });
    approveExperiment(paths, source, "full-map", "viewer", new Date(), "a".repeat(40));
    expect(() => auto.tick()).not.toThrow();
    await auto.tick();
    expect(auto.status()).toEqual({ state: "error", message: "runs unreadable" });
    now = RETRY_MS;
    expect(() => auto.tick()).not.toThrow();
  });
});
