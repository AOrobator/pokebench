import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunCatalog, RunSummary } from "./runs.js";
import { workbenchSnapshot, type WorkbenchLoader } from "./workbench-store.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of roots.splice(0)) fs.rmSync(path, { recursive: true, force: true });
});

function runsRoot(): string {
  const base = fs.mkdtempSync(join(tmpdir(), "workbench-forget-cache-"));
  roots.push(base);
  const root = join(base, "runs");
  fs.mkdirSync(root);
  return root;
}

function summary(id: string): RunSummary {
  return { id, model: "catalog-model", started: "2026-10-19T12:00:00.000-04:00", ended: true, reason: "budget", problem: null };
}

function loaderFor(paths: readonly string[], decisions: Map<string, boolean>): WorkbenchLoader {
  return {
    load: () => Promise.reject(new Error("cards-mode cleanup must not reduce a recording")),
    current: () => null,
    forget: (keep) => { for (const path of paths) decisions.set(path, keep(path)); },
  };
}

async function snapshot(root: string, catalog: RunCatalog, loader: WorkbenchLoader): Promise<void> {
  await workbenchSnapshot(
    root,
    () => Promise.resolve(false),
    42,
    join(dirname(root), "experiments"),
    loader,
    { cards: { selected: null, live: new Set() } },
    catalog,
  );
}

describe("workbench loader retention", () => {
  it("resolves each catalog path once instead of once per retained cache entry", async () => {
    const root = runsRoot(), ids = Array.from({ length: 6 }, (_, index) => `run-${String(index)}`);
    for (const id of ids) fs.mkdirSync(join(root, id));
    const summaries = ids.map(summary), catalog: RunCatalog = () => summaries;
    const active = ids.map(id => join(root, id, "events.jsonl"));
    const stale = ids.map(id => join(root, `stale-${id}`, "events.jsonl"));
    const foreign = join(dirname(root), "other-runs", "foreign", "events.jsonl");
    const decisions = new Map<string, boolean>(), exists = vi.spyOn(fs, "existsSync");

    await snapshot(root, catalog, loaderFor([...active, ...stale, foreign], decisions));

    const resolutionCandidates = new Set(ids.flatMap(id => [join(root, id), join(root, "human", id)]));
    const resolutionChecks = exists.mock.calls.filter(([path]) => resolutionCandidates.has(String(path))).length;
    expect(resolutionChecks).toBe(ids.length * 3);
    expect(active.every(path => decisions.get(path) === true)).toBe(true);
    expect(stale.every(path => decisions.get(path) === false)).toBe(true);
    expect(decisions.get(foreign)).toBe(true);
  });

  it("does no catalog path resolution when the loader has no retained entries", async () => {
    const root = runsRoot(), ids = ["run-a", "run-b"];
    for (const id of ids) fs.mkdirSync(join(root, id));
    const resolutionCandidates = new Set(ids.flatMap(id => [join(root, id), join(root, "human", id)]));
    const exists = vi.spyOn(fs, "existsSync");

    await snapshot(root, () => ids.map(summary), loaderFor([], new Map()));

    expect(exists.mock.calls.filter(([path]) => resolutionCandidates.has(String(path)))).toHaveLength(0);
  });

  it("retains the old short circuit when a later catalog path cannot be resolved", async () => {
    const root = runsRoot(), first = "first", racy = "racy";
    fs.mkdirSync(join(root, first));
    // A run becoming ambiguous is a deterministic stand-in for a path-resolution race.
    fs.mkdirSync(join(root, racy));
    fs.mkdirSync(join(root, "human", racy), { recursive: true });
    const firstPath = join(root, first, "events.jsonl"), decisions = new Map<string, boolean>();

    await expect(snapshot(root, () => [summary(first), summary(racy)], loaderFor([firstPath], decisions))).resolves.toBeUndefined();

    expect(decisions.get(firstPath)).toBe(true);
  });
});
