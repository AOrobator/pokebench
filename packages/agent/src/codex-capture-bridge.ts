import { createHash, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CodexCapture, JsonlSource, object, text, type NativeSpan } from "./codex-capture.js";
import { checkEvent } from "./events.js";
import { validateRunId } from "./run-log.js";

export interface CodexBridgeOptions {
  readonly source: string; readonly sessionId: string; readonly eventsPath: string; readonly runId: string;
  readonly model: string; readonly contextWindow: number; readonly maxTokens: number;
  readonly port?: number; readonly pollMs?: number; readonly maxBodyBytes?: number;
}
interface Pending { readonly key: string; readonly request: Record<string, unknown>; readonly exported: Record<string, unknown>; readonly response: ServerResponse; begun: boolean }
interface Decision { readonly key: string; readonly name: string; readonly arguments: Record<string, unknown>; readonly text: string; readonly native: NativeSpan; assistant: boolean; called: boolean; result: boolean; turn: number | null }

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage, max: number): Promise<{ value: Record<string, unknown>; raw: Buffer }> {
  let size = 0; const buffers: Buffer[] = [];
  for await (const chunk of request) {
    const value: unknown = chunk;
    if (!Buffer.isBuffer(value)) throw new Error("request body is not bytes");
    size += value.length; if (size > max) throw new Error("request body exceeds byte bound"); buffers.push(value);
  }
  const raw = Buffer.concat(buffers); return { value: object(JSON.parse(raw.toString("utf8")) as unknown), raw };
}
function sse(model: string, id: string, delta: Record<string, unknown>, finish: string | null): string {
  return `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
}

/** New, explicitly selected compatibility endpoint. Never connects to an existing game or Codex server. */
export async function startCodexCaptureBridge(options: CodexBridgeOptions): Promise<{
  readonly url: string; readonly token: string; tick(): void; close(): Promise<void>;
}> {
  validateRunId(options.runId);
  if (!options.model || !Number.isSafeInteger(options.contextWindow) || options.contextWindow < 1 || !Number.isSafeInteger(options.maxTokens) || options.maxTokens < 1) throw new Error("invalid model discovery metadata");
  const token = randomBytes(32).toString("hex");
  const decisions = new Map<string, Decision>();
  const disconnected: string[] = [];
  const imageAssets = new Map<string, { path: string; sha256: string; bytes: number }>();
  let pending: Pending | null = null;
  let capture: CodexCapture | null = null;
  let events: JsonlSource | null = null;
  let failure: Error | null = null;
  let lastSeq = -1;
  let started = false;
  let closing = false;
  const archive = join(dirname(options.eventsPath), "attached-harness", "codex");

  function activeCapture(): CodexCapture { if (!capture) throw new Error("native capture is not initialized"); return capture; }

  function exportRequest(request: Record<string, unknown>): { request: Record<string, unknown>; images: Record<string, unknown>[] } {
    const images: Record<string, unknown>[] = [];
    const exported = { ...request, messages: (request["messages"] as unknown[]).map((message, messageIndex) => {
      const value = object(message);
      if (!Array.isArray(value["content"])) return value;
      return { ...value, content: value["content"].map((part: unknown, partIndex: number) => {
        const content = object(part); if (content["type"] !== "image_url") return content;
        const url = text(object(content["image_url"])["url"]);
        const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
        if (!match) throw new Error("image needs an archivable inline payload");
        const base64 = text(match[2]), mime = text(match[1]);
        const bytes = Buffer.from(base64, "base64");
        if (bytes.toString("base64") !== base64) throw new Error("noncanonical image base64");
        const digest = createHash("sha256").update(bytes).digest("hex"), extension = text(mime.split("/")[1]);
        const name = `${digest}.${extension}`;
        let artifact = imageAssets.get(name);
        if (!artifact) { artifact = activeCapture().artifact(`images/${name}`, bytes); imageAssets.set(name, artifact); }
        images.push({ message_index: messageIndex, part_index: partIndex, mime_type: mime, ...artifact });
        return { type: "image_file", mime_type: mime, ...artifact };
      }) };
    }) };
    return { request: exported, images };
  }

  function scanEvents(): void {
    if (!events) throw new Error("game event source is not initialized");
    events.sync(line => {
      const value = line.value;
      if (value["run"] !== options.runId || value["seq"] !== lastSeq + 1) throw new Error("game recording run/sequence mismatch");
      lastSeq += 1;
      const kind = value["type"];
      if (!["run_start", "assistant", "tool_call", "tool_result"].includes(String(kind))) return;
      const event = checkEvent(value);
      if (event.type === "run_start") {
        if (event.seq !== 0 || event.model.id !== options.model) throw new Error("game recording model/start mismatch");
        started = true; return;
      }
      if (event.type !== "assistant" && event.type !== "tool_call" && event.type !== "tool_result") return;
      const ids = event.type === "assistant" ? event.tool_calls.map(call => call.id) : [event.id];
      for (const id of ids) {
        const decision = decisions.get(id); if (!decision) continue;
        if (event.type === "assistant") {
          const call: { readonly name: string; readonly args: unknown } | undefined = event.tool_calls.find(candidate => candidate.id === id);
          if (!call) throw new Error("missing recorded tool call");
          if (decision.assistant || call.name !== decision.name || !isDeepStrictEqual(call.args, decision.arguments) || event.thinking !== decision.native.summaries.map(s => s.text).join("\n\n") || event.text !== decision.text) throw new Error("recorded assistant differs from captured decision");
          decision.assistant = true; decision.turn = event.turn;
        }
        if (event.type === "tool_call") {
          if (!decision.assistant || decision.called || event.turn !== decision.turn || event.name !== decision.name || !isDeepStrictEqual(event.args, decision.arguments)) throw new Error("tool call differs from captured assistant");
          decision.called = true;
        }
        if (event.type === "tool_result") {
          if (!decision.assistant || !decision.called || decision.result || event.turn !== decision.turn || event.name !== decision.name) throw new Error("tool result lacks a unique captured assistant");
          decision.result = true;
        }
        activeCapture().record({ kind: "game_turn", key: decision.key, session: options.sessionId, native: { begin: decision.native.begin, end: decision.native.end }, summary_status: decision.native.status, run: event.run, turn: event.turn, seq: event.seq, event_type: event.type, event_source: options.eventsPath, source_start: line.start, source_end: line.end, ...(event.type === "assistant" ? { state_seq: event.request_context?.state_seq ?? null } : {}), ...(event.type === "tool_result" ? { is_error: event.is_error, state_seq: event.state_seq ?? null, frames: event.frames } : {}) });
      }
    });
  }
  function tick(): void {
    if (failure) throw failure;
    try { capture?.sync(); if (events) scanEvents(); }
    catch (error) { fail(error); throw error instanceof Error ? error : new Error(String(error)); }
  }
  function fail(error: unknown): void {
    if (failure) return;
    failure = error instanceof Error ? error : new Error(String(error));
    if (capture) {
      try { capture.record({ kind: "bridge_failure", error: failure.message }); } catch { /* Archive errors still prevent forwarding. */ }
    }
    if (pending) { json(pending.response, 503, { error: failure.message }); pending = null; }
  }
  function initialize(): void {
    if (capture) return;
    if (!existsSync(options.eventsPath)) throw new Error("run must create its own recording before capture attaches");
    events = new JsonlSource(options.eventsPath);
    scanEvents(); if (!started) throw new Error("missing game run_start");
    capture = new CodexCapture({ source: options.source, sessionId: options.sessionId, directory: archive });
    tick();
    capture.record({ kind: "attachment", run: options.runId, events: options.eventsPath, model: options.model, session: options.sessionId, classification: "provider_reasoning_summary" });
  }
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.origin !== undefined) { json(response, 403, { error: "browser origin rejected" }); return; }
    const path = request.url ?? "";
    if (failure) { json(response, 503, { error: failure.message }); return; }
    if (request.method === "GET" && ["/models", "/v1/models"].includes(path)) {
      json(response, 200, { object: "list", data: [{ id: options.model, context_window: options.contextWindow, max_tokens: options.maxTokens, metadata: { observed: { capabilities: ["multimodal"] } } }] }); return;
    }
    if (path.startsWith("/capture/") && request.headers.authorization !== `Bearer ${token}`) { json(response, 403, { error: "capture token required" }); return; }
    if (request.method === "GET" && path === "/capture/pending") {
      tick(); json(response, 200, pending ? { key: pending.key, run: options.runId, begun: pending.begun } : null); return;
    }
    if (request.method !== "POST" || request.headers["content-type"]?.split(";")[0] !== "application/json") { json(response, 404, { error: "unsupported method/route or content type" }); return; }
    const incoming = await body(request, options.maxBodyBytes ?? 64 * 1024 * 1024), value = incoming.value;
    if (path === "/v1/chat/completions" || path === "/chat/completions") {
      if (pending) { json(response, 409, { error: "one decision at a time" }); return; }
      if (value["model"] !== options.model || !Array.isArray(value["messages"]) || !Array.isArray(value["tools"])) throw new Error("invalid bridge completion request");
      initialize(); tick();
      const key = randomBytes(16).toString("hex");
      const artifact = activeCapture().artifact(`requests/${key}.json`, incoming.raw);
      const exported = exportRequest(value);
      activeCapture().record({ kind: "request", key, run: options.runId, artifact, images: exported.images, export_policy: "full_text_with_image_file_handles" });
      pending = { key, request: value, exported: exported.request, response, begun: false };
      response.once("close", () => {
        if (pending?.key !== key) return;
        disconnected.push(key); pending = null;
        try { activeCapture().record({ kind: "request_disconnected", key }); } catch (error) { fail(error); }
      });
      return;
    }
    if (!pending || value["key"] !== pending.key) { json(response, 409, { error: "no matching pending decision" }); return; }
    tick();
    if (path === "/capture/begin") {
      if (Object.keys(value).some(k => k !== "key") || pending.begun) throw new Error("invalid/repeated begin");
      activeCapture().begin(pending.key, options.model); pending.begun = true;
      json(response, 200, { key: pending.key, request: pending.exported }); return;
    }
    if (path === "/capture/respond") {
      if (!pending.begun || Object.keys(value).some(k => !["key", "name", "arguments", "text"].includes(k))) throw new Error("invalid response; reasoning is read only from native source");
      const name = text(value["name"]), args = object(value["arguments"]), reply = value["text"] === undefined ? "" : text(value["text"]);
      const tools = pending.request["tools"] as unknown[];
      if (!tools.some(tool => object(object(tool)["function"])["name"] === name)) throw new Error("tool was not offered");
      const native = activeCapture().finish(pending.key, options.model);
      const id = `call_${pending.key}`;
      const decision: Decision = { key: pending.key, name, arguments: args, text: reply, native, assistant: false, called: false, result: false, turn: null };
      const packet = { role: "assistant", content: reply, tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] };
      activeCapture().record({ kind: "response", run: options.runId, key: pending.key, tool_call_id: id, packet, native });
      // Both raw source and complete response receipt are fsynced before any action reaches pi.
      decisions.set(id, decision);
      const target = pending.response; pending = null;
      target.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      target.write(sse(options.model, id, { role: "assistant" }, null));
      const reasoning = native.summaries.map(s => s.text).join("\n\n");
      if (reasoning) target.write(sse(options.model, id, { reasoning_content: reasoning }, null));
      target.write(sse(options.model, id, packet, null)); target.write(sse(options.model, id, {}, "tool_calls")); target.end("data: [DONE]\n\n");
      json(response, 200, { key: decision.key, tool_call_id: id, summary_status: native.status }); return;
    }
    json(response, 404, { error: "unknown capture command" });
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      // An archival or protocol failure never sends an unrecorded action to the game.
      fail(error); if (!response.writableEnded) json(response, 503, { error: (failure ?? new Error("bridge failure")).message });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port ?? 0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("missing loopback address");
  const timer = setInterval(() => { try { tick(); } catch (error) { fail(error); } }, options.pollMs ?? 250);
  timer.unref();
  return {
    url: `http://127.0.0.1:${String(address.port)}`, token, tick,
    async close() {
      if (closing) return; closing = true; clearInterval(timer);
      try {
        if (!failure) tick();
        if (!failure) { try { events?.verify(); } catch (error) { fail(error); } }
        const abandoned = pending?.key;
        if (pending) { capture?.record({ kind: "request_abandoned", key: pending.key }); json(pending.response, 503, { error: "bridge closing" }); pending = null; }
        if (capture) {
          const unresolved = [...decisions.values()].filter(d => !d.assistant || !d.result).map(d => d.key).concat(disconnected, abandoned ? [abandoned] : []);
          const eventPrefix = events?.snapshot();
          const closure = { run: options.runId, unresolved, events_prefix: eventPrefix, status: failure ? "failed" : unresolved.length || !eventPrefix?.complete || !capture.snapshot().complete ? "incomplete" : "complete" };
          if (!failure) capture.seal(closure); else capture.record({ kind: "closure", ...closure });
        }
      } finally {
        capture?.close(); events?.close();
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => { resolve(); }));
      }
    },
  };
}

export function writeCodexControl(path: string, control: { url: string; token: string }): void {
  writeFileSync(path, JSON.stringify(control) + "\n", { flag: "wx", mode: 0o600 });
}
