import { closeSync, existsSync, lstatSync, openSync, readSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunEvent } from "@pokebench/agent/events";
import { readWorkbenchSnapshot } from "./workbench-reader.js";

const prefixPath = (eventsPath: string): string => join(dirname(eventsPath), "restoration-prefix.jsonl");
// Prefix bytes are immutable. Metadata participates in both summary and incremental cache identity.
export function restorationSignature(eventsPath: string): string {
  const path = prefixPath(eventsPath);
  if (!existsSync(path)) return "";
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Restoration prefix is not a regular file");
  return `:restoration:${String(stat.dev)}:${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ctimeMs)}`;
}
export function restorationNextSequence(eventsPath: string, start: Extract<RunEvent, { type: "run_start" }>): number {
  const bound = start.restoration;
  if (bound === undefined) return 1;
  if (start.start_state.kind !== "save_state" || bound.source_run === start.run || bound.source_turn < 1 || !Number.isSafeInteger(bound.prefix_last_seq + 1)) throw new Error("Invalid restoration provenance");
  const path = prefixPath(eventsPath), signature = restorationSignature(eventsPath);
  if (signature === "") throw new Error("Restoration prefix is missing");
  let expected = 0, previousMs = -Infinity;
  const snapshot = readWorkbenchSnapshot(path, event => {
    const ms = Date.parse(event.t);
    if (event.run !== bound.source_run || event.seq !== expected || !Number.isFinite(ms) || ms < previousMs || ms > Date.parse(start.t) || (event.seq === 0) !== (event.type === "run_start") || event.type === "run_end" || event.turn > bound.source_turn) throw new Error("Restoration prefix identity or order is invalid");
    expected++; previousMs = ms;
  });
  // The streaming reader deliberately ignores torn final lines for live logs; a prefix must be complete.
  const fd = openSync(path, "r");
  try {
    const last = Buffer.alloc(1);
    if (snapshot.bytes === 0 || readSync(fd, last, 0, 1, snapshot.bytes - 1) !== 1 || last[0] !== 10) throw new Error("Restoration prefix is incomplete");
  } finally { closeSync(fd); }
  if (snapshot.sha256 !== bound.prefix_sha256 || expected !== bound.prefix_last_seq + 1 || signature !== restorationSignature(eventsPath)) throw new Error("Restoration prefix does not match bound identity");
  return expected;
}
