import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Log, START, assistant, state } from "../test-support/events.js";
import { createBaselinePool, type BaselineRequest, type BaselineWorkerLike } from "./baseline-pool.js";
import { createWorkbenchStore, workbenchCacheDir } from "./baseline-store.js";
import { handleBaselineRequest } from "./baseline-worker.js";
import { viewerOffload } from "./cli.js";
import { startViewer, type Viewer } from "./server.js";
import { cardWorkbench, createIncrementalRunLoader, createWorkbenchLoader, loadRun, parseLoadedRun, timingSeconds, workbenchSnapshot, type LoadedRun, type WorkbenchCompute } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
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
function taggedEnded(): Log {
  const l = ended(), start = l.events[0];
  if (start?.type !== "run_start") throw new Error("fixture start");
  l.events[0] = { ...start, evaluation: { preset_id: "bundle-v-control", target: null, failure_limit: 3, flags: { loopGuard: false, activeUi: false, interfaceDocs: false, objectives: false }, experiment: { id: "allocation", arm: "control", trial: 1, of: 2 } } };
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

it("projects cards without historical measurements while retaining active data and trainer peers", async () => {
  const r = catalog(), full = await workbenchSnapshot(r, healthy, NOW), done = full.runs.find(run => run.id === "done"), live = full.runs.find(run => run.id === "live");
  if (done === undefined || live === undefined) throw new Error("fixture");
  const heavy = { ...done, experiment: { id: "allocation", arm: "control", trial: 1, of: 1 }, measurement: { controller: "agent" as const, features: [], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: Array.from({ length: 5000 }, (_, index) => ({ name: `M${String(index)}`, elapsedMs: index, evidence: [index] })) } };
  const source = { ...full, runs: [heavy, live] }, projected = parseWorkbench(cardWorkbench(source, "live")), peer = projected.runs.find(run => run.id === "done"), active = projected.runs.find(run => run.id === "live");
  expect(peer).toMatchObject({ config: null, splits: [], experiment: heavy.experiment }); expect(peer?.measurement).toBeUndefined();
  expect(active?.splits).toEqual(live.splits); expect(active?.card).toEqual(live.card);
  expect(JSON.stringify(projected).length * 20).toBeLessThan(JSON.stringify(source).length);
});

it("reduces only unfinished and selected logs for cards while retaining historical experiment peers", async () => {
  const r = catalog(); write(r, "peer", taggedEnded());
  const c = counted(), loader = createWorkbenchLoader({ compute: c.compute });
  const liveCards = cardWorkbench(await workbenchSnapshot(r, healthy, NOW, undefined, loader, { cards: { selected: "live", live: new Set(["live", "held"]) } }), "live");
  expect([...c.calls].sort()).toEqual(["held", "live"]);
  expect(liveCards.runs.find(run => run.id === "live")?.splits.length).toBeGreaterThan(0);
  expect(liveCards.runs.find(run => run.id === "peer")).toMatchObject({ config: null, splits: [], experiment: { id: "allocation", arm: "control", trial: 1, of: 2 } });
  expect(liveCards.runs.find(run => run.id === "done")).toBeUndefined();

  const peerCards = cardWorkbench(await workbenchSnapshot(r, healthy, NOW, undefined, loader, { cards: { selected: "peer", live: new Set(["live", "held"]) } }), "peer");
  expect(c.calls.filter(id => id === "peer")).toHaveLength(1);
  expect(peerCards.runs.find(run => run.id === "peer")?.config).not.toBeNull();
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

it("discards incremental state after a same-size in-place rewrite", () => {
  const r = root(), path = write(r, "live", named()), load = createIncrementalRunLoader();
  expect(load(r, "live").run.status).toBe("unresponsive");
  const originalStat = fs.statSync(path), original = fs.readFileSync(path, "utf8"), firstBreak = original.indexOf("\n"), rewritten = original.slice(0, firstBreak + 1) + original.slice(firstBreak + 1).replace('"seq":1', '"seq":9');
  expect(Buffer.byteLength(rewritten)).toBe(Buffer.byteLength(original));
  fs.writeFileSync(path, rewritten); fs.utimesSync(path, originalStat.atime, originalStat.mtime);
  const after = load(r, "live").run;
  expect(after.status).toBe("invalid"); expect(after.problem).toContain("order");
});

it("discards a tailer when the path is atomically replaced during reduction", () => {
  const r = root(), path = write(r, "live", named());
  let replaced = false;
  const load = createIncrementalRunLoader({ observeRead: (activePath) => {
    if (replaced) return;
    replaced = true;
    fs.renameSync(activePath, `${activePath}.old`);
    fs.writeFileSync(activePath, ended().events.map(event => JSON.stringify({ ...event, run: "live" })).join("\n") + "\n");
  } });
  const raced = load(r, "live").run;
  expect(raced.status).toBe("invalid"); expect(raced.problem).toContain("changed during reduction"); expect(load.retained()).toBe(0);
  expect(load(r, "live").run.status).toBe("ended"); expect(load.retained()).toBe(0);
  expect(fs.existsSync(`${path}.old`)).toBe(true);
});

it("discards a tailer when a same-size rewrite races its reduction", () => {
  const r = root(); write(r, "live", named());
  let rewritten = false;
  const load = createIncrementalRunLoader({ observeRead: (activePath) => {
    if (rewritten) return;
    rewritten = true;
    const original = fs.readFileSync(activePath, "utf8"), changed = original.replace('"seq":1', '"seq":9');
    expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(original));
    fs.writeFileSync(activePath, changed);
  } });
  const raced = load(r, "live").run;
  expect(raced.status).toBe("invalid"); expect(raced.problem).toContain("changed during reduction"); expect(load.retained()).toBe(0);
  const next = load(r, "live").run;
  expect(next.status).toBe("invalid"); expect(next.problem).toContain("order"); expect(load.retained()).toBe(0);
});

it("retires terminal reducers, resets after truncation and replacement, and bounds unfinished logs", () => {
  const r = root(), load = createIncrementalRunLoader();
  write(r, "done", ended()); expect(load(r, "done").run.status).toBe("ended"); expect(load.retained()).toBe(0);
  const changed = write(r, "changed", named()); expect(load(r, "changed").run.status).toBe("unresponsive"); expect(load.retained()).toBe(1);
  fs.truncateSync(changed, 10); expect(load(r, "changed").run.status).toBe("invalid"); expect(load.retained()).toBe(0);
  const replaced = write(r, "replaced", named()); load(r, "replaced"); fs.rmSync(replaced);
  fs.writeFileSync(replaced, ended().events.map(event => JSON.stringify({ ...event, run: "replaced" })).join("\n") + "\n");
  expect(load(r, "replaced").run.status).toBe("ended"); expect(load.retained()).toBe(0);
  for (let index = 0; index < 10; index++) { const id = `live-${String(index)}`; write(r, id, named()); load(r, id); }
  expect(load.retained()).toBe(8);
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

function heldCompute(): { compute: WorkbenchCompute; calls: string[]; release: () => void } {
  const calls: string[] = [], waiting: (() => void)[] = [];
  return {
    calls,
    compute: (root, id) => { calls.push(id); return new Promise<LoadedRun>((resolve) => { waiting.push(() => { resolve(loadRun(root, id)); }); }); },
    release: () => { for (const go of waiting.splice(0)) go(); },
  };
}

it("serves a partial snapshot at once while cold runs load in the background", async () => {
  const r = catalog();
  const h = heldCompute();
  const loader = createWorkbenchLoader({ compute: h.compute });
  const cold = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  expect(cold.runs).toEqual([]);
  expect(cold.problems).toContain("Still loading 4 of 4 recorded runs; this page fills in as they finish.");
  expect([...h.calls].sort()).toEqual(["broken", "done", "held", "live"]);
  h.release();
  await new Promise((resolve) => { setImmediate(resolve); });
  const warm = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  expect(warm).toEqual(await workbenchSnapshot(r, healthy, NOW));
  expect(h.calls).toHaveLength(4);
});

it("includes the selected cold replay in its first card response without waiting for other runs", async () => {
  const r = root(); write(r, "done", ended()); write(r, "live", named());
  let releaseOther = (): void => { throw new Error("other run was not requested"); };
  const loader = createWorkbenchLoader({ compute: (root, id) => id === "done" ? Promise.resolve(loadRun(root, id)) : new Promise(resolve => { releaseOther = () => { resolve(loadRun(root, id)); }; }) });
  try {
    const first = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true, cards: { selected: "done", live: new Set(["live"]) } });
    expect(first.runs.map(run => run.id)).toEqual(["done"]);
    expect(first.runs[0]?.config).not.toBeNull();
    expect(first.runs[0]?.status).toBe("ended");
  } finally { releaseOther(); }
});

it("keeps showing a run's previous record while its grown log reloads", async () => {
  const r = catalog();
  const h = heldCompute();
  const loader = createWorkbenchLoader({ compute: h.compute });
  const first = workbenchSnapshot(r, healthy, NOW, undefined, loader);
  await new Promise((resolve) => { setImmediate(resolve); });
  h.release();
  const before = (await first).runs.find((x) => x.id === "live");
  fs.appendFileSync(join(r, "live", "events.jsonl"), JSON.stringify({ v: 1, run: "live", seq: 4, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "milestone", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }) + "\n");
  const stale = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  expect(stale.runs.find((x) => x.id === "live")).toEqual(before);
  expect(stale.problems.some((p) => p.startsWith("Still loading"))).toBe(false);
  expect(h.calls.filter((id) => id === "live")).toHaveLength(2);
  h.release();
  await new Promise((resolve) => { setImmediate(resolve); });
  expect((await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true })).runs.find((x) => x.id === "live")?.status).toBe("ended");
});

it("retries a background load that failed instead of leaving the run pending forever", async () => {
  const r = root();
  write(r, "done", ended());
  let calls = 0;
  const loader = createWorkbenchLoader({ compute: (root, id) => { calls += 1; return calls === 1 ? Promise.reject(new Error("worker died")) : Promise.resolve(loadRun(root, id)); } });
  const first = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  expect(first.runs).toEqual([]);
  await new Promise((resolve) => { setImmediate(resolve); });
  await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  await new Promise((resolve) => { setImmediate(resolve); });
  expect((await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true })).runs.map((x) => x.id)).toEqual(["done"]);
  expect(calls).toBe(2);
});

it("runs workbench jobs before queued baseline jobs", async () => {
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const w = new FakeWorker(); workers.push(w); return w; }, 1);
  const jobs = [pool.compute("/r", "a"), pool.compute("/r", "b"), pool.load("/r", "c", null)];
  for (const job of jobs) job.catch(() => undefined);
  expect(workers[0]?.posted.map((p) => p.runId)).toEqual(["a"]);
  workers[0]?.emit("message", { id: workers[0].posted[0]?.id, outcome: { baseline: { run: "a", milestones: [] } } });
  await jobs[0];
  expect(workers[0]?.posted.map((p) => `${p.kind}:${p.runId}`)).toEqual(["baseline:a", "workbench:c"]);
  await pool.close();
});

it("answers the comparisons data at once when the viewer serves partial snapshots", async () => {
  const r = catalog();
  const h = heldCompute();
  const viewer = await startViewer({ runsRoot: r, staticDir: r, appDir: r, port: 0, workbench: { compute: h.compute, partial: true } });
  viewers.push(viewer);
  const reply = await fetch(new URL("api/workbench", viewer.url));
  expect(reply.status).toBe(200);
  expect(((await reply.json()) as { problems: string[] }).problems).toContain("Still loading 4 of 4 recorded runs; this page fills in as they finish.");
  h.release();
});

it("keeps card snapshot caches isolated when the selected replay changes", async () => {
  const r = catalog(); write(r, "peer", taggedEnded()); write(r, "archive", ended());
  const c = counted();
  const viewer = await startViewer({ runsRoot: r, staticDir: r, appDir: r, port: 0, workbench: { compute: c.compute } });
  viewers.push(viewer);
  const done = parseWorkbench(await (await fetch(new URL("api/cards?run=done", viewer.url))).json());
  const peer = parseWorkbench(await (await fetch(new URL("api/cards?run=peer", viewer.url))).json());
  expect(done.runs.find(run => run.id === "done")?.config).not.toBeNull();
  expect(peer.runs.find(run => run.id === "peer")?.config).not.toBeNull();
  expect(c.calls.filter(id => id === "done")).toHaveLength(1);
  expect(c.calls.filter(id => id === "peer")).toHaveLength(1);
  expect(c.calls).not.toContain("archive");
  const full = parseWorkbench(await (await fetch(new URL("api/workbench", viewer.url))).json());
  expect(full.runs.find(run => run.id === "archive")?.config).not.toBeNull();
  expect(c.calls.filter(id => id === "archive")).toHaveLength(1);
});

const tick = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });
const endLine = (run: string): string => JSON.stringify({ v: 1, run, seq: 4, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "milestone", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }) + "\n";

it("shows a live run whose log grows during every load, with at most one reload in flight", async () => {
  const r = catalog();
  const live = join(r, "live", "events.jsonl");
  const h = heldCompute();
  const loader = createWorkbenchLoader({ compute: (root, id, viewer) => { if (id === "live") fs.appendFileSync(live, "\n"); return h.compute(root, id, viewer); } });
  for (let cycle = 0; cycle < 3; cycle++) {
    const snap = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
    if (cycle > 0) {
      expect(snap.runs.map((x) => x.id)).toContain("live");
      expect(snap.problems.some((p) => p.startsWith("Still loading"))).toBe(false);
    }
    await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
    h.release();
    await tick();
  }
  expect(h.calls.filter((id) => id === "live")).toHaveLength(3);
});

it.each([
  ["rewritten in place", (p: string): void => { const text = fs.readFileSync(p, "utf8"); fs.writeFileSync(p, text.replace('"turn":1', '"turn":0')); }],
  ["truncated", (p: string): void => { fs.truncateSync(p, 10); }],
  ["replaced", (p: string): void => { const text = fs.readFileSync(p, "utf8"); fs.rmSync(p); fs.writeFileSync(p, text + endLine("done")); }],
])("never serves the previous record of a log that was %s rather than appended to", async (_label, mutate) => {
  const r = catalog();
  const h = heldCompute();
  const loader = createWorkbenchLoader({ compute: h.compute });
  const first = workbenchSnapshot(r, healthy, NOW, undefined, loader);
  await tick(); h.release(); await first;
  mutate(join(r, "done", "events.jsonl"));
  const during = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  expect(during.runs.map((x) => x.id)).not.toContain("done");
  expect(during.problems).toContain("Still loading 1 of 4 recorded runs; this page fills in as they finish.");
  h.release(); await tick();
  const after = await workbenchSnapshot(r, healthy, NOW, undefined, loader, { partial: true });
  expect(after.runs.find((x) => x.id === "done")).toEqual((await workbenchSnapshot(r, healthy, NOW)).runs.find((x) => x.id === "done"));
});

it("serves disk-cached runs in the very first partial snapshot without loading them", async () => {
  const r = catalog();
  const dir = workbenchCacheDir(r, CODE);
  await workbenchSnapshot(r, healthy, NOW, undefined, createWorkbenchLoader({ store: createWorkbenchStore(dir) }));
  const h = heldCompute();
  const first = await workbenchSnapshot(r, healthy, NOW, undefined, createWorkbenchLoader({ compute: h.compute, store: createWorkbenchStore(dir) }), { partial: true });
  expect(first.runs.map((x) => x.id)).toEqual(["done"]);
  expect(first.problems).toContain("Still loading 3 of 4 recorded runs; this page fills in as they finish.");
  expect(h.calls).not.toContain("done");
  h.release();
});


it("promotes already queued card runs over historical work without adding a worker", async () => {
  const workers: FakeWorker[] = [];
  const pool = createBaselinePool(() => { const worker = new FakeWorker(); workers.push(worker); return worker; }, 1);
  const jobs = [pool.compute("/r", "busy"), pool.load("/r", "history", null), pool.load("/r", "selected", null), pool.load("/other", "selected", null)];
  for (const job of jobs) void job.catch(() => undefined);
  try {
    pool.prioritize("/r", ["selected"]);
    workers[0]?.emit("message", { id: workers[0].posted[0]?.id, outcome: { baseline: { run: "busy", milestones: [] } } });
    await jobs[0];
    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted.map(job => job.runId)).toEqual(["busy", "selected"]);
    // A later selection replaces the priority; identities are scoped to the runs root.
    pool.prioritize("/other", ["selected"]);
    workers[0]?.emit("message", { id: workers[0].posted[1]?.id, failure: "test finished" });
    await jobs[2]?.catch(() => undefined);
    expect(workers[0]?.posted[2]?.runsRoot).toBe("/other");
  } finally { await pool.close(); }
});


it("prioritizes a selected HTTP card through production offload while history is queued", async () => {
  const r = root();
  for (const id of ["z-history", "y-history", "a-selected"]) write(r, id, ended());
  const posted = Promise.withResolvers<undefined>();
  const prioritized = Promise.withResolvers<undefined>();
  const worker = new FakeWorker();
  const originalPost = worker.postMessage.bind(worker);
  worker.postMessage = message => { originalPost(message); posted.resolve(undefined); };
  const offload = viewerOffload(r, new URL("file:///test-worker.js"), CODE, 32, () => worker);
  const promote = offload.workbench?.prioritize;
  const viewer = await startViewer({ runsRoot: r, staticDir: r, appDir: r, port: 0, build: null, ...offload,
    workbench: { ...offload.workbench, prioritize: ids => { promote?.(ids); prioritized.resolve(undefined); } },
  });
  viewers.push(viewer);
  const history = fetch(new URL("api/runs/a-selected/frontier", viewer.url));
  await posted.promise;
  const cards = fetch(new URL("api/cards?run=a-selected", viewer.url));
  await prioritized.promise;
  // Finish only the running historical job; selected must bypass every queued historical job.
  const first = worker.posted[0];
  if (first === undefined) throw new Error("missing running reduction");
  worker.emit("message", { id: first.id, outcome: loadRun(r, first.runId) });
  const nextRun = worker.posted[1]?.runId;
  const selected = worker.posted[1];
  if (selected === undefined) throw new Error("missing selected reduction");
  worker.emit("message", { id: selected.id, outcome: loadRun(r, selected.runId) });

  const last = worker.posted[2];
  if (last === undefined) throw new Error("missing remaining history reduction");
  worker.emit("message", { id: last.id, outcome: loadRun(r, last.runId) });
  const data = parseWorkbench(await (await cards).json());
  expect((await history).status).toBe(200);
  expect(nextRun).toBe("a-selected");
  expect(data.runs.map(run => run.id)).toEqual(["a-selected"]);
  expect(worker.posted).toHaveLength(3);
});
