import * as fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Log, START, assistant } from "../test-support/events.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const viewers: Viewer[] = [], roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const viewer of viewers.splice(0)) await viewer.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const END = { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 9000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } } as const;

function longRun(count: number, thinking = "Press A to start."): Log {
  const log = new Log();
  log.add(0, START);
  for (let i = 0; i < count; i++) log.add(1000 + i, assistant({ thinking }));
  log.add(9000, END);
  return log;
}
async function serve(id: string, log: Log, streamChunkBytes: number): Promise<Viewer> {
  const base = mkdtempSync(join(tmpdir(), "viewer-stream-"));
  roots.push(base);
  const runsRoot = join(base, "runs");
  mkdirSync(join(runsRoot, id), { recursive: true });
  writeFileSync(join(runsRoot, id, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
  const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, pollMs: 10, streamChunkBytes });
  viewers.push(viewer);
  return viewer;
}
const events = (text: string): unknown[] => [...text.matchAll(/^event: ev\ndata: (.*)$/gm)].map((m) => JSON.parse(m[1] ?? "null") as unknown);

it("streams a log many chunks long in order, then caught_up and done", async () => {
  const log = longRun(400);
  const viewer = await serve("long", log, 512);
  const text = await (await fetch(new URL("api/runs/long/events", viewer.url))).text();
  expect(events(text)).toEqual(log.events.map((e) => ({ ...e, run: "long" })));
  expect(text.indexOf("event: caught_up")).toBeGreaterThan(text.lastIndexOf("event: ev"));
  expect(text.trimEnd().endsWith("event: done\ndata: {}")).toBe(true);
});

it("reads a long log in steps that let the event loop run between them", async () => {
  const viewer = await serve("long", longRun(3000), 4096);
  let ticks = 0, running = true;
  const tick = (): void => { ticks += 1; if (running) setImmediate(tick); };
  setImmediate(tick);
  const seen: number[] = [];
  const read = fs.readSync;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => { seen.push(ticks); return read(...args); }));
  const text = await (await fetch(new URL("api/runs/long/events", viewer.url))).text();
  running = false;
  expect(text).toContain("event: done");
  expect(new Set(seen).size).toBeGreaterThan(10);
  expect((await fetch(new URL("api/runs", viewer.url))).status).toBe(200);
});

it("delivers a line longer than the chunk whole", async () => {
  const log = longRun(3, "x".repeat(5000));
  const viewer = await serve("wide", log, 256);
  const text = await (await fetch(new URL("api/runs/wide/events", viewer.url))).text();
  expect(events(text)).toEqual(log.events.map((e) => ({ ...e, run: "wide" })));
  expect(text).toContain("event: done");
});

it("stops reading once a client abandons a long stream, and keeps serving", async () => {
  const viewer = await serve("long", longRun(30000), 65536);
  const read = fs.readSync;
  let reads = 0;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => { reads += 1; return read(...args); }));
  const abort = new AbortController();
  const reply = await fetch(new URL("api/runs/long/events", viewer.url), { signal: abort.signal });
  await reply.body?.getReader().read();
  abort.abort();
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  const after = reads;
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  expect(reads).toBe(after);
  vi.restoreAllMocks();
  expect((await fetch(new URL("api/runs", viewer.url))).status).toBe(200);
  expect(await (await fetch(new URL("api/runs/long/events", viewer.url))).text()).toContain("event: done");
});

it("answers another request while a stream waits on a slow reader, and stops reading meanwhile", async () => {
  const log = longRun(30000);
  const viewer = await serve("long", log, 65536);
  const read = fs.readSync;
  let reads = 0;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => { reads += 1; return read(...args); }));
  const reply = await fetch(new URL("api/runs/long/events", viewer.url));
  const reader = reply.body?.getReader();
  await reader?.read();
  const list = await fetch(new URL("api/runs", viewer.url));
  expect(list.status).toBe(200);
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  const paused = reads, size = fs.statSync(join(roots.at(-1) ?? "", "runs", "long", "events.jsonl")).size;
  expect(paused).toBeLessThan(size / 65536 / 2);
  let text = "";
  const decoder = new TextDecoder();
  for (;;) { const chunk = await reader?.read(); if (chunk === undefined || chunk.done) break; text += decoder.decode(chunk.value, { stream: true }); }
  expect(text).toContain("event: done");
  expect(reads).toBeGreaterThan(paused);
});

it("writes nothing more after a write reports a full socket, until drain", async () => {
  const viewer = await serve("long", longRun(200), 1 << 20);
  const original = Reflect.get(ServerResponse.prototype, "write") as (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) => boolean;
  const streams: ServerResponse[] = [];
  let writes = 0;
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean {
    const ok = Reflect.apply<ServerResponse, Parameters<ServerResponse["write"]>, boolean>(original, this, args);
    if (this.req.url?.endsWith("/events") !== true) return ok;
    streams.push(this); writes += 1;
    return false;
  });
  const reply = fetch(new URL("api/runs/long/events", viewer.url));
  for (let i = 0; i < 20 && streams.length === 0; i++) await new Promise((resolve) => { setTimeout(resolve, 10); });
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  expect(writes).toBe(1);
  streams[0]?.emit("drain");
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  expect(writes).toBe(2);
  vi.restoreAllMocks();
  for (let i = 0; i < 300; i++) streams[0]?.emit("drain");
  expect(await (await reply).text()).toContain("event: done");
});

it("closes only the stream, not the viewer, when a read fails part way through", async () => {
  const viewer = await serve("long", longRun(3000), 4096);
  const read = fs.readSync;
  let reads = 0;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => {
    reads += 1;
    if (reads === 5) throw Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
    return read(...args);
  }));
  const text = await fetch(new URL("api/runs/long/events", viewer.url)).then(async (r) => r.text()).catch(() => "aborted");
  expect(text).not.toContain("event: done");
  vi.restoreAllMocks();
  expect((await fetch(new URL("api/runs", viewer.url))).status).toBe(200);
  expect(await (await fetch(new URL("api/runs/long/events", viewer.url))).text()).toContain("event: done");
});

it.each(["run_end", "caught_up"])("waits for drain after the %s write reports a full socket", async (marker) => {
  const viewer = await serve("short", longRun(2), 1 << 20);
  const original = Reflect.get(ServerResponse.prototype, "write") as (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) => boolean;
  const streams: ServerResponse[] = [], written: string[] = [];
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean {
    const ok = Reflect.apply<ServerResponse, Parameters<ServerResponse["write"]>, boolean>(original, this, args);
    if (this.req.url?.endsWith("/events") !== true) return ok;
    streams.push(this);
    const text = String(args[0]);
    written.push(text);
    return !text.includes(marker === "run_end" ? '"type":"run_end"' : "event: caught_up");
  });
  const reply = fetch(new URL("api/runs/short/events", viewer.url));
  for (let i = 0; i < 20 && !written.some((w) => w.includes(marker === "run_end" ? '"type":"run_end"' : "event: caught_up")); i++) await new Promise((resolve) => { setTimeout(resolve, 10); });
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  const before = written.length;
  expect(written.at(-1)).toContain(marker === "run_end" ? '"type":"run_end"' : "event: caught_up");
  streams[0]?.emit("drain");
  await new Promise((resolve) => { setTimeout(resolve, 30); });
  expect(written.length).toBeGreaterThan(before);
  vi.restoreAllMocks();
  for (let i = 0; i < 5; i++) streams[0]?.emit("drain");
  expect(await (await reply).text()).toContain("event: done");
});

it("still sends lines found after run_end in a later chunk, then done", async () => {
  const log = longRun(5);
  const base = mkdtempSync(join(tmpdir(), "viewer-stream-"));
  roots.push(base);
  const runsRoot = join(base, "runs");
  mkdirSync(join(runsRoot, "after"), { recursive: true });
  const lines = log.events.map((e) => JSON.stringify({ ...e, run: "after" }));
  writeFileSync(join(runsRoot, "after", "events.jsonl"), [...lines, "x".repeat(600), "{not json"].join("\n") + "\n");
  const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, pollMs: 10, streamChunkBytes: 256 });
  viewers.push(viewer);
  const text = await (await fetch(new URL("api/runs/after/events", viewer.url))).text();
  expect(events(text)).toHaveLength(log.events.length);
  expect(text.match(/^event: problem$/gm)).toHaveLength(2);
  expect(text.indexOf("event: done")).toBeGreaterThan(text.lastIndexOf("event: problem"));
});

it("rejects a chunk size that is not a positive integer", async () => {
  await expect(serve("bad", longRun(1), 0)).rejects.toThrow(RangeError);
});

it("still yields between steps when the socket asks the stream to wait for drain", async () => {
  const viewer = await serve("long", longRun(3000), 4096);
  const original = Reflect.get(ServerResponse.prototype, "write") as (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) => boolean;
  const write = (self: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean => Reflect.apply<ServerResponse, Parameters<ServerResponse["write"]>, boolean>(original, self, args);
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean {
    const ok = write(this, ...args);
    if (this.req.url?.endsWith("/events") === true) { process.nextTick(() => this.emit("drain")); return false; }
    return ok;
  });
  let ticks = 0, running = true;
  const tick = (): void => { ticks += 1; if (running) setImmediate(tick); };
  setImmediate(tick);
  const seen: number[] = [];
  const read = fs.readSync;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => { seen.push(ticks); return read(...args); }));
  const text = await (await fetch(new URL("api/runs/long/events", viewer.url))).text();
  running = false;
  expect(text).toContain("event: done");
  expect(new Set(seen).size).toBeGreaterThan(10);
});
