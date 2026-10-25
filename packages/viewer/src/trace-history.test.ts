import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Log, START, assistant, RUN } from "../test-support/events.js";
import { readTraceHistory, TRACE_PAGE_BYTES, TRACE_PAGE_TURNS } from "./trace-history.js";
import { startViewer, type Viewer } from "./server.js";
const roots: string[] = [], viewers: Viewer[] = [];
afterEach(async () => { for (const v of viewers.splice(0)) await v.close(); for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function fixture(turns = 5, text = "Read this") {
  const root = mkdtempSync(join(tmpdir(), "trace-page-")); roots.push(root);
  mkdirSync(join(root, RUN));
  const log = new Log(); log.add(0, START);
  for (let turn = 1; turn <= turns; turn++) log.add(turn, assistant({ turn, thinking: text }));
  const path = join(root, RUN, "events.jsonl");
  writeFileSync(path, log.events.map(e => JSON.stringify(e)).join("\n") + "\n");
  return { root, log, path };
}
it("pages backward without gaps or duplicates, bounded by an injected tiny turn limit", async () => {
  const { root, log } = fixture();
  let before: number | null = log.events.length;
  const pages = [];
  while (before !== null) {
    const page = await readTraceHistory(root, RUN, before, { maxTurns: 2 });
    expect(page.events.length).toBeLessThanOrEqual(2);
    expect(page.events.every(e => e.seq < (before ?? 0))).toBe(true);
    pages.unshift(...page.events);
    before = page.before;
  }
  expect(pages).toEqual(log.events);
  expect(await readTraceHistory(root, RUN, 0)).toEqual({ run: RUN, before: null, events: [] });
});
it("bounds a large recording by bytes, handles multibyte text and incomplete appends", async () => {
  const { root, log, path } = fixture(7, "é漢".repeat(50));
  appendFileSync(path, '{"v":1,"unfinished":');
  const page = await readTraceHistory(root, RUN, 9999, { maxBytes: 2000 });
  expect(Buffer.byteLength(JSON.stringify(page.events))).toBeLessThan(2000);
  expect(page.events.at(-1)).toEqual(log.events.at(-1));
  expect(page.events).toEqual(log.events.slice(page.before ?? 0));
  const earlier = await readTraceHistory(root, RUN, page.before ?? 0, { maxBytes: 2000 });
  expect(earlier.events.at(-1)?.seq).toBe((page.before ?? 0) - 1);
});
it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN])("rejects invalid cursor %s", async before => {
  const { root } = fixture(1);
  await expect(readTraceHistory(root, RUN, before)).rejects.toThrow("cursor");
});
it("fails explicitly for oversized or corrupt records and foreign runs", async () => {
  const { root, path } = fixture(1, "x".repeat(2100));
  await expect(readTraceHistory(root, RUN, 2, { maxBytes: 2000 })).rejects.toThrow("page size");
  writeFileSync(path, "invalid json\n");
  await expect(readTraceHistory(root, RUN, 2)).rejects.toThrow();
  const foreign = new Log(); foreign.add(0, START);
  writeFileSync(path, JSON.stringify({ ...foreign.events[0], run: "foreign" }) + "\n");
  await expect(readTraceHistory(root, RUN, 1)).rejects.toThrow("another run");
});
it("rejects disordered events instead of returning a misleading cursor", async () => {
  const { root, log, path } = fixture(3);
  writeFileSync(path, [log.events[0], log.events[2], log.events[1], log.events[3]].map(e => JSON.stringify(e)).join("\n") + "\n");
  await expect(readTraceHistory(root, RUN, 999)).rejects.toThrow("sequence");
});
it("serves bounded pages through the real read-only endpoint and rejects invalid input", async () => {
  const { root, log } = fixture(20);
  const viewer = await startViewer({ runsRoot: root, staticDir: root, appDir: root, port: 0 }); viewers.push(viewer);
  const base = `${viewer.url}api/runs/${RUN}/trace-history`;
  const response = await fetch(`${base}?before=10`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ run: RUN, events: log.events.slice(0, 10), before: null });
  for (const query of ["", "?before=-1", "?before=1.5", "?before=9007199254740992"]) expect((await fetch(base + query)).status).toBe(400);
  expect((await fetch(`${viewer.url}api/runs/missing/trace-history?before=1`)).status).toBe(404);
});

it("pins production page defaults independently of tiny-limit fixtures", () => {
  expect(TRACE_PAGE_BYTES).toBe(4 * 1024 * 1024);
  expect(TRACE_PAGE_TURNS).toBe(50);
});
it.each([{ maxBytes: 0 }, { maxBytes: 1.5 }, { maxTurns: 0 }, { maxTurns: NaN }])("rejects invalid injected limits %s", async limits => {
  const { root } = fixture(1);
  await expect(readTraceHistory(root, RUN, 2, limits)).rejects.toThrow("positive integers");
});

it("rejects a future event inside a disordered prefix at the range guard", async () => {
  const { root, log, path } = fixture(12, "x".repeat(1000));
  const events = log.events.map((event, index) => index === 1 ? { ...event, seq: 100 } : event);
  writeFileSync(path, events.map(event => JSON.stringify(event)).join("\n") + "\n");
  await expect(readTraceHistory(root, RUN, 8)).rejects.toThrow("beyond the requested cursor");
});
