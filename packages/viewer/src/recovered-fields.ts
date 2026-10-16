// route103_rival recovered from a run's raw-RAM archives by `just backfill-route103`, kept beside
// its log in derived/route103_rival.jsonl. The log itself never changes; readers attach the value
// to the state events that lack it, and RunView derives the rival splits from them.
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { RunEvent } from "@pokebench/agent/events";

const closed = { additionalProperties: false };
const RivalSchema = Type.Object({ battle_active: Type.Boolean(), defeated: Type.Boolean(), oldale_stage: Type.Union([Type.Integer({ minimum: 0, maximum: 2 }), Type.Null()]) }, closed);
const HeaderSchema = Type.Object({ v: Type.Literal(1), run: Type.String(), source: Type.Literal("raw-ram-route103-v1") }, closed);
const RowSchema = Type.Object({ seq: Type.Integer({ minimum: 0 }), raw_ram: Type.String({ pattern: "^raw-ram/[0-9]{8,}\\.json\\.gz$" }), sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }), route103_rival: RivalSchema }, closed);
export type RecoveredRival = Static<typeof RivalSchema>;
const MAX_BYTES = 64 * 1024 * 1024;

// An empty map when the file is missing, too large, for another run, or has any malformed row.
export function loadRecoveredRival(runDir: string): ReadonlyMap<number, RecoveredRival> {
  const path = join(runDir, "derived", "route103_rival.jsonl");
  const none = new Map<number, RecoveredRival>();
  if (!existsSync(path) || statSync(path).size > MAX_BYTES) return none;
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "");
  const parse = (line: string): unknown => { try { return JSON.parse(line); } catch { return null; } };
  const header = parse(lines[0] ?? "");
  if (!Value.Check(HeaderSchema, header) || header.run !== basename(runDir)) return none;
  const recovered = new Map<number, RecoveredRival>();
  for (const line of lines.slice(1)) {
    const row = parse(line);
    if (!Value.Check(RowSchema, row) || recovered.has(row.seq)) return none;
    recovered.set(row.seq, row.route103_rival);
  }
  return recovered;
}

export function withRecovered(event: RunEvent, recovered: ReadonlyMap<number, RecoveredRival>): RunEvent {
  if (event.type !== "state" || !("started" in event) || event.route103_rival !== undefined) return event;
  const value = recovered.get(event.seq);
  return value === undefined ? event : { ...event, route103_rival: value };
}
