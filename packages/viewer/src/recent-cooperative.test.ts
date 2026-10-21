import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { START, Log, state, assistant, tAt } from "../test-support/events.js";
import { readRecentEvents, readRecentEventsAsync, RECENT_SLICE_LINES } from "./runs.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(tail = ""): {root: string; path: string} {
  const root = mkdtempSync(join(tmpdir(), "recent-cooperative-")); roots.push(root);
  mkdirSync(join(root, "sample"));
  const log = new Log(); log.add(0, START); log.add(1, { type: "turn_start", turn:1, context:{messages:1,images:0,est_tokens:10} }); log.add(1, state()); log.add(2, { type: "turn_start", turn:2, context:{messages:2,images:0,est_tokens:20} }); log.add(2, {...state(),turn:2});
  const path = join(root, "sample", "events.jsonl");
  writeFileSync(path, log.events.map(e => JSON.stringify({...e,run:"sample"})).join("\n")+"\n"+tail);
  return {root,path};
}

it("yields between bounded validation slices and retains identical events and atomic tail cursor", async () => {
  const {root} = fixture('{"partial');
  expect(RECENT_SLICE_LINES).toBe(16);
  const expected = readRecentEvents(root, "sample", 1);
  const cursor = {offset:0};
  let yielded = false;
  setImmediate(() => { yielded = true; });
  const result = await readRecentEventsAsync(root, "sample", 1, 1 << 20, cursor, 2);
  expect(yielded).toBe(true);
  expect(result).toEqual(expected);
  expect(cursor.offset).toBe(Buffer.byteLength(writeBody(root).slice(0,writeBody(root).lastIndexOf("\n")+1)));
});

function writeBody(root: string): string {
  // The snapshot boundary must not include a partial append.
  return readFileSync(join(root,"sample","events.jsonl"),"utf8");
}

it("keeps strict malformed-line and foreign-run rejection before sending a head", async () => {
  const a = fixture('{broken}\n');
  await expect(readRecentEventsAsync(a.root,"sample",30,1<<20,undefined,2)).rejects.toThrow(/recent event/);
  const b = fixture(JSON.stringify({...START,run:"foreign",v:1,seq:99,t:"2026-10-21T12:00:00.000-04:00",turn:3})+"\n");
  await expect(readRecentEventsAsync(b.root,"sample",30,1<<20,undefined,2)).rejects.toThrow(/foreign/);
});


it("keeps a UTF-8 line spanning read chunks and excludes appends/replacement after the frozen snapshot", async () => {
  // One valid event crosses the 64 KiB read quantum; the 8 MiB history cap is not filled.
  const large = {...assistant({thinking:"é".repeat(40_000),turn:2}),v:1,run:"sample",seq:5,t:tAt(3)};
  const {root,path} = fixture(`${JSON.stringify(large)}\n`);
  const expected = readRecentEvents(root,"sample");
  const size = Buffer.byteLength(readFileSync(path,"utf8"));
  setImmediate(() => {
    appendFileSync(path, `${JSON.stringify({...large,seq:6})}\n`);
    renameSync(path,`${path}.old`);
    writeFileSync(path,"replaced with invalid input\n");
  });
  const cursor = {offset:0};
  expect(await readRecentEventsAsync(root,"sample",30,1<<20,cursor,2)).toEqual(expected);
  expect(cursor.offset).toBe(size);
});

it("stops at the first cooperative cancellation and closes its snapshot descriptor", async () => {
  const large = {...assistant({thinking:"é".repeat(40_000),turn:2}),v:1,run:"sample",seq:5,t:tAt(3)};
  const {root} = fixture(`${JSON.stringify(large)}\n`);
  const read = vi.spyOn(fs,"readSync");
  const close = vi.spyOn(fs,"closeSync");
  let cancelled = false;
  let readsAtCancel = 0;
  setImmediate(() => { cancelled = true; readsAtCancel = read.mock.calls.length; });
  expect(await readRecentEventsAsync(root,"sample",30,1<<20,undefined,2,() => cancelled)).toEqual([]);
  expect(readsAtCancel).toBeGreaterThan(0);
  expect(read.mock.calls.length).toBe(readsAtCancel);
  expect(close).toHaveBeenCalledTimes(2);
});
