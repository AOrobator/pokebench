import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { FEATURES } from "@pokebench/agent/features";
import { CONTROL_ACTIONS } from "@pokebench/agent/events";
import { BaselineError, RunsError, baselineOf, comparisonsOf, eventsPath, listRuns, liveScreenPort, readFrom, runDir } from "./runs.js";
import { featureHistory } from "./history.js";
import { localModels } from "./models.js";
import { NextRunError, appendControl, healthProbe, liveRuns, readDraft, writeDraft, type RunQueue } from "./next-run.js";
import { MILESTONE_ORDER } from "./model.js";

export const HOST = "127.0.0.1";
// Browser code the page may load; everything else in dist/ stays private.
export const BROWSER_MODULES = ["main", "app", "model", "format", "inspectformat", "timeline", "panels", "gba", "replay", "controls", "nextpanel"] as const;

const MODULE_NAME = new RegExp(`^(${BROWSER_MODULES.join("|")})\\.js$`);
const FRAME_NAME = /^\d{6}_\d+\.png$/;
const FONT_NAME = /^(press-start-2p|inter|jetbrains-mono)\.woff2$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SCREEN_TIMEOUT_MS = 3_000;

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; img-src 'self'; connect-src 'self'",
};

export interface ViewerOptions {
  readonly runsRoot: string;
  readonly staticDir: string;
  readonly appDir: string;
  readonly port: number;
  readonly pollMs?: number;
  readonly fetchFn?: typeof fetch;
  // Next-run controls: the local router's endpoint file and the run queue.
  readonly endpointFile?: string | null;
  readonly queue?: RunQueue;
  readonly now?: () => Date;
}

const MAX_BODY = 64 * 1024;
const ControlBodySchema = Type.Object({ action: Type.Enum(CONTROL_ACTIONS) }, { additionalProperties: false });

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Writes come only from this page: same origin, JSON body, bounded size.
async function jsonBody(req: IncomingMessage): Promise<unknown> {
  // The page's origin is exactly the host it was served from (already allowlisted).
  if (req.headers.origin !== `http://${req.headers.host ?? ""}`) throw new RequestError(403, "writes are accepted only from the viewer page");
  if (req.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") throw new RequestError(415, "send application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY) throw new RequestError(413, "request body too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestError(400, "request body is not JSON");
  }
}

async function write(req: IncomingMessage, res: ServerResponse, options: ViewerOptions, port: number, parts: string[]): Promise<void> {
  const [, second, id, leaf] = parts;
  const now = options.now?.() ?? new Date();
  try {
    const body = await jsonBody(req);
    if (req.method === "POST" && parts.length === 4 && second === "runs" && id !== undefined && leaf === "control") {
      if (!Value.Check(ControlBodySchema, body)) throw new RequestError(400, "action must be pause, resume, stop, cancel_stop or abort");
      sendJson(res, 200, { request: await appendControl(options.runsRoot, id, body.action, now, healthProbe(options.fetchFn ?? fetch)) });
      return;
    }
    if (req.method === "PUT" && parts.length === 2 && second === "next-run") {
      sendJson(res, 200, { draft: writeDraft(options.runsRoot, body), queue: options.queue?.status() ?? { state: "idle" } });
      return;
    }
    if (req.method === "POST" && parts.length === 3 && second === "next-run" && (id === "queue" || id === "cancel")) {
      if (options.queue === undefined) throw new RequestError(503, "this viewer has no run queue");
      if (id === "cancel") {
        sendJson(res, 200, { queue: options.queue.cancel() });
        return;
      }
      const draft = writeDraft(options.runsRoot, body);
      if (options.endpointFile === undefined || options.endpointFile === null) throw new NextRunError("the viewer was started without a local model endpoint file");
      const served = await localModels(options.endpointFile, options.fetchFn ?? fetch);
      // The play run accepts only loaded vision models with a known context size.
      if (!served.some((m) => m.id === draft.model && m.vision && m.status === "loaded" && m.contextWindow !== null)) throw new NextRunError(`model ${draft.model} is not a loaded vision model on the local router`);
      sendJson(res, 200, { queue: options.queue.enqueue(draft) });
      return;
    }
    throw new RequestError(404, "not found");
  } catch (error) {
    if (error instanceof RequestError) sendJson(res, error.status, { error: error.message });
    else if (error instanceof NextRunError) sendJson(res, 409, { error: error.message });
    else throw error;
  }
}

export interface Viewer {
  readonly server: Server;
  readonly address: string;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": type });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function sendFile(res: ServerResponse, path: string, type: string): void {
  let body: Buffer;
  try {
    body = readFileSync(path);
  } catch {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  send(res, 200, type, body);
}

function segments(rawUrl: string): string[] | null {
  const { pathname } = new URL(rawUrl, "http://viewer.invalid");
  try {
    return pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
}

function streamEvents(req: IncomingMessage, res: ServerResponse, path: string, pollMs: number): void {
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
  const emit = (type: string, data: unknown): void => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  let offset = 0;
  let lineNo = 0;
  // Returns true once run_end has been sent.
  const pump = (): boolean => {
    const read = readFrom(path, offset, lineNo);
    offset = read.offset;
    lineNo = read.lineNo;
    let ended = false;
    for (const result of read.results) {
      if (result.ok) {
        emit("ev", result.event);
        ended ||= result.event.type === "run_end";
      } else {
        emit("problem", { line: result.line, problem: result.problem });
      }
    }
    return ended;
  };
  const finish = (): void => {
    emit("done", {});
    res.end();
  };
  const endedAtStart = pump();
  emit("caught_up", {});
  if (endedAtStart) {
    finish();
    return;
  }
  const timer = setInterval(() => {
    if (pump()) {
      clearInterval(timer);
      finish();
    }
  }, pollMs);
  req.on("close", () => {
    clearInterval(timer);
  });
}

async function liveScreen(res: ServerResponse, port: number, fetchFn: typeof fetch): Promise<void> {
  const url = `http://${HOST}:${String(port)}/screenshot`;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(SCREEN_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`);
    const body: unknown = await response.json();
    const data = typeof body === "object" && body !== null && "screenshot_base64" in body ? body.screenshot_base64 : null;
    if (typeof data !== "string") throw new Error(`malformed ${url} payload`);
    const png = Buffer.from(data, "base64");
    if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${url} is not a PNG`);
    send(res, 200, "image/png", png);
  } catch (error) {
    sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function route(req: IncomingMessage, res: ServerResponse, options: ViewerOptions, port: number): Promise<void> {
  const host = req.headers.host ?? "";
  if (host !== `${HOST}:${String(port)}` && host !== `localhost:${String(port)}`) {
    sendJson(res, 403, { error: "the viewer only answers 127.0.0.1" });
    return;
  }
  const parts = segments(req.url ?? "/");
  if (parts === null) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if ((req.method === "POST" || req.method === "PUT") && parts[0] === "api") {
    await write(req, res, options, port, parts);
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET, or POST/PUT to /api" });
    return;
  }
  const [head, second, id, leaf, file] = parts;
  if (parts.length === 2 && head === "api" && second === "features") {
    sendJson(res, 200, { features: FEATURES, milestones: MILESTONE_ORDER });
    return;
  }
  if (parts.length === 3 && head === "api" && second === "features" && id === "history") {
    sendJson(res, 200, featureHistory(options.runsRoot, (({ model, thinking, maxTokens, maxTurns, maxWallMs, failureLimit, target, features }) => ({ model, thinking, maxTokens, maxTurns, maxWallMs, failureLimit, target, features }))(readDraft(options.runsRoot))));
    return;
  }
  if (parts.length === 2 && head === "api" && second === "next-run") {
    sendJson(res, 200, { draft: readDraft(options.runsRoot), queue: options.queue?.status() ?? { state: "idle" } });
    return;
  }
  if (parts.length === 2 && head === "api" && second === "models") {
    if (options.endpointFile === undefined || options.endpointFile === null) {
      sendJson(res, 503, { error: "the viewer was started without a local model endpoint file" });
      return;
    }
    try {
      sendJson(res, 200, { models: await localModels(options.endpointFile, options.fetchFn ?? fetch) });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (parts.length === 1 && head === "") {
    sendFile(res, join(options.staticDir, "index.html"), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 1 && head === "style.css") {
    sendFile(res, join(options.staticDir, "style.css"), "text/css; charset=utf-8");
    return;
  }
  if (parts.length === 2 && head === "fonts" && second !== undefined && FONT_NAME.test(second)) {
    sendFile(res, join(options.staticDir, "fonts", second), "font/woff2");
    return;
  }
  if (parts.length === 2 && head === "app" && second !== undefined && MODULE_NAME.test(second)) {
    sendFile(res, join(options.appDir, second), "text/javascript; charset=utf-8");
    return;
  }
  if (head !== "api" || second !== "runs") {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (parts.length === 2) {
    const live = new Set(await liveRuns(options.runsRoot, healthProbe(options.fetchFn ?? fetch)));
    sendJson(res, 200, listRuns(options.runsRoot).map((run) => ({ ...run, live: live.has(run.id) })));
    return;
  }
  try {
    if (id === undefined) throw new RunsError("no run id");
    const dir = runDir(options.runsRoot, id);
    if (parts.length === 4 && leaf === "events") {
      const path = eventsPath(options.runsRoot, id);
      if (!existsSync(path)) throw new RunsError(`run ${id} has no events.jsonl`);
      streamEvents(req, res, path, options.pollMs ?? 250);
      return;
    }
    if (parts.length === 4 && leaf === "comparisons") {
      sendJson(res, 200, comparisonsOf(options.runsRoot, id));
      return;
    }
    if (parts.length === 4 && leaf === "milestones") {
      try {
        sendJson(res, 200, baselineOf(options.runsRoot, id));
      } catch (error) {
        if (!(error instanceof BaselineError)) throw error;
        sendJson(res, 422, { error: error.message });
      }
      return;
    }
    if (parts.length === 5 && leaf === "frames" && file !== undefined && FRAME_NAME.test(file)) {
      sendFile(res, join(dir, "frames", file), "image/png");
      return;
    }
    if (parts.length === 4 && leaf === "screen") {
      const live = liveScreenPort(options.runsRoot, id);
      if (live === null) {
        sendJson(res, 409, { error: "the run has ended; replay uses frames/" });
        return;
      }
      await liveScreen(res, live, options.fetchFn ?? fetch);
      return;
    }
  } catch {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  sendJson(res, 404, { error: "not found" });
}

export async function startViewer(options: ViewerOptions): Promise<Viewer> {
  let port = 0;
  // A failing request (a client that disconnects mid-body, a file error) must
  // never take the viewer and its queue down.
  const server = createServer((req, res) => {
    route(req, res, options, port).catch((error: unknown) => {
      if (res.headersSent || res.destroyed) res.destroy();
      else sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  const queue = options.queue;
  const ticker = queue === undefined ? null : setInterval(() => { queue.tick().catch(() => undefined); }, 1_000);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, HOST, resolve);
  });
  const address = server.address() as AddressInfo;
  port = address.port;
  return {
    server,
    address: address.address,
    port,
    url: `http://${HOST}:${String(port)}/`,
    close: () =>
      new Promise<void>((resolve) => {
        if (ticker !== null) clearInterval(ticker);
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
