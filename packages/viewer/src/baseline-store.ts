// Validated baselines on disk, so a restarted viewer reuses them instead of re-reading
// every finished run log. An entry is valid only for the exact log it was computed from
// (its fingerprint) and the exact code that computed it (the directory's code identity).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { parseBaselineOutcome } from "./baseline-pool.js";
import type { BaselineOutcome } from "./runs.js";
import { parseLoadedRun, type LoadedRun } from "./workbench-store.js";

export interface RunStore<T> {
  get(runId: string, fingerprint: string): T | null;
  put(runId: string, fingerprint: string, value: T): void;
}
export type BaselineStore = RunStore<BaselineOutcome>;
export interface SnapshotReader<T> {
  get(runId: string, fingerprint: string): T | null;
  latest(runId: string): { fingerprint: string; outcome: T } | null;
}

export interface SnapshotStore<T> extends SnapshotReader<T>, RunStore<T> {}

const RUN_ID = new RegExp(RUN_ID_PATTERN);
const CODE_ID = /^[0-9a-f]{64}$/;
const PRUNE_AFTER_MS = 7 * 86_400_000;
const KINDS = ["baselines", "workbench"] as const;
const EntrySchema = Type.Object({ fingerprint: Type.String(), outcome: Type.Unknown() }, { additionalProperties: false });

function cacheDir(runsRoot: string, kind: (typeof KINDS)[number], codeId: string): string {
  if (!CODE_ID.test(codeId)) throw new RangeError(`not a code identity: ${codeId}`);
  return join(runsRoot, ".viewer-cache", kind, codeId);
}
export function baselineCacheDir(runsRoot: string, codeId: string): string {
  return cacheDir(runsRoot, "baselines", codeId);
}
export function workbenchCacheDir(runsRoot: string, codeId: string): string {
  return cacheDir(runsRoot, "workbench", codeId);
}

// The cache is an optimization: an unreadable or unwritable entry is a miss, never an error.
function createRunStore<T>(dir: string, parse: (value: unknown, runId: string) => T | null, eager = true): SnapshotStore<T> {
  const prepare = (): void => {
    try {
      mkdirSync(dir, { recursive: true });
      const now = new Date();
      utimesSync(dir, now, now);
    } catch { /* unwritable: every put misses */ }
  };
  if (eager) prepare();
  const pathOf = (runId: string): string | null => (RUN_ID.test(runId) ? join(dir, `${runId}.json`) : null);
  const latest = (runId: string): { fingerprint: string; outcome: T } | null => {
    const path = pathOf(runId);
    if (path === null) return null;
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
    if (!Value.Check(EntrySchema, value)) return null;
    const outcome = parse(value.outcome, runId);
    return outcome === null ? null : { fingerprint: value.fingerprint, outcome };
  };
  return {
    latest,
    get: (runId, fingerprint) => { const entry = latest(runId); return entry?.fingerprint === fingerprint ? entry.outcome : null; },
    put: (runId, fingerprint, value) => {
      const path = pathOf(runId);
      if (path === null) return;
      if (!eager) prepare();
      const temp = `${path}.${String(process.pid)}.${String(Date.now())}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify({ fingerprint, outcome: value }));
        renameSync(temp, path);
      } catch {
        try { rmSync(temp, { force: true }); } catch { /* the directory itself is unusable */ }
      }
    },
  };
}

export function createBaselineStore(dir: string): BaselineStore {
  return createRunStore(dir, (value, runId) => {
    const outcome = parseBaselineOutcome(value);
    return outcome === null || ("baseline" in outcome && outcome.baseline.run !== runId) ? null : outcome;
  });
}

export function createWorkbenchStore(dir: string): RunStore<LoadedRun> {
  return createRunStore(dir, (value, runId) => {
    const loaded = parseLoadedRun(value);
    return loaded === null || loaded.run.id !== runId ? null : loaded;
  });
}

// Display snapshots outlive parser builds; they never enter the validated workbench cache.
export function createCardStore(runsRoot: string): SnapshotStore<LoadedRun> {
  return createRunStore(join(runsRoot, ".viewer-cache", "cards-v1"), (value, runId) => {
    const loaded = parseLoadedRun(value);
    if (loaded === null || loaded.run.id !== runId || loaded.run.card == null || loaded.run.status === "invalid") return null;
    const run = { ...loaded.run }; delete run.measurement;
    return { ...loaded, run };
  }, false);
}

export function createCardReader(runsRoot: string): SnapshotReader<LoadedRun> {
  const store = createCardStore(runsRoot);
  return { get: store.get, latest: store.latest };
}

// Caches of other code that no viewer has opened for a week; the current one always stays.
export function pruneBaselineCaches(runsRoot: string, keep: string, nowMs: number): void {
  for (const kind of KINDS) {
    const parent = dirname(cacheDir(runsRoot, kind, keep));
    let names: string[];
    try {
      names = readdirSync(parent);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === keep || !CODE_ID.test(name)) continue;
      const path = join(parent, name);
      try {
        if (nowMs - statSync(path).mtimeMs > PRUNE_AFTER_MS) rmSync(path, { recursive: true, force: true });
      } catch { /* gone, unreadable or busy: pruning must never stop the viewer starting */ }
    }
  }
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

// SHA-256 over the compiled module and everything it imports (relative and @pokebench/*
// files by content, other packages by name), so any change to how a baseline is computed
// names a new cache.
export function codeIdentity(entry: string): string {
  const hash = createHash("sha256");
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    hash.update(`file ${String(seen.size)}\0${text}\0`);
    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? "";
      if (specifier.startsWith("node:")) continue;
      if (specifier.startsWith(".")) visit(resolve(dirname(file), specifier));
      else if (specifier.startsWith("@pokebench/")) visit(createRequire(file).resolve(specifier));
      else hash.update(`package\0${specifier}\0`);
    }
  };
  visit(resolve(entry));
  return hash.digest("hex");
}
