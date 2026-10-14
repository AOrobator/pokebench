import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { Log, START } from "../test-support/events.js";
import { reduceWorkbenchLog } from "./workbench-reader.js";
function path(bytes: string): string { const p = join(mkdtempSync(join(tmpdir(), "wb-reader-")), "events.jsonl"); writeFileSync(p, bytes); return p; }
function bytes(): string { const log = new Log(); log.add(0, { ...START, model: { ...START.model, id: "Pokémon · measured" } }); return log.events.map(e => JSON.stringify(e)).join("\n") + "\n"; }
describe("bounded streaming workbench log", () => {
  it("reduces exact production events across tiny multibyte chunk boundaries with a raw-byte hash", () => {
    const raw = bytes(), seen: RunEvent[] = [];
    const digest = reduceWorkbenchLog(path(raw), e => { seen.push(e); }, { chunkBytes: 7, lineBytes: 10000, maxBytes: 10000 });
    expect(seen).toHaveLength(1); expect(seen[0]?.type === "run_start" && seen[0].model.id).toBe("Pokémon · measured");
    expect(digest).toBe(createHash("sha256").update(raw).digest("hex"));
  });
  it("does not grade a partial final line and hashes the full source snapshot", () => {
    const raw = bytes() + '{"notComplete":', seen: RunEvent[] = [];
    const p = path(raw); expect(reduceWorkbenchLog(p, e => { seen.push(e); })).toBe(createHash("sha256").update(readFileSync(p)).digest("hex"));
    expect(seen).toHaveLength(1);
  });
  it("rejects source mutation during a reduction instead of caching mixed records", () => {
    const p = path(bytes());
    expect(() => reduceWorkbenchLog(p, () => { appendFileSync(p, "\\n"); })).toThrow("changed");
    const q = path(bytes() + bytes());
    expect(() => reduceWorkbenchLog(q, () => { truncateSync(q, 0); }, { chunkBytes: Buffer.byteLength(bytes()) })).toThrow("changed");
    expect(() => reduceWorkbenchLog(path("x".repeat(30)), () => {}, { lineBytes: 10, chunkBytes: 7 })).toThrow("line");
    expect(reduceWorkbenchLog(path("\n" + bytes()), () => {})).toHaveLength(64);
  });
  it("rejects byte and line overflows, malformed lines and consumer failures without hiding them", () => {
    expect(() => reduceWorkbenchLog(path(bytes()), () => {}, { maxBytes: 10 })).toThrow("bound");
    expect(() => reduceWorkbenchLog(path(bytes()), () => {}, { lineBytes: 10, chunkBytes: 7 })).toThrow("line");
    expect(() => reduceWorkbenchLog(path(bytes() + '{"bad":true}\n'), () => {})).toThrow("line 2");
    expect(() => reduceWorkbenchLog(path(bytes()), () => { throw new Error("consumer failed"); })).toThrow("consumer failed");
    expect(reduceWorkbenchLog(path(""), () => {})).toBe(createHash("sha256").digest("hex"));
    expect(() => reduceWorkbenchLog(path(bytes()), () => {}, { chunkBytes: 0 })).toThrow("positive");
  });
});
