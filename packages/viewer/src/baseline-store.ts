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

export interface BaselineStore {
  get(runId: string, fingerprint: string): BaselineOutcome | null;
  put(runId: string, fingerprint: string, outcome: BaselineOutcome): void;
}

const RUN_ID = new RegExp(RUN_ID_PATTERN);
const CODE_ID = /^[0-9a-f]{64}$/;
const PRUNE_AFTER_MS = 7 * 86_400_000;
const EntrySchema = Type.Object({ fingerprint: Type.String(), outcome: Type.Unknown() }, { additionalProperties: false });

export function baselineCacheDir(runsRoot: string, codeId: string): string {
  if (!CODE_ID.test(codeId)) throw new RangeError(`not a code identity: ${codeId}`);
  return join(runsRoot, ".viewer-cache", "baselines", codeId);
}

// The cache is an optimization: an unreadable or unwritable entry is a miss, never an error.
export function createBaselineStore(dir: string): BaselineStore {
  try {
    mkdirSync(dir, { recursive: true });
    const now = new Date();
    utimesSync(dir, now, now);
  } catch { /* unwritable: every put misses */ }
  const pathOf = (runId: string): string | null => (RUN_ID.test(runId) ? join(dir, `${runId}.json`) : null);
  return {
    get: (runId, fingerprint) => {
      const path = pathOf(runId);
      if (path === null) return null;
      let value: unknown;
      try {
        value = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return null;
      }
      if (!Value.Check(EntrySchema, value) || value.fingerprint !== fingerprint) return null;
      const outcome = parseBaselineOutcome(value.outcome);
      return outcome === null || ("baseline" in outcome && outcome.baseline.run !== runId) ? null : outcome;
    },
    put: (runId, fingerprint, outcome) => {
      const path = pathOf(runId);
      if (path === null) return;
      const temp = `${path}.${String(process.pid)}.${String(Date.now())}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify({ fingerprint, outcome }));
        renameSync(temp, path);
      } catch {
        try { rmSync(temp, { force: true }); } catch { /* the directory itself is unusable */ }
      }
    },
  };
}

// Caches of other code that no viewer has opened for a week; the current one always stays.
export function pruneBaselineCaches(runsRoot: string, keep: string, nowMs: number): void {
  const parent = dirname(baselineCacheDir(runsRoot, keep));
  let names: string[];
  try {
    names = readdirSync(parent);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === keep || !CODE_ID.test(name)) continue;
    const path = join(parent, name);
    if (nowMs - statSync(path).mtimeMs > PRUNE_AFTER_MS) rmSync(path, { recursive: true, force: true });
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
