import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Log, START } from "../test-support/events.js";
import type { ViewerBuild } from "./build-stamp.js";
import { liveRuns } from "./next-run.js";
import { createRunCatalog, listRuns } from "./runs.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const roots: string[] = [];
const viewers: Viewer[] = [];
const END = { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 1_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } } as const;
const older: ViewerBuild = { commit: "308ddd3e".padEnd(40, "0"), dirty: false, relation: () => "older" };

afterEach(async () => {
  vi.restoreAllMocks();
  while (viewers.length > 0) await viewers.pop()?.close();
  for (const path of roots.splice(0)) fs.rmSync(path, { recursive: true, force: true });
});

function root(): string {
  const path = fs.mkdtempSync(join(tmpdir(), "run-catalog-discovery-"));
  roots.push(path);
  return path;
}

function runText(id: string, model: string, ended = true): string {
  const log = new Log();
  log.add(0, { ...START, model: { ...START.model, id: model } });
  if (ended) log.add(1_000, END);
  return `${log.events.map(event => JSON.stringify({ ...event, run: id })).join("\n")}\n`;
}

function writeRun(runsRoot: string, id: string, model = id, ended = true, human = false): string {
  const dir = join(runsRoot, ...(human ? ["human", id] : [id])), path = join(dir, "events.jsonl");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path, runText(id, model, ended));
  return path;
}

describe("path-aware run catalog discovery", () => {
  it("serves one build-aware run-list scan using each discovered model and human path once", async () => {
    const base = root(), runsRoot = join(base, "runs");
    fs.mkdirSync(runsRoot);
    const paths = [
      writeRun(runsRoot, "model-a"),
      writeRun(runsRoot, "model-b"),
      writeRun(runsRoot, "model-c"),
      writeRun(runsRoot, "human-a", "Human fixture", true, true),
    ];
    const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, build: older });
    viewers.push(viewer);
    const first = await (await fetch(`${viewer.url}api/runs`)).json() as unknown;
    const exists = vi.spyOn(fs, "existsSync"), stat = vi.spyOn(fs, "statSync");

    const second = await (await fetch(`${viewer.url}api/runs`)).json() as unknown;

    expect(second).toEqual(first);
    const eventPaths = new Set(paths), runDirs = new Set(paths.flatMap(path => {
      const id = path.split("/").at(-2) ?? "";
      return [join(runsRoot, id), join(runsRoot, "human", id)];
    }));
    expect({
      eventFileExists: exists.mock.calls.filter(([path]) => eventPaths.has(String(path))).length,
      runDirectoryExists: exists.mock.calls.filter(([path]) => runDirs.has(String(path))).length,
      eventIdentityStats: stat.mock.calls.filter(([path, options]) => eventPaths.has(String(path)) && options?.bigint === true).length,
    }).toEqual({ eventFileExists: paths.length, runDirectoryExists: 0, eventIdentityStats: paths.length });
  });

  it("preserves the exact legacy ambiguity for an id present under both physical roots", () => {
    const runsRoot = root(), id = "ambiguous";
    writeRun(runsRoot, id, "model copy");
    writeRun(runsRoot, id, "human copy", true, true);
    expect(createRunCatalog(runsRoot, null)()).toEqual(listRuns(runsRoot, null));
    expect(createRunCatalog(runsRoot, null)()[0]?.problem).toContain("ambiguous run id");
  });

  it("does not trust a unique path when an ambiguous peer appears just after discovery", () => {
    const runsRoot = root(), id = "racy", humanRoot = join(runsRoot, "human");
    writeRun(runsRoot, id, "model copy");
    fs.mkdirSync(humanRoot);
    const readdir = fs.readdirSync;
    let appeared = false;
    const read = vi.spyOn(fs, "readdirSync").mockImplementation(((path: fs.PathLike, options?: unknown) => {
      const entries = readdir(path, options as never);
      if (!appeared && String(path) === humanRoot) {
        appeared = true;
        writeRun(runsRoot, id, "human copy", true, true);
      }
      return entries;
    }) as typeof fs.readdirSync);

    expect(createRunCatalog(runsRoot, null)()[0]?.problem).toContain("ambiguous run id");
    read.mockRestore();
  });

  it("keeps the surviving physical root when the other root cannot be listed", () => {
    const runsRoot = root(), humanRoot = join(runsRoot, "human");
    writeRun(runsRoot, "model-hidden", "hidden model");
    writeRun(runsRoot, "human-visible", "visible human", true, true);
    const readdir = fs.readdirSync;
    const broken = vi.spyOn(fs, "readdirSync").mockImplementation(((path: fs.PathLike, options?: unknown) => {
      if (String(path) === runsRoot) throw Object.assign(new Error("transient readdir"), { code: "EIO" });
      return readdir(path, options as never);
    }) as typeof fs.readdirSync);
    expect(createRunCatalog(runsRoot, null)()).toEqual(listRuns(runsRoot, null));
    expect(createRunCatalog(runsRoot, null)().map(run => run.id)).toEqual(["human-visible"]);
    broken.mockRestore();
  });

  it("preserves uncached wire behavior when a discovered event file disappears", () => {
    const disappearing = (catalog: boolean) => {
      const runsRoot = root(), path = writeRun(runsRoot, "vanished", "vanishing model"), exists = fs.existsSync;
      let removed = false;
      const check = vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
        const present = exists(candidate);
        if (!removed && String(candidate) === path) { removed = true; fs.rmSync(path, { force: true }); }
        return present;
      });
      const result = catalog ? createRunCatalog(runsRoot, null)()[0] : listRuns(runsRoot, null)[0];
      check.mockRestore();
      return result;
    };
    expect(disappearing(true)).toEqual(disappearing(false));
  });

  it("still propagates an actual edge-read failure and retries it on the next call", () => {
    const runsRoot = root();
    writeRun(runsRoot, "read-fault", "read fault");
    const catalog = createRunCatalog(runsRoot, null), read = fs.readSync;
    let failed = false;
    const fault = vi.spyOn(fs, "readSync").mockImplementation((...args) => {
      if (!failed) { failed = true; throw Object.assign(new Error("actual read fault"), { code: "EIO" }); }
      return read(...args);
    });
    expect(() => catalog()).toThrow("actual read fault");
    fault.mockRestore();
    expect(catalog()[0]).toMatchObject({ id: "read-fault", model: "read fault", problem: null });
  });

  it("uses strict build summaries for health candidates without probing a newer invalid run", async () => {
    const runsRoot = root(), livePath = writeRun(runsRoot, "live-valid", "live valid", false);
    const invalidPath = writeRun(runsRoot, "newer-invalid", "newer invalid", false);
    const lines = fs.readFileSync(invalidPath, "utf8").trimEnd().split("\n");
    const start = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    start.surprise = { added: true };
    lines[0] = JSON.stringify(start);
    fs.writeFileSync(invalidPath, `${lines.join("\n")}\n`);
    const strict = createRunCatalog(runsRoot, older), ports: number[] = [];
    const live = await liveRuns(runsRoot, (port) => { ports.push(port); return Promise.resolve(true); }, strict);
    expect(live).toEqual(["live-valid"]);
    expect(ports).toEqual([START.isolation.port]);
    expect(strict().find(run => run.id === "newer-invalid")?.problem).toContain("restart the viewer");
    expect(fs.existsSync(livePath)).toBe(true);
  });
});
