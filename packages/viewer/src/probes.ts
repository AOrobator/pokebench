// Decision probes the viewer lists and shows (/probes). A probe is a folder holding manifest.json and one folder per
// lane with samples.jsonl, status.json and provenance.json: the layout the cited-destination runner writes. It is
// listed from runs/probes/ as a real folder runs/probes/<id>/, or as a pointer file runs/probes/<id>.json naming a
// folder elsewhere under runs/. Only those fixed file names are read, and only inside runs/.
import { createReadStream, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";
import { createInterface } from "node:readline";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";

export class ProbeError extends Error {}

export type Split = "development" | "heldout";
export type LaneState = "running" | "complete" | "stopped" | "unknown";

export interface ProbeLaneSummary { readonly id: string; readonly state: LaneState; readonly completed: number; readonly planned: number }
export interface ProbeSummary {
  readonly id: string;
  readonly title: string;
  readonly feature: string;
  readonly started: string | null;
  readonly live: boolean;
  readonly lanes: readonly ProbeLaneSummary[];
}
export interface RecordedCall { readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
export interface ProbeCase {
  readonly id: string;
  readonly run: string;
  readonly turn: number;
  readonly split: Split;
  readonly title: string;
  readonly at: string | null;
  readonly recorded: RecordedCall | null;
  readonly frame: string | null;
}
export interface ProbeLane extends ProbeLaneSummary {
  readonly model: string | null;
  readonly started: string | null;
  readonly ended: string | null;
  readonly current: string | null;
  readonly ceilingMs: number | null;
}
export interface ProbeSample {
  readonly lane: string;
  readonly case: string;
  readonly arm: string;
  readonly sample: number;
  readonly at: string;
  readonly elapsedMs: number;
  readonly key: string;
  readonly thinking: string;
}
export interface ProbeDetail {
  readonly id: string;
  readonly title: string;
  readonly feature: string;
  readonly tier: string | null;
  readonly arms: readonly string[];
  readonly cases: readonly ProbeCase[];
  readonly lanes: readonly ProbeLane[];
  readonly samples: readonly ProbeSample[];
  readonly problems: readonly string[];
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const RUN_ID = new RegExp(RUN_ID_PATTERN);
const FRAME = /^(\d{6})_\d+\.png$/;
const STATES: readonly LaneState[] = ["running", "complete", "stopped"];

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")) as unknown; } catch { return undefined; }
}
function isDir(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

interface Manifest { readonly id: string; readonly feature: string; readonly tier: string | null; readonly arms: readonly string[] | null; readonly ceilingMs: number | null; readonly cases: readonly { id: string; run: string; turn: number; split: Split; title: string }[] }
function manifest(dir: string): Manifest | null {
  const v = readJson(join(dir, "manifest.json"));
  if (!record(v) || str(v.id) === null || !Array.isArray(v.cases) || v.cases.length === 0) return null;
  const cases: { id: string; run: string; turn: number; split: Split; title: string }[] = [];
  for (const c of v.cases as unknown[]) {
    if (!record(c)) return null;
    const id = str(c.id), run = str(c.run), turn = c.turn, split = c.split;
    if (id === null || run === null || typeof turn !== "number" || !Number.isInteger(turn) || turn < 0 || (split !== "development" && split !== "heldout")) return null;
    cases.push({ id, run, turn, split, title: str(c.category) ?? str(c.title) ?? id });
  }
  const arms = Array.isArray(v.arms) && v.arms.every((a) => typeof a === "string" && ID.test(a)) ? (v.arms as string[]) : null;
  const ceiling = typeof v.maxWallMsPerLane === "number" && v.maxWallMsPerLane > 0 ? v.maxWallMsPerLane : null;
  return { id: v.id as string, feature: str(v.changedFeature) ?? str(v.feature) ?? (v.id as string), tier: str(v.tier), arms, ceilingMs: ceiling, cases };
}

interface Entry { readonly id: string; readonly dir: string; readonly title: string | null }
// The probes runs/probes/ names: real folders (never symlinks) and pointer files whose folder's real path stays under runs/.
function entries(runsRoot: string): Entry[] {
  const base = join(runsRoot, "probes");
  if (!isDir(base)) return [];
  let realRoot: string;
  try { realRoot = realpathSync(runsRoot); } catch { return []; }
  const found: Entry[] = [];
  for (const name of readdirSync(base)) {
    const path = join(base, name);
    let stat;
    try { stat = lstatSync(path); } catch { continue; }
    if (stat.isDirectory() && ID.test(name)) { found.push({ id: name, dir: path, title: null }); continue; }
    if (!stat.isFile() || !name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length), v = readJson(path);
    if (!ID.test(id) || !record(v) || v.version !== 1) continue;
    const rel = str(v.dir);
    if (rel === null || isAbsolute(rel) || rel.split(/[\\/]/).some((p) => p === ".." || p === "")) continue;
    let real: string;
    try { real = realpathSync(join(runsRoot, rel)); } catch { continue; }
    if (!real.startsWith(realRoot + sep) || !isDir(real)) continue;
    found.push({ id, dir: real, title: str(v.title) });
  }
  return found;
}

// Only real lane folders: a lane that is a link could point outside runs/.
function laneIds(dir: string): string[] {
  return readdirSync(dir).filter((name) => {
    try { return ID.test(name) && lstatSync(join(dir, name)).isDirectory(); } catch { return false; }
  }).sort();
}
function lane(dir: string, id: string, ceilingMs: number | null): ProbeLane {
  const s = readJson(join(dir, id, "status.json")), p = readJson(join(dir, id, "provenance.json"));
  const status = record(s) ? s : {};
  const state = STATES.find((x) => x === status.state) ?? "unknown";
  const model = record(p) && record(p.model) ? str(p.model.id) : null;
  return { id, model, state, completed: count(status.completed), planned: count(status.planned), started: str(status.started), ended: str(status.ended), current: state === "running" ? str(status.case) : null, ceilingMs };
}

function find(runsRoot: string, id: string): { entry: Entry; m: Manifest } {
  if (!ID.test(id)) throw new ProbeError(`not a probe id: ${JSON.stringify(id)}`);
  const entry = entries(runsRoot).find((e) => e.id === id);
  const m = entry === undefined ? null : manifest(entry.dir);
  if (entry === undefined || m === null) throw new ProbeError(`no probe ${id}`);
  return { entry, m };
}

export function listProbes(runsRoot: string): ProbeSummary[] {
  const out: ProbeSummary[] = [];
  for (const entry of entries(runsRoot)) {
    const m = manifest(entry.dir);
    if (m === null) continue;
    const lanes = laneIds(entry.dir).map((l) => lane(entry.dir, l, m.ceilingMs));
    const starts = lanes.map((l) => l.started).filter((t): t is string => t !== null).sort();
    out.push({ id: entry.id, title: entry.title ?? m.feature, feature: m.feature, started: starts[0] ?? null, live: lanes.some((l) => l.state === "running"),
      lanes: lanes.map(({ id, state, completed, planned }) => ({ id, state, completed, planned })) });
  }
  return out.sort((a, b) => (b.started ?? "").localeCompare(a.started ?? ""));
}

function samples(dir: string, laneId: string, problems: string[]): ProbeSample[] {
  const path = join(dir, laneId, "samples.jsonl");
  if (!isFile(path)) return [];
  const out: ProbeSample[] = [];
  readFileSync(path, "utf8").split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    let v: unknown;
    try { v = JSON.parse(line); } catch { problems.push(`${laneId}/samples.jsonl line ${String(i + 1)} is not JSON`); return; }
    const d = record(v) && record(v.decision) ? v.decision : null;
    if (!record(v) || d === null || str(v.case) === null || str(v.arm) === null || !Number.isInteger(v.sample) || (v.sample as number) < 0 || str(v.at) === null || typeof d.key !== "string") {
      problems.push(`${laneId}/samples.jsonl line ${String(i + 1)} is not a sample`);
      return;
    }
    out.push({ lane: laneId, case: v.case as string, arm: v.arm as string, sample: v.sample as number, at: v.at as string, elapsedMs: count(v.elapsedMs), key: d.key, thinking: typeof d.thinking === "string" ? d.thinking : "" });
  });
  return out;
}

interface TurnFacts { readonly at: string | null; readonly recorded: RecordedCall | null; readonly startSeq: number | null }
const turnCache = new Map<string, TurnFacts>();
// The turn's start and its first tool call, streamed from the source run's log (logs reach hundreds of MB).
async function turnFacts(path: string, turn: number): Promise<TurnFacts> {
  // A turn that has its call never changes; one still missing is looked for again once the log grows.
  const found = turnCache.get(`${path}\0${String(turn)}`);
  if (found !== undefined) return found;
  const key = `${path}\0${String(turn)}\0${String(statSync(path).size)}`;
  const cached = turnCache.get(key);
  if (cached !== undefined) return cached;
  let at: string | null = null, startSeq: number | null = null, recorded: RecordedCall | null = null;
  const input = createReadStream(path), lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.includes('"turn_start"') && !line.includes('"tool_call"')) continue;
      let e: unknown;
      try { e = JSON.parse(line); } catch { continue; }
      if (!record(e)) continue;
      if (e.type === "turn_start") {
        if (startSeq !== null) break;
        if (e.turn === turn) { startSeq = typeof e.seq === "number" ? e.seq : -1; at = str(e.t); }
      } else if (e.type === "tool_call" && startSeq !== null && typeof e.name === "string") {
        recorded = { tool: e.name, args: record(e.args) ? e.args : {} };
        break;
      }
    }
  } finally {
    // Stopping early leaves the file open unless the stream itself is destroyed.
    lines.close();
    input.destroy();
  }
  const facts = { at, recorded, startSeq };
  turnCache.set(recorded === null ? key : `${path}\0${String(turn)}`, facts);
  return facts;
}
function frameAt(runDir: string, seq: number | null): string | null {
  if (seq === null || !isDir(join(runDir, "frames"))) return null;
  let best: string | null = null, bestSeq = -1;
  for (const name of readdirSync(join(runDir, "frames"))) {
    const m = FRAME.exec(name), s = m === null ? -1 : Number(m[1]);
    if (m !== null && s <= seq && s > bestSeq) { best = name; bestSeq = s; }
  }
  return best;
}

export async function readProbe(runsRoot: string, id: string): Promise<ProbeDetail> {
  const { entry, m } = find(runsRoot, id);
  const problems: string[] = [];
  const lanes = laneIds(entry.dir).map((l) => lane(entry.dir, l, m.ceilingMs));
  const all = lanes.flatMap((l) => samples(entry.dir, l.id, problems));
  const cases: ProbeCase[] = [];
  for (const c of m.cases) {
    const base = { id: c.id, run: c.run, turn: c.turn, split: c.split, title: c.title };
    if (!RUN_ID.test(c.run)) { problems.push(`case ${c.id}: not a run id: ${JSON.stringify(c.run)}`); cases.push({ ...base, at: null, recorded: null, frame: null }); continue; }
    const log = join(runsRoot, c.run, "events.jsonl");
    if (!isFile(log)) { problems.push(`case ${c.id}: source run ${c.run} has no events.jsonl`); cases.push({ ...base, at: null, recorded: null, frame: null }); continue; }
    const facts = await turnFacts(log, c.turn);
    cases.push({ ...base, at: facts.at, recorded: facts.recorded, frame: frameAt(join(runsRoot, c.run), facts.startSeq) });
  }
  const arms = m.arms ?? [...new Set(["on", "off", ...all.map((s) => s.arm)])];
  return { id, title: entry.title ?? m.feature, feature: m.feature, tier: m.tier, arms, cases, lanes, samples: all, problems };
}
