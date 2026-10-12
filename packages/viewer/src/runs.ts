// Read-only access to runs/<id>/events.jsonl (PB7: the viewer's record of truth).
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RUN_ID_PATTERN, parseEvent, type RunEvent } from "@pokebench/agent/events";
import type { Baseline } from "./panels.js";

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
  const startMs = Date.parse(start.t);
  const milestones: { name: string; offsetMs: number }[] = [];
  // A comparison must rest on the baseline run's own, fully valid log (PB1).
  for (const result of readFrom(eventsPath(runsRoot, runId), 0, 0).results) {
    if (!result.ok) throw new BaselineError(`baseline ${runId} line ${String(result.line)}: ${result.problem}`);
    if (result.event.run !== runId) throw new BaselineError(`baseline ${runId} holds an event for run ${result.event.run}`);
    if (result.event.type === "milestone") milestones.push({ name: result.event.name, offsetMs: Date.parse(result.event.t) - startMs });
  }
  return { run: runId, milestones };
}

// The live picture is the one thing the viewer reads outside the log: the
// run's own game server (INV-7), only while the run has not ended.
export function liveScreenPort(runsRoot: string, runId: string): number | null {
  const start = readStart(runsRoot, runId);
  return summarize(runsRoot, runId).ended ? null : start.isolation.port;
}
