// Operator run control. The viewer appends typed requests to
// runs/<id>/control.jsonl; the running agent polls that file and applies them:
//   pause       hold before the next model call, emulator frozen, time cap paused
//   resume      release a pause
//   stop        end after the current turn (run_end operator_stop, still scored)
//   cancel_stop withdraw a stop that has not been applied yet
//   abort       end now (run_end operator_abort, excluded from results)
import { readFileSync } from "node:fs";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { CONTROL_ACTIONS, type BodyOf } from "./events.js";

export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export const ControlRequestSchema = Type.Object(
  { v: Type.Literal(1), seq: Type.Integer({ minimum: 1 }), at: Type.String({ format: "date-time" }), action: Type.Enum(CONTROL_ACTIONS) },
  { additionalProperties: false },
);
export type ControlRequest = Static<typeof ControlRequestSchema>;

export function controlLine(seq: number, action: ControlAction, at: string): string {
  return JSON.stringify({ v: 1, seq, at, action });
}

export function parseControlRequest(line: string): ControlRequest {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("invalid control request");
  }
  if (!Value.Check(ControlRequestSchema, value) || !Number.isFinite(Date.parse(value.at))) throw new Error("invalid control request");
  return value;
}

// Incremental reader: only complete lines, sequence numbers strictly rising.
export class ControlFile {
  private offset = 0;
  private line = 0;
  private lastSeq = 0;
  readonly problems: string[] = [];
  constructor(private readonly path: string) {}

  poll(): ControlRequest[] {
    let text: string;
    try {
      text = readFileSync(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const end = text.lastIndexOf("\n") + 1;
    if (end <= this.offset) return [];
    const lines = text.slice(this.offset, end).split("\n").slice(0, -1);
    this.offset = end;
    const requests: ControlRequest[] = [];
    for (const raw of lines) {
      this.line += 1;
      let request: ControlRequest;
      try {
        request = parseControlRequest(raw);
      } catch {
        this.problems.push(`line ${String(this.line)}: invalid control request`);
        continue;
      }
      if (request.seq <= this.lastSeq) {
        this.problems.push(`line ${String(this.line)}: control request ${String(request.seq)} is not after ${String(this.lastSeq)}`);
        continue;
      }
      this.lastSeq = request.seq;
      requests.push(request);
    }
    return requests;
  }
}

export type ControlBody = Omit<BodyOf<"operator_control">, "type" | "turn">;

export interface RunControlDeps {
  record(body: ControlBody): void;
  freeze(paused: boolean): Promise<void>;
  end(reason: "operator_stop" | "operator_abort"): void;
  now(): number;
}

export type ControlState = "running" | "pause_pending" | "paused" | "stop_pending" | "ended";

export class RunControl {
  private current: ControlState = "running";
  private pauseRequest = 0;
  private stopRequest = 0;
  private stopApplied = false;
  private pausedSince: number | null = null;
  private pausedTotal = 0;
  private release: (() => void) | null = null;
  private readonly listeners: (() => void)[] = [];
  constructor(private readonly deps: RunControlDeps) {}

  get state(): ControlState {
    return this.current;
  }

  pausedMs(): number {
    return this.pausedTotal + (this.pausedSince === null ? 0 : this.deps.now() - this.pausedSince);
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  apply(request: ControlRequest): void {
    const { action, seq } = request;
    const ignore = (): void => { this.deps.record({ action, status: "ignored", request: seq }); };
    if (this.current === "ended") { ignore(); return; }
    if (action === "abort") { this.finish("operator_abort", action, seq); return; }
    if (action === "pause") {
      if (this.current !== "running") { ignore(); return; }
      this.current = "pause_pending";
      this.pauseRequest = seq;
      this.deps.record({ action, status: "pending", request: seq });
      return;
    }
    if (action === "resume") {
      if (this.current === "pause_pending") {
        this.current = "running";
        this.deps.record({ action, status: "applied", request: seq });
        return;
      }
      if (this.current !== "paused") { ignore(); return; }
      const paused = this.closePause();
      this.current = "running";
      void this.deps.freeze(false).catch(() => undefined);
      this.deps.record({ action, status: "applied", request: seq, paused_ms: paused });
      this.wake();
      return;
    }
    if (action === "stop") {
      if (this.current === "paused") { this.finish("operator_stop", action, seq); return; }
      if (this.current !== "running") { ignore(); return; }
      this.current = "stop_pending";
      this.stopRequest = seq;
      this.deps.record({ action, status: "pending", request: seq });
      return;
    }
    if (this.current !== "stop_pending") { ignore(); return; }
    this.current = "running";
    this.deps.record({ action, status: "applied", request: seq });
  }

  // The governor asks at each turn end whether an operator stop is due.
  takeStop(): boolean {
    if (this.stopApplied) return true;
    if (this.current !== "stop_pending") return false;
    this.stopApplied = true;
    this.current = "ended";
    this.deps.record({ action: "stop", status: "applied", request: this.stopRequest });
    return true;
  }

  // Awaited before every model call: a pending pause takes hold here, after the
  // previous turn's tool calls have finished.
  async gate(): Promise<void> {
    if (this.current !== "pause_pending") return;
    this.current = "paused";
    this.pausedSince = this.deps.now();
    this.notify();
    let frozen = true;
    try {
      await this.deps.freeze(true);
    } catch {
      frozen = false;
    }
    if (this.stillPaused()) {
      this.deps.record({ action: "pause", status: "applied", request: this.pauseRequest, emulator_frozen: frozen });
      await new Promise<void>((resolve) => { this.release = resolve; });
    }
  }

  // A stop or abort can arrive while the freeze request is in flight.
  private stillPaused(): boolean {
    return this.current === "paused";
  }

  private finish(reason: "operator_stop" | "operator_abort", action: ControlAction, seq: number): void {
    const wasPaused = this.current === "paused";
    const paused = wasPaused ? this.closePause() : 0;
    this.current = "ended";
    this.deps.record(wasPaused || action === "abort" ? { action, status: "applied", request: seq, paused_ms: paused } : { action, status: "applied", request: seq });
    this.deps.end(reason);
    this.wake();
  }

  private closePause(): number {
    const paused = this.pausedSince === null ? 0 : this.deps.now() - this.pausedSince;
    this.pausedTotal += paused;
    this.pausedSince = null;
    return paused;
  }

  private wake(): void {
    this.release?.();
    this.release = null;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

// The wall-clock budget counts only unpaused time.
export class BudgetTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly control: RunControl, private readonly limitMs: number, private readonly elapsed: () => number, private readonly expire: () => void) {
    control.onChange(() => { this.arm(); });
    this.arm();
  }

  private arm(): void {
    this.clear();
    if (this.control.state === "paused" || this.control.state === "ended") return;
    this.timer = setTimeout(this.expire, Math.max(0, this.limitMs - (this.elapsed() - this.control.pausedMs())));
  }

  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

const PausedSchema = Type.Object({ paused: Type.Boolean() });

// Freeze or release the emulator on this run's game server.
export async function freezeGame(gameServerUrl: string, paused: boolean, fetchFn: typeof fetch = fetch): Promise<void> {
  const url = `${gameServerUrl}/pokebench/pause`;
  const response = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused }), signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`POST ${url} returned HTTP ${String(response.status)}`);
  const body: unknown = await response.json();
  if (!Value.Check(PausedSchema, body) || body.paused !== paused) throw new Error(`POST ${url} did not confirm paused=${String(paused)}`);
}

// Poll the control file and apply new requests until stopped.
export function watchControl(file: ControlFile, control: RunControl, intervalMs = 250): () => void {
  const timer = setInterval(() => {
    for (const request of file.poll()) control.apply(request);
  }, intervalMs);
  return () => { clearInterval(timer); };
}
