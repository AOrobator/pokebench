import * as fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Log, START, assistant } from "../test-support/events.js";
import * as runs from "./runs.js";
import { LogReader } from "./runs.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("./runs.js", async (original) => ({ ...await original<typeof import("./runs.js")>() }));
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

it("serializes head JSON in slices, stops at backpressure, and preserves the exact event array", async () => {
  const log = longRun(3);
  const viewer = await serve("head-slices", log, 1);
  const original = Reflect.get(ServerResponse.prototype, "write") as (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) => boolean;
  const paused: ServerResponse[] = [];
  const chunks: string[] = [];
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean {
    const ok = Reflect.apply<ServerResponse, Parameters<ServerResponse["write"]>, boolean>(original, this, args);
    if (this.req.url?.endsWith("/head") === true) {
      chunks.push(String(args[0]));
      if (paused.length === 0) { paused.push(this); return false; }
    }
    return ok;
  });
  const response = await fetch(new URL("api/runs/head-slices/head", viewer.url));
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("head response has no body");
  let body = new TextDecoder().decode((await reader.read()).value);
  await new Promise<void>(resolve => { setImmediate(resolve); });
  expect(chunks).toHaveLength(1);
  expect(chunks[0]).not.toContain('"type":"run_end"');
  expect(paused).toHaveLength(1);
  paused[0]?.emit("drain");
  for (;;) { const next = await reader.read(); if (next.done) break; body += new TextDecoder().decode(next.value); }
  expect(body).toBe(JSON.stringify(log.events.map(event => ({...event,run:"head-slices"}))));
  expect(chunks.length).toBe(log.events.length + 1);
});

it("keeps a sliced SSE head as one complete head event before caught_up and done", async () => {
  const log = longRun(3);
  const viewer = await serve("sse-head-slices", log, 1);
  const text = await (await fetch(new URL("api/runs/sse-head-slices/events?head=1", viewer.url))).text();
  const heads = [...text.matchAll(/^event: head\ndata: (.*)$/gm)];
  expect(heads).toHaveLength(1);
  expect(JSON.parse(heads[0]?.[1] ?? "null")).toEqual(log.events.map(event => ({...event,run:"sse-head-slices"})));
  expect(text.indexOf("event: caught_up")).toBeGreaterThan(text.indexOf("event: head"));
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
  writeFileSync(join(runsRoot, "junk", "events.jsonl"), "x\n".repeat(48));
  const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, pollMs: 10, streamChunkBytes: 1 << 20 });
  viewers.push(viewer);
  let ticks = 0, running = true;
  const batches: { tick: number; lines: number; limit: number }[] = [];
  const next: (this: LogReader, limit: number) => ReturnType<LogReader["next"]> = Reflect.get(LogReader.prototype, "next");
  vi.spyOn(LogReader.prototype, "next").mockImplementation(function(this: LogReader, limit: number) {
    const result = next.call(this, limit);
    if (result.lines > 0) batches.push({ tick: ticks, lines: result.lines, limit });
    return result;
  });
  const tick = (): void => { ticks += 1; if (running) setImmediate(tick); };
  setImmediate(tick);
  const abort = new AbortController();
  const reply = await fetch(new URL("api/runs/junk/events", viewer.url), { signal: abort.signal });
  const reader = reply.body?.getReader();
  let problems = 0, tail = "";
  const decoder = new TextDecoder();
  while (problems < 48) {
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
  expect(problems).toBe(48);
  expect(batches.map(({ lines, limit }) => ({ lines, limit }))).toEqual(Array.from({ length: 3 }, () => ({ lines: 16, limit: 16 })));
  expect(batches.map(({ tick }) => tick), JSON.stringify(batches)).toEqual([...new Set(batches.map(({ tick }) => tick))]);
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

it("boots at the recorded head and tails appends without replaying the prefix", async () => {
  const log = new Log();
  log.add(0, START);
  for (let turn = 1; turn <= 40; turn++) {
    log.add(turn * 1000, { type: "turn_start", turn, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(turn * 1000 + 1, assistant({ turn, thinking: `Turn ${String(turn)}` }));
  }
  log.add(50000, END);
  const viewer = await serve("head-first", log, 512);
  const text = await (await fetch(new URL("api/runs/head-first/events?head=1", viewer.url))).text();
  const heads = [...text.matchAll(/^event: head\ndata: (.*)$/gm)].map(m => JSON.parse(m[1] ?? "null") as unknown);
  expect(heads).toHaveLength(1);
  expect(JSON.stringify(heads)).toContain("Turn 40");
  expect(JSON.stringify(heads)).not.toContain('Turn 1"');
  expect(events(text)).toEqual([]);
  expect(text).toContain("event: done");
});


it("tails a line torn across the head cursor exactly once", async () => {
  const log = new Log(); log.add(0, START);
  const viewer = await serve("head-append", log, 128);
  const path = join(roots.at(-1) ?? "", "runs", "head-append", "events.jsonl");
  const fresh = { ...log.add(1000, assistant({ thinking: "Pokémon 🎮" })), run: "head-append" };
  const line = JSON.stringify(fresh) + "\n";
  const cut = line.indexOf("Pokémon") + 4;
  fs.appendFileSync(path, line.slice(0, cut));
  const controller = new AbortController();
  const response = await fetch(new URL("api/runs/head-append/events?head=1", viewer.url), { signal: controller.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("no stream body");
  const decoder = new TextDecoder(); let text = "";
  try {
    while (!text.includes("event: caught_up")) {
      const part = await reader.read(); if (part.done) throw new Error("stream ended before catch-up");
      text += decoder.decode(part.value, { stream: true });
    }
    expect(events(text)).toEqual([]);
    fs.appendFileSync(path, line.slice(cut));
    while (!text.includes("event: ev")) {
      const part = await reader.read(); if (part.done) throw new Error("stream ended before append");
      text += decoder.decode(part.value, { stream: true });
    }
    expect(events(text)).toEqual([fresh]);
  } finally { controller.abort(); await reader.cancel().catch(() => undefined); }
});


it("reports a malformed compact head without falling back to the entire recording", async () => {
  const viewer = await serve("bad-head", longRun(2), 128);
  const path = join(roots.at(-1) ?? "", "runs", "bad-head", "events.jsonl");
  const lines = fs.readFileSync(path, "utf8").split("\n");
  lines.splice(1, 0, "{broken"); fs.writeFileSync(path, lines.join("\n"));
  const text = await (await fetch(new URL("api/runs/bad-head/events?head=1", viewer.url))).text();
  expect(text).toContain('event: problem\ndata: {"line":"recent head"');
  expect(text).not.toContain("event: done");
  expect(events(text)).toHaveLength(0);
});

it("labels malformed appends relative to the head byte cursor after history catch-up", async () => {
  const log = longRun(4); log.events.pop();
  const viewer = await serve("tail-location", log, 128);
  const path = join(roots.at(-1) ?? "", "runs", "tail-location", "events.jsonl");
  const offset = fs.statSync(path).size;
  const headAbort = new AbortController(), historyAbort = new AbortController();
  const response = await fetch(new URL("api/runs/tail-location/events?head=1", viewer.url), { signal: headAbort.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("no head stream");
  const readUntil = async (source: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> => {
    const decoder = new TextDecoder(); let text = "";
    while (!text.includes(marker)) {
      const part = await source.read(); if (part.done) throw new Error(`stream ended before ${marker}`);
      text += decoder.decode(part.value, { stream: true });
    }
    return text;
  };
  try {
    await readUntil(reader, "event: caught_up");
    const history = await fetch(new URL("api/runs/tail-location/events", viewer.url), { signal: historyAbort.signal });
    const historyReader = history.body?.getReader();
    if (historyReader === undefined) throw new Error("no history stream");
    await readUntil(historyReader, "event: caught_up");
    historyAbort.abort(); await historyReader.cancel().catch(() => undefined);
    fs.appendFileSync(path, "{broken\n");
    const text = await readUntil(reader, "event: problem");
    const raw = /^event: problem\ndata: (.*)$/m.exec(text)?.[1];
    if (raw === undefined) throw new Error(`missing problem in ${text}`);
    const problem = JSON.parse(raw) as { line: unknown; problem: unknown };
    expect(problem.line).toBe(`1 within tail starting at byte ${String(offset)}`);
    expect(problem.problem).toContain("event line is not JSON");
  } finally { headAbort.abort(); historyAbort.abort(); await reader.cancel().catch(() => undefined); }
});

it("abandons a backpressured head response when its reader disconnects", async () => {
  const viewer = await serve("abandoned-head", longRun(3), 1);
  const original = Reflect.get(ServerResponse.prototype, "write") as (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>) => boolean;
  let writes = 0;
  let closeObserved: Promise<void> | undefined;
  vi.spyOn(ServerResponse.prototype, "write").mockImplementation(function (this: ServerResponse, ...args: Parameters<ServerResponse["write"]>): boolean {
    const ok = Reflect.apply<ServerResponse, Parameters<ServerResponse["write"]>, boolean>(original, this, args);
    if (this.req.url?.endsWith("/head") === true) {
      writes += 1;
      closeObserved = new Promise(resolve => { this.once("close", () => { resolve(); }); });
      return false;
    }
    return ok;
  });
  await new Promise<void>((resolve, reject) => {
    const req = get(new URL("api/runs/abandoned-head/head",viewer.url), res => {
      res.once("data", () => { res.destroy(); resolve(); });
    });
    req.on("error",reject);
  });
  await closeObserved;
  await new Promise<void>(resolve => { setImmediate(resolve); });
  expect(writes).toBe(1);
  expect((await fetch(new URL("api/frame-metrics",viewer.url))).status).toBe(200);
});

it("does not start SSE after a client disconnects during its asynchronous head read", async () => {
  const viewer = await serve("abandoned",longRun(1),64);
  let enter!: () => void, release!: (events: Awaited<ReturnType<typeof runs.readHeadEvents>>) => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const pending = new Promise<Awaited<ReturnType<typeof runs.readHeadEvents>>>(resolve => { release = resolve; });
  vi.spyOn(runs,"readHeadEvents").mockImplementation(() => { enter(); return pending; });
  let closed!: () => void;
  const didClose = new Promise<void>(resolve => { closed = resolve; });
  let headerCalls: (() => number) | undefined;
  viewer.server.on("request", (_req,res) => { const headers = vi.spyOn(res,"writeHead"); headerCalls = () => headers.mock.calls.length; res.once("close",closed); });
  const req = get(new URL("api/runs/abandoned/events?head=1",viewer.url));
  req.on("error", () => undefined);
  await entered;
  req.destroy();
  await didClose;
  release([]);
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(headerCalls?.()).toBe(0);
});
