import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_ON } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { DEFAULT_NEXT_RUN, RunQueue } from "./next-run.js";
import { connect } from "node:net";
import { HOST, startViewer, type Viewer, type ViewerOptions } from "./server.js";

// The fixture run's game server (port 8011 in START) answers /health.
const gameUp: typeof fetch = (input) => Promise.resolve(new Response("{}", { status: typeof input === "string" && input === "http://127.0.0.1:8011/health" ? 200 : 404 }));

const open: Viewer[] = [];
afterEach(async () => { while (open.length > 0) await open.pop()?.close(); });

async function viewer(extra: Partial<ViewerOptions> = {}): Promise<{ viewer: Viewer; runsRoot: string }> {
  const base = mkdtempSync(join(tmpdir(), "viewer-controls-"));
  const runsRoot = join(base, "runs");
  mkdirSync(runsRoot);
  const v = await startViewer({ runsRoot, staticDir: base, appDir: base, port: 0, ...extra });
  open.push(v);
  return { viewer: v, runsRoot };
}

function call(v: Viewer, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown }> {
  const origin = `http://${HOST}:${String(v.port)}`;
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port: v.port, path, method, headers: { host: `${HOST}:${String(v.port)}`, origin, "content-type": "application/json", ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8") || "null") as unknown }); });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
}

function liveRun(runsRoot: string, id: string): void {
  const log = new Log(); log.add(0, START);
  mkdirSync(join(runsRoot, id), { recursive: true });
  writeFileSync(join(runsRoot, id, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
}

describe("write routes", () => {
  it("accept only same-origin JSON within the size bound", async () => {
    const { viewer: v, runsRoot } = await viewer({ fetchFn: gameUp });
    liveRun(runsRoot, "live");
    expect((await call(v, "POST", "/api/runs/live/control", { action: "pause" }, { origin: "http://evil.example" })).status).toBe(403);
    expect((await call(v, "POST", "/api/runs/live/control", { action: "pause" }, { origin: "" })).status).toBe(403);
    expect((await call(v, "POST", "/api/runs/live/control", { action: "pause" }, { origin: `http://localhost:${String(v.port)}` })).status).toBe(403);
    expect((await call(v, "POST", "/api/runs/live/control", { action: "pause" }, { host: `localhost:${String(v.port)}`, origin: `http://localhost:${String(v.port)}` })).status).toBe(200);
    expect((await call(v, "POST", "/api/runs/live/control", "action=pause", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await call(v, "POST", "/api/runs/live/control", "{nope")).status).toBe(400);
    expect((await call(v, "POST", "/api/runs/live/control", "x".repeat(70 * 1024))).status).toBe(413);
    expect((await call(v, "DELETE", "/api/runs/live/control")).status).toBe(405);
    expect((await call(v, "POST", "/api/runs/live/explode", {})).status).toBe(404);
  });

  it("append typed control requests for live runs only", async () => {
    const { viewer: v, runsRoot } = await viewer({ now: () => new Date(), fetchFn: gameUp });
    liveRun(runsRoot, "live");
    expect(await call(v, "POST", "/api/runs/live/control", { action: "pause" })).toEqual({ status: 200, json: { request: 1 } });
    expect(await call(v, "POST", "/api/runs/live/control", { action: "stop" })).toEqual({ status: 200, json: { request: 2 } });
    expect(readFileSync(join(runsRoot, "live", "control.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { action: string }).action)).toEqual(["pause", "stop"]);
    expect((await call(v, "POST", "/api/runs/live/control", { action: "explode" })).status).toBe(400);
    expect((await call(v, "POST", "/api/runs/nope/control", { action: "pause" })).status).toBe(409);
  });
});

describe("next run", () => {
  it("serves the feature registry, saves the draft and reports strict history for it", async () => {
    const { viewer: v } = await viewer();
    const features = await call(v, "GET", "/api/features");
    expect(features.status).toBe(200);
    expect((features.json as { features: { id: string }[] }).features).toHaveLength(28);
    expect(await call(v, "GET", "/api/next-run")).toEqual({ status: 200, json: { draft: DEFAULT_NEXT_RUN, queue: { state: "idle" } } });
    const draft = { ...DEFAULT_NEXT_RUN, model: "Qwen", features: { ...ALL_ON, "story-state-v1": false } };
    expect(await call(v, "PUT", "/api/next-run", draft)).toEqual({ status: 200, json: { draft, queue: { state: "idle" } } });
    expect((await call(v, "PUT", "/api/next-run", { ...draft, features: { ...ALL_ON, "ram-state-v1": false } })).status).toBe(409);
    const history = await call(v, "GET", "/api/features/history");
    expect(history.status).toBe(200);
    expect(Object.values(history.json as Record<string, unknown>).every((h) => h === null)).toBe(true);
    expect((await call(v, "POST", "/api/next-run/queue", draft)).status).toBe(503);
  });

  it("queues only vision models the local router serves, and reports queue status", async () => {
    const base = mkdtempSync(join(tmpdir(), "viewer-queue-"));
    writeFileSync(join(base, "endpoint.json"), JSON.stringify({ base_url: "http://127.0.0.1:18434/v1", api_key: "k" }));
    const router: typeof fetch = (input) => Promise.resolve(new Response(JSON.stringify({ data: [{ id: "Qwen", status: { value: "loaded", args: ["--mmproj", "m", "--ctx-size", "262144"] } }, { id: "TextOnly", status: { value: "loaded", args: ["--ctx-size", "8192"] } }, { id: "Asleep", status: { value: "unloaded", args: ["--mmproj", "m", "--ctx-size", "8192"] } }, { id: "NoContext", status: { value: "loaded", args: ["--mmproj", "m"] } }] }), { status: input === "http://127.0.0.1:18434/v1/models" ? 200 : 404 }));
    const queue = new RunQueue({ runsRoot: join(base, "runs"), liveJs: "/x/live.js", endpointFile: join(base, "endpoint.json"), gamePort: 8076, healthy: () => Promise.resolve(false), now: () => new Date("2026-10-13T16:00:00.000Z"), random: () => "cd34", launch: () => new Promise(() => undefined) });
    const { viewer: v } = await viewer({ queue, runsRoot: join(base, "runs"), endpointFile: join(base, "endpoint.json"), fetchFn: router });
    const unknown = await call(v, "POST", "/api/next-run/queue", { ...DEFAULT_NEXT_RUN, model: "invented" });
    expect(unknown.status).toBe(409);
    expect(JSON.stringify(unknown.json)).toContain("not a loaded vision model on the local router");
    for (const model of ["TextOnly", "Asleep", "NoContext"]) expect((await call(v, "POST", "/api/next-run/queue", { ...DEFAULT_NEXT_RUN, model })).status).toBe(409);
    expect((await call(v, "POST", "/api/next-run/queue", { ...DEFAULT_NEXT_RUN, model: "Qwen", maxTokens: 300_000 })).status).toBe(409);
    const queued = await call(v, "POST", "/api/next-run/queue", { ...DEFAULT_NEXT_RUN, model: "Qwen" });
    expect(queued).toEqual({ status: 200, json: { queue: { state: "queued", runId: "2026-10-13T12-00-00_Qwen_cd34", waitingFor: "checking" } } });
    // While queued the server owns the lock: no draft edits and no re-queue.
    const edit = await call(v, "PUT", "/api/next-run", { ...DEFAULT_NEXT_RUN, model: "Qwen", maxTurns: 5 });
    expect(edit.status).toBe(409);
    expect(JSON.stringify(edit.json)).toContain("cancel it to edit");
    expect((await call(v, "POST", "/api/next-run/queue", { ...DEFAULT_NEXT_RUN, model: "Qwen" })).status).toBe(409);
    expect((await call(v, "GET", "/api/next-run")).json).toMatchObject({ draft: { maxTurns: 300 } });
    expect(await call(v, "POST", "/api/next-run/cancel", {})).toEqual({ status: 200, json: { queue: { state: "idle" } } });
    expect((await call(v, "POST", "/api/next-run/cancel", {})).status).toBe(409);
    const { viewer: noEndpoint } = await viewer({ queue, runsRoot: join(base, "runs") });
    expect((await call(noEndpoint, "POST", "/api/next-run/queue", { ...DEFAULT_NEXT_RUN, model: "Qwen" })).status).toBe(409);
  });

  it("marks each run live only while its game server answers", async () => {
    const { viewer: v, runsRoot } = await viewer({ fetchFn: gameUp });
    liveRun(runsRoot, "up");
    const listed = await call(v, "GET", "/api/runs");
    expect((listed.json as { id: string; live: boolean }[]).map((r) => [r.id, r.live])).toEqual([["up", true]]);
    const { viewer: down } = await viewer({ runsRoot, fetchFn: () => Promise.reject(new Error("refused")) });
    expect((((await call(down, "GET", "/api/runs")).json) as { live: boolean }[])[0]?.live).toBe(false);
  });

  it("lists local router models and never the gateway", async () => {
    const dir = mkdtempSync(join(tmpdir(), "endpoint-"));
    writeFileSync(join(dir, "endpoint.json"), JSON.stringify({ base_url: "http://127.0.0.1:18434/v1", api_key: "k" }));
    const fetchFn: typeof fetch = (input) => { const url = typeof input === "string" ? input : ""; return Promise.resolve(new Response(url === "http://127.0.0.1:18434/v1/models" ? JSON.stringify({ data: [{ id: "Qwen", status: { value: "loaded", args: ["--mmproj", "m"] } }] }) : "{}", { status: url.endsWith("/models") ? 200 : 404 })); };
    const { viewer: withModels } = await viewer({ endpointFile: join(dir, "endpoint.json"), fetchFn });
    expect(await call(withModels, "GET", "/api/models")).toEqual({ status: 200, json: { models: [{ id: "Qwen", status: "loaded", vision: true, contextWindow: null }] } });
    const { viewer: without } = await viewer();
    expect((await call(without, "GET", "/api/models")).status).toBe(503);
    const { viewer: broken } = await viewer({ endpointFile: join(dir, "missing.json") });
    expect((await call(broken, "GET", "/api/models")).status).toBe(502);
  });
});

describe("local-only assets", () => {
  it("serves the vendored fonts and a CSP that allows no other origin", async () => {
    const { viewer: v } = await viewer({ staticDir: join(import.meta.dirname, "../static") });
    const font = await new Promise<{ status: number; type: string; csp: string; size: number }>((resolve, reject) => {
      const req = request({ host: HOST, port: v.port, path: "/fonts/press-start-2p.woff2", headers: { host: `${HOST}:${String(v.port)}` } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => { resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"] ?? "", csp: String(res.headers["content-security-policy"]), size: Buffer.concat(chunks).length }); });
      });
      req.on("error", reject); req.end();
    });
    expect(font.status).toBe(200);
    expect(font.type).toBe("font/woff2");
    expect(font.size).toBeGreaterThan(1000);
    expect(font.csp).not.toMatch(/https?:/);
    expect(font.csp).toContain("font-src 'self'");
    expect((await call(v, "GET", "/fonts/other.woff2")).status).toBe(404);
  });
});


describe("write failures", () => {
  it("answers 500 for a failing write and keeps serving", async () => {
    const { viewer: v, runsRoot } = await viewer();
    writeFileSync(join(runsRoot, ".viewer"), "not a directory");
    const failed = await call(v, "PUT", "/api/next-run", { ...DEFAULT_NEXT_RUN });
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.json)).toContain("error");
    expect((await call(v, "GET", "/api/features")).status).toBe(200);
  });

  it("survives a client that disconnects mid-body", async () => {
    const { viewer: v } = await viewer();
    await new Promise<void>((resolve) => {
      const socket = connect(v.port, HOST, () => {
        socket.write(`POST /api/next-run/queue HTTP/1.1\r\nHost: ${HOST}:${String(v.port)}\r\nOrigin: http://${HOST}:${String(v.port)}\r\nContent-Type: application/json\r\nContent-Length: 5000\r\n\r\n{"model":`);
        setTimeout(() => { socket.destroy(); resolve(); }, 50);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await call(v, "GET", "/api/features")).status).toBe(200);
  });
});
