import WebSocket, { type RawData } from "ws";
import { FrameDiagnostics, type SourceFrame } from "./frame-diagnostics.js";

const RETRY_BUFFER_MS = 5;

export interface FrameSink {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: Buffer, options: { readonly binary: true }, callback: (error?: Error) => void): void;
  terminate(): void;
}

/** One current send and one replaceable latest frame, regardless of source rate. */
export class BoundedFrameSender {
  private sending = false;
  private latest: Buffer | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private offeredAt = 0;

  constructor(private readonly client: FrameSink, private readonly stats?: FrameDiagnostics, private readonly now: () => number = () => performance.now()) {}

  offer(frame: Buffer): void {
    if (this.disposed) return;
    if (this.stats !== undefined) { this.stats.offered += 1; if (this.latest !== null) this.stats.replaced += 1; }
    this.offeredAt = this.now();
    this.latest = frame;
    this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.latest = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
  }

  private flush(): void {
    if (this.disposed || this.sending || this.latest === null) return;
    if (this.client.readyState !== WebSocket.OPEN) {
      this.latest = null;
      return;
    }
    if (this.client.bufferedAmount > 0) {
      if (this.stats !== undefined) this.stats.bufferedChecks += 1;
      if (this.retry === null) {
        this.retry = setTimeout(() => {
          this.retry = null;
          this.flush();
        }, RETRY_BUFFER_MS);
      }
      return;
    }
    const frame = this.latest;
    this.latest = null;
    this.sending = true;
    const started = this.now();
    this.stats?.queueWait.add(started - this.offeredAt);
    try {
      this.client.send(frame, { binary: true }, (error) => {
        this.sending = false;
        this.stats?.send.add(this.now() - started);
        if (error != null) {
          if (this.stats !== undefined) this.stats.sendErrors += 1;
          this.dispose();
          this.client.terminate();
          return;
        }
        if (this.stats !== undefined) this.stats.sent += 1;
        this.flush();
      });
    } catch {
      if (this.stats !== undefined) this.stats.sendErrors += 1;
      this.sending = false;
      this.dispose();
      this.client.terminate();
    }
  }
}

export interface FrameHubOptions {
  readonly runId: string;
  readonly gamePort: number;
  readonly host: string;
  readonly maxPayload: number;
  readonly decode: (raw: RawData) => Buffer | (SourceFrame & { readonly png: Buffer });
  readonly onEmpty: (hub: SharedFrameHub) => void;
}

/** A single validated game transport shared by every viewer of one live run. */
export class SharedFrameHub {
  readonly runId: string;
  readonly gamePort: number;
  readonly diagnostics = new FrameDiagnostics();
  private readonly clients = new Map<WebSocket, BoundedFrameSender>();
  private upstream: WebSocket | null = null;
  private latest: Buffer | null = null;
  private stopped = false;

  constructor(private readonly options: FrameHubOptions) {
    this.runId = options.runId;
    this.gamePort = options.gamePort;
  }

  add(client: WebSocket): void {
    if (this.stopped) {
      client.close(1012, "game frame source changed");
      return;
    }
    const sender = new BoundedFrameSender(client, this.diagnostics);
    this.clients.set(client, sender);
    const remove = (): void => { this.remove(client); };
    client.once("close", remove);
    client.once("error", remove);
    if (this.latest !== null) sender.offer(this.latest);
    if (this.upstream === null) this.connect("/pokebench/frames", true);
  }

  stop(code = 1012, reason = "game frame source changed"): void {
    if (this.stopped) return;
    this.stopped = true;
    const upstream = this.upstream;
    this.upstream = null;
    this.latest = null;
    if (upstream?.readyState === WebSocket.OPEN) upstream.close();
    else if (upstream?.readyState === WebSocket.CONNECTING) upstream.terminate();
    for (const [client, sender] of this.clients) {
      sender.dispose();
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      else if (client.readyState === WebSocket.CONNECTING) client.terminate();
    }
    this.clients.clear();
    this.options.onEmpty(this);
  }

  private remove(client: WebSocket): void {
    const sender = this.clients.get(client);
    if (sender === undefined) return;
    sender.dispose();
    this.clients.delete(client);
    if (this.clients.size === 0) this.stop(1000, "no frame subscribers");
  }

  private fail(code: number, reason: string): void {
    this.stop(code, reason);
  }

  private connect(path: string, allowLegacyFallback: boolean): void {
    if (this.stopped || this.clients.size === 0) return;
    const candidate = new WebSocket(`ws://${this.options.host}:${String(this.gamePort)}${path}`, {
      perMessageDeflate: false,
      maxPayload: this.options.maxPayload,
    });
    this.upstream = candidate;
    candidate.on("message", (raw) => {
      if (candidate !== this.upstream || this.stopped) return;
      try {
        const started = performance.now();
        const decoded = this.options.decode(raw);
        this.diagnostics.decode.add(performance.now() - started);
        const frame = Buffer.isBuffer(decoded) ? decoded : decoded.png;
        this.diagnostics.receive(Buffer.isBuffer(decoded) ? {} : decoded, started, Date.now());
        this.latest = frame;
        for (const sender of this.clients.values()) sender.offer(frame);
      } catch {
        this.diagnostics.invalidFrames += 1;
        this.fail(1003, "invalid upstream frame");
      }
    });
    candidate.once("unexpected-response", (_request, response) => {
      response.resume();
      if (candidate !== this.upstream || this.stopped) return;
      if (allowLegacyFallback && this.clients.size > 0) this.connect("/ws/frames", false);
      else this.fail(1011, "game frame stream unavailable");
    });
    candidate.once("error", () => {
      if (candidate === this.upstream && !this.stopped) this.fail(1011, "game frame stream unavailable");
    });
    candidate.once("close", () => {
      if (candidate === this.upstream && !this.stopped) this.fail(1011, "game frame stream closed");
    });
  }
}
