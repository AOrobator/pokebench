// Worker-thread entry for the pool: reduces one run log per request, as a baseline or a workbench record.
import { isMainThread, parentPort } from "node:worker_threads";
import type { BaselineReply } from "./baseline-pool.js";
import { computeBaseline, type BaselineOutcome } from "./runs.js";
import { loadRun, type LoadedRun } from "./workbench-store.js";
import type { BuildIdentity } from "./build-stamp.js";

// The viewer build stamp a workbench request carries: absent or null means unknown.
function viewerOf(value: unknown): BuildIdentity | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return undefined;
  const { commit, dirty } = value as Record<string, unknown>;
  return typeof commit === "string" && /^[0-9a-f]{40}$/.test(commit) && typeof dirty === "boolean" ? { commit, dirty } : undefined;
}
export function handleBaselineRequest(message: unknown, compute: (runsRoot: string, runId: string) => BaselineOutcome = computeBaseline, load: (runsRoot: string, runId: string, viewer: BuildIdentity | null) => LoadedRun = loadRun): BaselineReply {
  const request = typeof message === "object" && message !== null ? (message as Record<string, unknown>) : {};
  const { id, kind, runsRoot, runId } = request, viewer = viewerOf(request.viewer);
  if (typeof id !== "number" || !Number.isSafeInteger(id) || (kind !== "baseline" && kind !== "workbench") || typeof runsRoot !== "string" || typeof runId !== "string" || viewer === undefined) return { id: -1, failure: "invalid baseline request" };
  try {
    return { id, outcome: kind === "baseline" ? compute(runsRoot, runId) : load(runsRoot, runId, viewer) };
  } catch (error) {
    return { id, failure: String(error) };
  }
}

const port = isMainThread ? null : parentPort;
port?.on("message", (message: unknown) => { port.postMessage(handleBaselineRequest(message)); });
