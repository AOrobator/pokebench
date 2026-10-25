import { open, type FileHandle } from "node:fs/promises";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
import { eventsPath, RunsError } from "./runs.js";

export const TRACE_PAGE_BYTES = 4 * 1024 * 1024;
const CHUNK = 64 * 1024;
interface RecordLine { readonly event: RunEvent; readonly start: number; readonly end: number }
export interface TraceHistoryPage { readonly run: string; readonly events: readonly RunEvent[]; readonly before: number | null }

async function nextLine(file: FileHandle, offset: number, end: number): Promise<RecordLine | null> {
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
    if (length > TRACE_PAGE_BYTES) throw new RunsError("A history event exceeds the page size; the original recording remains on disk.");
    pieces.push(part);
    if (newline >= 0) return { event: parseEvent(Buffer.concat(pieces).toString("utf8")), start, end: offset + newline + 1 };
    offset += bytesRead;
  }
  return null;
}

// Seek by the recording's increasing sequence numbers without streaming its prefix to the browser.
async function boundary(file: FileHandle, size: number, before: number): Promise<number> {
  let low = 0, high = size;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const line = await nextLine(file, middle, size);
    if (line === null || line.event.seq >= before) high = middle;
    else low = line.end;
  }
  let line = await nextLine(file, low, size);
  while (line !== null && line.event.seq < before) line = await nextLine(file, line.end, size);
  return line?.start ?? size;
}

export async function readTraceHistory(runsRoot: string, run: string, before: number): Promise<TraceHistoryPage> {
  if (!Number.isSafeInteger(before) || before < 0) throw new RunsError("history cursor must be a nonnegative integer");
  const file = await open(eventsPath(runsRoot, run), "r");
  try {
    const end = await boundary(file, (await file.stat()).size, before);
    let offset = Math.max(0, end - TRACE_PAGE_BYTES);
    const events: RunEvent[] = [];
    while (offset < end) {
      const line = await nextLine(file, offset, end);
      if (line === null) break;
      if (line.event.run !== run) throw new RunsError("history event belongs to another run");
      if (line.event.seq >= before || (events.at(-1)?.seq ?? -1) >= line.event.seq) throw new RunsError("history sequence is not increasing");
      events.push(line.event); offset = line.end;
    }
    if (end > 0 && events.length === 0) throw new RunsError("A history event exceeds the page size; the original recording remains on disk.");
    const turns = new Set([...new Set(events.map(event => event.turn))].slice(-50));
    const selected = events.filter(event => turns.has(event.turn));
    const oldest = selected[0]?.seq ?? 0;
    return { run, events: selected, before: oldest === 0 ? null : oldest };
  } finally { await file.close(); }
}
