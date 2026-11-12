// Serves the broadcast feed. A run's log is read once, a bounded chunk per event-loop turn, then only its new bytes,
// so a long recording never stalls the viewer and a poll of a live run stays cheap. Reads only; the commentary and
// pricing it picks up live under runs/broadcast/, never in a run's own folder.
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { BroadcastRates, BroadcastResponse, CommentaryLine } from "./broadcast-feed.js";
import { createBroadcastReducer, wantedLine, type BroadcastReducer, type BroadcastSide } from "./broadcast-reducer.js";

export interface BroadcastDisk {
  readBytes(path: string, offset: number, length: number): Buffer;
  readText(path: string): string | null;
}
export interface BroadcastStoreOptions {
  readonly runsRoot: string;
  readonly disk: BroadcastDisk;
  eventsPath(runId: string): string;
  pause(): Promise<void>;
  readonly chunkBytes?: number;
  readonly keepRuns?: number;
}
export interface BroadcastStore { read(runId: string, after: number, lines?: number): Promise<BroadcastResponse> }

// The game server's tape keeps a cursor per reader and never touches the emulator, so this is safe beside the recorder.
export function gameAudioUrl(port: number, since: string): string | null {
  if (!/^(-1|0|[1-9][0-9]*)$/.test(since) || !Number.isSafeInteger(Number(since))) return null;
  return `http://127.0.0.1:${String(port)}/audio.wav?since=${since}&max_frames=12000`;
}

export function commentaryWav(runsRoot: string, runId: string, name: string): string | null {
  return /^t[0-9]{6,}\.wav$/.test(name) ? join(runsRoot, "broadcast", runId, name) : null;
}

const LineSchema = Type.Object({ turn: Type.Integer(), t: Type.Number(), text: Type.String(), wav: Type.String(), said: Type.Optional(Type.Union([Type.Number(), Type.Null()])) });
const ThinkingRow = Type.Object({ turn: Type.Integer(), thinking: Type.String() });
const CostRow = Type.Object({ turn: Type.Integer(), usd: Type.Number() });
const RateSchema = Type.Object({ input_per_million: Type.Number(), output_per_million: Type.Number(), cache_read_per_million: Type.Number() });
const HEAD_BYTES = 256;
const NEWLINE = 0x0a;

interface Tail { readonly reducer: BroadcastReducer; offset: number; rest: Buffer; pending: Promise<void>; said: { text: string | null; lines: CommentaryLine[] } }

function commentaryOf(text: string | null): CommentaryLine[] {
  const lines: CommentaryLine[] = [];
  for (const line of (text ?? "").split("\n")) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    if (Value.Check(LineSchema, value)) lines.push(value);
  }
  return lines;
}

function rowsOf<S extends typeof ThinkingRow | typeof CostRow>(text: string | null, schema: S): Static<S>[] {
  const rows: Static<S>[] = [];
  for (const line of (text ?? "").split("\n")) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { continue; }
    if (Value.Check(schema, value)) rows.push(value);
  }
  return rows;
}

// Read once, when the run's log is first read: they are written after a run has finished.
function sideOf(disk: BroadcastDisk, folder: string): BroadcastSide {
  return {
    thinking: new Map(rowsOf(disk.readText(join(folder, "thinking.jsonl")), ThinkingRow).map(row => [row.turn, row.thinking])),
    usd: new Map(rowsOf(disk.readText(join(folder, "cost.jsonl")), CostRow).map(row => [row.turn, row.usd])),
  };
}

function ratesOf(text: string | null, model: string): BroadcastRates | null {
  if (text === null) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  const entry = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[model] : undefined;
  if (!Value.Check(RateSchema, entry)) return null;
  return { input: entry.input_per_million, output: entry.output_per_million, cacheRead: entry.cache_read_per_million };
}

export function createBroadcastStore(options: BroadcastStoreOptions): BroadcastStore {
  const { disk, chunkBytes = 1024 * 1024, keepRuns = 4 } = options;
  const tails = new Map<string, Tail>();

  const take = (tail: Tail, bytes: Buffer): void => {
    const buffer = tail.rest.length === 0 ? bytes : Buffer.concat([tail.rest, bytes]);
    let start = 0;
    for (let end = buffer.indexOf(NEWLINE); end >= 0; end = buffer.indexOf(NEWLINE, start)) {
      if (wantedLine(buffer.toString("latin1", start, Math.min(end, start + HEAD_BYTES)))) tail.reducer.add(buffer.toString("utf8", start, end));
      start = end + 1;
    }
    tail.rest = buffer.subarray(start);
  };
  const advance = async (tail: Tail, path: string): Promise<void> => {
    for (;;) {
      const bytes = disk.readBytes(path, tail.offset, chunkBytes);
      if (bytes.length === 0) return;
      tail.offset += bytes.length;
      take(tail, bytes);
      await options.pause();
    }
  };
  const tailOf = (runId: string): Tail => {
    const known = tails.get(runId);
    tails.delete(runId);
    const tail = known ?? { reducer: createBroadcastReducer(sideOf(disk, join(options.runsRoot, "broadcast", runId))), offset: 0, rest: Buffer.alloc(0), pending: Promise.resolve(), said: { text: null, lines: [] } };
    tails.set(runId, tail);
    for (const oldest of tails.keys()) { if (tails.size <= keepRuns) break; tails.delete(oldest); }
    return tail;
  };

  return {
    async read(runId, after, lines) {
      const path = options.eventsPath(runId), tail = tailOf(runId);
      // One reader per run at a time: a second poll waits for the first instead of reading the same bytes.
      tail.pending = tail.pending.catch(() => undefined).then(() => advance(tail, path));
      await tail.pending;
      const { header, items, ended } = tail.reducer;
      if (header === null) throw new Error(`run ${runId} has no run_start`);
      const folder = join(options.runsRoot, "broadcast");
      // A live page polls twice a second, and the file changes only once a turn.
      const text = disk.readText(join(folder, runId, "commentary.jsonl"));
      if (text !== tail.said.text) tail.said = { text, lines: commentaryOf(text) };
      return {
        header, ended, next: items.length, items: items.slice(after),
        commentary: tail.said.lines.slice(lines ?? (after === 0 ? 0 : Infinity)),
        rates: ratesOf(disk.readText(join(folder, "pricing.json")), header.model),
      };
    },
  };
}
