import * as fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Log, START, assistant } from "../test-support/events.js";
import { LogReader } from "./runs.js";
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

it("stops polling once a client abandons an active stream, and keeps serving", async () => {
  const active = longRun(3);
  active.events.pop(); // no run_end: after catch-up the live stream polls for appended events
  const viewer = await serve("long", active, 4096);
  const open = fs.openSync;
  let reads = 0;
  vi.spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => { reads += 1; return open(...args); }));
  await new Promise<void>((resolve, reject) => {
    const request = get(new URL("api/runs/long/events", viewer.url), (reply) => {
      reply.once("data", () => { reply.destroy(); resolve(); });
    });
    request.once("error", reject);
  });
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  const after = reads;
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  expect(reads).toBe(after);
  vi.restoreAllMocks();
  expect((await fetch(new URL("api/runs", viewer.url))).status).toBe(200);
  const short = longRun(2), runsRoot = join(roots.at(-1) ?? "", "runs");
  mkdirSync(join(runsRoot, "short"));
  writeFileSync(join(runsRoot, "short", "events.jsonl"), short.events.map((e) => JSON.stringify({ ...e, run: "short" })).join("\n") + "\n");
  expect(await (await fetch(new URL("api/runs/short/events", viewer.url))).text()).toContain("event: done");
});

it("answers another request while a stream waits on a slow reader, and stops reading meanwhile", async () => {
  const log = longRun(400);
  const viewer = await serve("long", log, 4096);
  const read = fs.readSync;
  let reads = 0;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => { reads += 1; return read(...args); }));
  const write = Reflect.get(ServerResponse.prototype, "write") as (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) => boolean;
  const streams: ServerResponse[] = [];
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean {
    const ok = Reflect.apply<ServerResponse, Parameters<ServerResponse["write"]>, boolean>(write, this, args);
    if (this.req.url?.endsWith("/events") === true && streams.length === 0) { streams.push(this); return false; }
    return ok;
  });
  const reply = await fetch(new URL("api/runs/long/events", viewer.url));
  const reader = reply.body?.getReader();
  await reader?.read();
  const list = await fetch(new URL("api/runs", viewer.url));
  expect(list.status).toBe(200);
  const paused = reads;
  await new Promise((resolve) => { setImmediate(resolve); });
  expect(reads).toBe(paused);
  streams[0]?.emit("drain");
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

it("keeps the event loop responsive through a chunk of many tiny malformed lines", async () => {
  const base = mkdtempSync(join(tmpdir(), "viewer-stream-"));
  roots.push(base);
  const runsRoot = join(base, "runs");
  mkdirSync(join(runsRoot, "junk"), { recursive: true });
  writeFileSync(join(runsRoot, "junk", "events.jsonl"), "x\n".repeat(100_000));
  const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, pollMs: 10, streamChunkBytes: 1 << 20 });
  viewers.push(viewer);
  let last = performance.now(), worst = 0, running = true;
  const tick = (): void => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; if (running) setImmediate(tick); };
  setImmediate(tick);
  const abort = new AbortController();
  const reply = await fetch(new URL("api/runs/junk/events", viewer.url), { signal: abort.signal });
  const reader = reply.body?.getReader();
  let problems = 0, tail = "";
  const decoder = new TextDecoder();
  while (problems < 100_000) {
    const chunk = await reader?.read();
    if (chunk === undefined || chunk.done) break;
    const text = tail + decoder.decode(chunk.value, { stream: true });
    problems += (text.match(/^event: problem$/gm) ?? []).length;
    const cut = text.lastIndexOf("\n\n");
    tail = cut < 0 ? text : text.slice(cut + 2);
    problems -= (tail.match(/^event: problem$/gm) ?? []).length;
  }
  running = false;
  abort.abort();
  expect(problems).toBe(100_000);
  expect(worst).toBeLessThan(250);
});

it.each([
  ["many tiny lines", "x\n".repeat(100_000), 1 << 20, 2000],
  ["one line far longer than the chunk", `${"y".repeat(2_000_000)}\n{not json\n`, 65536, 2000],
  ["valid events in small pieces", longRun(300).events.map((e) => JSON.stringify(e)).join("\n") + "\n", 512, 3],
])("reads each byte of the log once for %s", (_label, body, chunk, perStep) => {
  const base = mkdtempSync(join(tmpdir(), "viewer-stream-"));
  roots.push(base);
  const path = join(base, "events.jsonl");
  writeFileSync(path, body.slice(0, Math.floor(body.length / 2)));
  const read = fs.readSync;
  let bytes = 0;
  vi.spyOn(fs, "readSync").mockImplementation(((...args: Parameters<typeof fs.readSync>) => { const n = read(...args); bytes += n; return n; }));
  const reader = new LogReader(path, chunk);
  let results = 0, consumed = 0;
  const drain = (): void => { for (;;) { const step = reader.next(perStep); if (step.lines === 0) return; expect(step.lines).toBeLessThanOrEqual(perStep); results += step.results.length; consumed += step.lines; } };
  drain();
  fs.appendFileSync(path, body.slice(Math.floor(body.length / 2)));
  drain();
  expect(bytes).toBe(Buffer.byteLength(body));
  const all = body.split("\n").slice(0, -1);
  expect(consumed).toBe(all.length);
  expect(results).toBe(all.filter((line) => line.trim() !== "").length);
});

it("copies a line many chunks long a bounded number of times", () => {
  const base = mkdtempSync(join(tmpdir(), "viewer-stream-"));
  roots.push(base);
  const path = join(base, "events.jsonl");
  const size = 8 << 20;
  writeFileSync(path, `${"z".repeat(size)}\n`);
  const concat = vi.spyOn(Buffer, "concat");
  const step = new LogReader(path, 65536).next(2000);
  expect(step.lines).toBe(1);
  const copied = concat.mock.results.reduce((sum, r) => sum + (r.type === "return" ? r.value.length : 0), 0);
  expect(copied).toBeLessThanOrEqual(2 * (size + 1));
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
