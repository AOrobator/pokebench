import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { START, Log, state } from "../test-support/events.js";
import { readRecentEvents, readRecentEventsAsync, RECENT_SLICE_LINES } from "./runs.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
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
