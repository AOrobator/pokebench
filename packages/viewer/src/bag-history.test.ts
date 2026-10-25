import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bagRun, itemChange, resources } from "../test-support/bag.js";
import { state } from "../test-support/events.js";
import { headline } from "./bag.js";
import { createBagHistoryReader } from "./bag-history.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pb-bag-history-")); roots.push(root);
  const log = bagRun(), run = log.events[0]?.run ?? "missing";
  mkdirSync(join(root, run)); const path = join(root, run, "events.jsonl");
  writeFileSync(path, log.events.map(e => JSON.stringify(e)).join("\n") + "\n");
  return { root, log, run, path };
}

describe("saved incremental bag history", () => {
  it("builds full history once, reuses the saved summary across readers, and tails only new complete lines", async () => {
    const { root, log, run, path } = fixture(); const reads: number[] = [];
    const options = { observeRead: (offset: number) => { reads.push(offset); }, chunkBytes: 97 };
    const read = createBagHistoryReader(root, options);
    const [a, b] = await Promise.all([read(run), read(run)]);
    expect(a).toBe(b); expect(headline(a.ledger)).toEqual({ gained: 7, used: 1, spent: 200, buys: 1 });
    const end = Buffer.byteLength(readFileSync(path)); reads.length = 0;
    await read(run); expect(reads).toEqual([]);
    const restarted = createBagHistoryReader(root, options);
    expect(headline((await restarted(run)).ledger)).toEqual(headline(a.ledger)); expect(reads).toEqual([]);
    const change = JSON.stringify(log.add(9000, itemChange(90, 4, "POKé BALL", 5, 4)));
    appendFileSync(path, change.slice(0, -4)); await restarted(run);
    expect(reads[0]).toBe(end); reads.length = 0;
    appendFileSync(path, change.slice(-4) + "\n" + JSON.stringify(log.add(9100, state({ turn: 90, resources: resources([[4, 4, "poke_balls", "POKé BALL"]]) }))) + "\n");
    expect(headline((await restarted(run)).ledger).used).toBe(2);
    expect(Math.min(...reads)).toBe(end);
    expect((await createBagHistoryReader(root)(run)).ledger.lastTurn).toBe(90);
  });

  it("rebuilds after replacement and truncation and rejects wrong-run or corrupt source events", async () => {
    const { root, run, path, log } = fixture(); const read = createBagHistoryReader(root);
    await read(run);
    const prefix = log.events.slice(0, 2).map(e => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(path + ".new", prefix); renameSync(path + ".new", path);
    expect(headline((await read(run)).ledger).gained).toBe(0);
    writeFileSync(path, ""); expect((await read(run)).ledger.recorded).toBe(false);
    appendFileSync(path, JSON.stringify({ ...log.events[0], run: "wrong" }) + "\n");
    await expect(read(run)).rejects.toThrow(/run/i);
    writeFileSync(path, "broken\n"); await expect(read(run)).rejects.toThrow();
  });
});
