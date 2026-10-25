import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codeIdentity } from "./baseline-store.js";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { parseEvent } from "@pokebench/agent/events";
import { BagLedger } from "./bag.js";
import { eventsPath } from "./runs.js";

const Natural = Type.Integer({ minimum: 0 });
const IdentitySchema = Type.Object({ dev: Natural, ino: Natural, size: Natural, mtimeMs: Type.Number(), ctimeMs: Type.Number() });
const SavedSchema = Type.Object({ run: Type.String(), identity: IdentitySchema, offset: Natural, seq: Type.Integer({ minimum: -1 }), ledger: Type.Unknown() });
interface Identity { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }
interface Tail { identity: Identity; offset: number; seq: number; ledger: BagLedger }
export interface BagHistory { readonly run: string; readonly throughSeq: number; readonly ledger: BagLedger }
export type BagHistoryReader = (run: string) => Promise<BagHistory>;

const identityOf = (s: Identity): Identity => ({ dev: s.dev, ino: s.ino, size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs });
const appended = (a: Identity, b: Identity): boolean => a.dev === b.dev && a.ino === b.ino && (b.size > a.size || (b.size === a.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs));

// Viewer-owned derived files only. A code-keyed, atomic checkpoint includes the reducer's
// unconfirmed item changes and shop transaction, not just the visible totals.
export function createBagHistoryReader(root: string, options: { readonly chunkBytes?: number; readonly codeEntry?: string; readonly observeRead?: (offset: number, bytes: number) => void } = {}): BagHistoryReader {
  const chunkBytes = options.chunkBytes ?? 256 * 1024;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new RangeError("Bag chunk size must be positive");
  // Fingerprint the built dependency graph, including the event parser. src/ tests and
  // dist/ runtime both address this same built entry; codeEntry isolates tiny test graphs.
  const hash = codeIdentity(options.codeEntry ?? fileURLToPath(new URL("../dist/bag-history.js", import.meta.url)));
  const directory = join(root, ".viewer-cache", "bag", hash);
  const active = new Map<string, Promise<BagHistory>>();

  async function restore(run: string, identity: Identity): Promise<Tail> {
    try {
      const value: unknown = JSON.parse(await readFile(join(directory, `${run}.json`), "utf8"));
      if (Value.Check(SavedSchema, value) && value.run === run && value.offset <= value.identity.size && appended(value.identity, identity)) {
        return { identity: value.identity, offset: value.offset, seq: value.seq, ledger: BagLedger.restore(value.ledger) };
      }
    } catch { /* Missing, old or corrupt derived data is rebuilt from the original log. */ }
    return { identity, offset: 0, seq: -1, ledger: new BagLedger() };
  }

  async function persist(run: string, tail: Tail): Promise<void> {
    const path = join(directory, `${run}.json`), temp = `${path}.${randomUUID()}.tmp`;
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temp, JSON.stringify({ run, identity: tail.identity, offset: tail.offset, seq: tail.seq, ledger: tail.ledger.checkpoint() }));
      await rename(temp, path);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw new Error("Could not save bag history summary", { cause: error });
    }
  }

  async function reduce(file: FileHandle, run: string, tail: Tail, end: number): Promise<void> {
    let offset = tail.offset;
    let pieces: Buffer[] = [];
    let count = 0;
    while (offset < end) {
      const bytes = Buffer.alloc(Math.min(chunkBytes, end - offset));
      const { bytesRead } = await file.read(bytes, 0, bytes.length, offset);
      if (bytesRead === 0) throw new Error("Bag source changed during reading");
      options.observeRead?.(offset, bytesRead);
      let start = 0;
      for (let newline = bytes.indexOf(10); newline >= 0 && newline < bytesRead; newline = bytes.indexOf(10, start)) {
        pieces.push(bytes.subarray(start, newline));
        const line = Buffer.concat(pieces).toString("utf8"); pieces = [];
        if (line.trim() !== "") {
          const event = parseEvent(line);
          if (event.run !== run || event.seq <= tail.seq) throw new Error("Bag event run or sequence is invalid");
          tail.ledger.add(event); tail.seq = event.seq;
        }
        tail.offset = offset + newline + 1; start = newline + 1;
        if (++count % 16 === 0) await yieldImmediate();
      }
      if (start < bytesRead) pieces.push(bytes.subarray(start, bytesRead));
      offset += bytesRead;
    }
  }

  async function read(run: string): Promise<BagHistory> {
    // eventsPath owns run-id/path validation before any cache filename is constructed.
    const path = eventsPath(root, run);
    await mkdir(directory, { recursive: true });
    const file = await open(path, "r");
    try {
      const before = identityOf(await file.stat());
      // Reloading the compact checkpoint avoids retaining every run's reducer in memory.
      const tail = await restore(run, before);
      const changed = tail.offset < before.size;
      if (changed) await reduce(file, run, tail, before.size);
      const after = identityOf(await stat(path));
      if (!appended(before, after)) throw new Error("Bag source changed during reading");
      tail.identity = before;
      if (changed) await persist(run, tail);
      return { run, throughSeq: tail.seq, ledger: tail.ledger };
    } finally { await file.close(); }
  }

  return run => {
    let pending = active.get(run);
    if (pending === undefined) {
      pending = read(run).finally(() => { active.delete(run); }); active.set(run, pending);
    }
    return pending;
  };
}
