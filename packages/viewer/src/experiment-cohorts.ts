import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { WorkbenchCohort } from "./workbench-data.js";
// Historical result provenance. A run whose run_start carries evaluation.experiment names its own
// cohort: one entry per experiment and build (harness.commit). Labels come from the experiment's
// definition (experiments/fixed/<id>.json, experiments/<id>.json, or a launch-receipt manifest).
const MAX_BYTES = 1024 * 1024;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v !== "";
export interface Definition { readonly id: string; readonly title: string }
export type Definitions = ReadonlyMap<string, Definition>;
export interface TaggedRun { readonly run: string; readonly experiment: string; readonly commit: string; readonly started: string | null }
interface Resolved { readonly experiment: string; readonly title: string; readonly known: boolean; readonly dryRun: boolean }
function json(path: string): unknown {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && stat.size <= MAX_BYTES ? JSON.parse(readFileSync(path, "utf8")) as unknown : null;
  } catch { return null; }
}
function entries(dir: string, directories: boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter(e => (directories ? e.isDirectory() : e.isFile() && e.name.endsWith(".json"))).map(e => e.name).sort();
}
// Fixed definitions first, then legacy definitions, then hand-run manifests by id, then by label
// (hand drivers tag runs with the manifest label). The first definition of a key wins.
export function experimentDefinitions(experimentsDir: string, runsRoot: string): Definitions {
  const found = new Map<string, Definition>(), add = (key: string, d: Definition): void => { if (!found.has(key)) found.set(key, d); };
  for (const dir of [join(experimentsDir, "fixed"), join(experimentsDir,"archive/fixed"), experimentsDir]) {
    for (const name of entries(dir, false)) {
      const v = json(join(dir, name));
      if (record(v) && text(v.id)) add(v.id, { id: v.id, title: text(v.title) ? v.title : v.id });
    }
  }
  const receipts = join(runsRoot, "launch-receipts"), manifests: { id: string; label: string | null }[] = [];
  for (const name of entries(receipts, true)) {
    const v = json(join(receipts, name, "manifest.json"));
    if (record(v) && text(v.id)) manifests.push({ id: v.id, label: text(v.label) ? v.label : null });
  }
  for (const m of manifests) add(m.id, { id: m.id, title: m.label ?? m.id });
  for (const m of manifests) if (m.label !== null) add(m.label, { id: m.id, title: m.label });
  return found;
}
const DRY_RUN = /^(.+)-dryrun(?:-(.+))?$/;
// `fixed-run rerun`: <id>-solo-<arm>-<lane>-<n>, one unpaired exploratory trial.
const SOLO = /^(.+)-solo-(control|bundle)-([a-z])-([1-9][0-9]*)$/;
// A dry run keeps its own id, so it never merges with the measured experiment it rehearses.
function resolve(id: string, definitions: Definitions): Resolved {
  const direct = definitions.get(id);
  if (direct !== undefined) return { experiment: direct.id, title: direct.title, known: true, dryRun: false };
  const solo = SOLO.exec(id), parent = solo === null ? undefined : definitions.get(solo[1] ?? "");
  if (solo !== null && parent !== undefined) return { experiment: id, title: `${parent.title} (exploratory: ${solo[2] ?? ""} only, lane ${(solo[3] ?? "").toUpperCase()}, #${solo[4] ?? ""})`, known: true, dryRun: false };
  const dry = DRY_RUN.exec(id), base = dry === null ? undefined : definitions.get(dry[1] ?? "");
  if (dry === null) return { experiment: id, title: id, known: false, dryRun: false };
  if (base === undefined) return { experiment: id, title: id, known: false, dryRun: true };
  return { experiment: id, title: `${base.title} (dry run${dry[2] === undefined ? "" : `, ${dry[2]}`})`, known: true, dryRun: true };
}
const NEW_YORK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function newYork(ms: number): string { return Number.isFinite(ms) ? `${NEW_YORK.format(ms).replace(/\s/g, " ")} ET` : "unknown"; }
export function taggedValue(experiment: string, commit: string): string { return `experiment:${experiment}@${commit.slice(0, 12)}`; }
export function taggedCohorts(runs: readonly TaggedRun[], definitions: Definitions): { membership: Map<string, string>; cohorts: WorkbenchCohort[] } {
  const membership = new Map<string, string>(), groups = new Map<string, { resolved: Resolved; commit: string; first: number }>(), builds = new Map<string, Set<string>>();
  for (const run of runs) {
    const resolved = resolve(run.experiment, definitions), value = taggedValue(resolved.experiment, run.commit), at = Date.parse(run.started ?? "");
    membership.set(run.run, value);
    const group = groups.get(value);
    if (group === undefined) groups.set(value, { resolved, commit: run.commit, first: at });
    else if (at < group.first || Number.isNaN(group.first)) group.first = at;
    const commits = builds.get(resolved.experiment) ?? new Set<string>(); commits.add(run.commit); builds.set(resolved.experiment, commits);
  }
  const cohorts = [...groups].sort(([a, x], [b, y]) => (Number.isNaN(x.first) ? Infinity : x.first) - (Number.isNaN(y.first) ? Infinity : y.first) || a.localeCompare(b)).map(([id, g]): WorkbenchCohort => {
    const several = (builds.get(g.resolved.experiment)?.size ?? 1) > 1;
    return { id, label: several ? `${g.resolved.title} · build ${g.commit.slice(0, 7)}, first trial ${newYork(g.first)}` : g.resolved.title, experiment: g.resolved.experiment, build: g.commit, dryRun: g.resolved.dryRun };
  });
  return { membership, cohorts };
}
// A cohort named by a legacy ledger or receipt: experiment:<id>, experiment:<id>:finals or a receipt id.
export function legacyCohort(value: string, definitions: Definitions): WorkbenchCohort {
  const rest = value.startsWith("experiment:") ? value.slice("experiment:".length) : value, finals = rest.endsWith(":finals");
  const resolved = resolve(finals ? rest.slice(0, -":finals".length) : rest, definitions);
  if (!resolved.known) return { id: value, label: value, experiment: null, build: null, dryRun: false };
  return { id: value, label: finals ? `${resolved.title} — finals` : resolved.title, experiment: resolved.experiment, build: null, dryRun: resolved.dryRun };
}
// Earlier entries keep their label; a later entry whose label is taken is told apart by its value
// (and a counter if even that is taken), so every final label is unique.
export function distinctLabels(cohorts: readonly WorkbenchCohort[]): WorkbenchCohort[] {
  const taken = new Set<string>();
  return cohorts.map(c => {
    let label = c.label;
    for (let n = 1; taken.has(label); n++) label = n === 1 ? `${c.label} (${c.id})` : `${c.label} (${c.id}, ${String(n)})`;
    taken.add(label); return { ...c, label };
  });
}
