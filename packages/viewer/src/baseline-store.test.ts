import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fullRun, tAt } from "../test-support/events.js";
import { baselineCacheDir, codeIdentity, createBaselineStore, createCardStore, pruneBaselineCaches } from "./baseline-store.js";
import { loadRun } from "./workbench-store.js";
import { BaselineError, baselineOf, computeBaseline, createBaselineReader, type BaselineCompute } from "./runs.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const roots: string[] = [], viewers: Viewer[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const viewer of viewers.splice(0)) await viewer.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const path = fs.mkdtempSync(join(tmpdir(), "baseline-store-"));
  roots.push(path);
  return path;
}
function write(root: string, id: string, offset = 3100): string {
  const dir = join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const events = fullRun().events.map((event) => ({ ...event, run: id, ...(event.type === "milestone" && event.name === "PLAYER_NAME_SET" ? { t: tAt(offset) } : {}) }));
  const path = join(dir, "events.jsonl");
  fs.writeFileSync(path, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  return path;
}
function counted(): { compute: BaselineCompute; calls: string[] } {
  const calls: string[] = [];
  return { calls, compute: (runsRoot, runId) => { calls.push(runId); return Promise.resolve(computeBaseline(runsRoot, runId)); } };
}
const CODE = "a".repeat(64);

it("validates saved card identities and drops measurements independently of parser caches", () => {
  const dir = root(); write(dir, "card"); write(dir, "other");
  const store = createCardStore(dir), loaded = loadRun(dir, "card");
  store.put("card", "signature", loaded);
  const restored = store.latest("card");
  expect(restored).toMatchObject({ fingerprint: "signature", outcome: { run: { id: "card", card: loaded.run.card } } });
  expect(restored?.outcome.run.measurement).toBeUndefined();
  const path = join(dir, ".viewer-cache", "cards-v1", "card.json");
  for (const bad of ["not json", JSON.stringify({ fingerprint: "signature", outcome: loadRun(dir, "other") }), JSON.stringify({ fingerprint: "signature", outcome: { ...loaded, run: { ...loaded.run, card: { name: "MAY", location: null, party: [{ speciesId: 9999, level: 1, egg: false }] } } } }), JSON.stringify({ fingerprint: "signature", outcome: { ...loaded, run: { ...loaded.run, card: null } } }), JSON.stringify({ fingerprint: "signature", outcome: { ...loaded, run: { ...loaded.run, status: "invalid" } } })]) {
    fs.writeFileSync(path, bad);
    expect(store.latest("card"), bad).toBeNull();
  }
  expect(store.latest("../escape")).toBeNull();
  const blocked = root(); fs.writeFileSync(join(blocked, ".viewer-cache"), "blocked");
  const unavailable = createCardStore(blocked);
  expect(() => { unavailable.put("card", "signature", loaded); }).not.toThrow();
  expect(unavailable.latest("card")).toBeNull();
});

it("reuses baselines and expected errors persisted by an earlier reader without computing again", async () => {
  const dir = root();
  write(dir, "good");
  fs.writeFileSync(write(dir, "bad"), fs.readFileSync(join(dir, "bad", "events.jsonl"), "utf8").replace('"name":"PLAYER_NAME_SET"', '"name":42'));
  const first = counted();
  const before = createBaselineReader(dir, { compute: first.compute, store: createBaselineStore(baselineCacheDir(dir, CODE)) });
  expect(await before("good")).toEqual(baselineOf(dir, "good"));
  await expect(before("bad")).rejects.toThrow(/line 8/);
  expect(first.calls).toEqual(["good", "bad"]);
  const second = counted();
  const after = createBaselineReader(dir, { compute: second.compute, store: createBaselineStore(baselineCacheDir(dir, CODE)) });
  expect(await after("good")).toEqual(baselineOf(dir, "good"));
  await expect(after("bad")).rejects.toBeInstanceOf(BaselineError);
  await expect(after("bad")).rejects.toThrow(/line 8/);
  expect(second.calls).toEqual([]);
  expect(fs.readdirSync(baselineCacheDir(dir, CODE)).sort()).toEqual(["bad.json", "good.json"]);
});

it("recomputes when the log changes or the baseline code changes", async () => {
  const dir = root();
  const path = write(dir, "reference");
  await createBaselineReader(dir, { store: createBaselineStore(baselineCacheDir(dir, CODE)) })("reference");
  write(dir, "reference", 4100);
  const changed = counted();
  expect((await createBaselineReader(dir, { compute: changed.compute, store: createBaselineStore(baselineCacheDir(dir, CODE)) })("reference")).milestones.at(-1)?.offsetMs).toBe(4100);
  expect(changed.calls).toEqual(["reference"]);
  const otherCode = counted();
  expect((await createBaselineReader(dir, { compute: otherCode.compute, store: createBaselineStore(baselineCacheDir(dir, "b".repeat(64))) })("reference")).milestones.at(-1)?.offsetMs).toBe(4100);
  expect(otherCode.calls).toEqual(["reference"]);
  expect(fs.existsSync(path)).toBe(true);
});

it("ignores corrupt, foreign and mismatched cache files and replaces them", async () => {
  const dir = root();
  write(dir, "reference");
  const cache = baselineCacheDir(dir, CODE);
  await createBaselineReader(dir, { store: createBaselineStore(cache) })("reference");
  const good = fs.readFileSync(join(cache, "reference.json"), "utf8");
  const entry = JSON.parse(good) as { fingerprint: string; outcome: unknown };
  for (const bad of ["not json", JSON.stringify({ fingerprint: entry.fingerprint }), JSON.stringify({ ...entry, outcome: { baseline: { run: "reference", milestones: [{ name: 1 }] } } }), JSON.stringify({ ...entry, fingerprint: "elsewhere" }), JSON.stringify({ ...entry, outcome: { baseline: { run: "someone-else", milestones: [] } } }), JSON.stringify({ ...entry, extra: true })]) {
    fs.writeFileSync(join(cache, "reference.json"), bad);
    const c = counted();
    expect(await createBaselineReader(dir, { compute: c.compute, store: createBaselineStore(cache) })("reference")).toEqual(baselineOf(dir, "reference"));
    expect(c.calls).toEqual(["reference"]);
    expect(fs.readFileSync(join(cache, "reference.json"), "utf8")).toBe(good);
  }
});

it("never persists a result whose log changed during the compute, or an unexpected failure", async () => {
  const dir = root();
  write(dir, "reference");
  const cache = baselineCacheDir(dir, CODE);
  const raced = createBaselineReader(dir, { store: createBaselineStore(cache), compute: (r, id) => { const outcome = computeBaseline(r, id); write(dir, "reference", 4100); return Promise.resolve(outcome); } });
  expect((await raced("reference")).milestones.at(-1)?.offsetMs).toBe(3100);
  expect(fs.existsSync(join(cache, "reference.json"))).toBe(false);
  const failing = createBaselineReader(dir, { store: createBaselineStore(cache), compute: () => Promise.reject(new Error("worker died")) });
  await expect(failing("reference")).rejects.toThrow("worker died");
  expect(fs.existsSync(join(cache, "reference.json"))).toBe(false);
});

it("keeps serving when the cache cannot be written", async () => {
  const dir = root();
  write(dir, "reference");
  const blocked = join(dir, "blocked");
  fs.writeFileSync(blocked, "a file where the cache directory should be");
  const store = createBaselineStore(join(blocked, CODE));
  expect(store.get("reference", "x")).toBeNull();
  expect(await createBaselineReader(dir, { store })("reference")).toEqual(baselineOf(dir, "reference"));
});

it("rejects run ids that are not run ids before touching the cache", () => {
  const store = createBaselineStore(baselineCacheDir(root(), CODE));
  expect(store.get("../escape", "x")).toBeNull();
  store.put("../escape", "x", { baseline: { run: "../escape", milestones: [] } });
  expect(() => baselineCacheDir(root(), "../up")).toThrow(/code identity/);
});

it("holds every run in memory, with no eviction at the old 256 limit", async () => {
  const dir = root();
  const ids = Array.from({ length: 258 }, (_, i) => `r${String(i).padStart(3, "0")}`);
  // Only the fingerprint stats the log; a canned compute keeps this about retention, not validation.
  for (const id of ids) { fs.mkdirSync(join(dir, id)); fs.writeFileSync(join(dir, id, "events.jsonl"), ""); }
  const calls: string[] = [];
  const read = createBaselineReader(dir, { compute: (_root, id) => { calls.push(id); return Promise.resolve({ baseline: { run: id, milestones: [] } }); } });
  for (const id of ids) await read(id);
  for (const id of ids) await read(id);
  expect(calls).toHaveLength(258);
});

it("keeps starting when a cache entry vanishes or cannot be inspected while pruning", () => {
  const dir = root();
  const parent = join(baselineCacheDir(dir, "c".repeat(64)), "..");
  fs.mkdirSync(parent, { recursive: true });
  fs.symlinkSync(join(dir, "nowhere"), join(parent, "f".repeat(64)));
  expect(() => { pruneBaselineCaches(dir, "c".repeat(64), Date.now()); }).not.toThrow();
  fs.mkdirSync(join(parent, "e".repeat(64)));
  vi.spyOn(fs, "rmSync").mockImplementation(() => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); });
  expect(() => { pruneBaselineCaches(dir, "c".repeat(64), Date.now() + 30 * 86_400_000); }).not.toThrow();
});

function tree(files: Record<string, string>): string {
  const base = root();
  for (const [path, text] of Object.entries(files)) {
    fs.mkdirSync(join(base, path, ".."), { recursive: true });
    fs.writeFileSync(join(base, path), text);
  }
  return base;
}

it("names the baseline code by the bytes of its whole import closure", () => {
  const files = {
    "dist/entry.js": 'import { b } from "./b.js";\nimport { Type } from "typebox";\nimport "./side.js";\nexport * from "./reexport.js";\nimport { readFileSync } from "node:fs";\nimport { x } from "@pokebench/fake/mod";\n',
    "dist/b.js": 'import { entry } from "./entry.js";\nexport const b = 1;\n',
    "dist/side.js": "globalThis.side = 1;\n",
    "dist/reexport.js": "export const r = 1;\n",
    "dist/unrelated.js": "export const u = 1;\n",
    "node_modules/@pokebench/fake/package.json": JSON.stringify({ name: "@pokebench/fake", type: "module", exports: { "./mod": { types: "./src/mod.ts", default: "./dist/mod.js" } } }),
    "node_modules/@pokebench/fake/dist/mod.js": "export const x = 1;\n",
  };
  const base = tree(files);
  const id = codeIdentity(join(base, "dist/entry.js"));
  expect(id).toMatch(/^[0-9a-f]{64}$/);
  expect(codeIdentity(join(tree(files), "dist/entry.js"))).toBe(id);
  fs.writeFileSync(join(base, "dist/unrelated.js"), "export const u = 2;\n");
  expect(codeIdentity(join(base, "dist/entry.js"))).toBe(id);
  for (const changed of ["dist/b.js", "dist/side.js", "dist/reexport.js", "node_modules/@pokebench/fake/dist/mod.js"]) {
    const copy = tree(files);
    fs.appendFileSync(join(copy, changed), "// changed\n");
    expect(codeIdentity(join(copy, "dist/entry.js"))).not.toBe(id);
  }
  const renamed = tree({ ...files, "dist/entry.js": files["dist/entry.js"].replace('"typebox"', '"typebox/value"') });
  expect(codeIdentity(join(renamed, "dist/entry.js"))).not.toBe(id);
});

it("prunes cache directories of other code that no viewer used for a week", () => {
  const dir = root();
  const now = Date.now(), day = 86_400_000;
  const current = baselineCacheDir(dir, "c".repeat(64)), recent = baselineCacheDir(dir, "d".repeat(64)), stale = baselineCacheDir(dir, "e".repeat(64));
  for (const path of [current, recent, stale]) fs.mkdirSync(path, { recursive: true });
  fs.utimesSync(current, new Date(now - 30 * day), new Date(now - 30 * day));
  fs.utimesSync(recent, new Date(now - 6 * day), new Date(now - 6 * day));
  fs.utimesSync(stale, new Date(now - 8 * day), new Date(now - 8 * day));
  pruneBaselineCaches(dir, "c".repeat(64), now);
  expect(fs.existsSync(current)).toBe(true);
  expect(fs.existsSync(recent)).toBe(true);
  expect(fs.existsSync(stale)).toBe(false);
  pruneBaselineCaches(root(), "c".repeat(64), now);
});

it("marks its directory used when a viewer opens it", () => {
  const dir = root();
  const path = baselineCacheDir(dir, CODE);
  fs.mkdirSync(path, { recursive: true });
  fs.utimesSync(path, new Date(0), new Date(0));
  createBaselineStore(path);
  expect(fs.statSync(path).mtimeMs).toBeGreaterThan(Date.now() - 60_000);
});

it("serves a restarted viewer's comparisons from the cache its predecessor wrote", async () => {
  const dir = root();
  write(dir, "selected"); write(dir, "reference");
  const cache = baselineCacheDir(dir, CODE);
  const first = counted();
  const one = await startViewer({ runsRoot: dir, staticDir: dir, appDir: dir, port: 0, baselines: { compute: first.compute, store: createBaselineStore(cache) } });
  viewers.push(one);
  const cold = await (await fetch(new URL("api/runs/selected/comparisons", one.url))).json() as unknown;
  expect(first.calls).toEqual(["reference"]);
  const second = counted();
  const two = await startViewer({ runsRoot: dir, staticDir: dir, appDir: dir, port: 0, baselines: { compute: second.compute, store: createBaselineStore(cache) } });
  viewers.push(two);
  expect(await (await fetch(new URL("api/runs/selected/comparisons", two.url))).json()).toEqual(cold);
  expect(second.calls).toEqual([]);
});
