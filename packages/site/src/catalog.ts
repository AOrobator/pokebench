import { InputError, type RunInfo } from "./input.js";
import type { Entry } from "./standings.js";

export interface SeriesRuns {
  readonly entry: Entry;
  readonly first: RunInfo;
  readonly all: readonly RunInfo[];
}

export interface Catalog {
  readonly byId: ReadonlyMap<string, RunInfo>;
  // Keyed by chart label, in standings order.
  readonly bySeries: ReadonlyMap<string, SeriesRuns>;
  // The series each run belongs to, keyed by run id.
  readonly entryOf: ReadonlyMap<string, Entry>;
}

// Joins each plotted run to its runs.json entry: every run of every chart series has exactly one entry,
// and every entry belongs to exactly one series.
export function catalog(entries: readonly Entry[], runs: readonly RunInfo[]): Catalog {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const entryOf = new Map<string, Entry>();
  const bySeries = new Map<string, SeriesRuns>();
  for (const e of entries) {
    const all = e.runs.map((id) => {
      if (entryOf.has(id)) throw new InputError(`run "${id}" is plotted by more than one series`);
      entryOf.set(id, e);
      const r = byId.get(id);
      if (r === undefined) throw new InputError(`runs.json has no entry for run "${id}" of "${e.chartLabel}"`);
      return r;
    });
    const [first] = all;
    if (first === undefined) throw new InputError(`"${e.chartLabel}" plots no runs`);
    bySeries.set(e.chartLabel, { entry: e, first, all });
  }
  for (const r of runs) if (!entryOf.has(r.id)) throw new InputError(`runs.json run "${r.id}" is not plotted by any series`);
  return { byId, bySeries, entryOf };
}

export function runIndex(entries: readonly Entry[], runs: readonly RunInfo[]): ReadonlyMap<string, RunInfo> {
  return catalog(entries, runs).byId;
}
