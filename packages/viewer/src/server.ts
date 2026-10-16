import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { ApprovalError, approveExperiment, revokeApproval, setFinalsWithdrawn } from "./experiment-approval.js";
import { AUTORUN_TICK_MS, type AutoRunStatus, type ExperimentAutoRun } from "./experiment-autorun.js";
import { execFileSync } from "node:child_process";
import { queueSnapshot, recordedRuns, winnerGateOn, type QueuePaths, type QueueSnapshot, type RunSource } from "./experiment-store.js";
import { readFixedStatuses, type FixedStatusView } from "./fixed-status.js";
import { pidAlive } from "./lease.js";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { FEATURES } from "@pokebench/agent/features";
import { CONTROL_ACTIONS } from "@pokebench/agent/events";
import { finalsRunLabels } from "./experiment-gate-store.js";
import type { BaselineStore, RunStore } from "./baseline-store.js";
import { BaselineError, RunsError, createBaselineReader, comparisonsOf, type BaselineCompute, eventsPath, listRuns, liveScreenPort, readStart, readFrom, runDir, type BaselineReader } from "./runs.js";
import { featureHistory } from "./history.js";
import { localModels } from "./models.js";
import { NextRunError, appendControl, healthProbe, liveRuns, readDraft, writeDraft, type RunQueue } from "./next-run.js";
import { WORKBENCH_POLL_MS, type WorkbenchData } from "./workbench-data.js";
import { createWorkbenchLoader, workbenchSnapshot, type LoadedRun, type WorkbenchCompute } from "./workbench-store.js";
import { MILESTONE_ORDER } from "./model.js";
import { FEATURE_EXPLAINERS } from "./panels.js";

export const HOST = "127.0.0.1";
const EXPERIMENTS_CACHE_MS = 5_000;
// Browser code the page may load; everything else in dist/ stays private.
export const BROWSER_MODULES = ["main", "app", "model", "format", "inspectformat", "timeline", "panels", "gba", "replay", "controls", "nextpanel", "human-input", "human-play", "human-main", "workbench-main", "workbench", "workbench-view", "workbench-data", "frontier", "queue-view", "trace"] as const;

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
  readonly restartHuman?: (runId: string) => Promise<string>;
  // Origins a loopback reverse proxy (Tailscale Serve) publishes this viewer at.
  readonly publicOrigins?: readonly string[];
  // The experiment queue (default: experiments/ and docs/experiments/readiness.md beside runsRoot).
  readonly experiments?: { readonly paths: QueuePaths; readonly source: RunSource; readonly head?: () => string };
  // Runs approved experiments by itself; its status is shown on the queue page.
  readonly autorun?: ExperimentAutoRun;
  // Where baseline validation runs (default: in process), whether to warm every ended run
  // at startup, and what to close with the viewer.
  readonly baselines?: { readonly compute?: BaselineCompute; readonly store?: BaselineStore; readonly warm?: boolean; readonly close?: () => Promise<void> };
  // Where workbench run logs are reduced (default: in process) and where finished runs persist.
  readonly workbench?: { readonly compute?: WorkbenchCompute; readonly store?: RunStore<LoadedRun> };
}

const MAX_BODY = 64 * 1024;
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

// The experiment queue's read and its two writes (approve, withdraw), sharing one snapshot cache.
type QueuePayload = QueueSnapshot & { readonly autorun: AutoRunStatus | null; readonly fixedRuns: readonly FixedStatusView[] };
type QueueAction = "approve" | "revoke" | "finals-withdraw" | "finals-resume";
const QUEUE_ACTIONS: readonly string[] = ["approve", "revoke", "finals-withdraw", "finals-resume"];
interface QueueApi { read(): Promise<QueuePayload>; change(id: string, action: QueueAction): QueuePayload }
const EmptyBodySchema = Type.Object({}, { additionalProperties: false });

async function write(req: IncomingMessage, res: ServerResponse, options: ViewerOptions, port: number, parts: string[], origin: string, queueApi: QueueApi): Promise<void> {
  const [, second, id, leaf] = parts;
  const now = options.now?.() ?? new Date();
  try {
    const body = await jsonBody(req, origin);
    if (req.method === "POST" && parts.length === 4 && second === "experiments" && id !== undefined && leaf !== undefined && QUEUE_ACTIONS.includes(leaf)) {
      if (!Value.Check(EmptyBodySchema, body)) throw new RequestError(400, "the body must be empty");
      sendJson(res, 200, queueApi.change(id, leaf as QueueAction));
      return;
    }
    if (req.method === "POST" && parts.length === 4 && second === "runs" && id !== undefined && leaf === "control") {
      if (!Value.Check(ControlBodySchema, body)) throw new RequestError(400, "action must be pause, resume, stop, cancel_stop or abort");
      sendJson(res, 200, { request: await appendControl(options.runsRoot, id, body.action, now, healthProbe(options.fetchFn ?? fetch)) });
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
    if (error instanceof RequestError || error instanceof ApprovalError) sendJson(res, error.status, { error: error.message });
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

async function route(req: IncomingMessage, res: ServerResponse, options: ViewerOptions, port: number, origins: ReadonlyMap<string, string>, readBaseline: BaselineReader, readWorkbench: () => Promise<WorkbenchData>, queueApi: QueueApi): Promise<void> {
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
    await write(req, res, options, port, parts, origin, queueApi);
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET, or POST/PUT to /api" });
    return;
  }
  const [head, second, id, leaf, file] = parts;
  if (parts.length === 2 && head === "api" && second === "experiments") {
    sendJson(res, 200, await queueApi.read());
    return;
  }
  if (parts.length === 2 && head === "api" && second === "workbench") {
    sendJson(res, 200, await readWorkbench());
    return;
  }
  if (parts.length === 2 && head === "explainers" && Object.values(FEATURE_EXPLAINERS).includes(second ?? "")) {
    sendFile(res, join(options.staticDir, "../../../docs/explainers", second ?? ""), "text/html; charset=utf-8");
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
  if (parts.length === 2 && head === "fonts" && second !== undefined && FONT_NAME.test(second)) {
    sendFile(res, join(options.staticDir, "fonts", second), "font/woff2");
    return;
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
    const live = new Set(await liveRuns(options.runsRoot, healthProbe(options.fetchFn ?? fetch)));
    const finals = finalsRunLabels(options.runsRoot);
    sendJson(res, 200, listRuns(options.runsRoot).map((run) => ({ ...run, ...(finals.has(run.id) ? { experiment: finals.get(run.id) } : {}), live: live.has(run.id) })));
    return;
  }
  try {
    if (id === undefined) throw new RunsError("no run id");
    const dir = runDir(options.runsRoot, id);
    if(parts.length===4 && leaf==="start") {sendJson(res,200,readStart(options.runsRoot,id));return;}
    if (parts.length === 4 && leaf === "events") {
      const path = eventsPath(options.runsRoot, id);
      if (!existsSync(path)) throw new RunsError(`run ${id} has no events.jsonl`);
      streamEvents(req, res, path, options.pollMs ?? 250);
      return;
    }
    if (parts.length === 4 && leaf === "comparisons") {
      sendJson(res, 200, await comparisonsOf(options.runsRoot, id, readBaseline));
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
  } catch {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  sendJson(res, 404, { error: "not found" });
}

export async function startViewer(options: ViewerOptions): Promise<Viewer> {
  let port = 0;
  let origins: ReadonlyMap<string, string> = new Map();
  const readBaseline = createBaselineReader(options.runsRoot, { ...(options.baselines?.compute === undefined ? {} : { compute: options.baselines.compute }), ...(options.baselines?.store === undefined ? {} : { store: options.baselines.store }) });
  const workbenchLoader = options.workbench === undefined ? undefined : createWorkbenchLoader({ ...(options.workbench.compute === undefined ? {} : { compute: options.workbench.compute }), ...(options.workbench.store === undefined ? {} : { store: options.workbench.store }) });
  let snapshot: { until: number; result: Promise<WorkbenchData> } | null = null;
  const readWorkbench = (): Promise<WorkbenchData> => {
    const now = (options.now?.() ?? new Date()).getTime();
    if (snapshot !== null && now < snapshot.until) return snapshot.result;
    const next = { until: Infinity, result: Promise.resolve().then(() => workbenchSnapshot(options.runsRoot, healthProbe(options.fetchFn ?? fetch), now, undefined, workbenchLoader)) };
    snapshot = next;
    next.result = next.result.then(data => { next.until = (options.now?.() ?? new Date()).getTime() + WORKBENCH_POLL_MS; return data; }, (error: unknown) => { if (snapshot === next) snapshot = null; throw error; });
    return next.result;
  };
  const repo = dirname(options.runsRoot);
  const experiments = options.experiments ?? { paths: { experimentsDir: join(repo, "experiments"), runsRoot: options.runsRoot, readinessPath: join(repo, "docs", "experiments", "readiness.md"), winnerGate: winnerGateOn(process.env) }, source: recordedRuns(options.runsRoot) };
  // Recorded runs are cached by the source; the snapshot itself is reused for a few seconds.
  let queued: { until: number; result: Promise<QueueSnapshot> } | null = null;
  const readExperiments = (): Promise<QueueSnapshot> => {
    const now = (options.now?.() ?? new Date()).getTime();
    if (queued !== null && now < queued.until) return queued.result;
    const next = { until: now + EXPERIMENTS_CACHE_MS, result: Promise.resolve().then(() => queueSnapshot(experiments.paths, experiments.source)) };
    queued = next;
    next.result.catch(() => { if (queued === next) queued = null; });
    return next.result;
  };
  const head = experiments.head ?? ((): string => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim());
  const payload = (s: QueueSnapshot): QueuePayload => ({ ...s, autorun: options.autorun?.status() ?? null, fixedRuns: readFixedStatuses(options.runsRoot, pidAlive) });
  const queueApi: QueueApi = {
    read: async () => payload(await readExperiments()),
    change: (id, action) => {
      const at = options.now?.() ?? new Date();
      if (action === "approve") approveExperiment(experiments.paths, experiments.source, id, "viewer", at, head());
      else if (action === "revoke") revokeApproval(experiments.paths, experiments.source, id, "viewer", at);
      else setFinalsWithdrawn(experiments.paths, experiments.source, id, action === "finals-withdraw", "viewer", at);
      queued = null;
      return payload(queueSnapshot(experiments.paths, experiments.source));
    },
  };
  const autorun = options.autorun;
  const autorunTicker = autorun === undefined ? null : setInterval(() => { autorun.tick().catch(() => undefined); }, AUTORUN_TICK_MS);
  // A failing request (a client that disconnects mid-body, a file error) must
  // never take the viewer and its queue down.
  const server = createServer((req, res) => {
    route(req, res, options, port, origins, readBaseline, readWorkbench, queueApi).catch((error: unknown) => {
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
  origins = allowedOrigins(port, options.publicOrigins ?? []);
  // Validate the catalog in the background so the first page load finds it ready.
  if (options.baselines?.warm === true) for (const run of listRuns(options.runsRoot)) if (run.ended && run.problem === null) readBaseline(run.id).catch(() => undefined);
  return {
    server,
    address: address.address,
    port,
    url: `http://${HOST}:${String(port)}/`,
    close: () =>
      new Promise<void>((resolve) => {
        if (ticker !== null) clearInterval(ticker);
        if (autorunTicker !== null) clearInterval(autorunTicker);
        autorun?.stop();
        server.closeAllConnections();
        server.close(() => {
          (options.baselines?.close?.() ?? Promise.resolve()).then(resolve, resolve);
        });
      }),
  };
}
