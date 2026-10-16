import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Log, START, assistant, state } from "../test-support/events.js";
import { createBaselinePool, type BaselineRequest, type BaselineWorkerLike } from "./baseline-pool.js";
import { createWorkbenchStore, workbenchCacheDir } from "./baseline-store.js";
import { handleBaselineRequest } from "./baseline-worker.js";
import { startViewer, type Viewer } from "./server.js";
import { createWorkbenchLoader, loadRun, parseLoadedRun, timingSeconds, workbenchSnapshot, type LoadedRun, type WorkbenchCompute } from "./workbench-store.js";
import { EventEmitter } from "node:events";

const roots: string[] = [], viewers: Viewer[] = [];
afterEach(async () => {
  for (const viewer of viewers.splice(0)) await viewer.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const base = fs.mkdtempSync(join(tmpdir(), "workbench-offthread-"));
  roots.push(base);
  const runs = join(base, "runs");
  fs.mkdirSync(runs);
  return runs;
}
function write(r: string, id: string, log: Log): string {
  fs.mkdirSync(join(r, id));
  const p = join(r, id, "events.jsonl");
  fs.writeFileSync(p, log.events.map((e) => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
  return p;
}
function named(): Log {
  const l = new Log(); l.add(0, START); l.add(1000, assistant());
  const s = l.add(3000, state({ story: { name_confirmed: true, intro_stage: null, rival_stage: null, birch_lab_stage: null, petalburg_gym_stage: null, woods_stage: null, clock_set: null, rival_battle_won: null, pokedex_received: null, running_shoes_received: null, starter_tutorial_complete: null, rustboro_gym_complete: null, stone_badge: null, rock_tomb_received: null } }));
  l.add(4000, { type: "milestone", turn: 1, name: "PLAYER_NAME_CONFIRMED", kind: "story", origin: "observed", server_timestamp: 4, evidence: [s.seq] });
  return l;
}
function ended(): Log {
  const l = named();
  l.add(4500, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1 });
  l.add(5500, { type: "operator_control", turn: 1, action: "resume", status: "applied", request: 2 });
  l.add(6000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } });
  return l;
}
function paused(): Log {
  const l = named();
  const start = l.events[0];
  if (start?.type !== "run_start") throw new Error("fixture start");
  l.events[0] = { ...start, isolation: { ...start.isolation, port: 8012 } };
  l.add(4500, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1 });
  return l;
}
function catalog(): string {
  const r = root();
  write(r, "live", named()); write(r, "done", ended()); write(r, "held", paused());
  fs.appendFileSync(write(r, "broken", named()), '{"bad":true}\n');
  return r;
}
function counted(): { compute: WorkbenchCompute; calls: string[] } {
  const calls: string[] = [];
  return { calls, compute: (r, id) => { calls.push(id); return Promise.resolve(loadRun(r, id)); } };
}
const NOW = 2_000_000_000_000, CODE = "a".repeat(64);
const healthy = (): Promise<boolean> => Promise.resolve(true);

it("produces the same snapshot whether runs load in process or through a compute", async () => {
  const r = catalog();
  const inProcess = await workbenchSnapshot(r, healthy, NOW);
  const viaCompute = await workbenchSnapshot(r, healthy, NOW, undefined, createWorkbenchLoader({ compute: counted().compute }));
  expect(viaCompute).toEqual(inProcess);
  expect(inProcess.runs.map((x) => [x.id, x.status]).sort()).toEqual([["broken", "invalid"], ["done", "ended"], ["held", "paused"], ["live", "live"]]);
});

it("returns plain, serializable records that survive validation", () => {
  const r = catalog();
  for (const id of ["live", "done", "held", "broken"]) {
    const record = loadRun(r, id);
    expect(parseLoadedRun(JSON.parse(JSON.stringify(record)))).toEqual(record);
  }
  expect(parseLoadedRun({ run: { id: "x" }, port: null, tag: null, timing: null })).toBeNull();
  expect(parseLoadedRun({ ...loadRun(r, "done"), timing: { startMs: "0" } })).toBeNull();
  expect(parseLoadedRun({ ...loadRun(r, "done"), port: -1 })).toBeNull();
  expect(parseLoadedRun({ ...loadRun(r, "done"), tag: { experiment: 1 } })).toBeNull();
  expect(parseLoadedRun(null)).toBeNull();
});

it("measures run time without paused time, up to now for live runs and to the last event for ended ones", () => {
  const pauses = [{ startMs: 1000, endMs: 2000 }, { startMs: 4000, endMs: null }];
  expect(timingSeconds({ startMs: 0, ended: false, lastMs: 5000, paused: true, pauses }, 6000)).toBe(3);
  expect(timingSeconds({ startMs: 0, ended: true, lastMs: 5000, paused: false, pauses: [{ startMs: 1000, endMs: 2000 }] }, 9000)).toBe(4);
  expect(timingSeconds({ startMs: null, ended: false, lastMs: null, paused: false, pauses: [] }, 9000)).toBe(0);
  expect(timingSeconds({ startMs: 0, ended: false, lastMs: null, paused: false, pauses: [{ startMs: 0, endMs: null }] }, 1000)).toBe(0);
});

it("shares one load per run between concurrent snapshots", async () => {
  const r = catalog();
  const c = counted();
  const loader = createWorkbenchLoader({ compute: c.compute });
  const [a, b] = await Promise.all([workbenchSnapshot(r, healthy, NOW, undefined, loader), workbenchSnapshot(r, healthy, NOW, undefined, loader)]);
  expect(a).toEqual(b);
  expect([...c.calls].sort()).toEqual(["broken", "done", "held", "live"]);
  await workbenchSnapshot(r, healthy, NOW, undefined, loader);
  expect(c.calls).toHaveLength(4);
});

it("persists finished runs only and reuses them in a fresh loader without loading again", async () => {
  const r = catalog();
  const dir = workbenchCacheDir(r, CODE);
  const first = await workbenchSnapshot(r, healthy, NOW, undefined, createWorkbenchLoader({ compute: counted().compute, store: createWorkbenchStore(dir) }));
  expect(fs.readdirSync(dir)).toEqual(["done.json"]);
  const c = counted();
  expect(await workbenchSnapshot(r, healthy, NOW, undefined, createWorkbenchLoader({ compute: c.compute, store: createWorkbenchStore(dir) }))).toEqual(first);
  expect([...c.calls].sort()).toEqual(["broken", "held", "live"]);
});

it("reloads a run whose log changed, and ignores corrupt cache entries", async () => {
  const r = catalog();
  const dir = workbenchCacheDir(r, CODE);
  await workbenchSnapshot(r, healthy, NOW, undefined, createWorkbenchLoader({ store: createWorkbenchStore(dir) }));
  fs.writeFileSync(join(dir, "done.json"), JSON.stringify({ fingerprint: "x", outcome: { nonsense: true } }));
  const c = counted();
  const loader = createWorkbenchLoader({ compute: c.compute, store: createWorkbenchStore(dir) });
  await workbenchSnapshot(r, healthy, NOW, undefined, loader);
  expect(c.calls).toContain("done");
  const live = join(r, "live", "events.jsonl");
  fs.appendFileSync(live, JSON.stringify({ v: 1, run: "live", seq: 4, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "milestone", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }) + "\n");
  c.calls.length = 0;
  const after = await workbenchSnapshot(r, healthy, NOW, undefined, loader);
  expect(c.calls).toEqual(["live"]);
  expect(after.runs.find((x) => x.id === "live")?.status).toBe("ended");
  expect(fs.readdirSync(dir).sort()).toEqual(["done.json", "live.json"]);
});

it("answers other routes while workbench runs are still loading", async () => {
  const r = catalog();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const compute: WorkbenchCompute = async (root, id) => { calls += 1; await gate; return loadRun(root, id); };
  const viewer = await startViewer({ runsRoot: r, staticDir: r, appDir: r, port: 0, workbench: { compute } });
  viewers.push(viewer);
  const pending = fetch(new URL("api/workbench", viewer.url));
  const list = await fetch(new URL("api/runs", viewer.url));
  expect(list.status).toBe(200);
  expect(calls).toBeGreaterThan(0);
  release();
  const reply = await pending;
  expect(reply.status).toBe(200);
  expect(((await reply.json()) as { runs: unknown[] }).runs).toHaveLength(4);
});

it("routes worker requests by kind", () => {
  const r = catalog();
  expect(handleBaselineRequest({ id: 1, kind: "workbench", runsRoot: r, runId: "done" })).toEqual({ id: 1, outcome: loadRun(r, "done") });
  expect(handleBaselineRequest({ id: 2, kind: "baseline", runsRoot: r, runId: "missing" })).toMatchObject({ id: 2, outcome: { error: { kind: "runs" } } });
  expect(handleBaselineRequest({ id: 3, kind: "other", runsRoot: r, runId: "done" })).toEqual({ id: -1, failure: expect.stringMatching(/invalid baseline request/) as unknown });
});

class FakeWorker extends EventEmitter implements BaselineWorkerLike {
  readonly posted: BaselineRequest[] = [];
  postMessage(message: BaselineRequest): void { this.posted.push(message); }
  terminate(): Promise<number> { return Promise.resolve(0); }
  unref(): void { /* test double */ }
}

it("loads workbench runs through the pool and validates their replies", async () => {
  const r = catalog();
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const w = new FakeWorker(); workers.push(w); return w; }, 1);
  const record: LoadedRun = loadRun(r, "done");
  const good = pool.load(r, "done", { commit: "a".repeat(40), dirty: false });
  expect(workers[0]?.posted[0]).toEqual({ id: expect.any(Number) as unknown, kind: "workbench", runsRoot: r, runId: "done", viewer: { commit: "a".repeat(40), dirty: false } });
  workers[0]?.emit("message", { id: workers[0].posted[0]?.id, outcome: record });
  expect(await good).toEqual(record);
  const bad = pool.load(r, "done", null);
  workers[0]?.emit("message", { id: workers[0].posted[1]?.id, outcome: { run: 7 } });
  await expect(bad).rejects.toThrow(/invalid reply/);
  await pool.close();
});

it("never keeps or persists a load whose log changed while it was being read", async () => {
  const r = catalog();
  const dir = workbenchCacheDir(r, CODE), path = join(r, "done", "events.jsonl");
  const calls: string[] = [];
  let touched = false;
  const loader = createWorkbenchLoader({ store: createWorkbenchStore(dir), compute: (root, id) => {
    calls.push(id);
    const loaded = loadRun(root, id);
    if (id === "done" && !touched) { touched = true; fs.appendFileSync(path, "\n"); }
    return Promise.resolve(loaded);
  } });
  await workbenchSnapshot(r, healthy, NOW, undefined, loader);
  expect(fs.existsSync(join(dir, "done.json"))).toBe(false);
  calls.length = 0;
  await workbenchSnapshot(r, healthy, NOW, undefined, loader);
  expect(calls).toContain("done");
  expect(fs.existsSync(join(dir, "done.json"))).toBe(true);
});
