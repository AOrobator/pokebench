import { open, type FileHandle } from "node:fs/promises";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
import { eventsPath, RunsError } from "./runs.js";

export const TRACE_PAGE_BYTES = 4 * 1024 * 1024;
export const TRACE_PAGE_TURNS = 50;
const CHUNK = 64 * 1024;
interface RecordLine { readonly event: RunEvent; readonly start: number; readonly end: number }
export interface TraceHistoryPage { readonly run: string; readonly events: readonly RunEvent[]; readonly before: number | null }

async function nextLine(file: FileHandle, offset: number, end: number, maxBytes: number): Promise<RecordLine | null> {
  let discard = false;
  if (offset > 0) {
    const previous = Buffer.alloc(1);
    await file.read(previous, 0, 1, offset - 1);
    discard = previous[0] !== 10;
  }
  let start = offset, length = 0;
  const pieces: Buffer[] = [];
  while (offset < end) {
    const bytes = Buffer.alloc(Math.min(CHUNK, end - offset));
    const { bytesRead } = await file.read(bytes, 0, bytes.length, offset);
    if (bytesRead === 0) return null;
    let at = 0;
    if (discard) {
      const newline = bytes.subarray(0, bytesRead).indexOf(10);
      if (newline < 0) { offset += bytesRead; continue; }
      discard = false; at = newline + 1; start = offset + at;
    }
    const newline = bytes.subarray(0, bytesRead).indexOf(10, at);
    const part = bytes.subarray(at, newline < 0 ? bytesRead : newline);
    length += part.length;
    if (length > maxBytes) throw new RunsError("A history event exceeds the page size; the original recording remains on disk.");
    pieces.push(part);
    if (newline >= 0) return { event: parseEvent(Buffer.concat(pieces).toString("utf8")), start, end: offset + newline + 1 };
    offset += bytesRead;
  }
  return null;
}

// Seek by the recording's increasing sequence numbers without streaming its prefix to the browser.
async function boundary(file: FileHandle, size: number, before: number, maxBytes: number): Promise<number> {
  let low = 0, high = size;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const line = await nextLine(file, middle, size, maxBytes);
    if (line === null || line.event.seq >= before) high = middle;
    else low = line.end;
  }
  let line = await nextLine(file, low, size, maxBytes);
  while (line !== null && line.event.seq < before) line = await nextLine(file, line.end, size, maxBytes);
  return line?.start ?? size;
}

export async function readTraceHistory(runsRoot: string, run: string, before: number, limits: { readonly maxBytes?: number; readonly maxTurns?: number } = {}): Promise<TraceHistoryPage> {
  if (!Number.isSafeInteger(before) || before < 0) throw new RunsError("history cursor must be a nonnegative integer");
  const maxBytes = limits.maxBytes ?? TRACE_PAGE_BYTES, maxTurns = limits.maxTurns ?? TRACE_PAGE_TURNS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxTurns) || maxTurns <= 0) throw new RunsError("history limits must be positive integers");
  const file = await open(eventsPath(runsRoot, run), "r");
  try {
    const end = await boundary(file, (await file.stat()).size, before, maxBytes);
    let offset = Math.max(0, end - maxBytes);
    const events: RunEvent[] = [];
    while (offset < end) {
      const line = await nextLine(file, offset, end, maxBytes);
      if (line === null) break;
      if (line.event.run !== run) throw new RunsError("history event belongs to another run");
      if (line.event.seq >= before) throw new RunsError("history event is beyond the requested cursor");
      if ((events.at(-1)?.seq ?? -1) >= line.event.seq) throw new RunsError("history sequence is not increasing");
      events.push(line.event); offset = line.end;
    }
    if (end > 0 && events.length === 0) throw new RunsError("No complete history event fits in this page; the original recording remains on disk.");
    // Keep a contiguous sequence suffix: late events may belong to earlier turns.
    const turns = new Set<number>();
    let start = events.length;
    for (const event of events.toReversed()) {
      if (!turns.has(event.turn) && turns.size === maxTurns) break;
      turns.add(event.turn);
      start--;
    }
    const selected = events.slice(start);
    const oldest = selected[0]?.seq ?? 0;
    return { run, events: selected, before: oldest === 0 ? null : oldest };
  } finally { await file.close(); }
}
