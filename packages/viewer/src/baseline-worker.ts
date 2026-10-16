// Worker-thread entry for the pool: reduces one run log per request, as a baseline or a workbench record.
import { isMainThread, parentPort } from "node:worker_threads";
import type { BaselineReply } from "./baseline-pool.js";
import { computeBaseline, type BaselineOutcome } from "./runs.js";
import { loadRun, type LoadedRun } from "./workbench-store.js";

export function handleBaselineRequest(message: unknown, compute: (runsRoot: string, runId: string) => BaselineOutcome = computeBaseline, load: (runsRoot: string, runId: string) => LoadedRun = loadRun): BaselineReply {
  const request = typeof message === "object" && message !== null ? (message as Record<string, unknown>) : {};
  const { id, kind, runsRoot, runId } = request;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || (kind !== "baseline" && kind !== "workbench") || typeof runsRoot !== "string" || typeof runId !== "string") return { id: -1, failure: "invalid baseline request" };
  try {
    return { id, outcome: kind === "baseline" ? compute(runsRoot, runId) : load(runsRoot, runId) };
  } catch (error) {
    return { id, failure: String(error) };
  }
}

const port = isMainThread ? null : parentPort;
port?.on("message", (message: unknown) => { port.postMessage(handleBaselineRequest(message)); });
