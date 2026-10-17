// Raw-RAM archives in the recorder's format, for tests of values recovered from them.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export type RamBytes = readonly (readonly [number, readonly number[]])[];
export const SAVE1 = 0x02025a18;
const u16 = (v: number): number[] => [v & 255, v >> 8];
// The bytes route103_rival reads: save block pointer, opponent id, battle type, the 535 defeat flag, Oldale state.
export function rivalRam(fight: boolean, won: boolean, oldale = 0): RamBytes {
  return [
    [0x03005d8c, [0x18, 0x5a, 0x02, 0x02]],
    [0x02038bca, u16(fight ? 535 : 0)],
    [0x02022fec, [fight ? 8 : 0, 0, 0, 0]],
    [SAVE1 + 0x1270 + (0x717 >> 3), [won ? 1 << (0x717 & 7) : 0]],
    [SAVE1 + 0x139c + 2 * (0x40c7 - 0x4000), u16(oldale)],
  ];
}
export function writeArchive(runDir: string, n: number, set: RamBytes): { v: 1; sequence: number; frame: number; path: string; sha256: string } {
  const ewram = Buffer.alloc(0x40000), iwram = Buffer.alloc(0x8000);
  for (const [address, bytes] of set) {
    if (address >= 0x03000000) iwram.set(bytes, address - 0x03000000); else ewram.set(bytes, address - 0x02000000);
  }
  const region = (name: string, address: number, data: Buffer) => ({ name, address, size: data.length, data_base64: data.toString("base64"), sha256: createHash("sha256").update(data).digest("hex") });
  const body = gzipSync(JSON.stringify({ v: 1, sequence: n, frame: n, regions: [region("ewram", 0x02000000, ewram), region("iwram", 0x03000000, iwram)] }));
  const path = `raw-ram/${String(n).padStart(8, "0")}.json.gz`;
  mkdirSync(join(runDir, "raw-ram"), { recursive: true });
  writeFileSync(join(runDir, path), body);
  return { v: 1, sequence: n, frame: n, path, sha256: createHash("sha256").update(body).digest("hex") };
}
