import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { BaselineError, RunsError, baselineOf, eventsPath, listRuns, liveScreenPort, readFrom, runDir } from "./runs.js";

export const HOST = "127.0.0.1";
// Browser code the page may load; everything else in dist/ stays private.
export const BROWSER_MODULES = ["main", "app", "model", "format", "timeline", "panels", "gba", "replay"] as const;

const MODULE_NAME = new RegExp(`^(${BROWSER_MODULES.join("|")})\\.js$`);
const FRAME_NAME = /^\d{6}_\d+\.png$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SCREEN_TIMEOUT_MS = 3_000;

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'",
};

export interface ViewerOptions {
  readonly runsRoot: string;
  readonly staticDir: string;
  readonly appDir: string;
  readonly port: number;
  readonly pollMs?: number;
  readonly fetchFn?: typeof fetch;
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
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET only" });
    return;
  }
  const parts = segments(req.url ?? "/");
  if (parts === null) {
    sendJson(res, 404, { error: "not found" });
    return;
  }
  const [head, second, id, leaf, file] = parts;
  if (parts.length === 1 && head === "") {
    sendFile(res, join(options.staticDir, "index.html"), "text/html; charset=utf-8");
    return;
  }
  if (parts.length === 1 && head === "style.css") {
    sendFile(res, join(options.staticDir, "style.css"), "text/css; charset=utf-8");
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
    sendJson(res, 200, listRuns(options.runsRoot));
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
  const server = createServer((req, res) => {
    void route(req, res, options, port);
  });
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
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
