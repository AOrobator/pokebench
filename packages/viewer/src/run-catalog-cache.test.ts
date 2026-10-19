import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Log, START } from "../test-support/events.js";
import type { ViewerBuild } from "./build-stamp.js";
import { WORKBENCH_POLL_MS } from "./workbench-data.js";
import { createRunCatalog, listRuns } from "./runs.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const roots: string[] = [];
const viewers: Viewer[] = [];
const END = { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 1_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } } as const;
const FLAGS = { loopGuard: false, activeUi: false, interfaceDocs: false, objectives: false };
const OLDER_COMMIT = "308ddd3e".padEnd(40, "0");
const older: ViewerBuild = { commit: OLDER_COMMIT, dirty: false, relation: () => "older" };

afterEach(async () => {
  vi.restoreAllMocks();
  while (viewers.length > 0) await viewers.pop()?.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const path = fs.mkdtempSync(join(tmpdir(), "run-catalog-cache-"));
  roots.push(path);
  return path;
}

function runText(id: string, model: string, ended: boolean, tagged = false): string {
  const log = new Log();
  log.add(0, {
    ...START,
    model: { ...START.model, id: model },
    ...(tagged ? { evaluation: { preset_id: "bundle-v-control", target: null, failure_limit: 3, flags: FLAGS, experiment: { id: "catalog-cache", arm: "control", trial: 1, of: 2 } } } : {}),
  });
  if (ended) log.add(1_000, END);
  return `${log.events.map(event => JSON.stringify({ ...event, run: id })).join("\n")}\n`;
}

function writeRun(runsRoot: string, id: string, model = "think-swarm", ended = true, tagged = false): string {
  const dir = join(runsRoot, id), path = join(dir, "events.jsonl");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path, runText(id, model, ended, tagged));
  return path;
}

function byId(catalog: ReturnType<typeof createRunCatalog>, id: string) {
  return catalog().find(run => run.id === id);
}

describe("server-owned run summary catalog", () => {
  it("reuses unchanged archived summaries without rereading either log edge and freezes nested cohort identity", () => {
    const runsRoot = root();
    writeRun(runsRoot, "tagged", "think-swarm", true, true);
    const catalog = createRunCatalog(runsRoot, null), reads = vi.spyOn(fs, "readSync");
    const first = byId(catalog, "tagged");
    expect(first).toMatchObject({ model: "think-swarm", ended: true, cohort: { id: "catalog-cache", arm: "control", trial: 1, of: 2 } });
    if (first === undefined || first.cohort === undefined) throw new Error("tagged run missing from catalog");
    expect(reads.mock.calls.length).toBeGreaterThan(0);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.cohort)).toBe(true);
    reads.mockClear();
    const second = byId(catalog, "tagged");
    expect(second).toBe(first);
    expect(reads).not.toHaveBeenCalled();
  });

  it("invalidates only the changed run on append and truncation", () => {
    const runsRoot = root(), live = writeRun(runsRoot, "live", "live-model", false);
    writeRun(runsRoot, "still", "still-model", true);
    const catalog = createRunCatalog(runsRoot, null);
    const stable = byId(catalog, "still");
    expect(byId(catalog, "live")).toMatchObject({ ended: false, reason: null });
    fs.appendFileSync(live, `${JSON.stringify({ v: 1, run: "live", seq: 1, t: "2026-10-11T22:00:01.000-04:00", ...END })}\n`);
    expect(byId(catalog, "live")).toMatchObject({ ended: true, reason: "budget" });
    expect(byId(catalog, "still")).toBe(stable);
    fs.writeFileSync(live, `${fs.readFileSync(live, "utf8").split("\n")[0] ?? ""}\n`);
    expect(byId(catalog, "live")).toMatchObject({ ended: false, reason: null });
    expect(byId(catalog, "still")).toBe(stable);
  });

  it("invalidates a same-size rewrite from nanosecond change metadata", () => {
    const runsRoot = root(), path = writeRun(runsRoot, "same", "think-swarm");
    const catalog = createRunCatalog(runsRoot, null);
    expect(byId(catalog, "same")?.model).toBe("think-swarm");
    const before = fs.statSync(path), text = fs.readFileSync(path, "utf8"), changed = text.replaceAll("think-swarm", "think-storm");
    expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(text));
    fs.writeFileSync(path, changed);
    fs.utimesSync(path, before.atime, new Date(before.mtimeMs + 2_000));
    expect(fs.statSync(path).size).toBe(before.size);
    expect(byId(catalog, "same")?.model).toBe("think-storm");
  });

  it("invalidates an atomic same-size replacement by device and inode identity", () => {
    const runsRoot = root(), path = writeRun(runsRoot, "replace", "think-swarm");
    const catalog = createRunCatalog(runsRoot, null);
    expect(byId(catalog, "replace")?.model).toBe("think-swarm");
    const before = fs.statSync(path), text = fs.readFileSync(path, "utf8"), replacement = `${path}.replacement`;
    const changed = text.replaceAll("think-swarm", "think-storm");
    fs.writeFileSync(replacement, changed);
    fs.utimesSync(replacement, before.atime, before.mtime);
    expect(fs.statSync(replacement).size).toBe(before.size);
    expect(fs.statSync(replacement).ino).not.toBe(before.ino);
    fs.renameSync(replacement, path);
    expect(byId(catalog, "replace")?.model).toBe("think-storm");
  });

  it("forgets deletions, discovers new runs immediately and reloads a recreated id", () => {
    const runsRoot = root();
    writeRun(runsRoot, "old", "old-model");
    const catalog = createRunCatalog(runsRoot, null);
    expect(byId(catalog, "old")?.model).toBe("old-model");
    fs.rmSync(join(runsRoot, "old"), { recursive: true });
    expect(catalog()).toEqual([]);
    writeRun(runsRoot, "new", "new-model");
    expect(byId(catalog, "new")?.model).toBe("new-model");
    writeRun(runsRoot, "old", "recreated");
    expect(byId(catalog, "old")?.model).toBe("recreated");
  });

  it("does not retain a swallowed first-line open failure despite an unchanged file identity", () => {
    const runsRoot = root(), path = writeRun(runsRoot, "retry", "readable");
    const catalog = createRunCatalog(runsRoot, null), open = fs.openSync;
    let failed = false;
    const openSpy = vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      if (!failed && String(args[0]) === path && args[1] === "r") { failed = true; throw Object.assign(new Error("transient open"), { code: "EIO" }); }
      return open(...args);
    });
    expect(byId(catalog, "retry")).toMatchObject({ model: null, problem: "no run_start yet" });
    openSpy.mockRestore();
    expect(byId(catalog, "retry")).toMatchObject({ model: "readable", problem: null });
  });

  it("propagates a read exception without retaining a result and retries the unchanged file", () => {
    const runsRoot = root();
    writeRun(runsRoot, "error", "retry-after-error");
    const catalog = createRunCatalog(runsRoot, null), read = fs.readSync;
    let failed = false;
    const readSpy = vi.spyOn(fs, "readSync").mockImplementation((...args) => {
      if (!failed) { failed = true; throw Object.assign(new Error("transient read"), { code: "EIO" }); }
      return read(...args);
    });
    expect(() => catalog()).toThrow("transient read");
    readSpy.mockRestore();
    expect(byId(catalog, "error")).toMatchObject({ model: "retry-after-error", ended: true, problem: null });
  });

  it("does not retain a successful-looking summary after a partial tail read", () => {
    const runsRoot = root();
    writeRun(runsRoot, "partial", "tail-model", true);
    const catalog = createRunCatalog(runsRoot, null), read = fs.readSync;
    let calls = 0;
    const readSpy = vi.spyOn(fs, "readSync").mockImplementation((...args) => {
      calls += 1;
      return calls === 2 ? 0 : read(...args);
    });
    expect(byId(catalog, "partial")).toMatchObject({ model: "tail-model", ended: false, problem: null });
    readSpy.mockRestore();
    expect(byId(catalog, "partial")).toMatchObject({ model: "tail-model", ended: true, reason: "budget", problem: null });
  });

  it("keeps read quality false after an earlier short read even when later reads produce a correct summary", () => {
    const runsRoot = root(), path = writeRun(runsRoot, "monotonic", "complete-looking", true);
    const firstLineBytes = Buffer.byteLength(fs.readFileSync(path, "utf8").split("\n")[0] ?? "") + 1;
    const catalog = createRunCatalog(runsRoot, null), read = fs.readSync;
    let calls = 0;
    const short = vi.spyOn(fs, "readSync").mockImplementation((fd, buffer, offset, length, position) => {
      calls += 1;
      if (calls === 1) return read(fd, buffer, offset, Math.min(length, firstLineBytes), position);
      if (calls === 2) return 0;
      return read(fd, buffer, offset, length, position);
    });
    expect(byId(catalog, "monotonic")).toMatchObject({ model: "complete-looking", ended: true, problem: null });
    short.mockRestore();
    const retry = vi.spyOn(fs, "readSync");
    expect(byId(catalog, "monotonic")).toMatchObject({ ended: true, problem: null });
    expect(retry.mock.calls.length).toBeGreaterThan(0);
  });

  it("does not cache a tail assembled from a positive prefix followed by premature EOF", () => {
    const runsRoot = root(), path = writeRun(runsRoot, "prefix", "prefix-model", true);
    const bytes = fs.statSync(path).size, catalog = createRunCatalog(runsRoot, null), read = fs.readSync;
    let calls = 0;
    const partial = vi.spyOn(fs, "readSync").mockImplementation((fd, buffer, offset, length, position) => {
      calls += 1;
      if (calls === 2) return read(fd, buffer, offset, Math.min(length, Math.max(1, Math.floor(bytes / 2))), position);
      if (calls === 3) return 0;
      return read(fd, buffer, offset, length, position);
    });
    expect(byId(catalog, "prefix")).toMatchObject({ model: "prefix-model", ended: false, problem: null });
    partial.mockRestore();
    expect(byId(catalog, "prefix")).toMatchObject({ model: "prefix-model", ended: true, reason: "budget", problem: null });
  });

  it("caches small files whose positive partial reads eventually fill every requested byte", () => {
    const runsRoot = root();
    writeRun(runsRoot, "chunked", "chunked-model", true);
    const catalog = createRunCatalog(runsRoot, null), read = fs.readSync;
    const chunks = vi.spyOn(fs, "readSync").mockImplementation((fd, buffer, offset, length, position) => read(fd, buffer, offset, Math.min(length, 7), position));
    expect(byId(catalog, "chunked")).toMatchObject({ model: "chunked-model", ended: true, problem: null });
    expect(chunks.mock.calls.length).toBeGreaterThan(2);
    chunks.mockRestore();
    const warm = vi.spyOn(fs, "readSync");
    expect(byId(catalog, "chunked")).toMatchObject({ ended: true });
    expect(warm).not.toHaveBeenCalled();
  });

  it("retains the existing terminal-without-newline interpretation and caches it", () => {
    const runsRoot = root(), path = writeRun(runsRoot, "unterminated", "terminal-model", true);
    fs.writeFileSync(path, fs.readFileSync(path, "utf8").trimEnd());
    const catalog = createRunCatalog(runsRoot, null);
    expect(byId(catalog, "unterminated")).toMatchObject({ ended: true, reason: "budget", problem: null });
    const reads = vi.spyOn(fs, "readSync");
    expect(byId(catalog, "unterminated")).toMatchObject({ ended: true, reason: "budget" });
    expect(reads).not.toHaveBeenCalled();
  });

  it("preserves descriptor fstat and close exceptions and retries rather than caching", () => {
    const runsRoot = root();
    writeRun(runsRoot, "descriptor", "descriptor-model", true);
    const catalog = createRunCatalog(runsRoot, null), fstat = fs.fstatSync;
    let fstatFailed = false;
    const fstatSpy = vi.spyOn(fs, "fstatSync").mockImplementation((...args) => {
      if (!fstatFailed) { fstatFailed = true; throw Object.assign(new Error("transient fstat"), { code: "EIO" }); }
      return fstat(...args);
    });
    expect(() => catalog()).toThrow("transient fstat");
    fstatSpy.mockRestore();

    const close = fs.closeSync;
    let closeFailed = false;
    const closeSpy = vi.spyOn(fs, "closeSync").mockImplementation((...args) => {
      close(...args);
      if (!closeFailed) { closeFailed = true; throw Object.assign(new Error("transient close"), { code: "EIO" }); }
    });
    expect(() => catalog()).toThrow("transient close");
    closeSpy.mockRestore();
    expect(byId(catalog, "descriptor")).toMatchObject({ model: "descriptor-model", ended: true, problem: null });
  });

  it("isolates roots and viewer builds while preserving unknown-newer-build wire semantics", () => {
    const a = root(), b = root();
    writeRun(a, "same", "root-a"); writeRun(b, "same", "root-b");
    expect(byId(createRunCatalog(a, null), "same")?.model).toBe("root-a");
    expect(byId(createRunCatalog(b, null), "same")?.model).toBe("root-b");

    const newer = writeRun(a, "newer", "newer-model", false);
    const rows = fs.readFileSync(newer, "utf8").trimEnd().split("\n");
    const start = JSON.parse(rows[0] ?? "{}") as Record<string, unknown>;
    start.surprise = { added: true };
    rows[0] = JSON.stringify(start);
    fs.writeFileSync(newer, `${rows.join("\n")}\n`);
    const strict = createRunCatalog(a, null), skewAware = createRunCatalog(a, older);
    expect(byId(strict, "newer")).toEqual(listRuns(a, null).find(run => run.id === "newer"));
    expect(byId(skewAware, "newer")).toEqual(listRuns(a, older).find(run => run.id === "newer"));
    expect(byId(strict, "newer")?.problem).toContain("unexpected property surprise");
    expect(byId(strict, "newer")?.problem).not.toContain("restart the viewer");
    expect(byId(skewAware, "newer")?.problem).toContain("restart the viewer");
  });
});

describe("catalog integration", () => {
  it("serves repeated run-list requests without rereading unchanged archived log edges", async () => {
    const base = root(), runsRoot = join(base, "runs");
    fs.mkdirSync(runsRoot); writeRun(runsRoot, "done", "archived");
    const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, build: null });
    viewers.push(viewer);
    expect((await fetch(`${viewer.url}api/runs`)).status).toBe(200);
    const reads = vi.spyOn(fs, "readSync");
    expect((await fetch(`${viewer.url}api/runs`)).status).toBe(200);
    expect(reads).not.toHaveBeenCalled();
  });

  it("shares the null-build catalog across live discovery, cards and workbench after snapshot expiry", async () => {
    const base = root(), runsRoot = join(base, "runs");
    fs.mkdirSync(runsRoot); writeRun(runsRoot, "done", "archived");
    let now = 0;
    const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, build: null, now: () => new Date(now) });
    viewers.push(viewer);
    expect((await fetch(`${viewer.url}api/cards?run=done`)).status).toBe(200);
    now += WORKBENCH_POLL_MS;
    const reads = vi.spyOn(fs, "readSync");
    expect((await fetch(`${viewer.url}api/cards?run=done`)).status).toBe(200);
    expect((await fetch(`${viewer.url}api/workbench`)).status).toBe(200);
    expect(reads).not.toHaveBeenCalled();
  });
});
