import {Governor,type GovernorDeps,type ModelCallControl} from "./harness.js";
import { TIME_EXTENSIONS, TURN_EXTENSIONS, isExtensionAction, isTimeExtension } from "./budget-extensions.js";
// Operator run control. The viewer appends typed requests to
// runs/<id>/control.jsonl; the running agent polls that file and applies them:
//   pause       hold before the next model call, emulator frozen, time cap paused
//   resume      release a pause
//   stop        end after the current turn (run_end operator_stop, still scored)
//   cancel_stop withdraw a stop that has not been applied yet
//   abort       end now (run_end operator_abort; earned progress still counts in results)
import { readFileSync } from "node:fs";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { CONTROL_ACTIONS, type BodyOf, type RunEvent } from "./events.js";
import { MEASUREMENT_ONLY_MILESTONES } from "./milestones.js";

export const EXTENSION_MS = TIME_EXTENSIONS;
export const isExtension = isExtensionAction;

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
  providerWaitPause?: boolean;
  budget?: { readonly maxWallMs: number; readonly maxTurns?:number; readonly turns?:()=>number; activeMs(): number; stopped(): boolean };
  record(body: ControlBody): void;
  freeze(paused: boolean): Promise<void>;
  end(reason: "operator_stop" | "operator_abort"): void;
  now(): number;
  // Reads requests appended since the last poll, so a request that landed
  // just before a turn boundary is applied at that boundary.
  poll?(): readonly ControlRequest[];
}

export type ControlState = "running" | "pause_pending" | "paused" | "stop_pending" | "ended";

export class RunControl {
  private extensionMs = 0;
  private extensionTurns = 0;
  private lastExtensionRequest = 0;
  private current: ControlState = "running";
  private pauseRequest = 0;
  private inCall = false;
  private freezing = false;
  private stopRequest = 0;
  private stopApplied = false;
  private resuming = false;
  // A resume that arrives while the freeze request is still out.
  private deferredResume: number | null = null;
  private detach: (() => void) | null = null;
  // A boundary pause starts counting after freeze. An in-flight pause starts
  // counting immediately so the budget cannot expire during the freeze request.
  private pausedSince: number | null = null;
  private pausedTotal = 0;
  private release: (() => void) | null = null;
  private readonly listeners: (() => void)[] = [];
  constructor(private readonly deps: RunControlDeps) {}

  turnLimit(original: number): number { return original + this.extensionTurns; }

  wallLimit(original: number): number { return original + this.extensionMs; }

  get state(): ControlState {
    return this.current;
  }

  // True while paused time is being counted.
  get holding(): boolean {
    return this.pausedSince !== null;
  }

  pausedMs(): number {
    return this.pausedTotal + (this.pausedSince === null ? 0 : this.deps.now() - this.pausedSince);
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  apply(request: ControlRequest): void {
    this.applyRequest(request, false);
  }

  applyBatch(requests: readonly ControlRequest[]): void {
    for (const [index, request] of requests.entries()) {
      // Budget extensions do not interrupt a pause/resume pair in one poll.
      const nextControl = this.inCall && request.action === "pause"
        ? requests.slice(index + 1).find(next => !isExtension(next.action))
        : undefined;
      const cancelled = nextControl?.action === "resume";
      this.applyRequest(request, cancelled);
    }
  }

  private applyRequest(request: ControlRequest, cancelledInBatch: boolean): void {
    const { action, seq } = request;
    const ignore = (): void => { this.deps.record({ action, status: "ignored", request: seq }); };
    if (this.current === "ended") { ignore(); return; }
    if (isExtension(action)) {
      const budget = this.deps.budget;
      const time = isTimeExtension(action);
      const original = time ? budget?.maxWallMs : budget?.maxTurns;
      const previous = original === undefined ? 0 : time ? this.wallLimit(original) : this.turnLimit(original);
      const addition = isTimeExtension(action) ? TIME_EXTENSIONS[action] : TURN_EXTENSIONS[action];
      const next = previous + addition;
      const expired = budget === undefined || budget.activeMs() >= this.wallLimit(budget.maxWallMs) || (budget.maxTurns!==undefined && budget.turns!==undefined && budget.turns()>=this.turnLimit(budget.maxTurns)) || (!time && budget.turns === undefined);
      if (original === undefined || seq <= this.lastExtensionRequest || this.current === "stop_pending" || budget?.stopped() || expired || !Number.isSafeInteger(next)) { ignore(); return; }
      this.deps.record(time ? { action, status:"applied",request:seq,previous_max_wall_ms:previous,max_wall_ms:next } : {action,status:"applied",request:seq,previous_max_turns:previous,max_turns:next});
      this.lastExtensionRequest = seq;
      if(time)this.extensionMs += addition; else this.extensionTurns += addition;
      this.notify();
      return;
    }
    if (action === "abort") { this.finish("operator_abort", action, seq); return; }
    if (action === "pause") {
      if (this.current !== "running") { ignore(); return; }
      this.current = "pause_pending";
      this.pauseRequest = seq;
      if (this.inCall && !cancelledInBatch) { void this.pauseDuringCall(); return; }
      this.deps.record({ action, status: "pending", request: seq });
      return;
    }
    if (action === "resume") {
      if (this.current === "pause_pending") {
        this.current = "running";
        this.deps.record({ action, status: "applied", request: seq });
        return;
      }
      if (this.current !== "paused" || this.resuming || this.deferredResume !== null) { ignore(); return; }
      if (this.freezing || this.pausedSince === null) { this.deferredResume = seq; return; }
      this.resume(seq);
      return;
    }
    if (action === "stop") {
      if (this.current === "paused") { this.finish("operator_stop", action, seq); return; }
      // A stop while a pause is still pending replaces the pause: end after this turn.
      if (this.current !== "running" && this.current !== "pause_pending") { ignore(); return; }
      this.current = "stop_pending";
      this.stopRequest = seq;
      this.deps.record({ action, status: "pending", request: seq });
      return;
    }
    if (this.current !== "stop_pending") { ignore(); return; }
    this.current = "running";
    this.deps.record({ action, status: "applied", request: seq });
  }

  // Resume only once the emulator is running again; a failed unfreeze keeps the
  // run paused and is recorded.
  private resume(seq: number): void {
    this.resuming = true;
    void this.deps.freeze(false).then(
      () => {
        this.resuming = false;
        if (this.current !== "paused") return;
        const paused = this.closePause();
        this.current = "running";
        this.deps.record({ action: "resume", status: "applied", request: seq, paused_ms: paused });
        this.wake();
      },
      () => {
        this.resuming = false;
        if (this.current === "paused") this.deps.record({ action: "resume", status: "failed", request: seq, emulator_frozen: true });
      },
    );
  }

  // The governor asks at each turn end whether an operator stop is due.
  private catchUp(): void {
    this.applyBatch(this.deps.poll?.() ?? []);
  }

  takeStop(): boolean {
    this.catchUp();
    if (this.stopApplied) return true;
    if (this.current !== "stop_pending") return false;
    this.stopApplied = true;
    this.current = "ended";
    this.deps.record({ action: "stop", status: "applied", request: this.stopRequest });
    return true;
  }

  callStarted(): void {
    if (this.deps.providerWaitPause) this.inCall = true;
  }

  async callEnded(signal?: AbortSignal): Promise<void> {
    if (!this.inCall) return;
    this.catchUp();
    this.inCall = false;
    if (this.current === "paused") await this.waitForResume(signal);
  }

  private async pauseDuringCall(): Promise<void> {
    this.current = "paused";
    const started = this.deps.now();
    this.pausedSince = started;
    this.freezing = true;
    this.notify();
    let frozen = true;
    try {
      await this.deps.freeze(true);
    } catch {
      frozen = false;
    }
    this.freezing = false;
    if (!this.stillPaused()) return;
    this.deps.record({
      action: "pause", status: "applied", request: this.pauseRequest, emulator_frozen: frozen,
      during_call: true, freeze_wait_ms: Math.max(0, this.deps.now() - started),
    });
    this.applyDeferredResume();
  }

  // Awaited before every model call: a pending pause takes hold here, after the
  // previous turn's tool calls have finished. The run's abort signal (Ctrl-C,
  // budget) also releases it.
  async gate(signal?: AbortSignal): Promise<void> {
    this.catchUp();
    if (this.current !== "pause_pending") return;
    this.current = "paused";
    this.notify();
    let frozen = true;
    try {
      await this.deps.freeze(true);
    } catch {
      frozen = false;
    }
    if (signal?.aborted === true) {
      this.dropDeferredResume();
      this.current = "ended";
      return;
    }
    if (!this.stillPaused()) return;
    this.pausedSince = this.deps.now();
    this.deps.record({ action: "pause", status: "applied", request: this.pauseRequest, emulator_frozen: frozen });
    this.notify();
    const held = this.waitForResume(signal);
    this.applyDeferredResume();
    await held;
  }

  private waitForResume(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      this.release = resolve;
      const onAbort = (): void => {
        this.dropDeferredResume();
        this.closePause();
        this.current = "ended";
        this.wake();
      };
      if (signal?.aborted === true) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      this.detach = () => { signal?.removeEventListener("abort", onAbort); };
    });
  }

  private applyDeferredResume(): void {
    const deferred = this.deferredResume;
    this.deferredResume = null;
    if (deferred !== null) this.resume(deferred);
  }

  // A stop or abort can arrive while the freeze request is in flight.
  private stillPaused(): boolean {
    return this.current === "paused";
  }

  private finish(reason: "operator_stop" | "operator_abort", action: ControlAction, seq: number): void {
    this.dropDeferredResume();
    const wasPaused = this.pausedSince !== null;
    const paused = this.closePause();
    this.current = "ended";
    this.deps.record(wasPaused ? { action, status: "applied", request: seq, paused_ms: paused } : { action, status: "applied", request: seq });
    this.deps.end(reason);
    this.wake();
  }

  // A resume held during the freeze that never applies is still recorded.
  private dropDeferredResume(): void {
    if (this.deferredResume !== null) this.deps.record({ action: "resume", status: "ignored", request: this.deferredResume });
    this.deferredResume = null;
  }

  private closePause(): number {
    const paused = this.pausedSince === null ? 0 : this.deps.now() - this.pausedSince;
    this.pausedTotal += paused;
    this.pausedSince = null;
    return paused;
  }

  private wake(): void {
    this.detach?.();
    this.detach = null;
    this.release?.();
    this.release = null;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

// Shared production construction: tests exercise the same effective-budget wiring as live play.
export function controlledRun(governorDeps:Omit<GovernorDeps,"takeStop"|"pausedMs"|"wallLimit"|"turnLimit">, controlDeps:Omit<RunControlDeps,"budget"|"end">, activeMs:()=>number):{governor:Governor;control:RunControl;callControl?:ModelCallControl} {
 let control:RunControl|null=null;
 const {limits}=governorDeps;
 const governor=new Governor({...governorDeps,
  takeStop:()=>control?.takeStop()??false,pausedMs:()=>control?.pausedMs()??0,
  wallLimit:()=>control?.wallLimit(limits.maxWallMs)??limits.maxWallMs,
  turnLimit:()=>control?.turnLimit(limits.maxTurns)??limits.maxTurns,
 });
 control=new RunControl({...controlDeps,budget:{maxWallMs:limits.maxWallMs,maxTurns:limits.maxTurns,turns:()=>governor.turnCount,activeMs,stopped:()=>governor.stopReason!==null},end:reason=>{governor.abort(reason);}});
 const runControl = control;
 return {governor,control,...(controlDeps.providerWaitPause ? {callControl:{
  callStarted:()=>{runControl.callStarted();},
  callEnded:(signal?:AbortSignal)=>runControl.callEnded(signal),
 }} : {})};
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
    if (this.control.holding || this.control.state === "ended") return;
    const remaining = this.control.wallLimit(this.limitMs) - (this.elapsed() - this.control.pausedMs());
    // Node timers overflow above 2^31-1; chunk long finite deadlines.
    this.timer = remaining > 2_147_483_647
      ? setTimeout(() => { this.arm(); }, 2_147_483_647)
      : setTimeout(this.expire, Math.max(0, remaining));
  }

  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const STALL_STOP_MS = 10 * 60_000;

// milestone-stall-stop-v1: reports once after limitMs of unpaused play with no new
// observed milestone. The clock starts at run start; a milestone that was already
// present at start does not reset it.
export class StallStop {
  private reported = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastProgress = 0;
  private done = false;
  constructor(private readonly control: RunControl, private readonly limitMs: number, private readonly elapsed: () => number, private readonly expire: () => void) {
    control.onChange(() => { this.arm(); });
    this.arm();
  }

  private active(): number {
    return this.elapsed() - this.control.pausedMs();
  }

  observe(event: RunEvent): void {
    if (this.done || event.type !== "milestone" || event.origin === "present_at_start" || MEASUREMENT_ONLY_MILESTONES.has(event.name)) return;
    this.lastProgress = this.active();
    this.reported = false;
    this.arm();
  }

  private arm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.done || this.reported || this.control.holding || this.control.state === "ended") return;
    this.timer = setTimeout(() => { this.reported = true; this.timer = null; this.expire(); }, Math.max(0, this.lastProgress + this.limitMs - this.active()));
  }

  clear(): void {
    this.done = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

const PausedSchema =Type.Object({ paused: Type.Boolean() });

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
    control.applyBatch(file.poll());
  }, intervalMs);
  return () => { clearInterval(timer); };
}
