import { visualEvidenceSignature } from "./frontier-visual.js";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { FEATURES } from "@pokebench/agent/features";
import { MILESTONES, qualifiedNativeMilestone } from "@pokebench/agent/milestones";
import { filesystemComparisonHost, prepareComparison, sha256 } from "@pokebench/agent/serial-comparison";
import { RUN_END_REASONS, type RunEvent } from "@pokebench/agent/events";
import { configOf } from "./history.js";
import { runSeconds } from "./controls.js";
import { RunView } from "./model.js";
import { readNativeRecording } from "./frontier-recording.js";
import { applyHistoricalProvenance } from "./frontier-provenance.js";
import { parseNavigationReceipt } from "./frontier-queue.js";
import { dirname } from "node:path";
import { eventsPath, listRuns, readStart } from "./runs.js";
import type { HealthProbe, QueueStatus } from "./next-run.js";
import type { WorkbenchConfig, WorkbenchData, WorkbenchQueueItem, WorkbenchRun } from "./workbench-data.js";
const MAX_PLAN_BYTES = 1024 * 1024;
const cache = new Map<string, { signature: string; run: WorkbenchRun; port: number | null; view: RunView | null }>();
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function errorText(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
function metadata(path: string): { value: unknown; digest: string } {
  if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("Receipt is symlinked or exceeds the metadata size bound");
  const bytes = readFileSync(path, "utf8");
  return { value: JSON.parse(bytes) as unknown, digest: sha256(bytes) };
}
function json(path: string): unknown { return metadata(path).value;
}
function configuration(start: Extract<RunEvent, { type: "run_start" }>): WorkbenchConfig {
  const known = configOf(start);
  return {
    source: start.harness.commit, dirty: start.harness.dirty, vendor: start.vendor_pin, pi: start.pi_version,
    preset: start.evaluation?.preset_id ?? null, target: start.evaluation?.target ?? null, thinking: start.sampling.thinking_level,
    maxTokens: start.sampling.max_tokens, maxTurns: start.budgets.max_turns ?? null, maxWallMs: start.budgets.max_wall_ms ?? null,
    failureLimit: start.evaluation?.failure_limit ?? null, context: start.model.context_window, vision: start.model.vision,
    start: start.start_state.kind, tools: start.tools,
    features: FEATURES.filter(f => f.switchable).map(f => ({ id: f.id, label: f.title, on: known === null ? (start.harness_features.includes(f.id) ? true : null) : known.features[f.id as keyof typeof known.features] })),
  };
}
function load(root: string, id: string): { run: WorkbenchRun; port: number | null; view: RunView | null } {
  const path = eventsPath(root, id), stat = statSync(path); let signature = `${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ino)}`;
  const prior = cache.get(path);
  let run: WorkbenchRun = { id, cohort: null, model: null, started: null, status: "invalid", reason: null, problem: null, excluded: null, elapsedMs: null, turn: 0, objective: null, config: null, splits: [] };
  let port: number | null, view: RunView | null;
  try {
    signature += visualEvidenceSignature(path);
    if (prior?.signature === signature) return prior;
    if (lstatSync(path).isSymbolicLink()) throw new Error("Run log is symlinked; no split graded");
    const start = readStart(root, id);
    if (start.run !== id) throw new Error("Run identity is invalid; no split graded");
    run = { ...run, model: start.controller?.kind === "human" ? `Human · ${start.controller.name}` : start.model.id, started: start.t, config: configuration(start), excluded: start.harness_features.includes("probe") ? "Excluded probe session" : null };
    port = start.isolation.port;
    const recording = readNativeRecording(path, id, qualifiedNativeMilestone); view = recording.view;
    run.splits = recording.splits; run.measurement = recording.measurement;
    run.status = view.end === null ? "unresponsive" : "ended"; run.reason = view.end?.reason ?? null; run.turn = view.turn;
    if (run.reason === "operator_abort") run.excluded ??= "Excluded operator-aborted run";
    run.objective = view.objective === null ? null : { title: view.objective.title, status: view.objective.status, nextDecision: view.objective.next_decision };
  } catch (error) { run.problem = errorText(error); run.status = "invalid"; run.splits = []; view = null; port = null; }
  if (view !== null) view.events.length = 0;
  const entry = { signature, run, port, view }; cache.set(path, entry); return entry;
}
function boundedLedger(path: string): unknown[] {
  if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("Cohort ledger exceeds metadata bounds");
  return readFileSync(path, "utf8").split("\n").filter(line => line.trim() !== "").map((line): unknown => JSON.parse(line));
}
function plans(root: string): string[] {
  const found: string[] = []; const visit = (dir: string, depth: number): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const path = join(dir, e.name);
      if (e.isDirectory() && depth < 3) visit(path, depth + 1);
      else if (e.isFile() && e.name === "manifest.json") found.push(path);
    }
  }; visit(join(root, "launch-receipts"), 0); return found;
}
async function cohortQueue(root: string): Promise<{ items: WorkbenchQueueItem[]; failures: Map<string, string>; membership: Map<string, string>; problems: string[] }> {
  const items: WorkbenchQueueItem[] = [], failures = new Map<string, string>(), membership = new Map<string, string>(), problems: string[] = [], accepted = new Set<string>();
  let owner: unknown = null;
  try { if (existsSync(join(root, ".naming-gameplay.lock", "owner.json"))) owner = json(join(root, ".naming-gameplay.lock", "owner.json")); } catch { /* No qualified coordinator ownership. */ }
  for (const path of plans(root)) {
    try {
      const receipt = metadata(path), raw = receipt.value;
      if (record(raw) && raw.id === "navigation-memory-think-fast-n4" && Array.isArray(raw.order)) {
        const folder = dirname(path), ledgerPath = join(folder, "trials.jsonl"), queuePath = join(folder, "queue.json");
        const rows: unknown[] = existsSync(ledgerPath) ? boundedLedger(ledgerPath) : [];
        if (typeof raw.root !== "string" || realpathSync(join(raw.root, "runs")) !== realpathSync(root)) throw new Error("Navigation receipt root does not own this run store");
        const custom = parseNavigationReceipt(raw, rows, existsSync(queuePath) ? json(queuePath) : null, owner, receipt.digest, raw.root, pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
        if (accepted.has(custom.id)) continue; accepted.add(custom.id);
        for (const trial of custom.trials) {
          if (trial.run !== null) {
            try { const start = readStart(root, trial.run); if (start.harness.commit === custom.source && start.model.id === custom.model) { membership.set(trial.run, custom.id); if (trial.failed) failures.set(trial.run, `Infrastructure outcome: ${custom.failure ?? "child process failed"}`); } else problems.push(`Navigation run ${trial.run} source/model does not match its receipt`); } catch { /* A launched child may not have written run_start yet. */ }
          }
          items.push({ id: trial.run ?? `${custom.id}:trial-${String(trial.ordinal)}`, cohort: custom.id, model: custom.model, arm: trial.arm, status: trial.phase === "completed" ? "completed" : trial.failed ? "failed" : custom.active ? trial.phase === "launched" ? "launching" : "queued" : "withheld", reason: custom.failure ?? (custom.active ? "Recorded eight-trial serial cohort" : "Coordinator not qualified as executing; plan slots retained") });
        }
        continue;
      }
      if (!record(raw) || !Array.isArray(raw.trials) || !Array.isArray(raw.lanes)) continue;
      const m = prepareComparison(raw), ledgerPath = join(root, "launch-receipts", m.id, "trials.jsonl");
      if (join(m.repoRoot, "runs") !== root || !existsSync(ledgerPath)) continue;
      if (lstatSync(ledgerPath).isSymbolicLink() || statSync(ledgerPath).size > MAX_PLAN_BYTES) throw new Error("Cohort ledger exceeds metadata bounds");
      const rows = await filesystemComparisonHost(m).readLedger();
      const digest = sha256(JSON.stringify(m));
      if (rows.length === 0 || !rows.every(row => record(row) && row.manifestSha256 === digest)) continue;
      if (accepted.has(m.id)) continue;
      const launched = new Set<string>(), completed = new Set<string>(), receiptFailures = new Map<string, string>(); let cohortFailed = false;
      for (const [index, row] of rows.entries()) {
        const trial = m.trials[Math.floor(index / 2)];
        if (trial === undefined || row.runId !== trial.runId || row.type !== (index % 2 === 0 ? "launch" : "outcome") || !Number.isFinite(Date.parse(row.at)) || (row.type === "outcome" && Date.parse(row.at) < Date.parse(rows[index - 1]?.at ?? "")) || cohortFailed) throw new Error("Cohort ledger has invalid serial order or timestamps");
        if (row.type === "launch") launched.add(row.runId);
        else {
          if (row.reason === undefined) throw new Error("Cohort outcome has no reason");
          completed.add(row.runId);
          if (row.exitCode !== 0 || row.eventsSha256 === null || !RUN_END_REASONS.some(reason => reason === row.reason)) { cohortFailed = true; receiptFailures.set(row.runId, `Infrastructure outcome: ${row.failureCode ?? (row.eventsSha256 === null ? "missing event digest" : row.reason)}`); }
        }
      }
      accepted.add(m.id);
      for (const trial of m.trials) membership.set(trial.runId, m.id);
      for (const [id, failure] of receiptFailures) failures.set(id, failure);
      let active = false;
      if (!cohortFailed && record(owner) && owner.cohort === m.id && typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0) { try { process.kill(owner.pid, 0); active = true; } catch { /* Stale lease is not executing. */ } }
      for (const trial of m.trials) if (!completed.has(trial.runId)) items.push({ id: trial.runId, cohort: m.id, model: m.lanes.find(l => l.id === trial.lane)?.model ?? null, arm: trial.arm, status: active ? (launched.has(trial.runId) ? "launching" : "queued") : "withheld", reason: active ? "Serial cohort execution" : "Coordinator is not executing; remaining trials have not been scheduled" });
    } catch (error) { problems.push(`Comparison receipt: ${errorText(error)}`); }
  }
  return { items, failures, membership, problems };
}
export async function workbenchSnapshot(root: string, healthy: HealthProbe, queue: QueueStatus, now: number): Promise<WorkbenchData> {
  const cohorts = await cohortQueue(root); const summaries = listRuns(root);
  const loadedRuns = summaries.map(s => load(root, s.id));
  const newest = new Map<number, { id: string; at: number }>();
  for (const loaded of loadedRuns) if (loaded.port !== null && loaded.run.status === "unresponsive") {
    const at = Date.parse(loaded.run.started ?? ""); const prior = newest.get(loaded.port);
    if (prior === undefined || at > prior.at) newest.set(loaded.port, { id: loaded.run.id, at });
  }
  const health = new Map<number, Promise<boolean>>();
  const runs = await Promise.all(loadedRuns.map(async loaded => {
    const run = structuredClone(loaded.run);
    if (loaded.view !== null) {
      if (run.status !== "ended" && loaded.port !== null && newest.get(loaded.port)?.id === run.id) {
        let probe = health.get(loaded.port); if (probe === undefined) { probe = healthy(loaded.port); health.set(loaded.port, probe); }
        if (await probe) run.status = loaded.view.control.state === "paused" ? "paused" : "live";
      }
      const clock = run.status === "live" || run.status === "paused" ? now : loaded.view.lastMs ?? now;
      run.elapsedMs = Math.round(runSeconds(loaded.view, clock) * 1000);
    }
    run.cohort = cohorts.membership.get(run.id) ?? null;
    applyHistoricalProvenance(root, run);
    for (const item of cohorts.items) if (item.id === run.id && item.status === "launching" && (run.status === "live" || run.status === "paused")) item.status = "running";
    const failure = cohorts.failures.get(run.id); if (failure !== undefined) run.excluded = failure;
    return run;
  }));
  if (queue.state !== "idle") cohorts.items.unshift({ id: queue.runId, cohort: null, model: null, arm: null, status: queue.state, reason: queue.state === "queued" ? queue.waitingFor : queue.state === "failed" ? queue.error : null });
  for (const path of cache.keys()) if (!summaries.some(s => eventsPath(root, s.id) === path) && path.startsWith(root + "/")) cache.delete(path);
  return { version: 1, at: now, milestones: MILESTONES.filter(m => m.kind !== "legacy").map(m => ({ id: m.name, label: m.name.replace(/_/g, " ") })), runs: runs.sort((a, b) => Date.parse(b.started ?? "") - Date.parse(a.started ?? "") || b.id.localeCompare(a.id)), queue: cohorts.items, problems: cohorts.problems };
}
