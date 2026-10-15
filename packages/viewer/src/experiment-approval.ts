// Approving an experiment, and withdrawing that approval, from the viewer or the CLI.
// Both are recorded in runs/experiments/<id>/approvals.jsonl. A withdrawn
// approval stops the runner before its next trial; a trial already running finishes.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { definitionHash, parseLedger, type Approval } from "@pokebench/agent/experiments";
import { experimentDir, loadExperiments, queueSnapshot, type ExperimentView, type QueuePaths, type RunSource } from "./experiment-store.js";

export class ApprovalError extends Error {
  override readonly name = "ApprovalError";
  constructor(readonly status: 404 | 409, message: string) {
    super(message);
  }
}

// The build earlier trials of this experiment ran on, if any recorded one.
function launchedCommit(paths: QueuePaths, id: string): string | null {
  const path = join(experimentDir(paths.runsRoot, id), "trials.jsonl");
  if (!existsSync(path)) return null;
  for (const e of parseLedger(readFileSync(path, "utf8")).entries) if (e.type === "launch" && e.commit !== undefined) return e.commit;
  return null;
}

function find(paths: QueuePaths, source: RunSource, id: string): ExperimentView {
  const s = queueSnapshot(paths, source);
  const view = [...s.queue, ...s.pending, ...s.closed].find((v) => v.id === id);
  if (view === undefined) throw new ApprovalError(404, `no experiment ${id}`);
  return view;
}
const after = (paths: QueuePaths, source: RunSource, id: string): ExperimentView => find(paths, source, id);
const record = (paths: QueuePaths, id: string, entry: Record<string, string>): void => { appendFileSync(join(experimentDir(paths.runsRoot, id), "approvals.jsonl"), `${JSON.stringify(entry)}\n`); };

// Only a queued experiment that is ready and unapproved (draft) or whose approval no longer matches (stale).
export function approveExperiment(paths: QueuePaths, source: RunSource, id: string, by: string, now: Date, head: string): ExperimentView {
  const view = find(paths, source, id);
  if (view.state === "pending") throw new ApprovalError(409, `${id} is pending (not ready yet); only queued experiments can be approved`);
  if (view.state !== "draft" && view.state !== "stale") throw new ApprovalError(409, `${id} is ${view.state}: ${view.reason}`);
  const experiment = loadExperiments(paths.experimentsDir, []).find((e) => e.id === id);
  if (experiment === undefined) throw new ApprovalError(404, `no experiment ${id}`);
  const sha256 = definitionHash(experiment);
  const ran = launchedCommit(paths, id);
  if (ran !== null && ran !== head) throw new ApprovalError(409, `${id} already ran trials on ${ran.slice(0, 7)}; main is now at ${head.slice(0, 7)}. Both arms must stay on one build.`);
  const approval: Approval = { experiment: id, sha256, approvedAt: now.toISOString(), approvedBy: by, commit: head };
  mkdirSync(experimentDir(paths.runsRoot, id), { recursive: true });
  writeFileSync(join(experimentDir(paths.runsRoot, id), "approval.json"), `${JSON.stringify(approval)}\n`);
  record(paths, id, { type: "approve", at: approval.approvedAt, by, sha256, commit: head });
  return after(paths, source, id);
}

// Allowed until the experiment is done; the queue then skips it until it is approved again.
export function revokeApproval(paths: QueuePaths, source: RunSource, id: string, by: string, now: Date): ExperimentView {
  const view = find(paths, source, id);
  if (view.state === "done" || view.state === "discarded") throw new ApprovalError(409, `${id} is ${view.state}; there is nothing left to stop`);
  const path = join(experimentDir(paths.runsRoot, id), "approval.json");
  if (!existsSync(path)) throw new ApprovalError(409, `${id} has no approval to withdraw`);
  rmSync(path);
  record(paths, id, { type: "revoke", at: now.toISOString(), by });
  return after(paths, source, id);
}
