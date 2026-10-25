import { readVisualPlan, visualEvidenceSignature } from "./frontier-visual.js";
import { readNativeRecording } from "./frontier-recording.js";
import { qualifiedNativeMilestone } from "@pokebench/agent/milestones";
// Read-only access to runs/<id>/events.jsonl (PB7: the viewer's record of truth).
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { createReadStream, closeSync, existsSync, fstatSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { RUN_ID_PATTERN, eventEnvelope, parseEvent, startIdentity, type RunEvent, type StartIdentity } from "@pokebench/agent/events";
import { locateRunDir } from "@pokebench/agent/run";
import type { Baseline } from "./panels.js";
import { RunView, MILESTONE_ORDER, hasPartySample } from "./model.js";
import type { BaselineStore } from "./baseline-store.js";
import { recoveredAttacher, recoveredSignature } from "./recovered-fields.js";
import { skewOf, type ViewerBuild } from "./build-stamp.js";

export class RunsError extends Error {
  override readonly name = "RunsError";
}

export class BaselineError extends Error {
  override readonly name = "BaselineError";
}

const RUN_ID = new RegExp(RUN_ID_PATTERN);
const CHUNK = 64 * 1024;
export const RECENT_EVENT_TURNS = 30;
export const RECENT_EVENT_BYTES = 8 * 1024 * 1024;

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

interface ReadQuality { complete: boolean }

function readBytes(path: string, offset: number, maxBytes: number, quality?: ReadQuality): Buffer {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    if (quality !== undefined) quality.complete = false;
    return Buffer.alloc(0);
  }
  try {
    const size = fstatSync(fd).size;
    const length = Math.max(0, Math.min(maxBytes, size - offset));
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const n = readSync(fd, buffer, read, length - read, offset + read);
      if (n === 0) {
        if (quality !== undefined) quality.complete = false;
        break;
      }
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

  constructor(private readonly path: string, private readonly chunkBytes: number, offset = 0) { this.fileEnd = offset; }

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

function firstLine(path: string, quality?: ReadQuality): string | null {
  let size = CHUNK;
  for (;;) {
    const bytes = readBytes(path, 0, size, quality);
    const newline = bytes.indexOf(0x0a);
    if (newline >= 0) return bytes.subarray(0, newline).toString("utf8");
    if (bytes.length < size) return null;
    size *= 4;
  }
}

function lastLine(path: string, quality?: ReadQuality): string | null {
  const start = Math.max(0, sizeOf(path) - CHUNK);
  const text = readBytes(path, start, CHUNK, quality).toString("utf8").replace(/\n+$/, "");
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

// run_start's identity read loosely (startIdentity) when it names this run: lets a viewer that cannot
// validate a newer harness's run_start still tell which build wrote it.
export function readStartIdentity(runsRoot: string, runId: string): StartIdentity | null {
  return readStartIdentityAt(eventsPath(runsRoot, runId), runId);
}

function readStartIdentityAt(path: string, runId: string): StartIdentity | null {
  const first = firstLine(path);
  if (first === null) return null;
  let value: unknown;
  try { value = JSON.parse(first); } catch { return null; }
  const identity = startIdentity(value);
  return identity?.run === runId ? identity : null;
}

// A run_start the schema rejects, written by a build the viewer's does not contain: listed with the
// restart-the-viewer problem instead of the schema error. Null where strict reporting applies.
function newerStart(id: string, path: string, problem: string, build: ViewerBuild | null): RunSummary | null {
  const identity = build === null ? null : readStartIdentityAt(path, id);
  const skew = identity === null ? null : skewOf(build, identity);
  if (identity === null || skew === null) return null;
  const last = lastLine(path);
  let ended = false;
  try { ended = last !== null && eventEnvelope(JSON.parse(last))?.type === "run_end"; } catch { /* a torn last line: still running */ }
  return { id, model: identity.model, started: identity.t, ended, reason: null, problem: `${skew.head}. It cannot read this run's run_start: line 1: ${problem}` };
}

function summarizeAt(id: string, path: string, build: ViewerBuild | null = null, quality?: ReadQuality): RunSummary {
  const first = firstLine(path, quality);
  const empty = { id, model: null, started: null, ended: false, reason: null };
  if (first === null) return { ...empty, problem: "no run_start yet" };
  const start = parseLine(first, 1);
  if (!start.ok) return newerStart(id, path, start.problem, build) ?? { ...empty, problem: start.problem };
  if (start.event.type !== "run_start") return { ...empty, problem: "the first event is not run_start" };
  const last = lastLine(path, quality);
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

function summarize(runsRoot: string, id: string, build: ViewerBuild | null = null, quality?: ReadQuality): RunSummary {
  return summarizeAt(id, eventsPath(runsRoot, id), build, quality);
}

// build: this viewer's own build; a run whose run_start only a newer build can read says to restart the viewer.
function runEntries(runsRoot: string): string[] {
  const entriesAt = (root: string): string[] => {
    try { return readdirSync(root).filter((id) => RUN_ID.test(id) && existsSync(join(root, id, "events.jsonl"))); }
    catch { return []; }
  };
  const entries = new Set([...entriesAt(runsRoot), ...entriesAt(join(runsRoot, "human"))]);
  return [...entries].sort().reverse();
}

interface DiscoveredRun {
  readonly id: string;
  readonly path: string | null;
}

interface Discovery {
  readonly entries: readonly DiscoveredRun[];
}

type DirectoryIdentity = { readonly kind: "present"; readonly identity: RunIdentity } | { readonly kind: "missing" } | { readonly kind: "error" };

function directoryIdentity(path: string): DirectoryIdentity {
  try {
    const stat = statSync(path, { bigint: true });
    return { kind: "present", identity: { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs } };
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? { kind: "missing" } : { kind: "error" };
  }
}

function sameDirectoryIdentity(before: DirectoryIdentity, after: DirectoryIdentity): boolean {
  if (before.kind === "missing" || after.kind === "missing") return before.kind === "missing" && after.kind === "missing";
  return before.kind === "present" && after.kind === "present" && sameIdentity(before.identity, after.identity);
}

function discoverRunEntries(runsRoot: string): Discovery {
  const roots = [runsRoot, join(runsRoot, "human")] as const;
  const before = roots.map(directoryIdentity);
  const present = roots.map((root) => {
    try {
      const ids = readdirSync(root).filter((id) => RUN_ID.test(id));
      return { status: "present" as const, ids: new Set(ids), withEvents: ids.filter((id) => existsSync(join(root, id, "events.jsonl"))) };
    } catch (error) {
      return { status: error instanceof Error && "code" in error && error.code === "ENOENT" ? "missing" as const : "error" as const, ids: new Set<string>(), withEvents: [] as string[] };
    }
  });
  const after = roots.map(directoryIdentity);
  const pathsStable = present.every(({ status }, index) => status !== "error" && status === before[index]?.kind) && before.every((identity, index) => {
    const next = after[index];
    return next !== undefined && sameDirectoryIdentity(identity, next);
  });
  const ids = new Set(present.flatMap(({ withEvents }) => withEvents));
  const entries = [...ids].sort().reverse().map((id): DiscoveredRun => {
    const locations = present.flatMap(({ ids: entries }, index) => entries.has(id) ? [join(roots[index] ?? runsRoot, id)] : []);
    return { id, path: pathsStable && locations.length === 1 ? join(locations[0] ?? runsRoot, "events.jsonl") : null };
  });
  return { entries };
}

function summarizeRun(runsRoot: string, id: string, build: ViewerBuild | null, quality?: ReadQuality): RunSummary {
  try {
    return summarize(runsRoot, id, build, quality);
  } catch (error) {
    if (!(error instanceof RunsError)) throw error;
    return { id, model: null, started: null, ended: false, reason: null, problem: error.message };
  }
}

export type RunCatalog = () => readonly RunSummary[];

interface RunIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

function runIdentity(path: string): RunIdentity | null {
  try {
    const stat = statSync(path, { bigint: true });
    return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs };
  } catch {
    return null;
  }
}

function sameIdentity(a: RunIdentity, b: RunIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function frozenSummary(summary: RunSummary): RunSummary {
  if (summary.cohort !== undefined) Object.freeze(summary.cohort);
  return Object.freeze(summary);
}

// Discovery and file identity remain fresh on every request. Only the bounded header/tail reduction
// is reused, and only when every byte requested was read and the file stayed identical throughout.
export function createRunCatalog(runsRoot: string, build: ViewerBuild | null = null): RunCatalog {
  const cache = new Map<string, { readonly identity: RunIdentity; readonly summary: RunSummary }>();
  return () => {
    const discovered = discoverRunEntries(runsRoot), keep = new Set(discovered.entries.map(({ id }) => id));
    for (const id of cache.keys()) if (!keep.has(id)) cache.delete(id);
    return discovered.entries.map(({ id, path: discoveredPath }) => {
      let path: string;
      try { path = discoveredPath ?? eventsPath(runsRoot, id); }
      catch (error) {
        if (!(error instanceof RunsError)) throw error;
        cache.delete(id);
        return summarizeRun(runsRoot, id, build);
      }
      const before = runIdentity(path), prior = cache.get(id);
      if (before !== null && prior !== undefined && sameIdentity(prior.identity, before)) return prior.summary;
      const quality: ReadQuality = { complete: true };
      const summary = discoveredPath === null ? summarizeRun(runsRoot, id, build, quality) : summarizeAt(id, path, build, quality);
      const after = runIdentity(path);
      if (before !== null && after !== null && quality.complete && summary.problem === null && sameIdentity(before, after)) {
        const frozen = frozenSummary(summary);
        cache.set(id, { identity: after, summary: frozen });
        return frozen;
      }
      cache.delete(id);
      return summary;
    });
  };
}

export function listRuns(runsRoot: string, build: ViewerBuild | null = null): RunSummary[] {
  return runEntries(runsRoot).map((id) => {
    try {
      return summarize(runsRoot, id, build);
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

// A compact, atomic view of the recorded present: the run header plus the newest
// complete turns. The forward event stream remains authoritative after catch-up.
function* recentEventSteps(
  runsRoot: string,
  runId: string,
  maxTurns = RECENT_EVENT_TURNS,
  maxBytes = RECENT_EVENT_BYTES,
  cursor?: { offset: number },
): Generator<void, RunEvent[]> {
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) throw new RunsError("recent turn limit must be a positive integer");
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RunsError("recent byte limit must be a positive integer");
  const path = eventsPath(runsRoot, runId);
  const start = readStart(runsRoot, runId);
  if (start.run !== runId) throw new RunsError(`run ${runId} holds an event for run ${start.run}`);

  const tail: RunEvent[] = [];
  const fd = openSync(path, "r");
  let offset: number;
  if (cursor !== undefined) cursor.offset = 0;
  try {
    const size = fstatSync(fd).size;
    offset = Math.max(0, size - maxBytes);
    let discardPrefix = false;
    if (offset > 0) {
      const previous = Buffer.alloc(1);
      discardPrefix = readSync(fd, previous, 0, 1, offset - 1) !== 1 || previous[0] !== 0x0a;
    }
    let position = offset, lineNo = 0;
    let pieces: Buffer[] = [];
    // One opened descriptor and a frozen end: appends/replacements cannot leak
    // into this snapshot. Long lines are joined once, only at their newline.
    while (position < size) {
      const bytes = Buffer.alloc(Math.min(CHUNK, size - position));
      const length = readSync(fd, bytes, 0, bytes.length, position);
      if (length === 0) break;
      const chunk = bytes.subarray(0, length);
      let start = 0;
      for (let end = chunk.indexOf(0x0a); end >= 0; end = chunk.indexOf(0x0a, start)) {
        if (cursor !== undefined) cursor.offset = position + end + 1;
        if (discardPrefix) discardPrefix = false;
        else {
          lineNo += 1;
          const last = chunk.subarray(start, end);
          const text = (pieces.length === 0 ? last : Buffer.concat([...pieces, last])).toString("utf8");
          if (text.trim() !== "") {
            const parsed = parseLine(text, lineNo);
            if (!parsed.ok) throw new RunsError(`run ${runId} recent event ${String(parsed.line)}: ${parsed.problem}`);
            if (parsed.event.run !== runId) throw new RunsError(`run ${runId} holds an event for run ${parsed.event.run}`);
            if (parsed.event.type !== "run_start") tail.push(parsed.event);
          }
        }
        pieces = []; start = end + 1;
        yield;
      }
      if (!discardPrefix && start < length) pieces.push(chunk.subarray(start));
      position += length;
      // Even a very long or incomplete line cannot turn a snapshot read into
      // an uninterruptible whole-file allocation on the HTTP event loop.
      yield;
    }
  } finally { closeSync(fd); }

  const turns = [...new Set(tail.map((event) => event.turn))];
  const cutTurn = offset > 0 && turns.length <= maxTurns && !tail.some(event => event.turn === turns[0] && event.type === "turn_start");
  const completeTurns = cutTurn ? turns.slice(1) : turns.slice(-maxTurns);
  const selected = new Set(completeTurns);
  // Lazy backward paging starts from this snapshot: never advance the stream
  // cursor beyond an unseen final event carrying an earlier turn label.
  const latest = tail.at(-1);
  return [start, ...tail.filter((event) => event === latest || selected.has(event.turn) || event.type === "run_end" || event.type === "operator_control")];
}

// Both callers consume the same snapshot and strict validation. HTTP uses small
// cooperative slices so an 8 MB recent history cannot starve live frame sockets.
export function readRecentEvents(runsRoot: string, runId: string, maxTurns = RECENT_EVENT_TURNS, maxBytes = RECENT_EVENT_BYTES, cursor?: { offset: number }): RunEvent[] {
  const steps = recentEventSteps(runsRoot, runId, maxTurns, maxBytes, cursor);
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}

export const RECENT_SLICE_LINES = 16;
export async function readRecentEventsAsync(runsRoot: string, runId: string, maxTurns = RECENT_EVENT_TURNS, maxBytes = RECENT_EVENT_BYTES, cursor?: { offset: number }, sliceLines = RECENT_SLICE_LINES, cancelled: () => boolean = () => false): Promise<RunEvent[]> {
  if (!Number.isSafeInteger(sliceLines) || sliceLines <= 0) throw new RunsError("recent slice limit must be a positive integer");
  const steps = recentEventSteps(runsRoot, runId, maxTurns, maxBytes, cursor);
  let lines = 0, started = performance.now();
  try {
    for (;;) {
      if (cancelled()) return [];
      const step = steps.next();
      if (step.done) return step.value;
      lines += 1;
      if (lines >= sliceLines || performance.now() - started >= 4) {
        await yieldImmediate(); lines = 0; started = performance.now();
      }
    }
  } finally { steps.return([]); }
}

// A recent trace may contain no state or milestone at all (for example repeated
// tool refusals). Hydrate sparse recorded panel context separately from trace
// history, retaining the same party-sample rule the panel reducer owns.
export async function readHeadEvents(runsRoot: string, runId: string, cursor: { offset: number }, maxTurns = RECENT_EVENT_TURNS, maxBytes = RECENT_EVENT_BYTES, cancelled: () => boolean = () => false): Promise<RunEvent[]> {
  const recent = await readRecentEventsAsync(runsRoot, runId, maxTurns, maxBytes, cursor, RECENT_SLICE_LINES, cancelled);
  if (cancelled()) return [];
  if (cursor.offset === 0) return recent;
  const input = createReadStream(eventsPath(runsRoot, runId), { encoding: "utf8", end: cursor.offset - 1 });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const controls: RunEvent[] = [], milestones = new Map<string, RunEvent>();
  let lastState: Extract<RunEvent, { type: "state" }> | undefined, partyState: Extract<RunEvent, { type: "state" }> | undefined;
  try {
    for await (const line of lines) {
      if (cancelled()) return [];
      if (!/"type"\s*:\s*"(?:operator_control|milestone|state)"/.test(line)) continue;
      const parsed = parseLine(line, 0);
      if (!parsed.ok) throw new RunsError(`run ${runId} head metadata: ${parsed.problem}`);
      const event = parsed.event;
      if (event.run !== runId) throw new RunsError(`run ${runId} holds an event for run ${event.run}`);
      if (event.type === "operator_control") controls.push(event);
      if (event.type === "milestone" && !milestones.has(event.name)) milestones.set(event.name, event);
      if (event.type === "state") {
        lastState = event;
        if ("started" in event && hasPartySample(event)) partyState = event;
      }
    }
  } finally { lines.close(); input.destroy(); }
  const anchors = [lastState, partyState].filter((event): event is Extract<RunEvent, { type: "state" }> => event !== undefined);
  const bySeq = new Map([...controls, ...milestones.values(), ...anchors, ...recent].map(event => [event.seq, event]));
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

// A six-hour log is larger than the longest string Node can build, so baselines read it in chunks.
const BASELINE_CHUNK_BYTES = 4 * 1024 * 1024;
const BASELINE_LINES = 4096;

export function baselineOf(runsRoot: string, runId: string, chunkBytes = BASELINE_CHUNK_BYTES): Baseline {
  const start = readStart(runsRoot, runId);
  if (start.harness_features.includes("probe")) throw new BaselineError("probe sessions cannot be benchmark baselines");
  const startMs = Date.parse(start.t);
  const view = new RunView();
  let expectedSeq = 0;
  let humanEnded = false;
  // A comparison must rest on the baseline run's own, fully valid log (PB1).
  const recovered = recoveredAttacher(runDir(runsRoot, runId));
  const reader = new LogReader(eventsPath(runsRoot, runId), chunkBytes);
  for (let batch = reader.next(BASELINE_LINES); batch.lines > 0; batch = reader.next(BASELINE_LINES)) for (const read of batch.results) {
    const result = read.ok ? { ...read, event: recovered(read.event) } : read;
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
  // Historical screenshot reconstruction has the same hash/sample qualification as comparisons.
  // Only the requested first-interaction gap is added here; original event logs stay untouched.
  if (readVisualPlan(eventsPath(runsRoot, runId))?.milestones.some(mark => mark.name === "ROXANNE_FIRST_INTERACTION") === true) {
    const recording = readNativeRecording(eventsPath(runsRoot, runId), runId, qualifiedNativeMilestone);
    const mark = recording.splits.find(split => split.name === "ROXANNE_FIRST_INTERACTION");
    const raw = recording.measurement.rawSplits.find(split => split.name === "ROXANNE_FIRST_INTERACTION");
    if (mark !== undefined && raw !== undefined && !view.milestones.some(m => m.name === mark.name)) view.milestones.push({name:mark.name,ms:startMs+raw.elapsedMs,seq:mark.seq,derived:true,kind:"story",origin:"observed",evidence:raw.evidence,...(mark.screenshotEvidence === undefined ? {} : {screenshotEvidence:mark.screenshotEvidence})});
  }
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
      return [path, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":") + recoveredSignature(runDir(runsRoot, runId)) + visualEvidenceSignature(path);
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
}

function sameStart(a: ReturnType<typeof readStart>, b: ReturnType<typeof readStart>): boolean {
  return a.start_state.kind === "boot" ? b.start_state.kind === "boot" : b.start_state.kind === "save_state" && a.start_state.sha1 === b.start_state.sha1;
}

// Once per selection, not per animation tick: validate each candidate's log.
// DNFs remain eligible for partial splits; probes and unverified logs do not.
export async function comparisonsOf(runsRoot: string, runId: string, readBaseline: BaselineReader = (id) => Promise.resolve().then(() => baselineOf(runsRoot, id))): Promise<Comparisons> {
  const current = readStart(runsRoot, runId);
  if (current.harness_features.includes("probe")) return { candidates: [], baseline: null };
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
      if (!baseline.milestones.some((m) => MILESTONE_ORDER.indexOf(m.name) > 0)) return null;
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
  return { candidates, baseline };
}
