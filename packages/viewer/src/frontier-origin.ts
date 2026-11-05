import { join } from "node:path";
import { FRONTIER_MILESTONES } from "./frontier.js";
import type { RunOrigin, WorkbenchRun } from "./workbench-data.js";
// Places a run that loaded an arbitrary save on the frontier's story axis, from the save's provenance.
export interface SaveStart { readonly path: string; readonly sha1: string; readonly restoration: { readonly source_run: string; readonly source_turn: number } | null }
export interface SaveProvenance { readonly run: string; readonly turn: number | null }
const ORDER: readonly string[] = FRONTIER_MILESTONES.map(m => m.id);
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const name = (v: unknown): string | null => typeof v === "string" && v !== "" ? v : null;
const turnOf = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
// Sidecars come in three recorded shapes: a manual save (run, turn), a milestone capture (run, milestone_event.turn)
// and a frontier handoff (source_run, source_turn). One that names a different save says nothing about this one.
export function parseSaveSidecar(value: unknown, sha1: string): SaveProvenance | null {
  if (!record(value)) return null;
  const hash = value.sha1 ?? (record(value.state) ? value.state.sha1 : undefined);
  if (hash !== undefined && hash !== sha1) return null;
  const run = name(value.source_run) ?? name(value.run);
  if (run === null) return null;
  return { run, turn: turnOf(value.source_turn) ?? turnOf(value.turn) ?? (record(value.milestone_event) ? turnOf(value.milestone_event.turn) : null) };
}
const RUNS = "/runs/", STATE = ".state";
// A recorded save path is untrusted and may name another checkout: only the part under runs/ is used, against this root.
export function sidecarPath(root: string, statePath: string): string | null {
  const at = statePath.lastIndexOf(RUNS);
  if (at < 0 || !statePath.endsWith(STATE)) return null;
  const inner = statePath.slice(at + RUNS.length, -STATE.length);
  return inner.split("/").some(part => part === "" || part === "." || part === "..") ? null : join(root, `${inner}.json`);
}
export function readSaveProvenance(root: string, save: SaveStart, read: (path: string) => string | null): SaveProvenance | null {
  const path = sidecarPath(root, save.path), text = path === null ? null : read(path);
  if (text === null) return null;
  try { return parseSaveSidecar(JSON.parse(text) as unknown, save.sha1); } catch { return null; }
}
const fileOf = (path: string): string => path.split(/[/\\]/).pop() ?? path;
const later = (a: string | null, b: string | null): string | null => a === null ? b : b === null ? a : ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a;
// Every run in saves gets an origin. milestone is null when the save's place in the story cannot be determined.
export function resolveOrigins(runs: readonly WorkbenchRun[], saves: ReadonlyMap<string, SaveStart>, provenance: (save: SaveStart) => SaveProvenance | null): Map<string, RunOrigin> {
  const byId = new Map(runs.map(run => [run.id, run])), origins = new Map<string, RunOrigin>(), visiting = new Set<string>();
  const reachedBy = (id: string, turn: number): string | null => {
    const source = byId.get(id); if (source === undefined) return null;
    const own = ORDER.includes(source.config?.resume ?? "") ? source.config?.resume ?? null : originOf(id)?.milestone ?? null;
    return source.splits.reduce((best, s) => s.screenshotEvidence === undefined && s.turn <= turn && ORDER.includes(s.name) ? later(best, s.name) : best, own);
  };
  const originOf = (id: string): RunOrigin | null => {
    const done = origins.get(id), save = saves.get(id);
    if (done !== undefined || save === undefined || visiting.has(id)) return done ?? null;
    visiting.add(id);
    const file = fileOf(save.path), named = file.slice(0, -STATE.length), bound = save.restoration;
    const source = provenance(save) ?? (bound === null ? null : { run: bound.source_run, turn: bound.source_turn });
    const milestone = file.endsWith(STATE) && ORDER.includes(named) ? named : source === null || source.turn === null ? null : reachedBy(source.run, source.turn);
    const origin = { milestone, save: file, sourceRun: source?.run ?? null, sourceTurn: source?.turn ?? null };
    visiting.delete(id); origins.set(id, origin);
    return origin;
  };
  for (const id of saves.keys()) originOf(id);
  return origins;
}
