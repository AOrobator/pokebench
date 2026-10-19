import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, expect, it } from "vitest";
import { ALL_ON, playHarnessFeatures } from "@pokebench/agent/features";
import { fullRun, tAt } from "../test-support/events.js";
import { createBaselinePool, defaultPoolSize, type BaselineRequest, type BaselineWorkerLike } from "./baseline-pool.js";
import { handleBaselineRequest } from "./baseline-worker.js";
import { BaselineError, RunsError, baselineOf, computeBaseline, comparisonsOf, createBaselineReader, type BaselineCompute, type BaselineOutcome } from "./runs.js";
import { startViewer, type Viewer } from "./server.js";

const roots: string[] = [], viewers: Viewer[] = [];
afterEach(async () => {
  for (const viewer of viewers.splice(0)) await viewer.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const path = fs.mkdtempSync(join(tmpdir(), "baseline-offthread-"));
  roots.push(path);
  return path;
}
function write(root: string, id: string, offset = 3100): string {
  const dir = join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const events = fullRun().events.map((event) => ({ ...event, run: id, ...(event.type === "run_start" ? { harness_features: playHarnessFeatures(ALL_ON, null) } : {}), ...(event.type === "milestone" && event.name === "PLAYER_NAME_SET" ? { t: tAt(offset) } : {}) }));
  const path = join(dir, "events.jsonl");
  fs.writeFileSync(path, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  return path;
}
function corrupt(path: string): void {
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace('"name":"PLAYER_NAME_SET"', '"name":42'));
}

// A compute the test releases by hand, recording every call it receives.
function held(): { compute: BaselineCompute; calls: string[]; started: (n: number) => Promise<void>; release: () => void } {
  const calls: string[] = [], waiting: (() => void)[] = [], watchers: { n: number; resolve: () => void }[] = [];
  const compute: BaselineCompute = (runsRoot, runId) => {
    calls.push(runId);
    for (const w of watchers.filter((x) => calls.length >= x.n)) w.resolve();
    return new Promise<BaselineOutcome>((resolve) => { waiting.push(() => { resolve(computeBaseline(runsRoot, runId)); }); });
  };
  return {
    compute,
    calls,
    started: (n) => new Promise<void>((resolve) => { if (calls.length >= n) resolve(); else watchers.push({ n, resolve }); }),
    release: () => { for (const go of waiting.splice(0)) go(); },
  };
}

it("computes outcomes as plain values and the reader rebuilds their error classes", async () => {
  const dir = root();
  const good = write(dir, "good"), bad = write(dir, "bad");
  corrupt(bad);
  expect(computeBaseline(dir, "good")).toEqual({ baseline: baselineOf(dir, "good") });
  expect(computeBaseline(dir, "bad")).toEqual({ error: { kind: "baseline", message: expect.stringMatching(/line 8/) as unknown } });
  expect(computeBaseline(dir, "missing")).toEqual({ error: { kind: "runs", message: expect.any(String) as unknown } });
  const read = createBaselineReader(dir, { compute: (r, id) => Promise.resolve(computeBaseline(r, id)) });
  expect(await read("good")).toEqual(baselineOf(dir, "good"));
  await expect(read("bad")).rejects.toBeInstanceOf(BaselineError);
  await expect(read("missing")).rejects.toBeInstanceOf(RunsError);
  expect(fs.existsSync(good)).toBe(true);
});

it("shares one compute between concurrent requests for the same unchanged log", async () => {
  const dir = root();
  write(dir, "reference");
  const h = held();
  const read = createBaselineReader(dir, { compute: h.compute });
  const first = read("reference"), second = read("reference");
  await h.started(1);
  h.release();
  expect(await first).toEqual(await second);
  expect(h.calls).toEqual(["reference"]);
});

it("does not cache a compute that fails unexpectedly", async () => {
  const dir = root();
  write(dir, "reference");
  let calls = 0;
  const read = createBaselineReader(dir, { compute: (r, id) => { calls += 1; return calls === 1 ? Promise.reject(new Error("worker died")) : Promise.resolve(computeBaseline(r, id)); } });
  await expect(read("reference")).rejects.toThrow("worker died");
  expect(await read("reference")).toEqual(baselineOf(dir, "reference"));
  expect(calls).toBe(2);
});

it("asks for every comparison candidate at once instead of one after another", async () => {
  const dir = root();
  for (const id of ["selected", "a", "b", "c"]) write(dir, id);
  const h = held();
  const read = createBaselineReader(dir, { compute: h.compute });
  const result = comparisonsOf(dir, "selected", read);
  await h.started(3);
  h.release();
  expect((await result).candidates.map((c) => c.run).sort()).toEqual(["a", "b", "c"]);
  expect(await result).toEqual(await comparisonsOf(dir, "selected"));
});

it("answers other routes while baselines are still computing, then serves the comparison", async () => {
  const dir = root();
  write(dir, "selected"); write(dir, "reference");
  const h = held();
  const viewer = await startViewer({ runsRoot: dir, staticDir: dir, appDir: dir, port: 0, baselines: { compute: h.compute } });
  viewers.push(viewer);
  const pending = fetch(new URL("api/runs/selected/comparisons", viewer.url));
  await h.started(1);
  const list = await fetch(new URL("api/runs", viewer.url));
  expect(list.status).toBe(200);
  expect((await list.json() as { id: string }[]).map((r) => r.id).sort()).toEqual(["reference", "selected"]);
  h.release();
  const reply = await pending;
  expect(reply.status).toBe(200);
  expect(await reply.json()).toMatchObject({ candidates: [{ run: "reference" }] });
});

it("warms every ended run in the background at startup when asked, and closes its compute", async () => {
  const dir = root();
  write(dir, "a"); write(dir, "b");
  const h = held();
  let closed = 0;
  const viewer = await startViewer({ runsRoot: dir, staticDir: dir, appDir: dir, port: 0, baselines: { compute: h.compute, warm: true, close: () => { closed += 1; return Promise.resolve(); } } });
  await h.started(2);
  expect([...h.calls].sort()).toEqual(["a", "b"]);
  h.release();
  const milestones = await fetch(new URL("api/runs/a/milestones", viewer.url));
  expect(await milestones.json()).toEqual(baselineOf(dir, "a"));
  expect(h.calls).toHaveLength(2);
  await viewer.close();
  expect(closed).toBe(1);
});

it("does not warm unless asked", async () => {
  const dir = root();
  write(dir, "a");
  const h = held();
  const viewer = await startViewer({ runsRoot: dir, staticDir: dir, appDir: dir, port: 0, baselines: { compute: h.compute } });
  viewers.push(viewer);
  expect((await fetch(new URL("api/runs", viewer.url))).status).toBe(200);
  expect(h.calls).toEqual([]);
});

class FakeWorker extends EventEmitter implements BaselineWorkerLike {
  readonly posted: BaselineRequest[] = [];
  terminated = false;
  unrefed = false;
  postMessage(message: BaselineRequest): void { this.posted.push(message); }
  terminate(): Promise<number> { this.terminated = true; return Promise.resolve(0); }
  unref(): void { this.unrefed = true; }
  reply(index: number, outcome: BaselineOutcome): void { this.emit("message", { id: this.posted[index]?.id, outcome }); }
}
const OK: BaselineOutcome = { baseline: { run: "x", milestones: [] } };

it("runs at most one job per worker, queues the rest and spawns lazily up to its size", async () => {
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const w = new FakeWorker(); workers.push(w); return w; }, 2);
  expect(workers).toHaveLength(0);
  const jobs = ["a", "b", "c"].map((id) => pool.compute("/runs", id));
  expect(workers).toHaveLength(2);
  expect(workers.every((w) => w.unrefed)).toBe(true);
  expect(workers.map((w) => w.posted.map((p) => p.runId))).toEqual([["a"], ["b"]]);
  workers[1]?.reply(0, { baseline: { run: "b", milestones: [] } });
  expect(await jobs[1]).toEqual({ baseline: { run: "b", milestones: [] } });
  expect(workers[1]?.posted.map((p) => p.runId)).toEqual(["b", "c"]);
  expect(workers[1]?.posted[1]).toEqual({ id: expect.any(Number) as unknown, kind: "baseline", runsRoot: "/runs", runId: "c" });
  workers[0]?.reply(0, { error: { kind: "runs", message: "gone" } });
  workers[1]?.reply(1, OK);
  expect(await jobs[0]).toEqual({ error: { kind: "runs", message: "gone" } });
  expect(await jobs[2]).toEqual(OK);
  expect(workers).toHaveLength(2);
});

it("rejects the job of a worker that crashes or exits, and replaces that worker", async () => {
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const w = new FakeWorker(); workers.push(w); return w; }, 1);
  const crashed = pool.compute("/runs", "a"), queued = pool.compute("/runs", "b");
  workers[0]?.emit("error", new Error("out of memory"));
  await expect(crashed).rejects.toThrow(/baseline worker failed: out of memory/);
  expect(workers).toHaveLength(2);
  expect(workers[1]?.posted.map((p) => p.runId)).toEqual(["b"]);
  workers[1]?.emit("exit", 1);
  await expect(queued).rejects.toThrow(/baseline worker exited with code 1/);
  const next = pool.compute("/runs", "c");
  expect(workers).toHaveLength(3);
  workers[2]?.reply(0, OK);
  expect(await next).toEqual(OK);
  workers[0]?.emit("exit", 1);
  expect(workers).toHaveLength(3);
});

it("rejects a job whose reply is malformed, mismatched or reports a failure, and ignores replies to no job", async () => {
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const w = new FakeWorker(); workers.push(w); return w; }, 1);
  const malformed = pool.compute("/runs", "a");
  workers[0]?.emit("message", { id: workers[0].posted[0]?.id, outcome: { baseline: { run: 7 } } });
  await expect(malformed).rejects.toThrow(/invalid reply/);
  const mismatched = pool.compute("/runs", "b");
  workers[0]?.emit("message", { id: -1, failure: "invalid baseline request" });
  await expect(mismatched).rejects.toThrow(/reply for another request/);
  const failed = pool.compute("/runs", "c");
  workers[0]?.emit("message", { id: workers[0].posted[2]?.id, failure: "TypeError: boom" });
  await expect(failed).rejects.toThrow(/TypeError: boom/);
  workers[0]?.emit("message", { id: workers[0].posted[2]?.id, outcome: OK });
  const after = pool.compute("/runs", "d");
  workers[0]?.reply(3, OK);
  expect(await after).toEqual(OK);
});

it("closes by terminating its workers and rejecting running and queued jobs", async () => {
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const w = new FakeWorker(); workers.push(w); return w; }, 1);
  const running = pool.compute("/runs", "a"), queued = pool.compute("/runs", "b");
  await pool.close();
  await expect(running).rejects.toThrow(/closed/);
  await expect(queued).rejects.toThrow(/closed/);
  expect(workers[0]?.terminated).toBe(true);
  await expect(pool.compute("/runs", "c")).rejects.toThrow(/closed/);
  workers[0]?.emit("exit", 0);
  expect(workers).toHaveLength(1);
});

it("serializes log reduction so live game servers keep CPU and memory bandwidth", () => {
  expect(defaultPoolSize(32)).toBe(1);
  expect(defaultPoolSize(5)).toBe(1);
  expect(defaultPoolSize(2)).toBe(1);
  expect(defaultPoolSize(1)).toBe(1);
  expect(() => createBaselinePool(() => new FakeWorker(), 0)).toThrow(RangeError);
});

it("answers worker requests with outcomes, and reports bad requests and unexpected failures", () => {
  const dir = root();
  write(dir, "reference");
  expect(handleBaselineRequest({ id: 4, kind: "baseline", runsRoot: dir, runId: "reference" })).toEqual({ id: 4, outcome: computeBaseline(dir, "reference") });
  expect(handleBaselineRequest({ id: 5, kind: "baseline", runsRoot: dir, runId: "missing" })).toEqual({ id: 5, outcome: { error: { kind: "runs", message: expect.any(String) as unknown } } });
  expect(handleBaselineRequest({ runsRoot: dir })).toEqual({ id: -1, failure: expect.stringMatching(/invalid baseline request/) as unknown });
  expect(handleBaselineRequest({ id: 6, kind: "baseline", runsRoot: dir, runId: "reference" }, () => { throw new TypeError("boom"); })).toEqual({ id: 6, failure: "TypeError: boom" });
});

it("speaks the same protocol through a real worker thread", async () => {
  const echo = `const { parentPort } = require("node:worker_threads");
parentPort.on("message", (m) => parentPort.postMessage({ id: m.id, outcome: { baseline: { run: m.runId, milestones: [{ name: "CLOCK_SET", offsetMs: 5 }] } } }));`;
  const pool = createBaselinePool(() => new Worker(echo, { eval: true }), 2);
  try {
    expect(await Promise.all([pool.compute("/r", "a"), pool.compute("/r", "b"), pool.compute("/r", "c")])).toEqual(["a", "b", "c"].map((run) => ({ baseline: { run, milestones: [{ name: "CLOCK_SET", offsetMs: 5 }] } })));
  } finally {
    await pool.close();
  }
});
