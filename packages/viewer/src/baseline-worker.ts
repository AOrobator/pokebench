// Worker-thread entry for the baseline pool: validates one run log per request.
import { isMainThread, parentPort } from "node:worker_threads";
import type { BaselineReply } from "./baseline-pool.js";
import { computeBaseline, type BaselineOutcome } from "./runs.js";

export function handleBaselineRequest(message: unknown, compute: (runsRoot: string, runId: string) => BaselineOutcome = computeBaseline): BaselineReply {
  const request = typeof message === "object" && message !== null ? (message as Record<string, unknown>) : {};
  const { id, runsRoot, runId } = request;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || typeof runsRoot !== "string" || typeof runId !== "string") return { id: -1, failure: "invalid baseline request" };
  try {
    return { id, outcome: compute(runsRoot, runId) };
  } catch (error) {
    return { id, failure: String(error) };
  }
}

const port = isMainThread ? null : parentPort;
port?.on("message", (message: unknown) => { port.postMessage(handleBaselineRequest(message)); });
