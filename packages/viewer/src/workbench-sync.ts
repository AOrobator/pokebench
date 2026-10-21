import { parseWorkbench, type WorkbenchData, type WorkbenchRun } from "./workbench-data.js";

export interface WorkbenchUpdate extends WorkbenchData {
  readonly revision: string;
  readonly base: string | null;
  readonly removed: string[];
  readonly order: string[];
}
interface Row { readonly json: string; readonly run: WorkbenchRun }
interface Revision { readonly id: string; readonly rows: ReadonlyMap<string, Row> }
// Share unchanged rows between a bounded set of revisions; a suspended client gets a full resync.
export function createWorkbenchUpdates(epoch: string): (data: WorkbenchData, since: string | null) => WorkbenchUpdate {
  const history: Revision[] = [];
  let prior: WorkbenchData | null = null, sequence = 0;
  return (data, since) => {
    if (data !== prior) {
      const was = history.at(-1)?.rows, rows = new Map(data.runs.map(run => {
        const json = JSON.stringify(run), old = was?.get(run.id);
        return [run.id, old?.json === json ? old : { json, run }];
      }));
      history.push({ id: `${epoch}:${String(++sequence)}`, rows });
      if (history.length > 8) history.shift();
      prior = data;
    }
    const current = history.at(-1);
    if (current === undefined) throw new Error("Missing workbench revision");
    const base = history.find(r => r.id === since);
    return {
      ...data, revision: current.id, base: base?.id ?? null,
      runs: [...current.rows].flatMap(([id, row]) => base?.rows.get(id) === row ? [] : [row.run]),
      removed: base === undefined ? [] : [...base.rows.keys()].filter(id => !current.rows.has(id)),
      order: [...current.rows.keys()],
    };
  };
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === "string") && new Set(value).size === value.length;
// Validate the complete update before advancing the cursor or replacing any verified records.
export function createWorkbenchClient(fetchJson: (url: string) => Promise<unknown>): () => Promise<WorkbenchData> {
  let revision: string | null = null, data: WorkbenchData | null = null;
  return async () => {
    const value = await fetchJson(`/api/workbench?updates=1${revision === null ? "" : `&since=${encodeURIComponent(revision)}`}`);
    try {
      if (!object(value) || typeof value.revision !== "string" || value.revision === "" || !(value.base === null || typeof value.base === "string") || !strings(value.removed) || !strings(value.order)) throw new Error("Invalid workbench update");
      if (value.base !== null && (revision === null || value.base !== revision)) throw new Error("Workbench revision mismatch");
      const patch = parseWorkbench(value);
      if (patch.at < (data?.at ?? 0)) throw new Error("Outdated workbench update");
      const rows = new Map(value.base === null ? [] : data?.runs.map(run => [run.id, run]));
      const changed = new Set(patch.runs.map(run => run.id));
      if (changed.size !== patch.runs.length || value.removed.some(id => changed.has(id) || !rows.has(id))) throw new Error("Conflicting workbench update");
      for (const id of value.removed) rows.delete(id);
      for (const run of patch.runs) rows.set(run.id, run);
      if (value.order.length !== rows.size || value.order.some(id => !rows.has(id))) throw new Error("Incomplete workbench update");
      const runs = value.order.map(id => rows.get(id)).filter((run): run is WorkbenchRun => run !== undefined);
      const next: WorkbenchData = { version: 1, at: patch.at, milestones: patch.milestones, problems: patch.problems, runs, ...(patch.cohorts === undefined ? {} : { cohorts: patch.cohorts }) };
      revision = value.revision; data = next; return next;
    } catch (error) { revision = null; throw error; }
  };
}
