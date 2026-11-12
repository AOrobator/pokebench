import {readRecentEventsAsync} from "./runs.js";
import { glob, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { createGatewayThinking } from "./gateway-thinking.js";
const MAX_BYTES = 8 * 1024 * 1024;
async function textFile(path: string): Promise<string | null> {
 try {
  const file = await open(path, "r");
  try {
   const info = await file.stat(); if (!info.isFile() || info.size > MAX_BYTES) return null;
   const buffer = Buffer.alloc(info.size); const { bytesRead } = await file.read(buffer, 0, info.size, 0);
   return buffer.toString("utf8", 0, bytesRead);
  } finally { await file.close(); }
 } catch { return null; }
}
export function gatewayThinkingDisk(runsRoot: string) {
 const cached = new Map<string, { signature: string; text: string }>();
 return createGatewayThinking({
  now: Date.now,
  async assistant(run, turn) {
   try { return (await readRecentEventsAsync(runsRoot, run, 64, MAX_BYTES)).findLast(event => event.type === "assistant" && event.turn === turn) ?? null; } catch { return null; }
  },
  async sources() {
   const sources: { key: string; text: string }[] = [];
   for await (const path of glob(["*/bridge/calls.jsonl", "launch-receipts/*/bridge/calls.jsonl", "probes/*/bridge/calls.jsonl"], { cwd: runsRoot })) {
    const full = join(runsRoot, path);
    try {
     const info = await stat(full), signature = `${String(info.ino)}:${String(info.size)}:${String(info.mtimeMs)}`;
     const known = cached.get(full), text = known?.signature === signature ? known.text : await textFile(full);
     if (text === null) continue;
     cached.set(full, { signature, text }); sources.push({ key: full, text });
    } catch { /* Missing archives leave recorded thinking unchanged. */ }
   }
   const active = new Set(sources.map(source => source.key));
   for (const key of cached.keys()) if (!active.has(key)) cached.delete(key);
   return sources;
  },
  transcript: (key, record) => textFile(join(key, "..", "calls", record)),
 });
}
