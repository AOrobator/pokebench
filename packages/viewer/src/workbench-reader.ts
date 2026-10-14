import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
export interface ReadLimits { maxBytes?: number; lineBytes?: number; chunkBytes?: number }
export function reduceWorkbenchLog(path: string, consume: (event: RunEvent) => void, limits: ReadLimits = {}): string {
  const maxBytes = limits.maxBytes ?? 512 * 1024 * 1024, lineBytes = limits.lineBytes ?? 1024 * 1024, chunkBytes = limits.chunkBytes ?? 64 * 1024;
  if (![maxBytes, lineBytes, chunkBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Log read limits must be positive safe integers");
  const fd = openSync(path, "r");
  try {
    const before = fstatSync(fd);
    if (before.size > maxBytes) throw new Error("Run log exceeds the streaming byte bound; no split graded");
    const hash = createHash("sha256"), chunk = Buffer.alloc(Math.min(chunkBytes, maxBytes));
    let pending = Buffer.alloc(0), offset = 0, line = 0;
    while (offset < before.size) {
      const count = readSync(fd, chunk, 0, Math.min(chunk.length, before.size - offset), offset);
      if (count === 0) throw new Error("Run log changed during reduction; snapshot unavailable");
      offset += count; const bytes = chunk.subarray(0, count); hash.update(bytes);
      const joined: Buffer = pending.length === 0 ? bytes : Buffer.concat([pending, bytes]);
      let start = 0;
      for (let end = joined.indexOf(0x0a); end >= 0; end = joined.indexOf(0x0a, start)) {
        if (end - start > lineBytes) throw new Error("Run log line exceeds the streaming line bound");
        line += 1; const text = joined.subarray(start, end).toString("utf8"); start = end + 1;
        if (text.trim() !== "") {
          let event: RunEvent;
          try { event = parseEvent(text); } catch (error) { throw new Error(`line ${String(line)}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
          consume(event);
        }
      }
      pending = Buffer.from(joined.subarray(start));
      if (pending.length > lineBytes) throw new Error("Run log line exceeds the streaming line bound");
    }
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error("Run log changed during reduction; snapshot unavailable");
    return hash.digest("hex");
  } finally { closeSync(fd); }
}
