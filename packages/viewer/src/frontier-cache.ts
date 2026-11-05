import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { frontierPair, pairFrontier, saveFrontiers, type FrontierPair } from "./frontier.js";
import type { Baseline } from "./panels.js";
import type { WorkbenchRun } from "./workbench-data.js";

// A frontier older than this is still answered, marked stale, while a refresh runs; the page asks again.
// Longer than the page's 5 s card poll, so the poll after a refresh finds it fresh.
export const FRONTIER_FRESH_MS = 10_000;
// A request waits this long for a running ranking before it answers "loading" or "stale".
export const FRONTIER_WAIT_MS = 1500;
const VERSION = 1;

// "loading" is never "no frontier": nothing has been ranked yet, so the page must ask again.
export type FrontierAnswer =
  | { readonly state: "ready" | "stale"; readonly frontier: Baseline | null; readonly save?: true }
  | { readonly state: "loading"; readonly frontier: null };

export interface FrontierCacheOptions {
  // Every recorded run, fully loaded: a partial snapshot would rank too few runs.
  readonly read: () => Promise<readonly WorkbenchRun[]>;
  readonly now: () => number;
  // Where the ranking persists across viewer restarts (absent: memory only).
  readonly file?: string | null;
  readonly waitMs?: number;
  readonly onError?: (error: unknown) => void;
}

export interface FrontierCache {
  // fromSave: the run started anywhere but New Game, so its race is the save frontier and never the New Game one.
  answer(current: string, fromSave: boolean): Promise<FrontierAnswer>;
  // Starts a ranking without waiting for it; the first one replaces whatever the disk had.
  warm(): void;
}

// Only what a ranking can produce: named splits at finite, nonnegative times.
const milestoneOf = (m: unknown): boolean => {
  if (typeof m !== "object" || m === null) return false;
  const { name, offsetMs, derived } = m as { name?: unknown; offsetMs?: unknown; derived?: unknown };
  return typeof name === "string" && name !== "" && typeof offsetMs === "number" && Number.isFinite(offsetMs) && offsetMs >= 0 && (derived === undefined || derived === true);
};
const milestonesOf = (value: unknown): Baseline["milestones"] | null => Array.isArray(value) && value.every(milestoneOf) ? value as Baseline["milestones"] : null;
function baselineOf(value: unknown): Baseline | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const record = value as { run?: unknown; milestones?: unknown }, milestones = milestonesOf(record.milestones);
  return typeof record.run === "string" && record.run !== "" && milestones !== null ? { run: record.run, milestones } : undefined;
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
  let saves: ReadonlyMap<string, Baseline | null> = new Map();
  let rankedAt: number | null = null;
  let refreshing: Promise<void> | null = null;
  // One ranking at a time; a failed one keeps the previous ranking and is reported once, not per waiting request.
  const refresh = (): Promise<void> => {
    refreshing ??= options.read().then(runs => {
      const next = frontierPair(runs);
      if (file !== null && !samePair(pair, next)) writeFrontierFile(file, next);
      pair = next; saves = saveFrontiers(runs); rankedAt = options.now();
    }).catch((error: unknown) => { options.onError?.(error); }).finally(() => { refreshing = null; });
    return refreshing;
  };
  const fresh = (): boolean => rankedAt !== null && options.now() - rankedAt < FRONTIER_FRESH_MS;
  return {
    warm: () => { void refresh(); },
    answer: async (current, fromSave) => {
      if (!fresh()) {
        const pending = refresh();
        // Wait only briefly: a cold catalog can take minutes to rank.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([pending, new Promise(resolve => { timer = setTimeout(resolve, waitMs); })]);
        clearTimeout(timer);
      }
      const state = fresh() ? "ready" : "stale", race = saves.get(current);
      // A save run this ranking has not seen is still unanswered, not unraced.
      if (fromSave) return race === undefined ? { state: "loading", frontier: null } : { state, frontier: race, save: true };
      if (pair === null) return { state: "loading", frontier: null };
      return { state, frontier: pairFrontier(pair, current, false) };
    },
  };
}
