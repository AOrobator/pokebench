import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, IncomingMessage, ServerResponse, type Server } from "node:http";
import { Socket, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { Log, START, assistant, fullRun, state } from "../test-support/events.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
import { ALL_ON as QUEUE_FEATURES } from "@pokebench/agent/features";
import { BROWSER_MODULES, HOST, startViewer, validFramePng, type Viewer } from "./server.js";
import { REPORT_SCROLL_SCRIPT, reportScrollProbe } from "./reports-scroll.js";
import { createWorkbenchClient } from "./workbench-sync.js";
import { parseWorkbench } from "./workbench-data.js";
import WebSocket, { WebSocketServer } from "ws";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const open: { close(): Promise<void> }[] = [];

afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
});

interface Fixture {
  readonly runsRoot: string;
  readonly viewer: Viewer;
}

function writeRun(runsRoot: string, id: string, log: Log, port = 8011): string {
  const dir = join(runsRoot, id);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const lines = log.events.map((event) =>
    JSON.stringify(
      event.type === "run_start" ? { ...event, run: id, isolation: { ...event.isolation, port } } : { ...event, run: id },
    ),
  );
  writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`);
  return join(dir, "events.jsonl");
}

async function fixture(): Promise<Fixture> {
  const base = mkdtempSync(join(tmpdir(), "pokebench-viewer-srv-"));
  const runsRoot = join(base, "runs");
  const staticDir = join(base, "static");
  const appDir = join(base, "app");
  mkdirSync(runsRoot);
  mkdirSync(staticDir);
  mkdirSync(appDir);
  writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>PokeBench viewer</title>");
  writeFileSync(join(staticDir, "style.css"), "body{}");
  writeFileSync(join(appDir, "model.js"), "export const x = 1;");
  writeFileSync(join(appDir, "server.js"), "secret");
  const viewer = await startViewer({ runsRoot, staticDir, appDir, port: 0, pollMs: 10 });
  open.push(viewer);
  return { runsRoot, viewer };
}

interface Reply {
  readonly status: number;
  readonly type: string;
  readonly body: Buffer;
}

function get(viewer: Viewer, path: string, options: { host?: string; method?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: HOST, port: viewer.port, path, method: options.method ?? "GET", headers: { host: options.host ?? `${HOST}:${String(viewer.port)}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"] ?? "", body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function fakeGameServer(body: unknown, status = 200): Promise<number> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  open.push({ close: () => new Promise<void>((resolve) => server.close(() => { resolve(); })) });
  return (server.address() as AddressInfo).port;
}

async function fakeFrameGameServer(
  frame: unknown = { frame_data: PNG.toString("base64"), frame_count: 2 },
  acceptedPath = "/pokebench/frames",
): Promise<number> {
  const server = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== acceptedPath) { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });
  sockets.on("connection", (client) => {
    const frames = Array.isArray(frame) ? frame : [frame];
    frames.forEach((payload, index) => {
      setTimeout(() => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
      }, index * 10);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  open.push({ close: () => new Promise<void>((resolve) => {
    for (const client of sockets.clients) client.terminate();
    sockets.close(() => { server.close(() => { resolve(); }); });
  }) });
  return (server.address() as AddressInfo).port;
}

async function trackedFrameGameServer(): Promise<{ readonly port: number; readonly active: () => number; readonly accepted: () => number; readonly drop: () => void }> {
  const server = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  let accepted = 0;
  server.on("upgrade", (request, socket, head) => {
    if (request.url !== "/pokebench/frames") { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });
  sockets.on("connection", (client) => {
    accepted += 1;
    client.send(JSON.stringify({ frame_data: PNG.toString("base64"), frame_count: accepted }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  open.push({ close: () => new Promise<void>((resolve) => {
    for (const client of sockets.clients) client.terminate();
    sockets.close(() => { server.close(() => { resolve(); }); });
  }) });
  return {
    port: (server.address() as AddressInfo).port,
    active: () => sockets.clients.size,
    accepted: () => accepted,
    drop: () => { for (const client of sockets.clients) client.terminate(); },
  };
}

async function eventually(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function frameSocket(viewer: Viewer, path: string, origin = viewer.url.slice(0, -1), host = `${HOST}:${String(viewer.port)}`): WebSocket {
  return new WebSocket(`ws://${HOST}:${String(viewer.port)}${path}`, { headers: { origin, host } });
}

function firstFrame(socket: WebSocket): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data, binary) => {
      if (binary) resolve(Buffer.from(data as Buffer));
      else reject(new Error("frame was not binary"));
    });
    socket.once("error", reject);
  });
}

function socketClosed(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", resolve));
}

function rejected(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_req, response) => { response.resume(); resolve(response.statusCode ?? 0); });
    socket.once("open", () => { reject(new Error("socket unexpectedly opened")); });
    socket.once("error", () => undefined);
  });
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  return port;
}

describe("browser modules", () => {
  it("import nothing at runtime but each other (the page has no bundler)", () => {
    for (const name of BROWSER_MODULES) {
      const source = readFileSync(new URL((name==="story-progress"||name==="campaign-catalog")?`../../agent/src/${name}.ts`:`./${name}.ts`, import.meta.url), "utf8");
      const runtimeImports = [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)";/gm)].map((match) => match[1]);
      for (const specifier of runtimeImports) expect(BROWSER_MODULES.some(allowed => specifier === `./${allowed}.js`), `${name}.ts imports ${String(specifier)}`).toBe(true);
    }
  });
});

describe("viewer server", () => {
  it("binds 127.0.0.1 only", async () => {
    const { viewer } = await fixture();
    expect(HOST).toBe("127.0.0.1");
    expect(viewer.address).toBe("127.0.0.1");
    expect(viewer.url).toBe(`http://127.0.0.1:${String(viewer.port)}/`);
  });

  it("gives every page the local Poké Ball favicon", async () => {
    const staticDir = fileURLToPath(new URL("../static/", import.meta.url));
    for (const page of ["index.html", "workbench.html", "play.html", "reports.html", "probes.html"]) {
      expect(readFileSync(join(staticDir, page), "utf8"), page).toContain('<link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml">');
    }
    const base = mkdtempSync(join(tmpdir(), "pokebench-viewer-favicon-"));
    const viewer = await startViewer({ runsRoot: base, staticDir, appDir: base, port: 0, pollMs: 10 });
    open.push(viewer);
    for (const path of ["/favicon.svg", "/favicon.ico", "/favicon.svg?v=2"]) {
      const icon = await get(viewer, path);
      expect(icon.status, path).toBe(200);
      expect(icon.type, path).toBe("image/svg+xml");
      const svg = icon.body.toString();
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toContain("<title>Poké Ball</title>");
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    }
  });

  it("serves the page, the stylesheet and only the browser modules", async () => {
    const { viewer } = await fixture();
    const page = await get(viewer, "/");
    expect(page.status).toBe(200);
    expect(page.type).toContain("text/html");
    expect((await get(viewer, "/style.css")).type).toContain("text/css");
    const module = await get(viewer, "/app/model.js");
    expect(module.type).toContain("text/javascript");
    expect(module.body.toString()).toBe("export const x = 1;");
    expect(BROWSER_MODULES).not.toContain("server");
    expect((await get(viewer, "/app/server.js")).status).toBe(404);
    expect((await get(viewer, "/app/..%2fserver.js")).status).toBe(404);
    expect((await get(viewer, "/app/timeline.js")).status).toBe(404);
    expect((await get(viewer, "/nope")).status).toBe(404);
  });

  it("refuses foreign Host headers and non-GET methods", async () => {
    const { viewer } = await fixture();
    expect((await get(viewer, "/", { host: "evil.example:80" })).status).toBe(403);
    expect((await get(viewer, "/", { host: `localhost:${String(viewer.port)}` })).status).toBe(200);
    expect((await get(viewer, "/", { method: "POST" })).status).toBe(405);
  });

  it("lists runs as JSON", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "2026-10-11T22-00-00_a", fullRun());
    const reply = await get(viewer, "/api/runs");
    expect(reply.type).toContain("application/json");
    expect(JSON.parse(reply.body.toString())).toMatchObject([{ id: "2026-10-11T22-00-00_a", ended: true }]);
  });

  it("keeps historical finals recordings listed without finals UI labels", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "2026-10-11T22-00-00_a", fullRun());
    writeRun(runsRoot, "2026-10-11T22-00-00_f", fullRun());
    const dir = join(runsRoot, "experiments", "fm");
    mkdirSync(dir, { recursive: true });
    const incumbent = { version: 2, id: "fm-finals-incumbent", target: null, limits: { maxTurns: 10, maxWallMs: 1000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: QUEUE_FEATURES };
    writeFileSync(join(dir, "nomination.json"), JSON.stringify({ experiment: "fm", source: "queue", at: "t", incumbent, finals: { runsPerArm: 1, maxWallMs: 1000, target: null }, ranking: [], reusedIncumbent: [], finalists: [{ arm: "whole", switches: { "full-map-navigation-v1": true } }], reason: "r" }));
    writeFileSync(join(dir, "finals.jsonl"), `${JSON.stringify({ type: "launch", trial: 1, arm: "whole", run: "2026-10-11T22-00-00_f", at: "t", model: "m", commit: "c".repeat(40) })}\n`);
    const runs = JSON.parse((await get(viewer, "/api/runs")).body.toString()) as { id: string; experiment?: string }[];
    expect(runs.find((r) => r.id === "2026-10-11T22-00-00_f")?.experiment).toBeUndefined();
    expect(runs.find((r) => r.id === "2026-10-11T22-00-00_a")?.experiment).toBeUndefined();
  });

  it("streams a finished run's events, then caught_up and done", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "done", fullRun());
    const reply = await get(viewer, "/api/runs/done/events");
    expect(reply.type).toContain("text/event-stream");
    const text = reply.body.toString();
    expect(text.match(/^event: ev$/gm)).toHaveLength(fullRun().events.length);
    expect(text).toMatch(/event: caught_up\ndata: \{\}\n\n/);
    expect(text.trimEnd().endsWith("event: done\ndata: {}")).toBe(true);
  });

  it("serves the selected run's bounded recent recorded-event head", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "head", fullRun());
    const reply = await get(viewer, "/api/runs/head/head");
    expect(reply.type).toContain("application/json");
    const events = JSON.parse(reply.body.toString()) as RunEvent[];
    expect(events[0]?.type).toBe("run_start");
    expect(events.at(-1)?.type).toBe("run_end");
    expect(events.every((event) => event.run === "head")).toBe(true);
  });

  it("streams rival values recovered from raw RAM onto the state events that lack them", async () => {
    const { runsRoot, viewer } = await fixture();
    const log = new Log();
    log.add(0, START);
    const scratch = mkdtempSync(join(tmpdir(), "ram-"));
    const fight = writeArchive(scratch, 1, rivalRam(true, false));
    const target = log.add(1000, state({ location: "ROUTE103", in_battle: true, raw_ram: fight }));
    log.add(2000, state({ location: "ROUTE103" }));
    log.add(3000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 3000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    writeRun(runsRoot, "recovered", log);
    mkdirSync(join(runsRoot, "recovered", "derived"), { recursive: true });
    cpSync(join(scratch, "raw-ram"), join(runsRoot, "recovered", "raw-ram"), { recursive: true });
    writeFileSync(join(runsRoot, "recovered", "derived", "route103_rival.jsonl"), [{ v: 1, run: "recovered", source: "raw-ram-route103-v1" }, { seq: target.seq, raw_ram: fight.path, sha256: fight.sha256, route103_rival: { battle_active: true, defeated: false, oldale_stage: 0 } }].map((r) => JSON.stringify(r)).join("\n") + "\n");
    const text = (await get(viewer, "/api/runs/recovered/events")).body.toString();
    const streamed = text.split("\n").filter((l) => l.startsWith("data: {\"")).map((l) => JSON.parse(l.slice(6)) as { seq?: number; route103_rival?: unknown });
    expect(streamed.find((e) => e.seq === target.seq)?.route103_rival).toEqual({ battle_active: true, defeated: false, oldale_stage: 0 });
    expect(streamed.filter((e) => e.route103_rival !== undefined)).toHaveLength(1);
    const paged = JSON.parse((await get(viewer, "/api/runs/recovered/trace-history?before=4")).body.toString()) as { events: RunEvent[] };
    expect(paged.events.find(event => event.seq === target.seq)).toMatchObject({ route103_rival: { battle_active: true, defeated: false, oldale_stage: 0 } });
  });

  it("tails a live run until run_end and reports invalid lines", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log();
    live.add(0, START);
    const path = writeRun(runsRoot, "live", live);
    const pending = get(viewer, "/api/runs/live/events");
    await new Promise((resolve) => setTimeout(resolve, 60));
    appendFileSync(path, "{broken\n");
    const end = fullRun().events.at(-1);
    appendFileSync(path, `${JSON.stringify({ ...end, run: "live", seq: 1 })}\n`);
    const text = (await pending).body.toString();
    expect(text.indexOf("event: caught_up")).toBeLessThan(text.indexOf("event: problem"));
    expect(text).toContain('"line":2');
    expect(text.match(/^event: ev$/gm)).toHaveLength(2);
    expect(text).toContain("event: done");
  });

  it("serves frames by safe name only", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "r", fullRun());
    writeFileSync(join(runsRoot, "r", "frames", "000009_0.png"), PNG);
    const frame = await get(viewer, "/api/runs/r/frames/000009_0.png");
    expect(frame.type).toBe("image/png");
    expect(frame.body.equals(PNG)).toBe(true);
    expect((await get(viewer, "/api/runs/r/frames/000010_0.png")).status).toBe(404);
    expect((await get(viewer, "/api/runs/r/frames/..%2fevents.jsonl")).status).toBe(404);
    expect((await get(viewer, "/api/runs/..%2f..%2fetc/events")).status).toBe(404);
  });

  it("serves baseline milestones", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "base", fullRun());
    const reply = await get(viewer, "/api/runs/base/milestones");
    expect(JSON.parse(reply.body.toString())).toEqual({
      run: "base",
      milestones: [
        { name: "GAME_RUNNING", offsetMs: 10 },
        { name: "PLAYER_NAME_SET", offsetMs: 3100 },
      ],
    });
    expect((await get(viewer, "/api/runs/missing/milestones")).status).toBe(404);
    appendFileSync(join(runsRoot, "base", "events.jsonl"), "{broken\n");
    const torn = await get(viewer, "/api/runs/base/milestones");
    expect(torn.status).toBe(422);
    expect(JSON.parse(torn.body.toString())).toMatchObject({ error: expect.stringContaining("line 15") as string });
  });

  it("proxies the live screen from the run's own game server while it runs", async () => {
    const { runsRoot, viewer } = await fixture();
    const port = await fakeGameServer({ screenshot_base64: PNG.toString("base64"), step_number: 3 });
    const live = new Log();
    live.add(0, START);
    writeRun(runsRoot, "live", live, port);
    const screen = await get(viewer, "/api/runs/live/screen");
    expect(screen.status).toBe(200);
    expect(screen.type).toBe("image/png");
    expect(screen.body.equals(PNG)).toBe(true);
  });

  it("proxies the owned live run's upstream frames as bounded binary PNG messages", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await fakeFrameGameServer());
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(socket)).equals(PNG)).toBe(true);
  });

  it("shares one real upstream transport across clients and closes it after the last client", async () => {
    const { runsRoot, viewer } = await fixture();
    const game = await trackedFrameGameServer();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, game.port);
    const first = frameSocket(viewer, "/api/runs/live/frames");
    const second = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { first.terminate(); second.terminate(); return Promise.resolve(); } });
    expect((await Promise.all([firstFrame(first), firstFrame(second)])).every(frame => frame.equals(PNG))).toBe(true);
    expect(game.accepted()).toBe(1);
    const firstClosed = socketClosed(first);
    first.close();
    await firstClosed;
    // close and error can race in ws; detaching the same subscriber twice is harmless.
    first.emit("error", new Error("late duplicate disconnect"));
    expect(game.active()).toBe(1);
    const secondClosed = socketClosed(second);
    second.close();
    await secondClosed;
    await eventually(() => game.active() === 0, "shared upstream remained after the final subscriber");
  });

  it("replaces a run hub when its game identity changes", async () => {
    const { runsRoot, viewer } = await fixture();
    const oldGame = await trackedFrameGameServer();
    const newGame = await trackedFrameGameServer();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, oldGame.port);
    const oldClient = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { oldClient.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(oldClient)).equals(PNG)).toBe(true);
    const oldClosed = socketClosed(oldClient);
    writeRun(runsRoot, "live", live, newGame.port);
    const newClient = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { newClient.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(newClient)).equals(PNG)).toBe(true);
    expect(await oldClosed).toBe(1012);
    await eventually(() => oldGame.active() === 0, "replaced run hub retained its old upstream");
    expect(newGame.accepted()).toBe(1);
  });

  it("tears down a failed upstream and reconnects through a fresh hub", async () => {
    const { runsRoot, viewer } = await fixture();
    const game = await trackedFrameGameServer();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, game.port);
    const failed = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { failed.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(failed)).equals(PNG)).toBe(true);
    const failedClosed = socketClosed(failed);
    game.drop();
    expect(await failedClosed).toBe(1011);
    const recovered = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { recovered.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(recovered)).equals(PNG)).toBe(true);
    expect(game.accepted()).toBe(2);
  });

  it("keeps the downstream socket open after a successful send callback", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    const frames = [1, 2, 3].map((frame_count) => ({ frame_data: PNG.toString("base64"), frame_count }));
    writeRun(runsRoot, "live", live, await fakeFrameGameServer(frames));
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    const received = await new Promise<number>((resolve, reject) => {
      let count = 0;
      const timeout = setTimeout(() => { reject(new Error(`received only ${String(count)} frames`)); }, 1_000);
      socket.on("message", (_data, binary) => {
        if (!binary) { clearTimeout(timeout); reject(new Error("frame was not binary")); return; }
        count += 1;
        if (count === frames.length) { clearTimeout(timeout); resolve(count); }
      });
      socket.once("error", reject);
    });
    expect(received).toBe(frames.length);
  });

  it("reports source loss and stage timings without changing binary PNG bytes", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    const payloads = [10, 13].map(frame_count => ({ frame_data: PNG.toString("base64"), frame_count, timestamp: Date.now() / 1000 }));
    writeRun(runsRoot, "live", live, await fakeFrameGameServer(payloads));
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    const frames: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.on("error", reject);
      socket.on("message", data => { frames.push(Buffer.from(data as Buffer)); if (frames.length === 2) resolve(); });
    });
    expect(frames).toEqual([PNG, PNG]);
    const reply = await get(viewer, "/api/frame-metrics");
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body.toString())).toMatchObject({ version: 1, runs: [{ run: "live", received: 2, offered: 2, sent: 2, send: { count: 2 }, queueWait: { count: 2 }, missingSourceFrames: 2, sourceFrame: 13, decode: { count: 2 }, upstreamGap: { count: 1 } }] });
    expect((await get(viewer, "/api/frame-metrics", {host:"evil.example"})).status).toBe(403);
  });

  it("falls back to the pinned vendor frame route for already-running game servers", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await fakeFrameGameServer(undefined, "/ws/frames"));
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(socket)).equals(PNG)).toBe(true);
  });

  it("closes a frame client when both upstream routes are unavailable", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await fakeFrameGameServer(undefined, "/not-a-frame-route"));
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    expect(await socketClosed(socket)).toBe(1011);
  });

  it("closes a frame client when the upstream transport is unreachable", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await closedPort());
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    expect(await socketClosed(socket)).toBe(1011);
  });

  it("rejects an invalid shared upstream frame without forwarding it", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await fakeFrameGameServer({ frame_data: Buffer.from("not png").toString("base64"), frame_count: 1 }));
    const socket = frameSocket(viewer, "/api/runs/live/frames");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    let messages = 0;
    socket.on("message", () => { messages += 1; });
    expect(await socketClosed(socket)).toBe(1003);
    expect(messages).toBe(0);
  });

  it("rejects frame sockets from foreign origins, ended or missing runs, and other paths", async () => {
    const { runsRoot, viewer } = await fixture();
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await fakeFrameGameServer());
    writeRun(runsRoot, "done", fullRun(), await fakeFrameGameServer());
    expect(await rejected(frameSocket(viewer, "/api/runs/live/frames", "http://evil.example"))).toBe(403);
    const missingOrigin = new WebSocket(`ws://${HOST}:${String(viewer.port)}/api/runs/live/frames`, { headers: { host: `${HOST}:${String(viewer.port)}` } });
    expect(await rejected(missingOrigin)).toBe(403);
    expect(await rejected(frameSocket(viewer, "/api/runs/done/frames"))).toBe(409);
    expect(await rejected(frameSocket(viewer, "/api/runs/missing/frames"))).toBe(404);
    expect(await rejected(frameSocket(viewer, "/api/runs/live/not-frames"))).toBe(404);
  });

  it("accepts an explicitly configured published origin and matching Host", async () => {
    const base = mkdtempSync(join(tmpdir(), "pokebench-viewer-public-frame-"));
    const runsRoot = join(base, "runs"); mkdirSync(runsRoot);
    const live = new Log(); live.add(0, START);
    writeRun(runsRoot, "live", live, await fakeFrameGameServer());
    const viewer = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, publicOrigins: ["https://viewer.example"] });
    open.push(viewer);
    const socket = frameSocket(viewer, "/api/runs/live/frames", "https://viewer.example", "viewer.example");
    open.push({ close: () => { socket.terminate(); return Promise.resolve(); } });
    expect((await firstFrame(socket)).equals(PNG)).toBe(true);
  });

  it("accepts only complete bounded PNG structures with valid chunk checksums", () => {
    expect(validFramePng(PNG)).toBe(true);
    expect(validFramePng(PNG.subarray(0, PNG.length - 1))).toBe(false);
    expect(validFramePng(Buffer.concat([PNG.subarray(0, 8), Buffer.from("not chunks")]))).toBe(false);
    const corrupt = Buffer.from(PNG), at = corrupt.length - 13; corrupt[at] = (corrupt[at] ?? 0) ^ 1;
    expect(validFramePng(corrupt)).toBe(false);
  });

  it("refuses the live screen for an ended run and reports an unreachable or malformed server", async () => {
    const { runsRoot, viewer } = await fixture();
    writeRun(runsRoot, "done", fullRun());
    expect((await get(viewer, "/api/runs/done/screen")).status).toBe(409);
    const live = new Log();
    live.add(0, START);
    writeRun(runsRoot, "down", live, await closedPort());
    expect((await get(viewer, "/api/runs/down/screen")).status).toBe(502);
    const bad = await fakeGameServer({ screenshot_base64: Buffer.from("not a png").toString("base64"), step_number: 1 });
    writeRun(runsRoot, "bad", live, bad);
    expect((await get(viewer, "/api/runs/bad/screen")).status).toBe(502);
    const malformed = await fakeGameServer({ nope: true });
    writeRun(runsRoot, "malformed", live, malformed);
    expect((await get(viewer, "/api/runs/malformed/screen")).status).toBe(502);
    const failing = await fakeGameServer({}, 500);
    writeRun(runsRoot, "failing", live, failing);
    expect((await get(viewer, "/api/runs/failing/screen")).status).toBe(502);
    expect((await get(viewer, "/api/runs/missing/screen")).status).toBe(404);
  });
});

it("serves validated comparisons for the selected start, excluding self", async () => {
  const { runsRoot, viewer } = await fixture();
  writeRun(runsRoot, "selected", fullRun());
  const frontier = new Log();
  frontier.add(0, START);
  frontier.add(1000, assistant());
  const named = frontier.add(3000, state({ story: { name_confirmed: true, intro_stage: null, rival_stage: null, birch_lab_stage: null, petalburg_gym_stage: null, woods_stage: null, clock_set: null, rival_battle_won: null, pokedex_received: null, running_shoes_received: null, starter_tutorial_complete: null, rustboro_gym_complete: null, stone_badge: null, rock_tomb_received: null } }));
  frontier.add(4000, { type: "milestone", turn: 1, name: "PLAYER_NAME_CONFIRMED", kind: "story", origin: "observed", server_timestamp: 4, evidence: [named.seq] });
  frontier.add(9000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 9000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } });
  writeRun(runsRoot, "reference", frontier);
  const reply = await get(viewer, "/api/runs/selected/comparisons");
  expect(reply.status).toBe(200);
  const result = JSON.parse(reply.body.toString()) as { candidates: {run:string}[]; baseline:unknown };
  expect(result.candidates.map((c) => c.run)).toEqual(["reference"]);
  expect(result.baseline).toBeNull(); // equal start timestamp, no previous run
  expect(result).not.toHaveProperty("frontier");
  // The splits race the frontier graph's agent frontier, never the selected run itself; it has its own cheap route.
  const frontierOf = async (v: Viewer, id: string): Promise<unknown> => JSON.parse((await get(v, `/api/runs/${id}/frontier`)).body.toString());
  expect(await frontierOf(viewer, "selected")).toEqual({ state: "ready", frontier: { run: "reference", milestones: [{ name: "PLAYER_NAME_CONFIRMED", offsetMs: 4000 }] } });
  expect(await frontierOf(viewer, "reference")).toEqual({ state: "ready", frontier: null });
  expect((await get(viewer, "/api/runs/..%2Fsecrets/frontier")).status).toBe(404);
  // A cold partial workbench still loading its runs must not hide the frontier from a run picked meanwhile.
  const partial = await startViewer({ runsRoot, staticDir: runsRoot, appDir: runsRoot, port: 0, workbench: { partial: true } });
  open.push(partial);
  expect(await frontierOf(partial, "selected")).toMatchObject({ frontier: { run: "reference" } });
  // A warm viewer ranks at start and persists the ranking; a run whose start is unreadable still gets the frontier.
  const file = join(runsRoot, ".viewer-cache", "frontier-v1.json");
  const warm = await startViewer({ runsRoot, staticDir: runsRoot, appDir: runsRoot, port: 0, frontier: { file, warm: true } });
  open.push(warm);
  mkdirSync(join(runsRoot, "2026-10-27T00-00-00_nostart"));
  expect(await frontierOf(warm, "2026-10-27T00-00-00_nostart")).toMatchObject({ state: "ready", frontier: { run: "reference" } });
  expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ version: 1, best: { run: "reference" } });
});

it("serves read-only workbench data from actual recorded runs, without prompts or arbitrary paths", async () => {
  const { runsRoot, viewer } = await fixture(); writeRun(runsRoot, "recorded", fullRun());
  const reply = await get(viewer, "/api/workbench"); expect(reply.status).toBe(200);
  const data = parseWorkbench(JSON.parse(reply.body.toString()) as unknown);
  expect(data.runs[0]?.id).toBe("recorded"); expect(data.runs[0]?.config?.source).toBe(START.harness.commit); expect(reply.body.toString()).not.toContain('"system_prompt"');
  expect((await get(viewer, "/api/workbench/../secrets")).status).not.toBe(200);
});

it("serves a validated lightweight card projection without changing the full workbench API", async () => {
  const { runsRoot, viewer } = await fixture(); writeRun(runsRoot, "recorded", fullRun());
  const full = await get(viewer, "/api/workbench"), cards = await get(viewer, "/api/cards?run=recorded");
  const projected = parseWorkbench(JSON.parse(cards.body.toString()) as unknown);
  expect(cards.status).toBe(200); expect(projected.runs[0]?.id).toBe("recorded");
  expect(projected.runs[0]?.measurement).toBeUndefined(); expect(cards.body.length).toBeLessThan(full.body.length);
});


it("serves only allowlisted tracked feature explainers with existing host and method protections",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"navigation-evidence-memory-v1.html"),"<!doctype html><h1>Memory mechanism</h1>");writeFileSync(join(docs,"visited-terrain-navigation-v1.html"),"<!doctype html><h1>Visited terrain</h1>");writeFileSync(join(docs,"private.html"),"not public");writeFileSync(join(docs,"just-in-time-prompt-v2.html"),"<!doctype html><h1>JIT v2 fixture</h1>");writeFileSync(join(docs,"one-way-tiles-v1.html"),"<h1>One-way tiles</h1>");writeFileSync(join(docs,"counter-talk-v1.html"),"<h1>Counter talk</h1>");writeFileSync(join(docs,"walkable-floor-v1.html"),"<h1>Walkable floor</h1>");writeFileSync(join(docs,"grass-cost-switch.html"),"<h1>Grass cost</h1>");writeFileSync(join(docs,"elevation-transitions.html"),"<h1>Elevation</h1>");
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const v2=await get(viewer,"/explainers/just-in-time-prompt-v2.html");expect(v2.status).toBe(200);expect(v2.body.toString()).toContain("JIT v2 fixture");const reply=await get(viewer,"/explainers/navigation-evidence-memory-v1.html");expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.toString()).toContain("Memory mechanism");expect((await get(viewer,"/explainers/visited-terrain-navigation-v1.html")).status).toBe(200);expect((await get(viewer,"/explainers/one-way-tiles-v1.html")).status).toBe(200);expect((await get(viewer,"/explainers/counter-talk-v1.html")).status).toBe(200);const floor=await get(viewer,"/explainers/walkable-floor-v1.html");expect(floor.status).toBe(200);expect(floor.body.toString()).toContain("Walkable floor");expect((await get(viewer,"/explainers/walkable-floor.html")).status).toBe(404);expect((await get(viewer,"/explainers/grass-cost-switch.html")).status).toBe(200);expect((await get(viewer,"/explainers/elevation-transitions.html")).status).toBe(200);
 expect((await get(viewer,"/explainers/private.html")).status).toBe(404);expect((await get(viewer,"/explainers/ledge-hops-v1.html")).status).toBe(404);expect((await get(viewer,"/explainers/navigation-evidence-memory-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);expect((await get(viewer,"/explainers/navigation-evidence-memory-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the deterministic warp navigation explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/deterministic-warp-navigation-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"deterministic-warp-navigation-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/deterministic-warp-navigation-v1.html");
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Deterministic warp navigation");
});

it("serves both semantic navigation explainers byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const files=["semantic-navigation-v1.html","semantic-navigation-v2.html","deterministic-exploration-v1.html"];
 for(const file of files)writeFileSync(join(docs,file),readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url))));
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const file of files){const tracked=readFileSync(join(docs,file)),reply=await get(viewer,`/explainers/${file}`);expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);}
});

it("serves the trainer sight check explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/trainer-sight-check-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"trainer-sight-check-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/trainer-sight-check-v1.html");
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Trainer sight check");
});

it("serves the safe navigation strides explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/safe-navigation-strides-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"safe-navigation-strides-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/safe-navigation-strides-v1.html");
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Safe planned navigation strides");
});

it("serves the tracked talk to people explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/explorer-guidance-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"explorer-guidance-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/explorer-guidance-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked talk to people v2 explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/explorer-guidance-v2.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"explorer-guidance-v2.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/explorer-guidance-v2.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked push-back, battle observation and ineffective loops explainers byte for byte, with their headings",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const files={"pushback-loop-detection-v1":"Push-back loop detection","pushback-press-result-v1":"Push-back press results","battle-observation-loop-v1":"Battle observation loop","ineffective-loops-v1":"Ineffective loops","battle-menu-loop-v1":"Battle menu loop","clock-view-loop-v1":"Clock view loop","loop-guard-screen-v1":"Loop guard screen","faced-interaction-history-v1":"Faced interaction history"} as const;
 const tracked=new Map(Object.keys(files).map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,bytes] of tracked)writeFileSync(join(docs,`${id}.html`),bytes);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const [id,heading] of Object.entries(files)){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status,id).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked.get(id)??Buffer.alloc(0)),id).toBe(true);expect(reply.body.toString()).toContain(`<h1>${heading}</h1>`);
 }
 expect((await get(viewer,"/explainers/pushback-loop-detection-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/battle-observation-loop-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Surf-gated exits explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/surf-gated-exits-v1.html",import.meta.url)));
 writeFileSync(join(docs,"surf-gated-exits-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/surf-gated-exits-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Surf-gated exits</h1>");
 expect((await get(viewer,"/explainers/surf-gated-exits-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/surf-gated-exits-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Exit reachability explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/exit-reachability-v1.html",import.meta.url)));
 writeFileSync(join(docs,"exit-reachability-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/exit-reachability-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Exit reachability</h1>");
 expect((await get(viewer,"/explainers/exit-reachability-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/exit-reachability-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Harness trust explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/harness-trust-v1.html",import.meta.url)));
 writeFileSync(join(docs,"harness-trust-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/harness-trust-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Harness trust</h1>");
 expect((await get(viewer,"/explainers/harness-trust-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/harness-trust-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked Cited destination explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/cited-destination-v1.html",import.meta.url)));
 writeFileSync(join(docs,"cited-destination-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/cited-destination-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>Cited destination</h1>");
 expect((await get(viewer,"/explainers/cited-destination-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/cited-destination-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked No exit here explainer byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/no-exit-here-v1.html",import.meta.url)));
 writeFileSync(join(docs,"no-exit-here-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/no-exit-here-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect(reply.body.toString()).toContain("<h1>No exit here</h1>");
 expect((await get(viewer,"/explainers/no-exit-here-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/no-exit-here-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked cross-map goal explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/cross-map-goal-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"cross-map-goal-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/cross-map-goal-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect((await get(viewer,"/explainers/cross-map-goal-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/cross-map-goal-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked people ID cards explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/people-id-cards-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"people-id-cards-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/people-id-cards-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect((await get(viewer,"/explainers/people-id-cards-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/people-id-cards-v1.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked story battle heal warning explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/low-hp-trainer-warning-v2.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"low-hp-trainer-warning-v2.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/low-hp-trainer-warning-v2.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the rival-push explainers through the existing allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 for(const id of ["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-triage-guidance-v1","battle-details-v2","dialogue-auto-advance-v1","warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1","blocked-batch-result-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1","battle-text-auto-advance-v1","battle-message-waiting-v1","script-line-presence-v1","disproved-beliefs-v1","same-plan-breaker-v1","briefing-exits-v1","untaken-exits-v1","briefing-battle-outcomes-v1","blocked-exit-fact-v1","battle-loss-recap-v1","navigation-truth-v1","navigation-refusal-reasons-v2"])writeFileSync(join(docs,`${id}.html`),`<h1>${id}</h1>`);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const id of ["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","double-context-window-v1","fresh-retry-v1","named-warp-destinations-v1","milestone-stall-stop-v1","text-only-supervisor-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-triage-guidance-v1","battle-details-v2","dialogue-auto-advance-v1","warp-arrival-settle-v1","dialogue-context-kept-v1","displayed-place-names-v1","transition-loop-detection-v1","blocked-batch-result-v1","adjacent-tiles-v1","readout-rules-in-prompt-v1","connection-edge-tiles-v1","in-game-naming-readout-v1","no-nickname-guidance-v1","battle-text-auto-advance-v1","battle-message-waiting-v1","script-line-presence-v1","disproved-beliefs-v1","same-plan-breaker-v1","briefing-exits-v1","untaken-exits-v1","briefing-battle-outcomes-v1","blocked-exit-fact-v1","battle-loss-recap-v1","navigation-truth-v1","navigation-refusal-reasons-v2"]){const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.toString()).toContain(id);}
});

it("caches sprite bytes, revalidates changed art, and keeps dynamic data uncached", async () => {
  const { runsRoot, viewer } = await fixture();
  const dir = join(runsRoot, "sprites", "trainer-card-v1", "card"); mkdirSync(dir, { recursive: true });
  const path = join(dir, "wide-gold.png"); writeFileSync(path, PNG);
  const url = `${viewer.url}sprites/card/wide-gold.png`;
  const first = await fetch(url); await first.arrayBuffer();
  expect(first.headers.get("cache-control")).toBe("private, max-age=300");
  const etag = first.headers.get("etag"); expect(etag).toBeTruthy();
  const same = await fetch(url, { headers: { "if-none-match": etag ?? "" } });
  expect(same.status).toBe(304); expect((await same.arrayBuffer()).byteLength).toBe(0);
  writeFileSync(path, Buffer.concat([PNG, Buffer.from("changed")]));
  const changed = await fetch(url, { headers: { "if-none-match": etag ?? "" } });
  expect(changed.status).toBe(200); expect(changed.headers.get("etag")).not.toBe(etag); await changed.arrayBuffer();
  const dynamic = await fetch(`${viewer.url}api/runs`); await dynamic.arrayBuffer();
  expect(dynamic.headers.get("cache-control")).toBe("no-store");
  const missing = await fetch(`${viewer.url}sprites/card/wide-silver.png`); await missing.arrayBuffer();
  expect(missing.status).toBe(404); expect(missing.headers.get("cache-control")).toBe("no-store");
});

it("serves only the allowlisted trainer card art from runs/sprites/trainer-card-v1",async()=>{
 const {runsRoot,viewer}=await fixture();const art=join(runsRoot,"sprites","trainer-card-v1");
 for(const dir of ["card","trainers","font","icons"])mkdirSync(join(art,dir),{recursive:true});
 const png=PNG;
 writeFileSync(join(art,"manifest.json"),'{"version":1}');writeFileSync(join(art,"card","wide-gold.png"),png);writeFileSync(join(art,"card","mini-ribbon-green.png"),png);writeFileSync(join(art,"trainers","may.png"),png);writeFileSync(join(art,"font","glyphs.png"),png);writeFileSync(join(art,"font","glyphs.json"),"{}");writeFileSync(join(art,"icons","280.png"),png);writeFileSync(join(art,"icons","secret.txt"),"no");writeFileSync(join(runsRoot,"sprites","other.png"),png);
 const manifest=await get(viewer,"/sprites/manifest.json");expect(manifest.status).toBe(200);expect(manifest.type).toContain("application/json");expect(manifest.body.toString()).toBe('{"version":1}');
 for(const path of ["/sprites/card/wide-gold.png","/sprites/card/mini-ribbon-green.png","/sprites/trainers/may.png","/sprites/font/glyphs.png","/sprites/icons/280.png"]){const reply=await get(viewer,path);expect(reply.status,path).toBe(200);expect(reply.type,path).toBe("image/png");}
 expect((await get(viewer,"/sprites/font/glyphs.json")).type).toContain("application/json");
 for(const path of ["/sprites/icons/secret.txt","/sprites/icons/1234.png","/sprites/card/wide-purple.png","/sprites/trainers/May.png","/sprites/../other.png","/sprites/%2e%2e/other.png","/sprites/icons/..%2f..%2fother.png","/sprites/icons/281.png","/sprites/manifest.json/x","/sprites"])expect((await get(viewer,path)).status,path).toBe(404);
 expect((await get(viewer,"/sprites/manifest.json",{host:"elsewhere.invalid"})).status).toBe(403);
 expect(BROWSER_MODULES).toEqual(expect.arrayContaining(["trainer-card","game-font"]));
});

it("serves only the allowlisted bag item icons from runs/sprites/bag-v1",async()=>{
 const {runsRoot,viewer}=await fixture();const art=join(runsRoot,"sprites","bag-v1");
 for(const dir of ["items","pockets"])mkdirSync(join(art,dir),{recursive:true});
 writeFileSync(join(art,"manifest.json"),'{"items":[4]}');writeFileSync(join(art,"items","4.png"),PNG);writeFileSync(join(art,"pockets","tm_hm.png"),PNG);writeFileSync(join(art,"items","notes.txt"),"no");
 const manifest=await get(viewer,"/sprites/bag/manifest.json");expect(manifest.status).toBe(200);expect(manifest.type).toContain("application/json");expect(manifest.body.toString()).toBe('{"items":[4]}');
 for(const path of ["/sprites/bag/items/4.png"]){const reply=await get(viewer,path);expect(reply.status,path).toBe(200);expect(reply.type,path).toBe("image/png");}
 for(const path of ["/sprites/bag/items/notes.txt","/sprites/bag/items/0.png","/sprites/bag/items/1000.png","/sprites/bag/items/5.png","/sprites/bag/pockets/pc.png","/sprites/bag/pockets/tm_hm.png","/sprites/bag/../manifest.json","/sprites/bag/items/..%2f..%2fmanifest.json","/sprites/bag","/sprites/bag/manifest.json/x"])expect((await get(viewer,path)).status,path).toBe(404);
 expect(BROWSER_MODULES).not.toContain("bag");
});

it("serves only the allowlisted party art from runs/sprites/party-v1",async()=>{
 const {runsRoot,viewer}=await fixture();const art=join(runsRoot,"sprites","party-v1");
 for(const dir of ["front","parts","font"])mkdirSync(join(art,dir),{recursive:true});
 for(const name of ["font/small.png","font/normal.png","font/small.json","font/normal.json","font/big.png"])writeFileSync(join(art,name),name.endsWith(".json")?"{}":PNG);
 writeFileSync(join(art,"manifest.json"),'{"version":1}');writeFileSync(join(art,"data.json"),'{"species":{}}');
 for(const name of ["front/280.png","front/411.png","parts/types.png","parts/status.png","parts/hp-tag.png","parts/exp-empty.png","parts/exp-full.png","parts/marks.png","parts/ball-big.png","parts/ball-small.png","parts/balls.png","parts/notes.png"])writeFileSync(join(art,name),PNG);
 writeFileSync(join(art,"front","notes.txt"),"no");
 for(const [path,type] of [["/sprites/party/manifest.json","application/json"],["/sprites/party/data.json","application/json"],["/sprites/party/font/small.json","application/json"],["/sprites/party/font/normal.json","application/json"],["/sprites/party/font/small.png","image/png"],["/sprites/party/font/normal.png","image/png"]] as const){const reply=await get(viewer,path);expect(reply.status,path).toBe(200);expect(reply.type,path).toContain(type);}
 for(const path of ["/sprites/party/front/280.png","/sprites/party/front/411.png","/sprites/party/parts/types.png","/sprites/party/parts/status.png","/sprites/party/parts/hp-tag.png","/sprites/party/parts/exp-empty.png","/sprites/party/parts/exp-full.png","/sprites/party/parts/marks.png","/sprites/party/parts/ball-big.png","/sprites/party/parts/ball-small.png","/sprites/party/parts/balls.png"]){const reply=await get(viewer,path);expect(reply.status,path).toBe(200);expect(reply.type,path).toBe("image/png");}
 for(const path of ["/sprites/party/front/notes.txt","/sprites/party/front/0.png","/sprites/party/front/412.png","/sprites/party/front/1000.png","/sprites/party/front/281.png","/sprites/party/parts/notes.png","/sprites/party/../manifest.json","/sprites/party/front/..%2f..%2fdata.json","/sprites/party","/sprites/party/data.json/x","/sprites/party/parts/types.png/x","/sprites/party/parts/summary-ball.png","/sprites/party/font/big.png","/sprites/party/font/small.txt"])expect((await get(viewer,path)).status,path).toBe(404);
});

it("serves the tracked story destinations explainer byte for byte through the allowlist",async()=>{
 const id="story-destinations-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Story destinations</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked heal before trainers explainer byte for byte through the allowlist",async()=>{
 const id="heal-before-trainers-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Heal before trainers</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked heal before trainers v2 explainer byte for byte through the allowlist",async()=>{
 const id="heal-before-trainers-v2";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Heal before trainers v2</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
});

it("serves the tracked gym heal warning explainer byte for byte through the allowlist",async()=>{
 const id="gym-heal-warning-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Gym heal warning</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
});

it("serves the tracked reopened dialogue loop explainer byte for byte through the allowlist",async()=>{
 const id="reopened-dialogue-loop-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Reopened dialogue loop</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked dialogue button explainer byte for byte through the allowlist",async()=>{
 const id="dialog-button-b-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Dialogue button B</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked stale story goal explainer byte for byte through the allowlist",async()=>{
 const id="stale-story-goal-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Stale story goal</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked stage-bound story goal explainer byte for byte through the allowlist",async()=>{
 const id="stale-story-goal-v2";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Stage-bound story goal</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked heal before trainers BAG items explainer byte for byte through the allowlist",async()=>{
 const id="bag-healing-items-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Heal before trainers: BAG items</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked input cuts explainer byte for byte through the allowlist",async()=>{
 const id="input-cuts-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Input cuts</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked battle action tool explainer byte for byte through the allowlist",async()=>{
 const id="battle-move-tool-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Battle action tool</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the 2026-10-17 readout-fix and respawn readout explainers byte for byte through the allowlist",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const pages={"respawn-readout-v1":"Respawn readout","tutorial-party-owner-v1":"Tutorial party owner","mid-frame-readout-v1":"Mid-frame readout","unset-dynamic-warp-v1":"Unset dynamic warp","status-names-v1":"Status names","surf-gated-exits-v2":"Surf-gated exits v2"};
 const tracked=new Map(Object.keys(pages).map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,body] of tracked)writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const [id,heading] of Object.entries(pages)){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status,id).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked.get(id)??Buffer.alloc(0)),id).toBe(true);expect(reply.body.toString()).toContain(`<h1>${heading}</h1>`);
 }
 expect((await get(viewer,"/explainers/status-names-v1.html",{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,"/explainers/surf-gated-exits-v2.html",{method:"PUT"})).status).toBe(405);
});

it("serves the tracked conversation ledger explainer byte for byte through the allowlist",async()=>{
 const id="instruction-ledger-v2";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Conversation ledger</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked automatic running explainer byte for byte through the allowlist",async()=>{
 const id="automatic-running-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Automatic running</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked battle refusal explainer byte for byte",async()=>{
 const id="battle-refusal-loop-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-refusal-explainer-"));
 const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");
 mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body).toEqual(tracked);
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the tracked battle readiness explainer through the existing protected route",async()=>{
 const id="battle-decision-ready-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-battle-ready-explainer-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it.each(["ineffective-navigation-v2","supervisor-briefing-v2","reachable-story-guidance-v1","text-only-supervisor-v2"])("serves the tracked recovery explainer %s byte for byte",async(id)=>{
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-recovery-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked explicit evolution explainer byte for byte through the allowlist",async()=>{
 const id="evolution-decision-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Explicit evolution decision</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});



it("serves the tracked observed instruction memory explainer byte for byte through the allowlist",async()=>{
 const id="observed-instructions-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("<h1>Keep the instruction whole.</h1>");
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});
it("serves the tracked starter decision explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/starter-decision-salience-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"starter-decision-salience-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/starter-decision-salience-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});
it("serves the tracked original-speed explainer only through the protected allowlist",async()=>{
 const id="original-speed-pacing-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-speed-explainer-"));
 const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");
 mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
 expect((await get(viewer,`/explainers/${id}.html`,{host:"elsewhere.invalid"})).status).toBe(403);
 expect((await get(viewer,`/explainers/${id}.html`,{method:"PUT"})).status).toBe(405);
});

it("serves the reports page, the report list and each report's own files, and nothing else",async()=>{
 const {runsRoot,viewer}=await fixture();const staticDir=join(dirname(runsRoot),"static");writeFileSync(join(staticDir,"reports.html"),"<title>Reports</title>");
 const d=join(runsRoot,"reports","run-analysis","2026-10-17_top50");mkdirSync(join(d,"shots"),{recursive:true});writeFileSync(join(d,"index.html"),"<title>Top 50</title>");writeFileSync(join(d,"shots","a.png"),PNG);writeFileSync(join(d,"run.exe"),"x");
 const page=await get(viewer,"/reports");expect(page.status).toBe(200);expect(page.body.toString()).toContain("<title>Reports</title>");
 const list=await get(viewer,"/api/reports");expect(list.status).toBe(200);expect(JSON.parse(list.body.toString())).toEqual([{slug:"2026-10-17_top50",date:"2026-10-17",title:"Top 50",kind:"REPORT",verdict:null,frontier:null,facts:[],trainer:null}]);
 const html=await get(viewer,"/reports/2026-10-17_top50/index.html");expect(html.status).toBe(200);expect(html.type).toContain("text/html");expect(html.body.toString()).toBe(`<title>Top 50</title>${REPORT_SCROLL_SCRIPT}`);
 expect((await get(viewer,"/reports/2026-10-17_top50/")).status).toBe(200);
 expect((await get(viewer,"/reports/2026-10-17_top50/shots/a.png")).type).toBe("image/png");
 for(const path of ["/reports/2026-10-17_top50/run.exe","/reports/2026-10-17_top50/../../events.jsonl","/reports/2026-10-17_top50/%2e%2e/x.html","/reports/x/index.html","/reports/2026-10-17_top50/missing.html"])expect((await get(viewer,path)).status,path).toBe(404);
 expect((await get(viewer,"/api/reports",{host:"elsewhere.invalid"})).status).toBe(403);
 expect(BROWSER_MODULES).toEqual(expect.arrayContaining(["reports-view","reports-main"]));
 writeFileSync(join(d,"live.html"),'<a href="http://127.0.0.1:8790/#run=abc">run abc</a> <a href="#top">top</a> <script>document.title="x"</script>');
 const live=await getWithHeaders(viewer,"/reports/2026-10-17_top50/live.html");
 expect(live.body).toBe(`<a target="_top" href="/#run=abc">run abc</a> <a href="#top">top</a> <script>document.title="x"</script>${REPORT_SCROLL_SCRIPT}`);
 expect(REPORT_SCROLL_SCRIPT).toBe(`<script>(${reportScrollProbe.toString()})(window);</script>`);
 expect((await get(viewer,"/reports/2026-10-17_top50/shots/a.png")).body.equals(PNG)).toBe(true);
 expect(live.csp).toContain("sandbox allow-scripts");expect(live.csp).toContain("script-src 'self' 'unsafe-inline'");expect(live.csp).not.toContain("allow-same-origin");
 expect((await getWithHeaders(viewer,"/reports")).csp).toContain("script-src 'self';");
});

it("serves the probes page, the probe list and one probe, and refuses unsafe probe ids", async () => {
  const { runsRoot, viewer } = await fixture();
  writeFileSync(join(dirname(runsRoot), "static", "probes.html"), "<title>Probes</title>");
  const dir = join(runsRoot, "probes", "p1");
  mkdirSync(join(dir, "gpu0"), { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ id: "p1", cases: [{ id: "c1", run: "r1", turn: 1, split: "heldout" }] }));
  writeFileSync(join(dir, "gpu0", "status.json"), JSON.stringify({ lane: "gpu0", state: "running", completed: 1, planned: 2, started: "2026-10-20T23:00:00.000Z" }));
  writeFileSync(join(dir, "gpu0", "samples.jsonl"), `${JSON.stringify({ case: "c1", arm: "on", sample: 0, at: "2026-10-20T23:00:01.000Z", elapsedMs: 5, decision: { key: "(text only)", thinking: "" } })}\n`);
  const page = await get(viewer, "/probes");
  expect(page.status).toBe(200);
  expect(page.body.toString()).toContain("<title>Probes</title>");
  const list = JSON.parse((await get(viewer, "/api/probes")).body.toString()) as { id: string; live: boolean }[];
  expect(list.map((p) => [p.id, p.live])).toEqual([["p1", true]]);
  const one = await get(viewer, "/api/probes/p1");
  expect(one.status).toBe(200);
  expect((JSON.parse(one.body.toString()) as { samples: unknown[] }).samples).toHaveLength(1);
  for (const path of ["/api/probes/nope", "/api/probes/..", "/api/probes/%2e%2e", "/api/probes/a%2Fb"]) expect((await get(viewer, path)).status, path).toBe(404);
  expect((await get(viewer, "/api/probes", { host: "elsewhere.invalid" })).status).toBe(403);
  expect(BROWSER_MODULES).toEqual(expect.arrayContaining(["probes-view", "probes-main", "probes-boot", "probe-stats"]));
});

function getWithHeaders(viewer: Viewer, path: string): Promise<{ body: string; csp: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port: viewer.port, path, headers: { host: `${HOST}:${String(viewer.port)}` } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => { resolve({ body: Buffer.concat(chunks).toString(), csp: String(res.headers["content-security-policy"] ?? "") }); });
    });
    req.on("error", reject); req.end();
  });
}

it("serves the caught nickname and fail-open explainers byte for byte, mapped from their cards",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const pages=[["party-menu-message-v1","Party menu message"],["party-item-confirmation-v1","Party item confirmation"],["caught-nickname-prompt-v1","Caught nickname question"],["fail-open-input-v1","Fail-open input"]] as const;
 for(const [id] of pages)writeFileSync(join(docs,`${id}.html`),readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url))));
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 for(const [id,title] of pages){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status).toBe(200);expect(reply.body.toString()).toContain(title);expect(reply.body.equals(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url))))).toBe(true);
 }
});

it("serves the field move gates explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="field-move-gates-v1",body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);expect(reply.body.toString()).toContain("<title>Field move gates</title>");
});

it("serves the whiteout healed explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const pages=[["whiteout-healed-v1","Whiteout healed"],["same-target-no-progress-v1","Same target, no progress"],["short-cycle-fixed-point-v1","Short-cycle fixed point"],["navigation-tool-use-guard-v1","Navigation tool-use guard"],["semantic-current-map-feedback-v1","Semantic current-map feedback"],["moving-npc-target-v1","Moving NPC target"]] as const;
 for(const [id] of pages)writeFileSync(join(docs,`${id}.html`),readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url))));
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 for(const [id,title] of pages){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status).toBe(200);expect(reply.body.toString()).toContain(title);expect(reply.body.equals(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url))))).toBe(true);
 }
});

it("serves the gym readiness readout explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="gym-readiness-readout-v1",tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Gym readiness readout");
});

it("serves the story progress clock explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="story-progress-clock-v1",tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Story progress clock");
});

it("serves the mart stock readout explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="mart-stock-readout-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Mart stock readout");
});

it("serves the shop interface explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="shop-interface-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Shop interface");
});

it("serves the training and catching explainers byte for byte, mapped from their cards",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const ids=["exp-next-level-v1","pokedex-own-v1","exp-earned-ledger-v1","leader-attempt-ledger-v1","seen-trainers-ledger-v1","party-coverage-v1","said-type-matches-v1"];
 const tracked=new Map(ids.map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,bytes] of tracked)writeFileSync(join(docs,`${id}.html`),bytes);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 for(const [id,bytes] of tracked){
  expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status).toBe(200);expect(reply.body.equals(bytes)).toBe(true);
 }
});

it("serves the YES/NO answer readout explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="yes-no-answer-readout-v1",tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("YES/NO answer readout");
});

it("serves the tracked pending field dialogue explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/pending-field-dialogue-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-pending-field-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"pending-field-dialogue-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/pending-field-dialogue-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves opted-in revisions while preserving the complete workbench endpoint", async () => {
  const { runsRoot, viewer } = await fixture(); writeRun(runsRoot, "cached", fullRun());
  const payloads: unknown[] = [];
  const client = createWorkbenchClient(async path => { const reply = await get(viewer, path); expect(reply.status).toBe(200); const value: unknown = JSON.parse(reply.body.toString()); payloads.push(value); return value; });
  const full = parseWorkbench(JSON.parse((await get(viewer, "/api/workbench")).body.toString()) as unknown);
  expect(await client()).toEqual(full); expect(await client()).toEqual(full);
  expect(payloads[0]).toMatchObject({ base: null, runs: full.runs });
  expect(payloads[1]).toMatchObject({ runs: [], removed: [] });
  expect((await get(viewer, "/api/workbench?updates=1&since=unknown")).body.toString()).toContain('"base":null');
});

it("serves the section-aware exit explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-sections-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="exit-labels-v3",tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the exploratory waypoint explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-sections-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="navigation-refusal-reasons-v3",tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked menu refusal recovery explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/menu-refusal-recovery-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-pending-field-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"menu-refusal-recovery-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/menu-refusal-recovery-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});
it("serves the tracked Gym door label explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/gym-door-label-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-pending-field-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"gym-door-label-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/gym-door-label-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it.each(["caught-dex-input-v1","caught-nickname-prompt-v2","cutscene-journal-v1","instruction-goal-advisory-v1","goal-review-repair-feedback-v1"])("serves tracked %s explainer byte for byte",async(id)=>{
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-pending-field-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the tracked GLM-run harness bug explainers byte for byte",async()=>{
 const ids=["story-goal-player-name-v1","cut-off-reply-feedback-v1","trainer-sight-check-v2","auto-talk-v2","map-wide-triggers-v1","drought-battle-heal-hold-v1","milestone-drought-suppression-v1"];
 const root=mkdtempSync(join(tmpdir(),"pokebench-glm-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=new Map(ids.map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,body] of tracked)writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const [id,body] of tracked){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(body)).toBe(true);
 }
});

it("serves the tracked interface-ownership explainers byte for byte",async()=>{
 const ids=["tool-prompt-docs-v1","field-ownership-feedback-v1","move-learn-loop-fingerprint-v1","stale-plan-fact-v1","post-battle-readout-v1","move-learn-tool-v1","move-learn-early-comparison-v1"];
 const root=mkdtempSync(join(tmpdir(),"pokebench-interface-explainers-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const tracked=new Map(ids.map(id=>[id,readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)))]));
 for(const [id,body] of tracked)writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const [id,body] of tracked){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(body)).toBe(true);
 }
});

it("serves the tracked progress-aware cycles explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/progress-aware-cycles-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-pending-field-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"progress-aware-cycles-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/progress-aware-cycles-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it.each(["gym-evidence-v1","rejected-movement-step-v1","observed-field-dialogue-v1"])("serves repair explainer %s byte for byte",async id=>{
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-repair-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("keeps malformed URL failures inside the request boundary and continues serving", async () => {
  const {viewer} = await fixture();
  const req = new IncomingMessage(new Socket());
  req.method = "GET"; req.url = "//["; req.headers.host = `${HOST}:${String(viewer.port)}`;
  const res = new ServerResponse(req);
  expect(() => viewer.server.emit("request",req,res)).not.toThrow();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(res.statusCode).toBe(500);
  expect((await get(viewer,"/api/frame-metrics")).status).toBe(200);
});

it("serves the tracked script boundary explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/trigger-navigation-boundary-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-trigger-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"trigger-navigation-boundary-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});
 try{const reply=await get(viewer,"/explainers/trigger-navigation-boundary-v1.html");expect(reply.status).toBe(200);expect(reply.body).toEqual(tracked);}finally{await viewer.close();rmSync(root,{recursive:true,force:true});}
});

it("serves both poison and berry explainers byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const files=["poison-readout-v1.html","berry-readout-v1.html"];
 for(const file of files)writeFileSync(join(docs,file),readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url))));
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const file of files){const tracked=readFileSync(join(docs,file)),reply=await get(viewer,`/explainers/${file}`);expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);}
});


it("serves the tracked navigation recovery recovery explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/navigation-recovery-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-pending-field-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"navigation-recovery-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/navigation-recovery-v1.html");
 expect(reply.status).toBe(200);expect(reply.type).toContain("text/html");expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the menu and factual healing explainers byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const ids=["menu-item-guidance-v1","factual-healing-guidance-v1"];
 for(const id of ids)writeFileSync(join(docs,`${id}.html`),readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url))));
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 for(const id of ids){
  const reply=await get(viewer,`/explainers/${id}.html`);
  expect(reply.status).toBe(200);
  expect(reply.body.equals(readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url))))).toBe(true);
 }
});


it("serves the battle move-learning owner explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/battle-move-learn-input-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-learn-owner-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"battle-move-learn-input-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/battle-move-learn-input-v1.html");
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the checked requested strides explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/rejected-movement-stride-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-stride-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"rejected-movement-stride-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/rejected-movement-stride-v1.html");expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the current boundary facts explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/boundary-crossing-facts-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-boundary-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"boundary-crossing-facts-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/boundary-crossing-facts-v1.html");expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});


it("serves the delivered place evidence explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/delivered-place-evidence-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-place-evidence-"));const staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 writeFileSync(join(docs,"delivered-place-evidence-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/delivered-place-evidence-v1.html");
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the section alternatives explainer byte for byte",async()=>{
 const tracked=readFileSync(fileURLToPath(new URL("../../../docs/explainers/reachable-section-alternatives-v1.html",import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-section-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,"reachable-section-alternatives-v1.html"),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,"/explainers/reachable-section-alternatives-v1.html");expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the rejected movement prefix explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="rejected-movement-prefix-v1",source=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 writeFileSync(join(docs,`${id}.html`),source);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(source)).toBe(true);
});

it("serves the coherent battle observation explainer byte for byte, mapped from its card",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="coherent-battle-observation-v1";
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");
 expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);expect(reply.body.toString()).toContain("Coherent battle observation");
});

it("serves the map-cycle recovery explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="map-cycle-recovery-v1",source=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 writeFileSync(join(docs,`${id}.html`),source);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);
 expect(reply.status).toBe(200);expect(reply.body.equals(source)).toBe(true);
});

it("serves the move-learning goal reminder explainer byte for byte from its card mapping",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="move-learn-goal-reminder-v1",body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);const {FEATURE_EXPLAINERS}=await import("./panels.js");expect(FEATURE_EXPLAINERS[id]).toBe(`${id}.html`);const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});
it.each(["restored-memory-run-v1","blackout-transition-v1","whiteout-outcomes-v2"] as const)("serves the tracked %s explainer byte for byte",async id=>{
 const tracked=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));
 const root=mkdtempSync(join(tmpdir(),"pokebench-recovery-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});writeFileSync(join(docs,`${id}.html`),tracked);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(tracked)).toBe(true);
});

it("serves the navigation cycle stop explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="navigation-cycle-stop-v1",source=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),source);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(source)).toBe(true);
});

it("serves the observed trainer Pokémon explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-explainers-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="trainer-observed-party-v1",body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it.each(["leader-loss-immediate-v1","battle-action-history-v1","leader-preparation-comparison-v1"])("serves tracked battle history explainer %s byte for byte",async id=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-history-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves the exact tracked refusal ledger explainer through the feature allowlist",async()=>{
 const id="refusal-ledger-v1",root=mkdtempSync(join(tmpdir(),"pokebench-refusals-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");
 mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves the shared nonterminal guard explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-nonterminal-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const file="loop-guard-supervisor-v1.html",body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${file}`,import.meta.url)));writeFileSync(join(docs,file),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const {FEATURE_EXPLAINERS}=await import("./panels.js");expect(FEATURE_EXPLAINERS["deterministic-loop-guard-v1"]).toBe(file);
 const reply=await get(viewer,`/explainers/${file}`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves the tracked player elevation explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-elevation-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="player-elevation-readout-v1",body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves the exact independent interface guidance explainer",async()=>{
 const id="interface-guidance-v1",root=mkdtempSync(join(tmpdir(),"pokebench-interface-guidance-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");
 mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves the tracked native task retirement explainer through the existing allowlist",async()=>{
 const id="native-task-goal-retirement-v1",root=mkdtempSync(join(tmpdir(),"pokebench-task-goal-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");
 mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});


it.each(["instruction-goal-ledger-v1","menu-option-tool-v1","mauville-puzzle-readout-v1","map-observability-v1"])("serves the exact tracked %s explainer through the feature allowlist",async id=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-goal-menu-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);
 const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it.each(["bag-pocket-truth-v1","bag-press-feedback-v1","bag-ineffective-loop-v1"])("serves tracked bag explainer %s byte for byte",async id=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-bag-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves the tracked citation evidence explainer byte for byte",async()=>{
 const root=mkdtempSync(join(tmpdir(),"pokebench-elevation-explainer-")),staticDir=join(root,"packages/viewer/static"),docs=join(root,"docs/explainers");mkdirSync(staticDir,{recursive:true});mkdirSync(docs,{recursive:true});
 const id="citation-evidence-v1",body=readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${id}.html`,import.meta.url)));writeFileSync(join(docs,`${id}.html`),body);
 const viewer=await startViewer({runsRoot:join(root,"runs"),staticDir,appDir:join(root,"app"),port:0});open.push(viewer);const reply=await get(viewer,`/explainers/${id}.html`);expect(reply.status).toBe(200);expect(reply.body.equals(body)).toBe(true);
});

it("serves complete BAG history without trace paging and updates its persisted summary on append", async () => {
  const { bagRun, resources } = await import("../test-support/bag.js");
  const { runsRoot, viewer } = await fixture(); const log = bagRun(), run = log.events[0]?.run ?? "missing";
  writeRun(runsRoot, run, log);
  const first = await get(viewer, `/api/runs/${run}/bag`);
  expect(first.status).toBe(200);
  const body = JSON.parse(first.body.toString()) as { run: string; throughSeq: number; html: string; range: string };
  expect(body.run).toBe(run); expect(body.html).toContain("¥3,100"); expect(body.html).toContain("7</b><span>ITEMS GAINED");
  expect(body.range).toBe(`RUN ${run.split("_").at(-1) ?? ""} · T0–T80`);
  const event = log.add(10000, state({ turn: 100, money: 3300, resources: resources([[4, 5, "poke_balls", "POKé BALL"]]) }));
  appendFileSync(join(runsRoot, run, "events.jsonl"), JSON.stringify(event) + "\n");
  const next = await get(viewer, `/api/runs/${run}/bag`);
  expect(next.status).toBe(200); expect(next.body.toString()).toContain("¥3,300");
  expect((JSON.parse(next.body.toString()) as { throughSeq: number }).throughSeq).toBe(event.seq);
  expect((await get(viewer, "/api/runs/not-there/bag")).status).toBe(503);
});

it("reports unusable BAG summary storage through the real HTTP endpoint without false totals", async () => {
  const { bagRun } = await import("../test-support/bag.js");
  const { runsRoot, viewer } = await fixture(); const log = bagRun(), run = log.events[0]?.run ?? "missing";
  writeRun(runsRoot, run, log); writeFileSync(join(runsRoot, ".viewer-cache"), "blocked");
  const reply = await get(viewer, `/api/runs/${run}/bag`);
  expect(reply.status).toBe(503);
  expect(reply.body.toString()).toContain("Bag history unavailable");
  expect(reply.body.toString()).not.toContain("ITEMS GAINED");
});
