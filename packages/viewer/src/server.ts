import { PAGE_SPRITE_PATH } from "./trainer-page.js";
import {createCurrentPool,type CurrentPoolOptions} from "./current-pool.js";
import {createCurrentApi,type CurrentApi} from "./current-api.js";
import {readTurnBudgetReceipt} from "./budget-receipt.js";
import { createBroadcastStore, type BroadcastDisk, type BroadcastStore } from "./broadcast-store.js";
import { createBagHistoryReader, type BagHistoryReader } from "./bag-history.js";
import { bagPage, bagRange, NO_ART, parseBagArt } from "./bag.js";
import { readTraceHistory } from "./trace-history.js";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Timing } from "./frame-diagnostics.js";
import { createHash, randomUUID } from "node:crypto";
import { createWorkbenchUpdates, type WorkbenchUpdate } from "./workbench-sync.js";
import { ProbeError, listProbes, readProbe } from "./probes.js";
import { byteRange, listReports, reportFile } from "./reports.js";
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { recoveredAttacher } from "./recovered-fields.js";
import { readFixedStatuses } from "./fixed-status.js";
import { pidAlive } from "./lease.js";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { FEATURES } from "@pokebench/agent/features";
import { CONTROL_ACTIONS, type RunEvent } from "@pokebench/agent/events";
import type { BaselineStore, RunStore } from "./baseline-store.js";
import { createCardReader, createCardStore } from "./baseline-store.js";
import { createFrontierCache, type FrontierCache } from "./frontier-cache.js";
import { BaselineError, RunsError, createBaselineReader, createRunCatalog, comparisonsOf, type BaselineCompute, eventsPath, liveScreenPort, LogReader, readRecentEventsAsync, readHeadEvents, readStart, readStartIdentity, runDir, type BaselineReader, type RunCatalog } from "./runs.js";
import { featureHistory } from "./history.js";
import { localModels } from "./models.js";
import { NextRunError, appendControl, healthProbe, liveRuns, readDraft, writeDraft, type RunQueue } from "./next-run.js";
import { WORKBENCH_POLL_MS, type WorkbenchData } from "./workbench-data.js";
import { cardWorkbench, createWorkbenchLoader, runFromSave, workbenchSnapshot, type LoadedRun, type WorkbenchCompute } from "./workbench-store.js";
import { MILESTONE_ORDER } from "./model.js";
import { defaultViewerBuild, skewOf, type Skew, type ViewerBuild } from "./build-stamp.js";
import { FEATURE_EXPLAINERS, STANDING_EXPLAINERS } from "./panels.js";
import { REPORT_SCROLL_SCRIPT } from "./reports-scroll.js";
import { WebSocketServer } from "ws";
import { SharedFrameHub } from "./frame-hub.js";
import { BROWSER_MODULES } from "./browser-modules.js";

export const HOST = "127.0.0.1";

const MODULE_NAME = new RegExp(`^(${BROWSER_MODULES.join("|")})\\.js$`);
const FRAME_NAME = /^\d{6}_\d+\.png$/;
const FONT_NAME = /^(press-start-2p|inter|jetbrains-mono)\.woff2$/;
// The trainer card art `just trainer-card-art` builds from the ROM into runs/sprites (never into git).
const SPRITE_PATH = /^(manifest\.json|card\/(wide|mini|mini-ribbon)-(green|bronze|copper|silver|gold)\.png|trainers\/[a-z]+\.png|font\/glyphs\.(png|json)|icons\/[1-9][0-9]{0,2}\.png)$/;
// The BAG page item icons `just bag-art` builds from the ROM into runs/sprites/bag-v1 (never into git).
const BAG_SPRITE_PATH = /^(manifest\.json|items\/[1-9][0-9]{0,2}\.png)$/;
// The POKéMON PARTY page art and tables `just party-art` builds from the ROM into runs/sprites/party-v1 (never into git).
const PARTY_SPRITE_PATH = /^(manifest\.json|data\.json|front\/(?:[1-9][0-9]?|[1-3][0-9]{2}|40[0-9]|41[01])\.png|parts\/(?:types|status|hp-tag|exp-empty|exp-full|marks|ball-big|ball-small|balls)\.png|font\/(?:small|normal)\.(?:png|json))$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SCREEN_TIMEOUT_MS = 3_000;
const FRAME_MAX_BYTES = 1024 * 1024;
const PNG_MAX_DIMENSION = 2048;

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function validFramePng(png: Buffer): boolean {
  if (png.length < 45 || png.length > FRAME_MAX_BYTES || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;
  let offset = PNG_SIGNATURE.length;
  let chunks = 0;
  let sawIdat = false;
  while (offset <= png.length - 12) {
    const length = png.readUInt32BE(offset);
    if (length > png.length - offset - 12) return false;
    const dataEnd = offset + 8 + length;
    const chunkEnd = dataEnd + 4;
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (png.readUInt32BE(dataEnd) !== crc32(png.subarray(offset + 4, dataEnd))) return false;
    if (chunks === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      const width = png.readUInt32BE(offset + 8), height = png.readUInt32BE(offset + 12);
      if (width === 0 || height === 0 || width > PNG_MAX_DIMENSION || height > PNG_MAX_DIMENSION) return false;
    } else if (type === "IHDR") return false;
    if (type === "IDAT") sawIdat = true;
    if (type === "IEND") return length === 0 && sawIdat && chunkEnd === png.length;
    offset = chunkEnd;
    chunks += 1;
  }
  return false;
}

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; img-src 'self' blob:; connect-src 'self'",
};

// A run-analysis report is our own static page, often with inline scripts (charts, filters). It runs sandboxed in
// an opaque origin, so its scripts cannot call the viewer's control endpoints, and links back to the viewer open
// in the top window on whatever host is serving it.
const REPORT_HEADERS = {
  ...SECURITY_HEADERS,
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self'; connect-src 'none'; " +
    "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
};
function sendReportVideo(req: IncomingMessage, res: ServerResponse, path: string, type: string): void {
  const { size } = statSync(path);
  const range = byteRange(req.headers.range, size);
  if (range === "unsatisfiable") { res.writeHead(416, { ...SECURITY_HEADERS, "content-range": `bytes */${String(size)}` }); res.end(); return; }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  res.writeHead(range === null ? 200 : 206, { ...SECURITY_HEADERS, "accept-ranges": "bytes", "content-type": type, "content-length": String(end - start + 1), ...(range === null ? {} : { "content-range": `bytes ${String(start)}-${String(end)}/${String(size)}` }) });
  createReadStream(path, { start, end }).on("error", () => { res.destroy(); }).pipe(res);
}
function sendReport(res: ServerResponse, path: string, type: string): void {
  let body: Buffer;
  try { body = readFileSync(path); } catch { sendJson(res, 404, { error: "not found" }); return; }
  res.writeHead(200, { ...REPORT_HEADERS, "content-type": type });
  res.end(type.startsWith("text/html") ? body.toString("utf8").replace(/href="http:\/\/127\.0\.0\.1:8790\//g, 'target="_top" href="/') + REPORT_SCROLL_SCRIPT : body);
}

export interface ViewerOptions {
  readonly current?: Omit<CurrentPoolOptions,"runsRoot">;
  readonly runsRoot: string;
  readonly staticDir: string;
  readonly appDir: string;
  readonly port: number;
  readonly pollMs?: number;
  // Bytes of a run log read and sent per step of an events stream (default 1 MiB).
  readonly streamChunkBytes?: number;
  readonly fetchFn?: typeof fetch;
  // Next-run controls: the local router's endpoint file and the run queue.
  readonly endpointFile?: string | null;
  readonly queue?: RunQueue;
  readonly now?: () => Date;
  readonly restartHuman?: (runId: string) => Promise<string>;
  // Origins a loopback reverse proxy (Tailscale Serve) publishes this viewer at.
  readonly publicOrigins?: readonly string[];
  // Where baseline validation runs (default: in process), whether to warm every ended run
  // at startup, and what to close with the viewer.
  readonly baselines?: { readonly compute?: BaselineCompute; readonly store?: BaselineStore; readonly warm?: boolean; readonly close?: () => Promise<void> };
  // This viewer's own build (default: dist/build-stamp.json); null when unknown.
  readonly build?: ViewerBuild | null;
  // The frontier ranking: persisted to file across restarts (absent: memory only), ranked at start when warm.
  readonly frontier?: { readonly file?: string | null; readonly warm?: boolean };
  // Where workbench run logs are reduced (default: in process) and where finished runs persist.
  readonly workbench?: { readonly compute?: WorkbenchCompute; readonly store?: RunStore<LoadedRun>; readonly partial?: boolean; readonly prioritize?: (runIds: readonly string[]) => void };
}

const broadcastDisk: BroadcastDisk = {
  readBytes(path, offset, length) {
    const fd = openSync(path, "r");
    try {
      const bytes = Buffer.allocUnsafe(length);
      return bytes.subarray(0, readSync(fd, bytes, 0, length, offset));
    } finally { closeSync(fd); }
  },
  readText(path) { try { return readFileSync(path, "utf8"); } catch { return null; } },
};

const MAX_BODY = 64 * 1024;
export const STREAM_CHUNK_BYTES = 1024 * 1024;
// Lines parsed per step, so a chunk of many tiny lines cannot hold the event loop either.
const STREAM_STEP_LINES = 16;
const HumanAcceptedSchema=Type.Object({accepted:Type.Literal(true)},{additionalProperties:false});
const HumanClaimSchema=Type.Object({session:Type.String({pattern:"^[A-Za-z0-9_-]{8,128}$"})},{additionalProperties:false});
const HumanInputSchema=Type.Object({session:Type.String({pattern:"^[A-Za-z0-9_-]{8,128}$"}),seq:Type.Integer({minimum:1}),release:Type.Optional(Type.Boolean()),buttons:Type.Array(Type.Enum(["A","B","START","SELECT","UP","DOWN","LEFT","RIGHT","L","R"]),{maxItems:10,uniqueItems:true})},{additionalProperties:false});
const ControlBodySchema = Type.Object({ action: Type.Enum(CONTROL_ACTIONS) }, { additionalProperties: false });

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Each answered Host header maps to the one page origin allowed to write through it.
function allowedOrigins(port: number, publicOrigins: readonly string[]): ReadonlyMap<string, string> {
  const hosts = new Map<string, string>();
  for (const host of [`${HOST}:${String(port)}`, `localhost:${String(port)}`]) hosts.set(host, `http://${host}`);
  for (const origin of publicOrigins) hosts.set(new URL(origin).host, origin);
  return hosts;
}

// Writes come only from this page: same origin, JSON body, bounded size.
async function jsonBody(req: IncomingMessage, origin: string): Promise<unknown> {
  if (req.headers.origin !== origin) throw new RequestError(403, "writes are accepted only from the viewer page");
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

async function write(req: IncomingMessage, res: ServerResponse, options: ViewerOptions, port: number, parts: string[], origin: string, catalog: RunCatalog): Promise<void> {
  const [, second, id, leaf] = parts;
  const now = options.now?.() ?? new Date();
  try {
    const body = await jsonBody(req, origin);
    if (req.method === "POST" && parts.length === 4 && second === "runs" && id !== undefined && leaf === "control") {
      if (!Value.Check(ControlBodySchema, body)) throw new RequestError(400, "invalid control action");
      sendJson(res, 200, { request: await appendControl(options.runsRoot, id, body.action, now, healthProbe(options.fetchFn ?? fetch), catalog) });
      return;
    }
    if(req.method==="POST" && parts.length===5 && second==="runs" && id!==undefined && leaf==="human" && parts[4]==="restart") {
      if(!Value.Check(Type.Object({},{additionalProperties:false}),body))throw new RequestError(400,"restart body must be empty");
      const start=readStart(options.runsRoot,id);
      if(start.controller?.kind!=="human")throw new RequestError(409,"restart requires a human run");
      if(options.restartHuman===undefined)throw new RequestError(503,"human restart is unavailable");
      sendJson(res,200,{run_id:await options.restartHuman(id)});return;
    }
    if(req.method==="POST" && parts.length===5 && second==="runs" && id!==undefined && leaf==="human" && (parts[4]==="claim"||parts[4]==="input")) {
      const operation=parts[4];
      if(!Value.Check(operation==="claim"?HumanClaimSchema:HumanInputSchema,body))throw new RequestError(400,"invalid human input");
      const start=readStart(options.runsRoot,id);
      const gamePort=liveScreenPort(options.runsRoot,id);
      if(start.controller?.kind!=="human"||gamePort===null)throw new RequestError(409,"select a live human run");
      const token=readFileSync(join(runDir(options.runsRoot,id),"human-token"),"utf8");
      const response=await (options.fetchFn??fetch)(`http://127.0.0.1:${String(gamePort)}/pokebench/human/${operation}`,{method:"POST",headers:{"content-type":"application/json","x-human-token":token},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
      const result:unknown=await response.json();
      if(response.ok&&!Value.Check(HumanAcceptedSchema,result))throw new RequestError(502,"human server did not acknowledge input");
      sendJson(res,response.status,result);return;
    }
    // The queued run launches with the draft it was queued with: no edits until cancelled.
    const queuedNow = options.queue?.status().state;
    if (req.method === "PUT" && parts.length === 2 && second === "next-run") {
      if (queuedNow === "queued" || queuedNow === "launching") throw new NextRunError("a run is queued; cancel it to edit the next run");
      sendJson(res, 200, { draft: writeDraft(options.runsRoot, body), queue: options.queue?.status() ?? { state: "idle" } });
      return;
    }
    if (req.method === "POST" && parts.length === 3 && second === "next-run" && (id === "queue" || id === "cancel")) {
      if (options.queue === undefined) throw new RequestError(503, "this viewer has no run queue");
      if (id === "cancel") {
        sendJson(res, 200, { queue: options.queue.cancel() });
        return;
      }
      if (queuedNow === "queued" || queuedNow === "launching") throw new NextRunError("a run is already queued; cancel it first");
      const draft = writeDraft(options.runsRoot, body);
      if (options.endpointFile === undefined || options.endpointFile === null) throw new NextRunError("the viewer was started without a local model endpoint file");
      const served = await localModels(options.endpointFile, options.fetchFn ?? fetch);
      // The play run accepts only loaded vision models with a known context size.
      const model = served.find((m) => m.id === draft.model && m.vision && m.status === "loaded" && m.contextWindow !== null);
      if (model === undefined) throw new NextRunError(`model ${draft.model} is not a loaded vision model on the local router`);
      if (model.contextWindow !== null && draft.maxTokens > model.contextWindow) throw new NextRunError(`max tokens ${String(draft.maxTokens)} exceeds ${draft.model}'s context of ${String(model.contextWindow)}`);
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

// Serialize one bounded slice per event-loop turn. Individual events remain
// indivisible; a large history never becomes one uninterruptible stringify.
function* eventArrayChunks(events: Iterable<RunEvent>, chunkBytes: number): Generator<string> {
  let chunk = "[", first = true, started = performance.now();
  for (const event of events) {
    chunk += `${first ? "" : ","}${JSON.stringify(event)}`;
    first = false;
    if (chunk.length >= chunkBytes || performance.now() - started >= 4) {
      yield chunk; chunk = ""; started = performance.now();
    }
  }
  yield `${chunk}]`;
}

async function sendEventArray(res: ServerResponse, events: readonly RunEvent[], chunkBytes = 64 * 1024): Promise<void> {
  const isClosed = (): boolean => res.destroyed;
  if (isClosed()) return;
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" });
  for (const chunk of eventArrayChunks(events, chunkBytes)) {
    if (isClosed()) return;
    if (!res.write(chunk)) await new Promise<void>(resolve => {
      if (isClosed()) { resolve(); return; }
      const ready = (): void => { res.off("drain", ready); res.off("close", ready); resolve(); };
      res.once("drain", ready); res.once("close", ready);
    });
    await yieldImmediate();
  }
  if (!isClosed()) res.end();
}

function sendFile(res: ServerResponse, path: string, type: string, spriteRequest?: IncomingMessage): void {
  let body: Buffer;
  try {
    body = readFileSync(path);
  } catch {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if (spriteRequest !== undefined) {
    // Short freshness for ROM-generated art; revalidation detects regenerated bytes.
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = { ...SECURITY_HEADERS, "cache-control": "private, max-age=300", "content-type": type, etag };
    if (spriteRequest.headers["if-none-match"] === etag) { res.writeHead(304, headers); res.end(); return; }
    res.writeHead(200, headers); res.end(body); return;
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

// Under version skew the first rejected line is reported once, as a stale viewer, instead of a
// misleading problem per line; the same build reports every rejected line.
// A recorded log can be hundreds of MB: it is read, validated and sent a bounded chunk at a time,
// yielding to the event loop between chunks and waiting for the socket to drain, so opening one
// run never stalls every other request.
function streamEvents(req: IncomingMessage, res: ServerResponse, path: string, pollMs: number, skew: Skew | null, chunkBytes: number, head?: readonly RunEvent[], offset = 0): void {
  res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
  let closed = false, timer: NodeJS.Timeout | null = null;
  const reader = new LogReader(path, chunkBytes, offset);
  const recovered = recoveredAttacher(dirname(path));
  let skewReported = false, endRead = head?.some(event => event.type === "run_end") ?? false, caughtUp = false, closing = false;
  // A queue with a read cursor: shifting a large array on every write would be quadratic.
  let pending: string[] = [], cursor = 0;
  const empty = (): boolean => cursor >= pending.length;
  const message = (type: string, data: unknown): string => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  const location = (line: number): number | string => offset === 0 ? line : `${String(line)} within tail starting at byte ${String(offset)}`;
  function* headChunks(): Generator<string> {
    if (head === undefined) return;
    yield "event: head\ndata: ";
    function* recoveredEvents(): Generator<RunEvent> { for (const event of head ?? []) yield recovered(event); }
    yield* eventArrayChunks(recoveredEvents(), Math.min(chunkBytes, 64 * 1024));
    yield "\n\n";
  }
  const initial = headChunks();
  let initialDone = head === undefined;
  // Parses the next bounded piece of the log into the queue; true when there was nothing new.
  const fill = (): boolean => {
    if (!initialDone) {
      const chunk = initial.next();
      if (!chunk.done) { pending.push(chunk.value); return false; }
      initialDone = true;
    }
    const { results, lines } = reader.next(STREAM_STEP_LINES);
    for (const result of results) {
      if (result.ok) {
        pending.push(message("ev", recovered(result.event)));
        endRead ||= result.event.type === "run_end";
      } else if (skew === null) {
        pending.push(message("problem", { line: location(result.line), problem: result.problem }));
      } else if (!skewReported) {
        skewReported = true;
        pending.push(message("problem", { line: location(result.line), problem: `${skew.head}. First event it cannot read: line ${String(location(result.line))}: ${result.problem}` }));
      }
    }
    return lines === 0;
  };
  // One step: refill an empty queue (adding caught_up once the file is read, and done after run_end),
  // then write until the socket is full. Every message, control ones included, waits its turn.
  const step = (): "more" | "drain" | "wait" | "end" => {
    if (empty()) {
      if (closing) { res.end(); return "end"; }
      if (fill() && empty()) {
        if (!caughtUp) { caughtUp = true; pending.push(message("caught_up", {})); }
        if (endRead) { closing = true; pending.push(message("done", {})); }
        if (empty()) return "wait";
      }
    }
    let full = false;
    while (!empty() && !full) { full = !res.write(pending[cursor] ?? ""); cursor += 1; }
    if (empty()) { pending = []; cursor = 0; }
    return full ? "drain" : "more";
  };
  // One step per turn of the event loop; a failing read closes this stream, never the viewer.
  const run = (): void => {
    if (closed) return;
    let next: ReturnType<typeof step>;
    try { next = step(); } catch (error) { res.destroy(error instanceof Error ? error : new Error(String(error))); return; }
    if (next === "more") setImmediate(run);
    else if (next === "drain") res.once("drain", () => { setImmediate(run); });
    else if (next === "wait") timer = setTimeout(() => { timer = null; run(); }, pollMs);
  };
  req.on("close", () => {
    closed = true;
    if (timer !== null) clearTimeout(timer);
  });
  run();
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

async function route(req: IncomingMessage, res: ServerResponse, options: ViewerOptions, port: number, origins: ReadonlyMap<string, string>, readBaseline: BaselineReader, readWorkbench: (cards?: { selected: string | null }) => Promise<WorkbenchData>, frontier: FrontierCache, readUpdates: (since: string | null) => Promise<WorkbenchUpdate>, catalog: RunCatalog, strictCatalog: RunCatalog, readBag: BagHistoryReader, current: CurrentApi | null, broadcast: BroadcastStore): Promise<void> {
  const origin = origins.get(req.headers.host ?? "");
  if (origin === undefined) {
    sendJson(res, 403, { error: "the viewer only answers 127.0.0.1 and its published origins" });
    return;
  }
  const parts = segments(req.url ?? "/");
  if (parts === null) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  if ((req.method === "POST" || req.method === "PUT") && parts[0] === "api") {
    await write(req, res, options, port, parts, origin, catalog);
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET, or POST/PUT to /api" });
    return;
  }
  if (current !== null && await current.handle(req, res, parts, (options.now?.() ?? new Date()).getTime())) return;
  const [head, second, id, leaf, file] = parts;
  if (parts.length === 2 && head === "api" && second === "run-lanes") {
    sendJson(res, 200, readFixedStatuses(options.runsRoot, pidAlive).flatMap(status => status.lanes.filter(lane => lane.run !== null).map(lane => ({run: lane.run, lane: lane.id, gpu: lane.gpu}))));
    return;
  }
  if (parts.length === 2 && head === "api" && second === "workbench") {
    const query = new URL(req.url ?? "/", "http://viewer.invalid").searchParams;
    sendJson(res, 200, query.get("updates") === "1" ? await readUpdates(query.get("since")) : await readWorkbench());
    return;
  }
  if (parts.length === 2 && head === "api" && second === "cards") {
    const selected = new URL(req.url ?? "/", "http://viewer.invalid").searchParams.get("run");
    sendJson(res, 200, cardWorkbench(await readWorkbench({ selected }), selected));
    return;
  }
  if (parts.length === 2 && head === "explainers" && (Object.values(FEATURE_EXPLAINERS).includes(second ?? "") || STANDING_EXPLAINERS.includes(second ?? ""))) {
    sendFile(res, join(options.staticDir, "../../../docs/explainers", second ?? ""), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 1 && head === "reports") {
    sendFile(res, join(options.staticDir, "reports.html"), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 2 && head === "api" && second === "reports") {
    sendJson(res, 200, listReports(options.runsRoot));
    return;
  }
  if (head === "reports" && second !== undefined) {
    const found = reportFile(options.runsRoot, second, parts.slice(2).filter((part, i, all) => !(part === "" && i === all.length - 1)));
    if (found === null) sendJson(res, 404, { error: "not found" }); else if (found.type === "video/mp4") sendReportVideo(req, res, found.path, found.type); else sendReport(res, found.path, found.type);
    return;
  }
  if (parts.length === 1 && head === "probes") {
    sendFile(res, join(options.staticDir, "probes.html"), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 2 && head === "api" && second === "probes") {
    sendJson(res, 200, listProbes(options.runsRoot));
    return;
  }
  if (parts.length === 3 && head === "api" && second === "probes") {
    try {
      sendJson(res, 200, await readProbe(options.runsRoot, id ?? ""));
    } catch (error) {
      if (!(error instanceof ProbeError)) throw error;
      sendJson(res, 404, { error: error.message });
    }
    return;
  }
  if (parts.length === 1 && head === "comparisons") {
    sendFile(res, join(options.staticDir, "workbench.html"), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 2 && head === "api" && second === "features") {
    sendJson(res, 200, { features: FEATURES, milestones: MILESTONE_ORDER });
    return;
  }
  if (parts.length === 3 && head === "api" && second === "features" && id === "history") {
    sendJson(res, 200, await featureHistory(options.runsRoot, (({ model, thinking, maxTokens, maxTurns, maxWallMs, failureLimit, target, features }) => ({ model, thinking, maxTokens, maxTurns, maxWallMs, failureLimit, target, features }))(readDraft(options.runsRoot)), readBaseline));
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
  if(parts.length===1 && head==="play") {
    sendFile(res,join(options.staticDir,"play.html"),"text/html; charset=utf-8");return;
  }
  if (parts.length === 1 && head === "broadcast") {
    sendFile(res, join(options.staticDir, "broadcast.html"), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 1 && head === "broadcast.css") {
    sendFile(res, join(options.staticDir, "broadcast.css"), "text/css; charset=utf-8");
    return;
  }
  if(parts.length===1 && head==="human.css") {
    sendFile(res,join(options.staticDir,"human.css"),"text/css; charset=utf-8");return;
  }
  if (parts.length === 1 && (head === "favicon.svg" || head === "favicon.ico")) {
    sendFile(res, join(options.staticDir, "favicon.svg"), "image/svg+xml");
    return;
  }
  if (parts.length === 1 && head === "style.css") {
    sendFile(res, join(options.staticDir, "style.css"), "text/css; charset=utf-8");
    return;
  }
  if (head === "sprites" && second === "party" && PARTY_SPRITE_PATH.test(parts.slice(2).join("/"))) {
    const path = parts.slice(2).join("/");
    sendFile(res, join(options.runsRoot, "sprites", "party-v1", ...path.split("/")), path.endsWith(".json") ? "application/json; charset=utf-8" : "image/png");
    return;
  }
  if (head === "sprites" && second === "page" && PAGE_SPRITE_PATH.test(parts.slice(2).join("/"))) {
    const path = parts.slice(2).join("/");
    sendFile(res, join(options.runsRoot, "sprites", "trainer-page-v1", path), path.endsWith(".json") ? "application/json; charset=utf-8" : "image/png");
    return;
  }
  if (head === "sprites" && second === "bag" && BAG_SPRITE_PATH.test(parts.slice(2).join("/"))) {
    const path = parts.slice(2).join("/");
    sendFile(res, join(options.runsRoot, "sprites", "bag-v1", ...path.split("/")), path.endsWith(".json") ? "application/json; charset=utf-8" : "image/png");
    return;
  }
  if (head === "sprites" && SPRITE_PATH.test(parts.slice(1).join("/"))) {
    const path = parts.slice(1).join("/");
    sendFile(res, join(options.runsRoot, "sprites", "trainer-card-v1", ...path.split("/")), path.endsWith(".json") ? "application/json; charset=utf-8" : "image/png", req);
    return;
  }
  if (parts.length === 2 && head === "fonts" && second !== undefined && FONT_NAME.test(second)) {
    sendFile(res, join(options.staticDir, "fonts", second), "font/woff2");
    return;
  }
  if(parts.length===2 && head==="app" && (second==="story-progress.js"||second==="campaign-catalog.js"||second==="budget-extensions.js")) {
    sendFile(res,join(options.appDir,"../../agent/dist/",second),"text/javascript; charset=utf-8");return;
  }
  if(parts.length===2 && head==="app" && second==="roxanne-interaction.js") {
    sendFile(res,join(options.appDir,"../../agent/dist/roxanne-interaction.js"),"text/javascript; charset=utf-8");return;
  }
  if(parts.length===2 && head==="app" && second==="agent-spectator.js") {
    sendFile(res,join(options.appDir,"../../agent/dist/spectator.js"),"text/javascript; charset=utf-8");return;
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
    const summaries = strictCatalog();
    const live = new Set(await liveRuns(options.runsRoot, healthProbe(options.fetchFn ?? fetch), () => summaries));
    sendJson(res, 200, summaries.map((run) => ({ ...run, live: live.has(run.id) })));
    return;
  }
  try {
    if (id === undefined) throw new RunsError("no run id");
    const dir = runDir(options.runsRoot, id);
    if (parts.length === 4 && leaf === "bag") {
      const history = await readBag(id);
      let art = NO_ART;
      try { art = parseBagArt(JSON.parse(readFileSync(join(options.runsRoot, "sprites", "bag-v1", "manifest.json"), "utf8")) as unknown); } catch { /* Names remain usable without optional ROM art. */ }
      const input = { ledger: history.ledger, run: id, art };
      sendJson(res, 200, { run: id, throughSeq: history.throughSeq, range: bagRange(input), html: bagPage(input) });
      return;
    }
    if (parts.length === 4 && leaf === "broadcast") {
      const after = new URL(req.url ?? "/", "http://viewer.invalid").searchParams.get("after") ?? "0";
      if (!/^(0|[1-9][0-9]*)$/.test(after) || !Number.isSafeInteger(Number(after))) { sendJson(res, 400, { error: "invalid broadcast cursor" }); return; }
      sendJson(res, 200, await broadcast.read(id, Number(after)));
      return;
    }
    if(parts.length===4 && leaf==="budget") {sendJson(res,200,{max_turns:readTurnBudgetReceipt(dir,id)});return;}
    if(parts.length===4 && leaf==="start") {sendJson(res,200,readStart(options.runsRoot,id));return;}
    if (parts.length === 4 && leaf === "head") { await sendEventArray(res, await readRecentEventsAsync(options.runsRoot, id, undefined, undefined, undefined, undefined, () => res.destroyed), options.streamChunkBytes); return; }
    if (parts.length === 4 && leaf === "events") {
      const path = eventsPath(options.runsRoot, id);
      if (!existsSync(path)) throw new RunsError(`run ${id} has no events.jsonl`);
      // run_start read loosely, so a newer harness's run_start the schema rejects still names its build.
      const identity = readStartIdentity(options.runsRoot, id);
      const skew: Skew | null = identity === null ? null : skewOf(options.build ?? null, identity);
      const cursor = { offset: 0 };
      let head: RunEvent[] | undefined;
      if (new URL(req.url ?? "/", "http://viewer.invalid").searchParams.has("head")) {
        try { head = await readHeadEvents(options.runsRoot, id, cursor, undefined, undefined, () => res.destroyed); }
        catch (error) {
          if (!res.destroyed) send(res, 200, "text/event-stream; charset=utf-8", `event: problem\ndata: ${JSON.stringify({ line: "recent head", problem: skew?.head ?? String(error) })}\n\n`);
          return;
        }
      }
      if (res.destroyed) return;
      streamEvents(req, res, path, options.pollMs ?? 250, skew, options.streamChunkBytes ?? STREAM_CHUNK_BYTES, head, cursor.offset);
      return;
    }
    if (parts.length === 4 && leaf === "trace-history") {
      const value = new URL(req.url ?? "/", "http://viewer.invalid").searchParams.get("before");
      if (value === null || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
        sendJson(res, 400, { error: "invalid history cursor" }); return;
      }
      const page = await readTraceHistory(options.runsRoot, id, Number(value));
      const recovered = recoveredAttacher(dir);
      sendJson(res, 200, { ...page, events: page.events.map(recovered) });
      return;
    }
    if (parts.length === 4 && leaf === "comparisons") {
      sendJson(res, 200, await comparisonsOf(options.runsRoot, id, readBaseline));
      return;
    }
    if (parts.length === 4 && leaf === "frontier") {
      if (!existsSync(dir)) throw new RunsError(`no run ${id}`);
      sendJson(res, 200, await frontier.answer(id, runFromSave(options.runsRoot, id)));
      return;
    }
    if (parts.length === 4 && leaf === "milestones") {
      try {
        sendJson(res, 200, await readBaseline(id));
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
    if(parts.length===4 && leaf==="audio.wav") {
      const start=readStart(options.runsRoot,id);const gamePort=liveScreenPort(options.runsRoot,id);
      if(start.controller?.kind!=="human"||gamePort===null){sendJson(res,409,{error:"select a live human run"});return;}
      const url=new URL(req.url??"",`http://127.0.0.1:${String(port)}`);
      const since=Number(url.searchParams.get("since")??"-1");const max=Number(url.searchParams.get("max_frames")??"12000");
      if(!Number.isSafeInteger(since)||since< -1||!Number.isSafeInteger(max)||max<1||max>12000){sendJson(res,400,{error:"invalid audio cursor"});return;}
      const response=await (options.fetchFn??fetch)(`http://127.0.0.1:${String(gamePort)}/audio.wav?since=${String(since)}&max_frames=${String(max)}`,{signal:AbortSignal.timeout(3000)});
      if(!response.ok){sendJson(res,502,{error:"audio unavailable"});return;}
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>48044||bytes.length<44){sendJson(res,502,{error:"invalid audio segment"});return;}
      for(const name of ["X-Audio-Next","X-Audio-Skipped","X-Audio-Epoch"]){const value=response.headers.get(name);if(value!==null)res.setHeader(name,value);}
      send(res,200,"audio/wav",bytes);return;
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
  } catch (error) {
    sendJson(res, leaf === "bag" ? 503 : 404, { error: leaf === "bag" ? `Bag history unavailable: ${error instanceof Error ? error.message : String(error)}` : "not found" });
    return;
  }
  sendJson(res, 404, { error: "not found" });
}

export async function startViewer(given: ViewerOptions): Promise<Viewer> {
  const options: ViewerOptions = { ...given, build: given.build === undefined ? defaultViewerBuild() : given.build };
  if (options.streamChunkBytes !== undefined && (!Number.isSafeInteger(options.streamChunkBytes) || options.streamChunkBytes < 1)) throw new RangeError("streamChunkBytes must be a positive integer");
  let port = 0;
  let origins: ReadonlyMap<string, string> = new Map();
  const readBaseline = createBaselineReader(options.runsRoot, { ...(options.baselines?.compute === undefined ? {} : { compute: options.baselines.compute }), ...(options.baselines?.store === undefined ? {} : { store: options.baselines.store }) });
  const readBag = createBagHistoryReader(options.runsRoot);
  const broadcast = createBroadcastStore({ runsRoot: options.runsRoot, disk: broadcastDisk, eventsPath: id => eventsPath(options.runsRoot, id), pause: () => yieldImmediate() });
  const catalog = createRunCatalog(options.runsRoot, null);
  const strictCatalog = options.build === null ? catalog : createRunCatalog(options.runsRoot, options.build ?? null);
  const workbenchLoader = createWorkbenchLoader({ build: options.build ?? null, cards: createCardReader(options.runsRoot), ...(options.current === undefined ? {cardWriter:createCardStore(options.runsRoot)} : {}), ...(options.workbench?.compute === undefined ? {} : { compute: options.workbench.compute }), ...(options.workbench?.store === undefined ? {} : { store: options.workbench.store }) });
  let snapshot: { until: number; result: Promise<WorkbenchData> } | null = null;
  let cardsSnapshot: { selected: string | null; until: number; result: Promise<WorkbenchData> } | null = null;
  // The splits' frontier must not depend on how far a cold partial snapshot has loaded: wait for every run (the loader caches them).
  const readCompleteWorkbench = (): Promise<WorkbenchData> => workbenchSnapshot(options.runsRoot, healthProbe(options.fetchFn ?? fetch), (options.now?.() ?? new Date()).getTime(), undefined, workbenchLoader, {}, catalog);
  const frontier = createFrontierCache({ read: async () => (await readCompleteWorkbench()).runs, now: () => (options.now?.() ?? new Date()).getTime(), file: options.frontier?.file ?? null, onError: error => { console.error(`frontier ranking failed: ${error instanceof Error ? error.message : String(error)}`); } });
  if (options.current === undefined && options.frontier?.warm === true) frontier.warm();
  const readWorkbench = (cards?: { selected: string | null }): Promise<WorkbenchData> => {
    const now = (options.now?.() ?? new Date()).getTime();
    const cached = cards === undefined ? snapshot : cardsSnapshot?.selected === cards.selected ? cardsSnapshot : null;
    if (cached !== null && now < cached.until) return cached.result;
    const healthy = healthProbe(options.fetchFn ?? fetch);
    const pending = cards === undefined
      ? Promise.resolve().then(() => workbenchSnapshot(options.runsRoot, healthy, now, undefined, workbenchLoader, { partial: options.workbench?.partial === true }, catalog))
      : liveRuns(options.runsRoot, healthy, catalog).then(live => {
        options.workbench?.prioritize?.([...live, ...(cards.selected === null ? [] : [cards.selected])]);
        return workbenchSnapshot(options.runsRoot, healthy, now, undefined, workbenchLoader, { partial: options.workbench?.partial === true, cards: { ...cards, live: new Set(live) } }, catalog);
      });
    if (cards === undefined) {
      const next = { until: Infinity, result: pending }; snapshot = next;
      next.result = next.result.then(data => { next.until = (options.now?.() ?? new Date()).getTime() + WORKBENCH_POLL_MS; return data; }, (error: unknown) => { if (snapshot === next) snapshot = null; throw error; });
      return next.result;
    }
    const next = { selected: cards.selected, until: Infinity, result: pending }; cardsSnapshot = next;
    next.result = next.result.then(data => { next.until = (options.now?.() ?? new Date()).getTime() + WORKBENCH_POLL_MS; return data; }, (error: unknown) => { if (cardsSnapshot === next) cardsSnapshot = null; throw error; });
    return next.result;
  };
  const updates = createWorkbenchUpdates(randomUUID());
  const readUpdates = async (since: string | null): Promise<WorkbenchUpdate> => updates(await readWorkbench(), since);
  // A failing request (a client that disconnects mid-body, a file error) must
  // never take the viewer and its queue down.
  const currentPool = options.current === undefined ? null : createCurrentPool({...options.current, runsRoot:options.runsRoot});
  const currentApi = currentPool === null ? null : createCurrentApi(currentPool);
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const dispatchTimings = new Map<string, Timing>();
  const frameHubs = new Map<string, SharedFrameHub>();
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/api/frame-metrics" && origins.has(req.headers.host ?? "")) {
      sendJson(res, 200, { version: 1, eventLoop: { meanMs: loopDelay.count === 0 ? 0 : loopDelay.mean / 1e6, p99Ms: loopDelay.percentile(99) / 1e6, maxMs: loopDelay.max / 1e6 },
        dispatch: Object.fromEntries([...dispatchTimings].map(([key, timing]) => [key, timing.snapshot()])),
        runs: [...frameHubs.values()].map(hub => ({ run: hub.runId, port: hub.gamePort, ...hub.diagnostics.snapshot() })) });
      return;
    }
    const started = performance.now();
    route(req, res, options, port, origins, readBaseline, readWorkbench, frontier, readUpdates, catalog, strictCatalog, readBag, currentApi, broadcast).catch((error: unknown) => {
      if (res.headersSent || res.destroyed) res.destroy();
      else sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
    // Classification must not escape the async route's malformed-URL boundary.
    let parts: string[] | null;
    try { parts = segments(req.url ?? "/"); } catch { parts = null; }
    const key = parts?.[0] === "api" ? parts[1] === "runs" ? `runs/${parts.length === 2 ? "list" : parts[3] === "head" ? "head" : parts[3] === "events" ? "events" : "other"}` : parts[1] === "cards" ? "cards" : "other-api" : "static";
    let timing = dispatchTimings.get(key);
    if (timing === undefined) { timing = new Timing(); dispatchTimings.set(key, timing); }
    timing.add(performance.now() - started);
  });
  const frameSockets = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: FRAME_MAX_BYTES });
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => { socket.destroy(); });
    const reject = (status: number, message: string): void => {
      socket.end(`HTTP/1.1 ${String(status)} ${message}\r\nConnection: close\r\n\r\n`);
    };
    const origin = origins.get(req.headers.host ?? "");
    if (origin === undefined || req.headers.origin !== origin) { reject(403, "Forbidden"); return; }
    const parts = segments(req.url ?? "/");
    const runId = parts?.length === 4 && parts[0] === "api" && parts[1] === "runs" && parts[3] === "frames" ? parts[2] : undefined;
    if (runId === undefined) { reject(404, "Not Found"); return; }
    let gamePort: number | null;
    try { gamePort = liveScreenPort(options.runsRoot, runId); }
    catch { reject(404, "Not Found"); return; }
    if (gamePort === null) { reject(409, "Conflict"); return; }
    frameSockets.handleUpgrade(req, socket, head, (client) => {
      let hub = frameHubs.get(runId);
      if (hub !== undefined && hub.gamePort !== gamePort) {
        hub.stop();
        hub = undefined;
      }
      if (hub === undefined) {
        hub = new SharedFrameHub({
          runId,
          gamePort,
          host: HOST,
          maxPayload: FRAME_MAX_BYTES,
          decode: (raw) => {
            const encoded = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as ArrayBuffer);
            const payload = JSON.parse(encoded.toString("utf8")) as { frame_data?: unknown; frame_count?: unknown; timestamp?: unknown };
            if (typeof payload.frame_data !== "string") throw new Error("frame_data is missing");
            const png = Buffer.from(payload.frame_data, "base64");
            if (!validFramePng(png)) throw new Error("frame is not a bounded PNG");
            return { png, ...(typeof payload.frame_count === "number" && Number.isSafeInteger(payload.frame_count) && payload.frame_count >= 0 ? { frame: payload.frame_count } : {}),
              ...(typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp) ? { timestamp: payload.timestamp } : {}) };
          },
          onEmpty: (closed) => { if (frameHubs.get(runId) === closed) frameHubs.delete(runId); },
        });
        frameHubs.set(runId, hub);
      }
      hub.add(client);
    });
  });
  const queue = options.queue;
  const ticker = queue === undefined ? null : setInterval(() => { queue.tick().catch(() => undefined); }, 1_000);
  await new Promise<void>((resolve, reject) => {
    server.once("error", error => { loopDelay.disable(); void currentPool?.close(); reject(error); });
    server.listen(options.port, HOST, resolve);
  });
  const address = server.address() as AddressInfo;
  port = address.port;
  origins = allowedOrigins(port, options.publicOrigins ?? []);
  // Validate the catalog in the background so the first page load finds it ready.
  if (options.current === undefined && options.baselines?.warm === true) for (const run of catalog()) if (run.ended && run.problem === null) readBaseline(run.id).catch(() => undefined);
  return {
    server,
    address: address.address,
    port,
    url: `http://${HOST}:${String(port)}/`,
    close: () =>
      new Promise<void>((resolve) => {
        if (ticker !== null) clearInterval(ticker);
        loopDelay.disable();
        for (const hub of frameHubs.values()) hub.stop(1001, "viewer closing");
        frameHubs.clear();
        for (const client of frameSockets.clients) client.terminate();
        frameSockets.close();
        server.closeAllConnections();
        server.close(() => {
          Promise.all([options.baselines?.close?.(), currentPool?.close()]).then(() => {resolve();}, () => {resolve();});
        });
      }),
  };
}
