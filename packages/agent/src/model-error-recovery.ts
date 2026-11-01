import { ContextBudget, overflowTokens } from "./context-budget.js";
import type { ExactContext } from "./exact-context.js";

// model-error-recovery-v1: a lane that refuses a prompt for size sets a sticky ceiling on every
// later request, and a failed model call is retried only after its lane answers a readiness probe.
// Text is never cut; only the oldest whole turns are dropped, by the fitter already in use.

// The reply needs room, so a refused prompt is followed by at most three quarters of itself.
export const CEILING_RATIO = 0.75;

// mlx-serve's refusal, verbatim from runs/2026-11-01T09-25-00_deepseek-v4.1-flash-mlx_control24h:
// "This prompt (42430 tokens) does not fit in GPU memory even after freeing the prefix cache: ...".
const MEMORY_REFUSAL = /This prompt \((\d+) tokens?\) does not fit in/;

export function refusedPromptTokens(message: string | undefined): number | null {
  if (message === undefined) return null;
  const memory = MEMORY_REFUSAL.exec(message);
  if (memory !== null) return Number(memory[1]);
  return overflowTokens(message, true);
}

export function ceilingFor(refused: number): number {
  return Math.max(1, Math.floor(refused * CEILING_RATIO));
}

// Sticky for the run: a refusal lowers the ceiling, nothing raises it.
export class InputCeiling {
  private ceiling: number | null = null;

  get limit(): number | null {
    return this.ceiling;
  }

  lower(refused: number): number {
    const next = ceilingFor(refused);
    this.ceiling = this.ceiling === null ? next : Math.min(this.ceiling, next);
    return this.ceiling;
  }
}

function aborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (aborted(signal)) {
      reject(new Error("aborted"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface ReadinessOptions {
  readonly probe: (signal?: AbortSignal) => Promise<boolean>;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  // "start" when the wait begins, "ready" once the probe answered, "exhausted" when it never did.
  readonly onWait?: (phase: "start" | "ready" | "exhausted", waitedMs: number) => void;
  readonly firstMs?: number;
  readonly capMs?: number;
  // Bounded so a dead lane cannot hold a run forever; the next model error waits again.
  readonly attempts?: number;
}

// GET {baseUrl}/models is the lane's own health surface: the same host, port and key the model
// calls already use, so nothing new is reachable.
export function modelsProbe(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  apiKey?: string,
  timeoutMs = 5000,
): (signal?: AbortSignal) => Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  return async (signal) => {
    // A lane that accepts the socket and never answers must not own the probe: bound it here.
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchFn(url, {
        method: "GET",
        headers: apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
        signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}

export class LaneReadiness {
  private readonly probe: (signal?: AbortSignal) => Promise<boolean>;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly onWait: ((phase: "start" | "ready" | "exhausted", waitedMs: number) => void) | undefined;
  private readonly firstMs: number;
  private readonly capMs: number;
  private readonly attempts: number;

  constructor(options: ReadinessOptions) {
    this.probe = options.probe;
    this.sleep = options.sleep;
    this.onWait = options.onWait;
    this.firstMs = options.firstMs ?? 500;
    this.capMs = options.capMs ?? 60_000;
    this.attempts = options.attempts ?? 60;
  }

  // Milliseconds waited, zero when the lane was already up.
  async wait(signal?: AbortSignal): Promise<number> {
    if (aborted(signal)) throw new Error("aborted");
    if (await this.probe(signal)) return 0;
    this.onWait?.("start", 0);
    let waited = 0;
    let delay = Math.min(this.firstMs, this.capMs);
    for (let attempt = 0; attempt < this.attempts; attempt += 1) {
      await this.sleep(delay, signal);
      waited += delay;
      delay = Math.min(delay * 2, this.capMs);
      if (aborted(signal)) throw new Error("aborted");
      if (await this.probe(signal)) {
        this.onWait?.("ready", waited);
        return waited;
      }
    }
    this.onWait?.("exhausted", waited);
    return waited;
  }
}

export interface RecoveryOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly probeTimeoutMs?: number;
  readonly record: (reason: string) => void;
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly firstMs?: number;
  readonly capMs?: number;
  readonly attempts?: number;
}

// The run-side object: one per run, built when the switch is on. A refusal lowers the ceiling on
// whichever fitter the run uses; any other lane error arms the readiness wait for the next call.
export class ModelErrorRecovery {
  readonly ceiling = new InputCeiling();
  private readonly readiness: LaneReadiness;
  private readonly options: RecoveryOptions;
  private fitters: { budget?: ContextBudget; exact?: ExactContext } = {};
  private pending = false;
  private unsatisfiable = false;

  constructor(options: RecoveryOptions) {
    this.options = options;
    this.readiness = new LaneReadiness({
      probe: modelsProbe(options.baseUrl, options.fetchFn ?? fetch, options.apiKey, options.probeTimeoutMs ?? 5000),
      sleep: options.sleep ?? abortableSleep,
      onWait: (phase, waitedMs) => {
        if (phase === "start") options.record("lane readiness wait started; no request is sent until GET /models answers");
        else if (phase === "ready") options.record(`lane answered GET /models after ${String(waitedMs)} ms`);
        else options.record(`lane still not answering GET /models after ${String(waitedMs)} ms`);
      },
      ...(options.firstMs === undefined ? {} : { firstMs: options.firstMs }),
      ...(options.capMs === undefined ? {} : { capMs: options.capMs }),
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
    });
  }

  attach(fitters: { budget?: ContextBudget; exact?: ExactContext }): void {
    this.fitters = fitters;
    this.apply();
  }

  // Called by the fitter when even the smallest request it can build is still over the ceiling: no
  // retry can help, so the run ends rather than resending a request the lane has already refused.
  markUnsatisfiable(): void {
    if (this.unsatisfiable) return;
    this.unsatisfiable = true;
    this.options.record(`no request fits under the input ceiling ${String(this.ceiling.limit)}; ending the run`);
  }

  // Called for every model error: a size refusal lowers the ceiling, anything else waits on the lane.
  // Returns true when the run cannot make progress and must end: the request that was just refused is
  // no smaller than what the ceiling already allows, so the next attempt would be the same request.
  observe(message: { readonly errorMessage?: string }): boolean {
    if (this.unsatisfiable) return true;
    const refused = refusedPromptTokens(message.errorMessage);
    if (refused === null) {
      this.pending = true;
      return false;
    }
    const before = this.ceiling.limit;
    const ceiling = this.ceiling.lower(refused);
    this.apply();
    if (before !== null && ceiling === before) {
      this.options.record(
        `prompt refused again at ${String(refused)} tokens; it cannot fit under the input ceiling ${String(ceiling)}; ending the run`,
      );
      return true;
    }
    this.options.record(`prompt refused at ${String(refused)} tokens; input ceiling ${String(ceiling)}`);
    return false;
  }

  async beforeModelCall(signal?: AbortSignal): Promise<void> {
    if (!this.pending) return;
    this.pending = false;
    await this.readiness.wait(signal);
  }

  private apply(): void {
    const limit = this.ceiling.limit;
    if (limit === null) return;
    this.fitters.budget?.capAt(limit);
    this.fitters.exact?.capAt(limit);
  }
}
