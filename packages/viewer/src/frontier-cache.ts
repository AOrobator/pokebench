import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { frontierPair, pairFrontier, type FrontierPair } from "./frontier.js";
import type { Baseline } from "./panels.js";
import type { WorkbenchRun } from "./workbench-data.js";

// A frontier older than this is still answered, marked stale, while a refresh runs; the page asks again.
export const FRONTIER_FRESH_MS = 5000;
// A cold request waits this long for the first ranking before it answers "loading".
export const FRONTIER_WAIT_MS = 1500;
const VERSION = 1;

// "loading" is never "no frontier": nothing has been ranked yet, so the page must ask again.
export type FrontierAnswer =
  | { readonly state: "ready" | "stale"; readonly frontier: Baseline | null }
  | { readonly state: "loading"; readonly frontier: null };

export interface FrontierCacheOptions {
  // Every recorded run, fully loaded: a partial snapshot would rank too few runs.
  readonly read: () => Promise<readonly WorkbenchRun[]>;
  readonly now: () => number;
  // Where the ranking persists across viewer restarts (absent: memory only).
  readonly file?: string | null;
  readonly waitMs?: number;
}

export interface FrontierCache {
  answer(current: string, resumed: boolean): Promise<FrontierAnswer>;
  // Starts a ranking without waiting for it; the first one replaces whatever the disk had.
  warm(): void;
}

const milestonesOf = (value: unknown): Baseline["milestones"] | null => Array.isArray(value) && value.every((m: unknown) => typeof m === "object" && m !== null && typeof (m as { name?: unknown }).name === "string" && typeof (m as { offsetMs?: unknown }).offsetMs === "number" && [undefined, true].includes((m as { derived?: unknown }).derived as undefined)) ? value as Baseline["milestones"] : null;
function baselineOf(value: unknown): Baseline | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const record = value as { run?: unknown; milestones?: unknown }, milestones = milestonesOf(record.milestones);
  return typeof record.run === "string" && milestones !== null ? { run: record.run, milestones } : undefined;
}

// An unreadable, foreign or malformed file is a miss: the viewer then answers "loading" until it has ranked the runs.
export function readFrontierFile(path: string): FrontierPair | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown; best?: unknown; runnerUp?: unknown };
    if (value.version !== VERSION) return null;
    const best = baselineOf(value.best), runnerUp = baselineOf(value.runnerUp);
    if (best === undefined || runnerUp === undefined || (best === null && runnerUp !== null) || (best !== null && best.run === runnerUp?.run)) return null;
    return { best, runnerUp };
  } catch {
    return null;
  }
}

function writeFrontierFile(path: string, pair: FrontierPair): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${String(process.pid)}.tmp`;
    writeFileSync(temp, JSON.stringify({ version: VERSION, ...pair }));
    renameSync(temp, path);
  } catch { /* the cache is an optimization: an unwritable file only costs the next restart its head start */ }
}

const samePair = (a: FrontierPair | null, b: FrontierPair): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

export function createFrontierCache(options: FrontierCacheOptions): FrontierCache {
  const file = options.file ?? null, waitMs = options.waitMs ?? FRONTIER_WAIT_MS;
  // A ranking from disk answers at once but stays stale until this viewer ranks the runs itself.
  let pair: FrontierPair | null = file === null ? null : readFrontierFile(file);
  let rankedAt: number | null = null;
  let refreshing: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    refreshing ??= options.read().then(runs => {
      const next = frontierPair(runs);
      if (file !== null && !samePair(pair, next)) writeFrontierFile(file, next);
      pair = next; rankedAt = options.now();
    }).finally(() => { refreshing = null; });
    return refreshing;
  };
  const fresh = (): boolean => rankedAt !== null && options.now() - rankedAt < FRONTIER_FRESH_MS;
  return {
    warm: () => { refresh().catch(() => undefined); },
    answer: async (current, resumed) => {
      if (!fresh()) {
        const pending = refresh();
        pending.catch(() => undefined);
        // Only a viewer with nothing to show waits, and only briefly: a cold catalog can take minutes to rank.
        if (pair === null) await Promise.race([pending.catch(() => undefined), new Promise(resolve => setTimeout(resolve, waitMs).unref())]);
      }
      if (pair === null) return { state: "loading", frontier: null };
      return { state: fresh() ? "ready" : "stale", frontier: pairFrontier(pair, current, resumed) };
    },
  };
}
