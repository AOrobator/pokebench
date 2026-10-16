// route103_rival recovered from a run's raw-RAM archives by `just backfill-route103`, kept beside
// its log in derived/route103_rival.jsonl. The log itself never changes; readers attach the value
// to the state events that lack it, and RunView derives the rival splits from them.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { RunEvent } from "@pokebench/agent/events";

const closed = { additionalProperties: false };
const RivalSchema = Type.Object({ battle_active: Type.Boolean(), defeated: Type.Boolean(), oldale_stage: Type.Union([Type.Integer({ minimum: 0, maximum: 2 }), Type.Null()]) }, closed);
const HeaderSchema = Type.Object({ v: Type.Literal(1), run: Type.String(), source: Type.Literal("raw-ram-route103-v1") }, closed);
const RowSchema = Type.Object({ seq: Type.Integer({ minimum: 0 }), raw_ram: Type.String({ pattern: "^raw-ram/[0-9]{8,}\\.json\\.gz$" }), sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }), route103_rival: RivalSchema }, closed);
export type RecoveredRival = Static<typeof RivalSchema>;
// The value plus the raw-RAM receipt it was decoded from; it attaches only to the state with that receipt.
// `trainerRival` is set on rows re-decoded from their snapshot: a trainer battle against a Route 103 rival.
export interface RecoveredEntry { readonly rival: RecoveredRival; readonly raw_ram: string; readonly sha256: string; readonly trainerRival?: boolean }
const PLACES = new Set(["ROUTE103", "ROUTE 103", "OLDALE TOWN"]);
const sidePath = (runDir: string): string => join(runDir, "derived", "route103_rival.jsonl");
const MAX_BYTES = 64 * 1024 * 1024;

// Part of a run's cache identity, so writing, changing or removing the side file re-grades the run.
export function recoveredSignature(runDir: string): string {
  const path = sidePath(runDir);
  if (!existsSync(path)) return "";
  const stat = statSync(path);
  return stat.size > MAX_BYTES ? `:recovered=oversize:${String(stat.size)}:${String(stat.mtimeMs)}` : `:recovered=${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

// An empty map when the file is missing, too large, for another run, or has any malformed row.
// The values route103_rival.py reads, decoded from one archive in the recorder's format; null when the
// archive is missing, a symlink, oversized, fails its file or region SHA-256, or has no valid save block.
const RIVAL_TRAINERS = [520, 523, 526, 529, 532, 535];
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
interface Decoded { readonly trainerRival: boolean; readonly defeated: boolean; readonly oldale_stage: number | null }
export function decodeArchive(runDir: string, rawRam: string, sha256: string): Decoded | null {
  const path = join(runDir, rawRam);
  try {
    if (lstatSync(join(runDir, "raw-ram")).isSymbolicLink() || lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_ARCHIVE_BYTES) return null;
    const body = readFileSync(path);
    if (createHash("sha256").update(body).digest("hex") !== sha256) return null;
    const value: unknown = JSON.parse(gunzipSync(body, { maxOutputLength: MAX_ARCHIVE_BYTES }).toString("utf8"));
    if (typeof value !== "object" || value === null || !("regions" in value) || !Array.isArray(value.regions)) return null;
    const region = (address: number, size: number): Buffer | null => {
      for (const r of value.regions as unknown[]) {
        if (typeof r !== "object" || r === null || !("address" in r) || r.address !== address || !("size" in r) || r.size !== size || !("data_base64" in r) || typeof r.data_base64 !== "string" || !("sha256" in r)) continue;
        const data = Buffer.from(r.data_base64, "base64");
        return data.length === size && createHash("sha256").update(data).digest("hex") === r.sha256 ? data : null;
      }
      return null;
    };
    const ewram = region(0x02000000, 0x40000), iwram = region(0x03000000, 0x8000);
    if (ewram === null || iwram === null) return null;
    const save1 = iwram.readUInt32LE(0x5d8c) - 0x02000000;
    if (save1 < 0 || save1 > 0x40000 - 0x159c) return null;
    const flag = (n: number): boolean => ((ewram[save1 + 0x1270 + (n >> 3)] ?? 0) >> (n & 7) & 1) === 1;
    const stage = ewram.readUInt16LE(save1 + 0x139c + 2 * (0x40c7 - 0x4000));
    return {
      trainerRival: (ewram.readUInt32LE(0x22fec) & (1 << 3)) !== 0 && RIVAL_TRAINERS.includes(ewram.readUInt16LE(0x38bca)),
      defeated: RIVAL_TRAINERS.some((t) => flag(0x500 + t)),
      oldale_stage: stage <= 2 ? stage : null,
    };
  } catch {
    return null;
  }
}

export function loadRecoveredRival(runDir: string): ReadonlyMap<number, RecoveredEntry> {
  const path = sidePath(runDir);
  const none = new Map<number, RecoveredEntry>();
  if (!existsSync(path) || lstatSync(join(runDir, "derived")).isSymbolicLink() || lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_BYTES) return none;
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "");
  const parse = (line: string): unknown => { try { return JSON.parse(line); } catch { return null; } };
  const header = parse(lines[0] ?? "");
  if (!Value.Check(HeaderSchema, header) || header.run !== basename(runDir)) return none;
  // Only a row that changes a value can start a split, so each one is re-decoded from its own
  // snapshot; any disagreement voids the file. Repeated rows carry an already-checked value.
  const recovered = new Map<number, RecoveredEntry>();
  let previous: RecoveredRival | null = null;
  for (const line of lines.slice(1)) {
    const row = parse(line);
    if (!Value.Check(RowSchema, row) || recovered.has(row.seq)) return none;
    const rival = row.route103_rival;
    const changed = previous === null || rival.battle_active !== previous.battle_active || rival.defeated !== previous.defeated || rival.oldale_stage !== previous.oldale_stage;
    let trainerRival: boolean | undefined;
    if (changed) {
      const decoded = decodeArchive(runDir, row.raw_ram, row.sha256);
      if (decoded === null || decoded.defeated !== rival.defeated || decoded.oldale_stage !== rival.oldale_stage || (rival.battle_active && !decoded.trainerRival)) return none;
      trainerRival = decoded.trainerRival;
    }
    recovered.set(row.seq, { rival, raw_ram: row.raw_ram, sha256: row.sha256, ...(trainerRival === undefined ? {} : { trainerRival }) });
    previous = rival;
  }
  return recovered;
}

export function withRecovered(event: RunEvent, recovered: ReadonlyMap<number, RecoveredEntry>): RunEvent {
  if (event.type !== "state" || !("started" in event) || event.route103_rival !== undefined) return event;
  const entry = recovered.get(event.seq);
  if (entry === undefined || event.raw_ram?.path !== entry.raw_ram || event.raw_ram.sha256 !== entry.sha256 || !PLACES.has(event.location ?? "")) return event;
  if (entry.trainerRival !== undefined && entry.rival.battle_active !== (event.in_battle && entry.trainerRival)) return event;
  return { ...event, route103_rival: entry.rival };
}
