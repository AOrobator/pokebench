import { createHash } from "node:crypto";
import { closeSync, fsyncSync, fstatSync, mkdirSync, openSync, readSync, statSync, writeSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("expected object");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string");
  return value;
}
export function writeAll(fd: number, bytes: Buffer): void {
  let done = 0;
  while (done < bytes.length) {
    const count = writeSync(fd, bytes, done, bytes.length - done);
    if (count === 0) throw new Error("archive write made no progress");
    done += count;
  }
}

export interface SourceLine { readonly start: number; readonly end: number; readonly value: Record<string, unknown> }

/** One forward pass; keeps incomplete bytes until the next append, never decodes split UTF-8. */
export class JsonlSource {
  private readonly fd: number;
  private offset = 0;
  private parsed = 0;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private tail = Buffer.alloc(0);
  private readonly identity: { dev: number; ino: number };
  readonly hash = createHash("sha256");
  constructor(readonly path: string, private readonly maxLineBytes = 64 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1) throw new Error("invalid record byte bound");
    this.fd = openSync(path, "r");
    const info = fstatSync(this.fd);
    if (!info.isFile()) { closeSync(this.fd); throw new Error("capture source is not a regular file"); }
    this.identity = { dev: info.dev, ino: info.ino };
  }
  sync(onLine: (line: SourceLine) => void, onBytes: (bytes: Buffer) => void = () => undefined): number {
    const info = statSync(this.path);
    if (info.dev !== this.identity.dev || info.ino !== this.identity.ino) throw new Error("capture source replaced");
    if (info.size < this.offset) throw new Error("capture source truncated");
    if (this.tail.length) {
      const guard = Buffer.alloc(this.tail.length);
      readSync(this.fd, guard, 0, guard.length, this.offset - guard.length);
      if (!guard.equals(this.tail)) throw new Error("capture source append boundary changed");
    }
    const initial = this.offset;
    while (this.offset < info.size) {
      const buffer = Buffer.alloc(Math.min(1024 * 1024, info.size - this.offset));
      const count = readSync(this.fd, buffer, 0, buffer.length, this.offset);
      if (count === 0) throw new Error("capture source shortened during read");
      const bytes = buffer.subarray(0, count);
      onBytes(bytes); this.hash.update(bytes); this.offset += count;
      this.tail = Buffer.concat([this.tail, bytes]).subarray(-64);
      let cursor = 0;
      while (cursor < bytes.length) {
        const newline = bytes.indexOf(10, cursor);
        const fragment = bytes.subarray(cursor, newline === -1 ? bytes.length : newline);
        this.pending.push(fragment); this.pendingBytes += fragment.length;
        if (this.pendingBytes > this.maxLineBytes) throw new Error("native record exceeds configured byte bound; raw bytes retained");
        if (newline === -1) break;
        const end = this.parsed + this.pendingBytes + 1;
        const value = object(JSON.parse(Buffer.concat(this.pending, this.pendingBytes).toString("utf8")) as unknown);
        onLine({ start: this.parsed, end, value }); this.parsed = end;
        this.pending = []; this.pendingBytes = 0; cursor = newline + 1;
      }
    }
    return this.offset - initial;
  }
  snapshot(): { bytes: number; complete: boolean; sha256: string } {
    return { bytes: this.offset, complete: this.pendingBytes === 0, sha256: this.hash.copy().digest("hex") };
  }
  /** Final prefix verification detects an earlier in-place rewrite without rehashing history per turn. */
  verify(): void {
    const hash = createHash("sha256"); let offset = 0;
    while (offset < this.offset) {
      const bytes = Buffer.alloc(Math.min(1024 * 1024, this.offset - offset));
      const count = readSync(this.fd, bytes, 0, bytes.length, offset);
      if (count === 0) throw new Error("capture source shortened at seal");
      hash.update(bytes.subarray(0, count)); offset += count;
    }
    if (hash.digest("hex") !== this.snapshot().sha256) throw new Error("capture source prefix changed");
  }
  close(): void { closeSync(this.fd); }
}

export interface NativeAnchor { readonly id: string; readonly start: number; readonly end: number }
export interface NativeSummary extends NativeAnchor { readonly text: string }
export interface NativeSpan {
  readonly begin: NativeAnchor; readonly end: NativeAnchor;
  readonly summaries: readonly NativeSummary[];
  readonly status: "summary_recorded" | "none_emitted";
}
interface CaptureOptions { readonly source: string; readonly directory: string; readonly sessionId: string; readonly maxLineBytes?: number }

/** Raw native evidence and derived indices live outside events.jsonl; source files are read-only. */
export class CodexCapture {
  private readonly source: JsonlSource;
  private readonly raw: number;
  private readonly journal: number;
  private session: string | null = null;
  private settings: Record<string, unknown> = {};
  private readonly anchors = new Map<string, NativeAnchor[]>();
  private readonly outputs = new Map<string, NativeAnchor[]>();
  private readonly summaries: NativeSummary[] = [];
  private readonly beginnings = new Map<string, NativeAnchor>();
  private failure: Error | null = null;
  private sealed = false;
  private closed = false;
  constructor(readonly options: CaptureOptions) {
    mkdirSync(dirname(resolve(options.directory)), { recursive: true });
    mkdirSync(options.directory, { mode: 0o700 }); // Deliberately refuses reuse/overwrite.
    this.source = new JsonlSource(options.source, options.maxLineBytes);
    try { this.raw = openSync(join(options.directory, "native.jsonl"), "wx", 0o600); }
    catch (error) { this.source.close(); throw error; }
    try { this.journal = openSync(join(options.directory, "index.jsonl"), "wx", 0o600); }
    catch (error) { this.source.close(); closeSync(this.raw); throw error; }
    try { this.record({ kind: "source", path: resolve(options.source), session: options.sessionId, format: "codex-native-jsonl" }); }
    catch (error) { this.close(); throw error; }
  }
  record(value: Record<string, unknown>): void {
    if (this.closed || this.sealed) throw new Error("capture is closed/sealed");
    writeAll(this.journal, Buffer.from(JSON.stringify(value) + "\n")); fsyncSync(this.journal);
  }
  artifact(relative: string, bytes: Buffer): { path: string; sha256: string; bytes: number } {
    if (this.closed || this.sealed || this.failure) throw new Error("capture is not writable");
    const path = resolve(this.options.directory, relative);
    if (!path.startsWith(resolve(this.options.directory) + sep)) throw new Error("artifact escapes capture directory");
    mkdirSync(dirname(path), { recursive: true });
    const fd = openSync(path, "wx", 0o600);
    try { writeAll(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    return { path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
  }
  sync(): void {
    if (this.failure) throw this.failure;
    if (this.sealed || this.closed) throw new Error("capture is closed/sealed");
    const start = this.source.snapshot().bytes;
    const segment = createHash("sha256");
    try {
      const bytes = this.source.sync(line => { this.accept(line); }, bytes => {
        writeAll(this.raw, bytes); segment.update(bytes);
      });
      fsyncSync(this.raw);
      if (bytes) this.record({ kind: "archive", start, end: start + bytes, sha256: segment.digest("hex") });
    } catch (error) {
      this.failure = error instanceof Error ? error : new Error(String(error));
      fsyncSync(this.raw);
      this.record({ kind: "capture_failure", error: this.failure.message });
      throw this.failure;
    }
  }
  private accept(line: SourceLine): void {
    const root = line.value;
    const payload = object(root["payload"]);
    if (root["type"] === "event_msg" && payload["type"] === "item_completed") {
      const item = object(payload["item"]);
      if (item["type"] === "SubAgentActivity" && item["kind"] === "spawned") throw new Error("player child session needs its own capture source; single-session bridge cannot qualify it");
    }
    if (root["type"] === "session_meta") {
      this.session = text(payload["id"]);
      if (this.session !== this.options.sessionId) throw new Error("native session mismatch");
    }
    if (root["type"] === "turn_context") this.settings = { model: payload["model"], effort: payload["effort"], summary: payload["summary"], source_start: line.start, source_end: line.end };
    if (root["type"] !== "response_item") return;
    if (payload["type"] === "custom_tool_call_output" || payload["type"] === "function_call_output") {
      const id = text(payload["call_id"]), prior = this.outputs.get(id) ?? [];
      prior.push({ id, start: line.start, end: line.end }); this.outputs.set(id, prior);
    }
    if (payload["type"] === "custom_tool_call" || payload["type"] === "function_call") {
      const input = payload["input"] ?? payload["arguments"];
      if (typeof input === "string" && input.includes("--capture-key=")) {
        const keys = new Set([...input.matchAll(/--capture-key=([a-f0-9]{32})(?=$|[\s"'\\])/g)].map(m => text(m[1])));
        const phases = new Set([...input.matchAll(/--capture-phase=(begin|respond)(?=$|[\s"'\\])/g)].map(m => text(m[1])));
        for (const key of keys) for (const phase of phases) {
          const name = `${key}:${phase}`, prior = this.anchors.get(name) ?? [];
          prior.push({ start: line.start, end: line.end, id: text(payload["call_id"]) }); this.anchors.set(name, prior);
        }
      }
    }
    if (payload["type"] === "reasoning") {
      const parts = payload["summary"];
      if (!Array.isArray(parts)) throw new Error("invalid native reasoning summary");
      const content = parts.map((part: unknown) => {
        const value = object(part); if (value["type"] !== "summary_text") throw new Error("unknown native summary part"); return text(value["text"]);
      }).join("\n\n");
      if (content) this.summaries.push({ start: line.start, end: line.end, id: text(payload["id"]), text: content });
    }
  }
  private requireSettings(model: string): void {
    if (this.session !== this.options.sessionId) throw new Error("missing native session metadata");
    if (this.settings["model"] !== model) throw new Error("native player model mismatch");
    if (!["auto", "concise", "detailed"].includes(String(this.settings["summary"]))) throw new Error("effective Codex reasoning summary is disabled/unknown");
  }
  private anchor(key: string, phase: "begin" | "respond"): NativeAnchor {
    if (!/^[a-f0-9]{32}$/.test(key)) throw new Error("invalid capture key");
    const matches = this.anchors.get(`${key}:${phase}`) ?? [];
    const match = matches[0];
    if (matches.length !== 1 || !match) throw new Error(`missing/ambiguous native ${phase} anchor (${String(matches.length)})`);
    return { start: match.start, end: match.end, id: match.id };
  }
  begin(key: string, model: string): NativeAnchor {
    this.sync(); this.requireSettings(model);
    if (this.beginnings.has(key)) throw new Error("decision already began");
    const begin = this.anchor(key, "begin");
    this.record({ kind: "begin", key, session: this.session, begin, settings: this.settings });
    this.beginnings.set(key, begin); return begin;
  }
  finish(key: string, model: string): NativeSpan {
    this.sync(); this.requireSettings(model);
    const begin = this.beginnings.get(key);
    if (!begin) throw new Error("decision has not begun");
    this.anchor(key, "begin");
    const end = this.anchor(key, "respond");
    if (end.start < begin.end) throw new Error("response anchor precedes observation boundary");
    const outputs = (this.outputs.get(begin.id) ?? []).filter(o => o.start >= begin.end && o.end <= end.start);
    if (outputs.length !== 1) throw new Error("missing/ambiguous native observation tool result");
    let low = 0, high = this.summaries.length;
    while (low < high) { const middle = (low + high) >>> 1; const candidate = this.summaries[middle]; if (!candidate) throw new Error("missing summary index"); if (candidate.start < begin.end) low = middle + 1; else high = middle; }
    const summaries: NativeSummary[] = [];
    for (let i = low; i < this.summaries.length; i++) { const candidate = this.summaries[i]; if (!candidate || candidate.end > end.start) break; summaries.push(candidate); }
    const span: NativeSpan = { begin, end, summaries, status: summaries.length ? "summary_recorded" : "none_emitted" };
    this.record({ kind: "native_decision", key, session: this.session, observation: outputs[0], ...span });
    this.beginnings.delete(key); return span;
  }
  snapshot(): { bytes: number; complete: boolean; sha256: string; readableSummaries: number; settings: Record<string, unknown> } {
    return { ...this.source.snapshot(), readableSummaries: this.summaries.length, settings: { ...this.settings } };
  }
  seal(bridge?: Record<string, unknown>): ReturnType<CodexCapture["snapshot"]> {
    try {
      this.sync(); this.source.verify(); const snapshot = this.snapshot();
      this.record({ kind: "sealed", ...snapshot, ...(bridge ? { bridge } : {}) }); this.sealed = true; return snapshot;
    } catch (error) {
      const problem = error instanceof Error ? error : new Error(String(error));
      if (!this.failure) {
        this.failure = problem;
        try { this.record({ kind: "capture_failure", error: problem.message }); } catch { /* The caller still receives the archival failure. */ }
      }
      throw problem;
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true; this.source.close(); closeSync(this.raw); closeSync(this.journal);
  }
}
