// Read-only access to runs/<id>/events.jsonl (PB7: the viewer's record of truth).
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { RUN_ID_PATTERN, parseEvent, type RunEvent } from "@pokebench/agent/events";
import { locateRunDir } from "@pokebench/agent/run";
import type { Baseline } from "./panels.js";
import { RunView, MILESTONE_ORDER } from "./model.js";
import type { BaselineStore } from "./baseline-store.js";

export class RunsError extends Error {
  override readonly name = "RunsError";
}

export class BaselineError extends Error {
  override readonly name = "BaselineError";
}

const RUN_ID = new RegExp(RUN_ID_PATTERN);
const CHUNK = 64 * 1024;

export interface RunSummary {
  readonly id: string;
  readonly model: string | null;
  readonly started: string | null;
  readonly ended: boolean;
  readonly reason: string | null;
  readonly problem: string | null;
  // The experiment, arm and trial (or preset) the run belongs to, when its header records one.
  readonly experiment?: string;
  readonly cohort?: Cohort;
}

export interface Cohort {
  readonly id: string;
  readonly arm: string;
  readonly trial: number;
  readonly of: number;
}

export type LineResult =
  | { readonly ok: true; readonly event: RunEvent }
  | { readonly ok: false; readonly line: number; readonly problem: string };

export interface ReadResult {
  readonly results: LineResult[];
  readonly offset: number;
  readonly lineNo: number;
}

export function runDir(runsRoot: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new RunsError(`not a run id: ${JSON.stringify(runId)}`);
  try {
    return locateRunDir(runsRoot, runId);
  } catch (error) {
    throw new RunsError(error instanceof Error ? error.message : String(error));
  }
}

export function eventsPath(runsRoot: string, runId: string): string {
  return join(runDir(runsRoot, runId), "events.jsonl");
}

function parseLine(text: string, line: number): LineResult {
  try {
    return { ok: true, event: parseEvent(text) };
  } catch (error) {
    return { ok: false, line, problem: error instanceof Error ? error.message : String(error) };
  }
}

function readBytes(path: string, offset: number, maxBytes: number): Buffer {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return Buffer.alloc(0);
  }
  try {
    const size = fstatSync(fd).size;
    const length = Math.max(0, Math.min(maxBytes, size - offset));
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const n = readSync(fd, buffer, read, length - read, offset + read);
      if (n === 0) break;
      read += n;
    }
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

// Complete lines only: a line the writer is still appending stays unread
// until its newline lands. Splitting on the newline byte keeps multi-byte
// characters whole.
export function readFrom(path: string, offset: number, lineNo: number): ReadResult {
  const bytes = readBytes(path, offset, Number.MAX_SAFE_INTEGER);
  const end = bytes.lastIndexOf(0x0a);
  if (end < 0) return { results: [], offset, lineNo };
  const results: LineResult[] = [];
  let line = lineNo;
  for (const text of bytes.subarray(0, end).toString("utf8").split("\n")) {
    line += 1;
    if (text.trim() !== "") results.push(parseLine(text, line));
  }
  return { results, offset: offset + end + 1, lineNo: line };
}

// Reads a log forward in bounded pieces: each file byte is read once, at most chunkBytes per read
// (more only to finish a line longer than that), and next() parses at most maxLines complete
// lines, keeping the unparsed rest in memory. A line still being written stays unread until its
// newline lands.
export class LogReader {
  private buffer: Buffer = Buffer.alloc(0);
  private pieces: Buffer[] = [];
  private fileEnd = 0;
  private lineNo = 0;

  constructor(private readonly path: string, private readonly chunkBytes: number) {}

  // The parsed lines (blank ones skipped) and how many lines were consumed: 0 means nothing new.
  next(maxLines: number): { readonly results: LineResult[]; readonly lines: number } {
    // Pieces of a line longer than a chunk are kept apart and joined once, when its newline arrives.
    if (this.buffer.indexOf(0x0a) < 0) {
      for (;;) {
        const more = readBytes(this.path, this.fileEnd, this.chunkBytes);
        if (more.length === 0) return { results: [], lines: 0 };
        this.fileEnd += more.length;
        this.pieces.push(more);
        if (more.indexOf(0x0a) >= 0) break;
        if (more.length < this.chunkBytes) return { results: [], lines: 0 };
      }
      this.buffer = Buffer.concat([this.buffer, ...this.pieces]);
      this.pieces = [];
    }
    const results: LineResult[] = [];
    let start = 0, parsed = 0;
    for (let end = this.buffer.indexOf(0x0a); end >= 0 && parsed < maxLines; end = this.buffer.indexOf(0x0a, start)) {
      parsed += 1;
      this.lineNo += 1;
      const text = this.buffer.subarray(start, end).toString("utf8");
      if (text.trim() !== "") results.push(parseLine(text, this.lineNo));
      start = end + 1;
    }
    this.buffer = start >= this.buffer.length ? Buffer.alloc(0) : this.buffer.subarray(start);
    return { results, lines: parsed };
  }
}

function firstLine(path: string): string | null {
  let size = CHUNK;
  for (;;) {
    const bytes = readBytes(path, 0, size);
    const newline = bytes.indexOf(0x0a);
    if (newline >= 0) return bytes.subarray(0, newline).toString("utf8");
    if (bytes.length < size) return null;
    size *= 4;
  }
}

function lastLine(path: string): string | null {
  const start = Math.max(0, sizeOf(path) - CHUNK);
  const text = readBytes(path, start, CHUNK).toString("utf8").replace(/\n+$/, "");
  const cut = text.lastIndexOf("\n");
  return text === "" ? null : text.slice(cut + 1);
}

function sizeOf(path: string): number {
  const fd = openSync(path, "r");
  try {
    return fstatSync(fd).size;
  } finally {
    closeSync(fd);
  }
}

function summarize(runsRoot: string, id: string): RunSummary {
  const path = eventsPath(runsRoot, id);
  const first = firstLine(path);
  const empty = { id, model: null, started: null, ended: false, reason: null };
  if (first === null) return { ...empty, problem: "no run_start yet" };
  const start = parseLine(first, 1);
  if (!start.ok) return { ...empty, problem: start.problem };
  if (start.event.type !== "run_start") return { ...empty, problem: "the first event is not run_start" };
  const last = lastLine(path);
  const end = last === null ? null : parseLine(last, 0);
  const ended = end?.ok === true && end.event.type === "run_end" ? end.event : null;
  const evaluation = start.event.evaluation;
  const experiment = evaluation === undefined ? undefined : evaluation.experiment === undefined ? `preset ${evaluation.preset_id}` : `${evaluation.experiment.id} · ${evaluation.experiment.arm} · ${String(evaluation.experiment.trial)}/${String(evaluation.experiment.of)}`;
  return {
    id,
    model: start.event.controller?.kind === "human" ? `Human · ${start.event.controller.name}` : start.event.model.id,
    started: start.event.t,
    ended: ended !== null,
    reason: ended?.reason ?? null,
    problem: null,
    ...(experiment === undefined ? {} : { experiment }),
    ...(evaluation?.experiment === undefined ? {} : { cohort: { ...evaluation.experiment } }),
  };
}

export function listRuns(runsRoot: string): RunSummary[] {
  const entriesAt = (root: string): string[] => {
    try {
      return readdirSync(root).filter((id) => RUN_ID.test(id) && existsSync(join(root, id, "events.jsonl")));
    } catch {
      return [];
    }
  };
  const entries = new Set([...entriesAt(runsRoot), ...entriesAt(join(runsRoot, "human"))]);
  return [...entries].sort().reverse().map((id) => {
    try {
      return summarize(runsRoot, id);
    } catch (error) {
      if (!(error instanceof RunsError)) throw error;
      return { id, model: null, started: null, ended: false, reason: null, problem: error.message };
    }
  });
}

export function readStart(runsRoot: string, runId: string): RunEvent & { type: "run_start" } {
  const path = eventsPath(runsRoot, runId);
  if (!existsSync(path)) throw new RunsError(`run ${runId} has no events.jsonl`);
  const first = firstLine(path);
  const start = first === null ? null : parseLine(first, 1);
  if (start?.ok !== true || start.event.type !== "run_start") throw new RunsError(`run ${runId} has no readable run_start`);
  return start.event;
}

export function baselineOf(runsRoot: string, runId: string): Baseline {
  const start = readStart(runsRoot, runId);
  if (start.harness_features.includes("probe")) throw new BaselineError("probe sessions cannot be benchmark baselines");
  const startMs = Date.parse(start.t);
  const view = new RunView();
  let expectedSeq = 0;
  let humanEnded = false;
  // A comparison must rest on the baseline run's own, fully valid log (PB1).
  for (const result of readFrom(eventsPath(runsRoot, runId), 0, 0).results) {
    if (!result.ok) throw new BaselineError(`baseline ${runId} line ${String(result.line)}: ${result.problem}`);
    if (result.event.run !== runId) throw new BaselineError(`baseline ${runId} holds an event for run ${result.event.run}`);
    if (result.event.type === "state" && !("started" in result.event)) throw new BaselineError("baseline uses unverified historical vendor state");
    if (start.controller?.kind === "human") {
      if (result.event.seq !== expectedSeq || humanEnded || (expectedSeq > 0 && result.event.type === "run_start")) throw new BaselineError("invalid human event order");
      humanEnded = result.event.type === "run_end";
      expectedSeq += 1;
    }
    view.apply(result.event);
  }
  if (start.controller?.kind === "human") {
    const terminal = summarize(runsRoot, runId);
    if (!humanEnded || !terminal.ended) throw new BaselineError("baseline requires a finished human run");
    if (terminal.reason === "operator_abort") throw new BaselineError("aborted human sessions cannot be benchmark baselines");
  }
  if (view.state === null && !start.harness_features.includes("ram-state-v1")) throw new BaselineError("baseline has no verified RAM-state provenance");
  // Operator pauses are not run time: splits exclude paused time before each milestone.
  const pausedBefore = (ms: number): number => view.control.pauses.reduce((sum, p) => sum + Math.max(0, Math.min(ms, p.endMs ?? ms) - p.startMs), 0);
  return { run: runId, milestones: view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => ({ name: m.name, offsetMs: m.ms - startMs - pausedBefore(m.ms), ...(m.derived === true ? { derived: true } : {}) })) };
}

// A baseline as a plain value: expected errors cross worker threads and disk as data.
export type BaselineOutcome =
  | { readonly baseline: Baseline }
  | { readonly error: { readonly kind: "baseline" | "runs"; readonly message: string } };
export type BaselineCompute = (runsRoot: string, runId: string) => Promise<BaselineOutcome>;
export type BaselineReader = (runId: string) => Promise<Baseline>;

export function computeBaseline(runsRoot: string, runId: string): BaselineOutcome {
  try {
    return { baseline: baselineOf(runsRoot, runId) };
  } catch (error) {
    if (error instanceof BaselineError) return { error: { kind: "baseline", message: error.message } };
    if (error instanceof RunsError) return { error: { kind: "runs", message: error.message } };
    throw error;
  }
}

export interface BaselineReaderOptions {
  // Where validation runs; the viewer passes a worker pool so the event loop stays free.
  readonly compute?: BaselineCompute;
  // Outcomes persisted by earlier viewers of the same code.
  readonly store?: BaselineStore;
}

export function createBaselineReader(runsRoot: string, options: BaselineReaderOptions = {}): BaselineReader {
  const compute = options.compute ?? ((root: string, id: string): Promise<BaselineOutcome> => Promise.resolve().then(() => computeBaseline(root, id)));
  const cache = new Map<string, { readonly fingerprint: string; readonly outcome: BaselineOutcome }>();
  const inflight = new Map<string, { readonly fingerprint: string; readonly outcome: Promise<BaselineOutcome> }>();
  const fingerprint = (runId: string): string => {
    const path = eventsPath(runsRoot, runId);
    try {
      const stat = statSync(path, { bigint: true });
      return [path, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
    } catch {
      cache.delete(runId);
      throw new RunsError(`run ${runId} has no readable events.jsonl`);
    }
  };
  const settle = (outcome: BaselineOutcome): Baseline => {
    if ("baseline" in outcome) return structuredClone(outcome.baseline);
    throw outcome.error.kind === "baseline" ? new BaselineError(outcome.error.message) : new RunsError(outcome.error.message);
  };
  // Entries are a few hundred bytes, so every run stays cached for the viewer's lifetime.
  const load = async (runId: string, before: string): Promise<BaselineOutcome> => {
    const stored = options.store?.get(runId, before) ?? null;
    if (stored !== null) {
      cache.set(runId, { fingerprint: before, outcome: stored });
      return stored;
    }
    const outcome = await compute(runsRoot, runId);
    // A changed file may finish validation, but its result cannot become a cache hit.
    let after: string | null = null;
    try { after = fingerprint(runId); } catch { /* deleted while computing: keep nothing */ }
    if (after === before) {
      cache.set(runId, { fingerprint: before, outcome });
      options.store?.put(runId, before, outcome);
    }
    return outcome;
  };
  return async (runId) => {
    const before = fingerprint(runId);
    const cached = cache.get(runId);
    if (cached?.fingerprint === before) return settle(cached.outcome);
    cache.delete(runId);
    let pending = inflight.get(runId);
    if (pending?.fingerprint !== before) {
      const outcome = load(runId, before);
      const entry = { fingerprint: before, outcome };
      pending = entry;
      inflight.set(runId, entry);
      const clear = (): void => { if (inflight.get(runId) === entry) inflight.delete(runId); };
      outcome.then(clear, clear);
    }
    return settle(await pending.outcome);
  };
}

// The live picture is the one thing the viewer reads outside the log: the
// run's own game server (INV-7), only while the run has not ended.
export function liveScreenPort(runsRoot: string, runId: string): number | null {
  const start = readStart(runsRoot, runId);
  return summarize(runsRoot, runId).ended ? null : start.isolation.port;
}

export interface ComparisonRun extends Baseline {
  readonly model: string;
  readonly started: string;
  readonly harness: string;
  readonly features: readonly string[];
  readonly controller?: { readonly kind: "human"; readonly name: string };
  readonly romIdentity?: "verified" | "unverified";
}

export interface Comparisons {
  readonly candidates: readonly ComparisonRun[];
  readonly baseline: ComparisonRun | null;
  readonly best: ComparisonRun | null;
}

function sameStart(a: ReturnType<typeof readStart>, b: ReturnType<typeof readStart>): boolean {
  return a.start_state.kind === "boot" ? b.start_state.kind === "boot" : b.start_state.kind === "save_state" && a.start_state.sha1 === b.start_state.sha1;
}

// Once per selection, not per animation tick: validate each candidate's log.
// DNFs remain eligible for partial splits; probes and unverified logs do not.
export async function comparisonsOf(runsRoot: string, runId: string, readBaseline: BaselineReader = (id) => Promise.resolve().then(() => baselineOf(runsRoot, id))): Promise<Comparisons> {
  const current = readStart(runsRoot, runId);
  if (current.harness_features.includes("probe")) return { candidates: [], baseline: null, best: null };
  // Every candidate is requested at once so a worker pool validates them in parallel.
  const found = await Promise.all(listRuns(runsRoot).map(async (summary): Promise<ComparisonRun | null> => {
    if (summary.id === runId || !summary.ended || summary.problem !== null) return null;
    try {
      const start = readStart(runsRoot, summary.id);
      if (!sameStart(current, start)) return null;
      const humanPair = current.controller?.kind === "human" || start.controller?.kind === "human";
      const currentRom = current.controller?.rom_sha1 ?? current.rom_sha1;
      const candidateRom = start.controller?.rom_sha1 ?? start.rom_sha1;
      if (humanPair && (current.vendor_pin !== start.vendor_pin || (currentRom !== undefined && candidateRom !== undefined && currentRom !== candidateRom))) return null;
      const baseline = await readBaseline(summary.id);
      if (!baseline.milestones.some((m) => MILESTONE_ORDER.indexOf(m.name as typeof MILESTONE_ORDER[number]) > 0)) return null;
      return { ...baseline, model: start.controller?.kind === "human" ? `Human · ${start.controller.name}` : start.model.id, started: start.t, harness: start.harness.commit, features: start.harness_features, ...(start.controller?.kind === "human" ? { controller: { kind: "human" as const, name: start.controller.name } } : {}), ...(humanPair ? { romIdentity: currentRom !== undefined && candidateRom !== undefined ? "verified" as const : "unverified" as const } : {}) };
    } catch (error) {
      if (!(error instanceof BaselineError || error instanceof RunsError)) throw error;
      return null;
    }
  }));
  const candidates = found.filter((c): c is ComparisonRun => c !== null);
  candidates.sort((a, b) => Date.parse(b.started) - Date.parse(a.started) || a.run.localeCompare(b.run));
  const models = candidates.filter((c) => c.controller?.kind !== "human");
  const previous = models.filter((c) => Date.parse(c.started) < Date.parse(current.t));
  const baseline = previous.find((c) => c.model === current.model.id) ?? previous[0] ?? null;
  const score = (run: ComparisonRun) => {
    const deepest = run.milestones.reduce((depth, m) => Math.max(depth, MILESTONE_ORDER.indexOf(m.name as typeof MILESTONE_ORDER[number])), -1);
    const time = run.milestones.find((m) => m.name === MILESTONE_ORDER[deepest])?.offsetMs ?? Infinity;
    return { deepest, time };
  };
  const best = models.slice().sort((a, b) => score(b).deepest - score(a).deepest || score(a).time - score(b).time || a.run.localeCompare(b.run))[0] ?? null;
  return { candidates, baseline, best };
}
