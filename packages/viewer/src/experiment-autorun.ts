// The viewer runs approved experiments by itself (operator 2026-10-14: approve in the
// viewer and it runs), one at a time, under the same gameplay lease as NEXT RUN.
// Withdrawing an approval stops it before the experiment's next trial.
import { nextExperiment, runQueue, type RunnerHost, type RunnerOptions, type RunnerOutcome } from "./experiment-runner.js";
import { queueSnapshot, type QueuePaths, type RunSource } from "./experiment-store.js";

export const AUTORUN_TICK_MS = 5_000;
// After a failure (main moved, the gateway is down, the lease is held), wait before trying again.
export const RETRY_MS = 60_000;

export interface AutoRunStatus { readonly state: "idle" | "running" | "error"; readonly message: string }
export interface AutoRunDeps {
  readonly paths: QueuePaths;
  readonly source: RunSource;
  readonly host: RunnerHost;
  readonly now: () => number;
  readonly run?: (options: RunnerOptions) => Promise<RunnerOutcome>;
}

export class ExperimentAutoRun {
  private current: AutoRunStatus = { state: "idle", message: "Nothing is approved to run." };
  private busy = false;
  private stopping = false;
  private stopped = false;
  private retryAt = 0;

  constructor(private readonly deps: AutoRunDeps) {}

  status(): AutoRunStatus {
    return this.current;
  }

  // The viewer is shutting down: the running experiment holds before its next trial.
  stop(): void {
    this.stopping = true;
    this.stopped = true;
  }

  tick(): Promise<void> {
    if (this.busy || this.stopped || this.deps.now() < this.retryAt) return Promise.resolve();
    let next;
    try {
      next = nextExperiment(queueSnapshot(this.deps.paths, this.deps.source).queue);
    } catch (error) {
      // Runs the timer calls this from: a failure must never take the viewer down.
      this.current = { state: "error", message: error instanceof Error ? error.message : String(error) };
      this.retryAt = this.deps.now() + RETRY_MS;
      return Promise.resolve();
    }
    if (next === null) {
      if (this.current.state === "error") this.current = { state: "idle", message: "Nothing is approved to run." };
      return Promise.resolve();
    }
    this.busy = true;
    this.stopping = false;
    this.current = { state: "running", message: `Running ${next.id}.` };
    const run = this.deps.run ?? runQueue;
    run({ paths: this.deps.paths, source: this.deps.source, host: this.deps.host, stopRequested: () => this.stopping }).then(
      (outcome) => { this.current = { state: "idle", message: `${String(outcome.ran)} trial(s) run; ${outcome.stopped}` }; },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        // Another run or cohort holding the machine is a wait, not a failure.
        const waiting = /lease is held|is still running/.test(message);
        this.current = waiting ? { state: "idle", message: `Waiting: ${message}` } : { state: "error", message };
        this.retryAt = this.deps.now() + (waiting ? AUTORUN_TICK_MS : RETRY_MS);
      },
    ).finally(() => { this.busy = false; });
    return Promise.resolve();
  }
}
