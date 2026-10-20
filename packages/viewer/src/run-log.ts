import { closeSync, openSync, readSync } from "node:fs";

// A six-hour run writes over 1 GB of events, past both the old 512 MiB bound and the longest string Node can build.
export const RUN_LOG_MAX_BYTES = 8 * 1024 * 1024 * 1024;

export type LogLines = string | Iterable<string>;

export function linesOf(log: LogLines): Iterable<string> {
  return typeof log === "string" ? log.split("\n") : log;
}

// The file's lines without their newlines, read in chunks; each pass reopens the file.
export function fileLines(path: string, chunkBytes = 1024 * 1024): Iterable<string> {
  return {
    *[Symbol.iterator]() {
      if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error("Log chunk size must be a positive safe integer");
      const fd = openSync(path, "r");
      try {
        const chunk = Buffer.alloc(chunkBytes);
        let pending = Buffer.alloc(0);
        for (let count = readSync(fd, chunk, 0, chunkBytes, null); count > 0; count = readSync(fd, chunk, 0, chunkBytes, null)) {
          const joined = pending.length === 0 ? chunk.subarray(0, count) : Buffer.concat([pending, chunk.subarray(0, count)]);
          let start = 0;
          for (let end = joined.indexOf(0x0a); end >= 0; end = joined.indexOf(0x0a, start)) {
            yield joined.subarray(start, end).toString("utf8");
            start = end + 1;
          }
          pending = Buffer.from(joined.subarray(start));
        }
        if (pending.length > 0) yield pending.toString("utf8");
      } finally { closeSync(fd); }
    },
  };
}
