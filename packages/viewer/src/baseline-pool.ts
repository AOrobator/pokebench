// Baseline validation reads every line of every finished run log (hundreds of MB), so the
// viewer runs it on worker threads: the event loop keeps answering while a cold catalog
// is validated. One job per worker; the rest wait in order.
import { Type } from "typebox";
import { Value } from "typebox/value";
import type { BaselineCompute, BaselineOutcome } from "./runs.js";

export interface BaselineRequest {
  readonly id: number;
  readonly runsRoot: string;
  readonly runId: string;
}

export type BaselineReply = { readonly id: number; readonly outcome: BaselineOutcome } | { readonly id: number; readonly failure: string };

// The part of node:worker_threads' Worker the pool uses.
export interface BaselineWorkerLike {
  postMessage(message: BaselineRequest): void;
  on(event: "message", listener: (value: unknown) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  terminate(): Promise<number>;
  unref(): void;
}

export interface BaselinePool {
  readonly compute: BaselineCompute;
  close(): Promise<void>;
}

const OutcomeSchema = Type.Union([
  Type.Object({ baseline: Type.Object({ run: Type.String(), milestones: Type.Array(Type.Object({ name: Type.String(), offsetMs: Type.Number(), derived: Type.Optional(Type.Boolean()) }, { additionalProperties: false })) }, { additionalProperties: false }) }, { additionalProperties: false }),
  Type.Object({ error: Type.Object({ kind: Type.Union([Type.Literal("baseline"), Type.Literal("runs")]), message: Type.String() }, { additionalProperties: false }) }, { additionalProperties: false }),
]);
const ReplySchema = Type.Union([
  Type.Object({ id: Type.Integer(), outcome: OutcomeSchema }, { additionalProperties: false }),
  Type.Object({ id: Type.Integer(), failure: Type.String() }, { additionalProperties: false }),
]);

export function parseBaselineOutcome(value: unknown): BaselineOutcome | null {
  return Value.Check(OutcomeSchema, value) ? value : null;
}

// Leave cores for the game servers and agents; more than four buys little on a disk-bound scan.
export function defaultPoolSize(cpus: number): number {
  return Math.min(4, Math.max(1, cpus - 2));
}

interface Job {
  readonly request: BaselineRequest;
  readonly resolve: (outcome: BaselineOutcome) => void;
  readonly reject: (error: Error) => void;
}

export function createBaselinePool(spawn: () => BaselineWorkerLike, size: number): BaselinePool {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError("baseline pool size must be a positive integer");
  const busy = new Map<BaselineWorkerLike, Job | null>();
  const queue: Job[] = [];
  let nextId = 0;
  let closed = false;

  const finish = (worker: BaselineWorkerLike, settle: (job: Job) => void): void => {
    const job = busy.get(worker);
    if (job === undefined || job === null) return;
    busy.set(worker, null);
    settle(job);
    pump();
  };
  const retire = (worker: BaselineWorkerLike, reason: string): void => {
    const job = busy.get(worker);
    if (job === undefined) return;
    busy.delete(worker);
    if (job !== null) job.reject(new Error(reason));
    pump();
  };
  const hire = (): BaselineWorkerLike => {
    const worker = spawn();
    worker.unref();
    busy.set(worker, null);
    worker.on("message", (value) => {
      const job = busy.get(worker);
      if (job === undefined || job === null) return;
      if (!Value.Check(ReplySchema, value)) {
        finish(worker, (j) => { j.reject(new Error(`baseline worker sent an invalid reply for ${j.request.runId}`)); });
        return;
      }
      if (value.id !== job.request.id) return;
      finish(worker, (j) => { if ("outcome" in value) j.resolve(value.outcome); else j.reject(new Error(`baseline worker failed on ${j.request.runId}: ${value.failure}`)); });
    });
    worker.on("error", (error) => { retire(worker, `baseline worker failed: ${error.message}`); });
    worker.on("exit", (code) => { retire(worker, `baseline worker exited with code ${String(code)}`); });
    return worker;
  };
  const pump = (): void => {
    while (!closed && queue.length > 0) {
      let idle = [...busy].find(([, job]) => job === null)?.[0];
      if (idle === undefined && busy.size < size) idle = hire();
      if (idle === undefined) return;
      const job = queue.shift();
      if (job === undefined) return;
      busy.set(idle, job);
      idle.postMessage(job.request);
    }
  };

  return {
    compute: (runsRoot, runId) => new Promise<BaselineOutcome>((resolve, reject) => {
      if (closed) { reject(new Error("baseline pool closed")); return; }
      nextId += 1;
      queue.push({ request: { id: nextId, runsRoot, runId }, resolve, reject });
      pump();
    }),
    close: async () => {
      closed = true;
      const workers = [...busy];
      busy.clear();
      for (const job of [...queue.splice(0), ...workers.flatMap(([, job]) => (job === null ? [] : [job]))]) job.reject(new Error("baseline pool closed"));
      await Promise.all(workers.map(([worker]) => worker.terminate()));
    },
  };
}
