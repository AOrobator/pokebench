// Read-only access to runs/<id>/events.jsonl (PB7: the viewer's record of truth).
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RUN_ID_PATTERN, parseEvent, type RunEvent } from "@pokebench/agent/events";
import type { Baseline } from "./panels.js";
import { RunView, MILESTONE_ORDER } from "./model.js";

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
  return join(runsRoot, runId);
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
  return {
    id,
    model: start.event.model.id,
    started: start.event.t,
    ended: ended !== null,
    reason: ended?.reason ?? null,
    problem: null,
  };
}

export function listRuns(runsRoot: string): RunSummary[] {
  let entries: string[];
  try {
    entries = readdirSync(runsRoot);
  } catch {
    return [];
  }
  return entries
    .filter((id) => RUN_ID.test(id) && existsSync(join(runsRoot, id, "events.jsonl")))
    .sort()
    .reverse()
    .map((id) => summarize(runsRoot, id));
}

function readStart(runsRoot: string, runId: string): RunEvent & { type: "run_start" } {
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
  // A comparison must rest on the baseline run's own, fully valid log (PB1).
  for (const result of readFrom(eventsPath(runsRoot, runId), 0, 0).results) {
    if (!result.ok) throw new BaselineError(`baseline ${runId} line ${String(result.line)}: ${result.problem}`);
    if (result.event.run !== runId) throw new BaselineError(`baseline ${runId} holds an event for run ${result.event.run}`);
    if (result.event.type === "state" && !("started" in result.event)) throw new BaselineError("baseline uses unverified historical vendor state");
    view.apply(result.event);
  }
  if (view.state === null && !start.harness_features.includes("ram-state-v1")) throw new BaselineError("baseline has no verified RAM-state provenance");
  return { run: runId, milestones: view.milestones.filter((m) => m.origin !== "present_at_start").map((m) => ({ name: m.name, offsetMs: m.ms - startMs, ...(m.derived === true ? { derived: true } : {}) })) };
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
export function comparisonsOf(runsRoot: string, runId: string): Comparisons {
  const current = readStart(runsRoot, runId);
  const candidates: ComparisonRun[] = [];
  if (current.harness_features.includes("probe")) return { candidates, baseline: null, best: null };
  for (const summary of listRuns(runsRoot)) {
    if (summary.id === runId || !summary.ended || summary.problem !== null) continue;
    try {
      const start = readStart(runsRoot, summary.id);
      if (!sameStart(current, start)) continue;
      const baseline = baselineOf(runsRoot, summary.id);
      if (!baseline.milestones.some((m) => MILESTONE_ORDER.indexOf(m.name as typeof MILESTONE_ORDER[number]) > 0)) continue;
      candidates.push({ ...baseline, model: start.model.id, started: start.t, harness: start.harness.commit, features: start.harness_features });
    } catch (error) {
      if (!(error instanceof BaselineError || error instanceof RunsError)) throw error;
    }
  }
  candidates.sort((a, b) => Date.parse(b.started) - Date.parse(a.started) || a.run.localeCompare(b.run));
  const previous = candidates.filter((c) => Date.parse(c.started) < Date.parse(current.t));
  const baseline = previous.find((c) => c.model === current.model.id) ?? previous[0] ?? null;
  const score = (run: ComparisonRun) => {
    const deepest = run.milestones.reduce((depth, m) => Math.max(depth, MILESTONE_ORDER.indexOf(m.name as typeof MILESTONE_ORDER[number])), -1);
    const time = run.milestones.find((m) => m.name === MILESTONE_ORDER[deepest])?.offsetMs ?? Infinity;
    return { deepest, time };
  };
  const best = candidates.slice().sort((a, b) => score(b).deepest - score(a).deepest || score(a).time - score(b).time || a.run.localeCompare(b.run))[0] ?? null;
  return { candidates, baseline, best };
}
