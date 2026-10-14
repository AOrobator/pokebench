// Read side of the experiment queue: tracked definitions, the operator's
// approvals, trial ledgers, the runner's position, recorded run outcomes and
// the readiness verdicts in docs/experiments/readiness.md.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ApprovalSchema, definitionHash, deriveStatus, parseExperiment, parseLedger, readinessOf, type Approval, type Experiment, type ExperimentState, type LedgerEntry, type Readiness, type ReadinessRun, type RunnerPosition, type TrialProgress } from "@pokebench/agent/experiments";
import { parseEvent } from "@pokebench/agent/events";
import { configOf } from "./history.js";
import { RunsError, listRuns, readStart, runDir } from "./runs.js";

export interface TrialMetrics {
  readonly reached: readonly string[];
  readonly milestoneMs: Readonly<Record<string, number>>;
  readonly turns: number;
  readonly wallMs: number;
}
export interface RunSource {
  // Valid, ended model runs of a registry configuration, oldest first.
  readonly recent: () => ReadinessRun[];
  readonly trial: (runId: string) => TrialMetrics | null;
}

export interface TrialView extends TrialProgress {
  readonly reachedPrimary: boolean | null;
  readonly primaryMs: number | null;
  readonly turns: number | null;
}
export interface ArmSummary {
  readonly finished: number;
  readonly reached: number;
  readonly medianPrimaryMs: number | null;
  readonly medianTurns: number | null;
  readonly reachedPer1kTurns: number | null;
}
export interface RecordedReadiness { readonly verdict: string; readonly evidence: string }
export const VERDICTS: readonly string[] = ["improve", "regress", "inconclusive"];
export const RECOMMENDATIONS: readonly string[] = ["confirm", "keep", "discard", "retain", "repair_and_rerun"];
export interface ResultSummary { readonly verdict: string; readonly recommendation: string; readonly eligible: boolean; readonly problems: readonly string[] }
export interface ExperimentView {
  readonly id: string;
  readonly title: string;
  readonly changedFeature: string;
  readonly incumbentOn: boolean;
  readonly hypothesis: string;
  readonly activationMilestone: string;
  readonly primaryMilestone: string;
  readonly queuePosition: number | null;
  readonly source: { readonly checkout: string; readonly commit: string };
  readonly trialsPerArm: number;
  readonly modelLane: string;
  readonly budgetMs: number;
  readonly usedMs: number;
  readonly state: ExperimentState;
  readonly reason: string;
  readonly approved: boolean;
  readonly readiness: Readiness;
  readonly recorded: RecordedReadiness | null;
  readonly trials: readonly TrialView[];
  readonly arms: { readonly incumbent: ArmSummary; readonly candidate: ArmSummary };
  readonly notes: string | null;
  // The graded comparison, once result.json holds one.
  readonly result: ResultSummary | null;
}
export interface QueueSnapshot {
  readonly queue: readonly ExperimentView[];
  readonly pending: readonly ExperimentView[];
  // Finished or discarded: on neither list.
  readonly closed: readonly ExperimentView[];
  readonly runner: RunnerPosition | null;
  readonly problems: readonly string[];
}
export interface QueuePaths { readonly experimentsDir: string; readonly runsRoot: string; readonly readinessPath: string }

export const experimentDir = (runsRoot: string, id: string): string => join(runsRoot, "experiments", id);
export const runnerPath = (runsRoot: string): string => join(runsRoot, "experiments", "runner.json");
const RunnerSchema = Type.Object({ pid: Type.Integer({ minimum: 1 }), experiment: Type.String({ minLength: 1 }), trial: Type.Integer({ minimum: 0 }) });

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readRunner(runsRoot: string, alive: (pid: number) => boolean = pidAlive): RunnerPosition | null {
  const path = runnerPath(runsRoot);
  if (!existsSync(path)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (!Value.Check(RunnerSchema, value) || !alive(value.pid)) return null;
  return { experiment: value.experiment, trial: value.trial };
}

// Rows of the readiness table: | `switch-id` | `MILESTONE` ... | verdict | evidence |
export function parseReadinessDoc(text: string): ReadonlyMap<string, RecordedReadiness> {
  const rows = new Map<string, RecordedReadiness>();
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const id = /^`([a-z0-9-]+)`$/.exec(cells[1] ?? "")?.[1];
    if (id === undefined || cells.length < 6) continue;
    rows.set(id, { verdict: cells[3] ?? "", evidence: cells[4] ?? "" });
  }
  return rows;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function arm(trials: readonly TrialView[]): ArmSummary {
  const finished = trials.filter((t) => t.state === "done" && t.turns !== null);
  const reached = finished.filter((t) => t.reachedPrimary === true);
  const turns = finished.reduce((sum, t) => sum + (t.turns ?? 0), 0);
  return {
    finished: finished.length,
    reached: reached.length,
    medianPrimaryMs: median(reached.flatMap((t) => (t.primaryMs === null ? [] : [t.primaryMs]))),
    medianTurns: median(finished.map((t) => t.turns ?? 0)),
    reachedPer1kTurns: turns === 0 ? null : (reached.length * 1000) / turns,
  };
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function approvalOf(runsRoot: string, id: string, problems: string[]): Approval | null {
  const path = join(experimentDir(runsRoot, id), "approval.json");
  if (!existsSync(path)) return null;
  try {
    const value = readJsonFile(path);
    if (Value.Check(ApprovalSchema, value) && value.experiment === id) return value;
  } catch {
    // reported below
  }
  problems.push(`${id}: approval.json is not a valid approval; treated as unapproved`);
  return null;
}

function ledgerOf(runsRoot: string, id: string, problems: string[]): LedgerEntry[] {
  const path = join(experimentDir(runsRoot, id), "trials.jsonl");
  if (!existsSync(path)) return [];
  const { entries, problems: bad } = parseLedger(readFileSync(path, "utf8"));
  problems.push(...bad.map((problem) => `${id}: trials.jsonl ${problem}`));
  return entries;
}

export function experimentView(e: Experiment, input: { approval: Approval | null; ledger: readonly LedgerEntry[]; runner: RunnerPosition | null; recent: readonly ReadinessRun[]; source: RunSource; recorded: RecordedReadiness | null; result: ResultSummary | null }): ExperimentView {
  const readiness = readinessOf(e, input.recent);
  const status = deriveStatus({ experiment: e, approval: input.approval, ledger: input.ledger, runner: input.runner, readiness, graded: input.result !== null });
  const metrics = (run: string | null): TrialMetrics | null => (run === null ? null : input.source.trial(run));
  const trials: TrialView[] = status.trials.map((t) => {
    const m = t.state === "done" ? metrics(t.run) : null;
    return { ...t, reachedPrimary: m === null ? null : m.reached.includes(e.primaryMilestone), primaryMs: m?.milestoneMs[e.primaryMilestone] ?? null, turns: m?.turns ?? null };
  });
  const usedMs = status.trials.flatMap((t) => t.runs).reduce((sum, run) => sum + (metrics(run)?.wallMs ?? 0), 0);
  return {
    id: e.id, title: e.title, changedFeature: e.changedFeature, incumbentOn: e.incumbent.features[e.changedFeature], hypothesis: e.hypothesis,
    activationMilestone: e.activationMilestone, primaryMilestone: e.primaryMilestone, queuePosition: e.queuePosition ?? null,
    source: e.source, trialsPerArm: e.trialsPerArm, modelLane: e.modelLane, budgetMs: e.budget.maxWallMs, usedMs,
    state: status.state, reason: status.reason, approved: input.approval !== null && input.approval.sha256 === definitionHash(e), readiness, recorded: input.recorded, trials,
    arms: { incumbent: arm(trials.filter((t) => t.arm === "incumbent")), candidate: arm(trials.filter((t) => t.arm === "candidate")) },
    notes: e.notes ?? null, result: input.result,
  };
}

// Graded means result.json is a file holding a comparison result, not only a grading problem.
export function gradedResult(path: string, definitionSha256: string): ResultSummary | null {
  try {
    if (!statSync(path).isFile()) return null;
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    // A result graded under an earlier definition no longer counts.
    if (typeof value !== "object" || value === null || !("result" in value) || !("definitionSha256" in value) || value.definitionSha256 !== definitionSha256) return null;
    const r = value.result;
    if (typeof r !== "object" || r === null) return null;
    const get = (k: string): unknown => (r as Record<string, unknown>)[k];
    const verdict = get("verdict"), recommendation = get("recommendation"), eligible = get("eligible"), problems = get("problems");
    const arm = (k: string): boolean => { const a = get(k); return typeof a === "object" && a !== null && Number.isInteger((a as Record<string, unknown>)["launched"]) && Number.isInteger((a as Record<string, unknown>)["reached"]); };
    // A comparePatchResults report, or nothing: a partial file keeps the experiment open.
    if (typeof verdict !== "string" || !VERDICTS.includes(verdict) || typeof recommendation !== "string" || !RECOMMENDATIONS.includes(recommendation) || typeof eligible !== "boolean" ||
      !Array.isArray(problems) || !problems.every((p) => typeof p === "string") || !arm("incumbent") || !arm("candidate")) return null;
    return { verdict, recommendation, eligible, problems };
  } catch {
    return null;
  }
}

export function loadExperiments(experimentsDir: string, problems: string[]): Experiment[] {
  if (!existsSync(experimentsDir)) return [];
  const experiments: Experiment[] = [];
  for (const file of readdirSync(experimentsDir).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const e = parseExperiment(readJsonFile(join(experimentsDir, file)));
      if (file !== `${e.id}.json`) throw new Error(`file name must be ${e.id}.json`);
      experiments.push(e);
    } catch (error) {
      problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return experiments;
}

export function queueSnapshot(paths: QueuePaths, source: RunSource, alive: (pid: number) => boolean = pidAlive): QueueSnapshot {
  const problems: string[] = [];
  const experiments = loadExperiments(paths.experimentsDir, problems);
  const recorded = existsSync(paths.readinessPath) ? parseReadinessDoc(readFileSync(paths.readinessPath, "utf8")) : new Map<string, RecordedReadiness>();
  const runner = readRunner(paths.runsRoot, alive);
  const recent = experiments.length === 0 ? [] : source.recent();
  const views = experiments.map((e) => experimentView(e, { approval: approvalOf(paths.runsRoot, e.id, problems), ledger: ledgerOf(paths.runsRoot, e.id, problems), runner, recent, source, recorded: recorded.get(e.changedFeature) ?? null, result: gradedResult(join(experimentDir(paths.runsRoot, e.id), "result.json"), definitionHash(e)) }));
  const positions = new Map<number, string>();
  for (const v of views) {
    if (v.queuePosition === null) continue;
    const other = positions.get(v.queuePosition);
    if (other !== undefined) problems.push(`${v.id}: queue position ${String(v.queuePosition)} is also used by ${other}`);
    positions.set(v.queuePosition, v.id);
  }
  const closed = (v: ExperimentView): boolean => v.state === "done" || v.state === "discarded";
  return {
    queue: views.filter((v) => v.queuePosition !== null && !closed(v)).sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0) || a.id.localeCompare(b.id)),
    pending: views.filter((v) => v.queuePosition === null && !closed(v)),
    closed: views.filter(closed),
    runner,
    problems,
  };
}

// Run logs reach tens of MB (raw RAM archives), so only the run_start, milestone and final
// lines are parsed and validated; the counts match summarize() for the same log.
export function scanRun(text: string): { readonly metrics: TrialMetrics; readonly ended: boolean } {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const first = lines[0], last = lines.at(-1);
  const start = first === undefined ? null : parseEvent(first);
  if (start?.type !== "run_start" || last === undefined) throw new RunsError("event log does not begin with run_start");
  const startMs = Date.parse(start.t);
  const reached: string[] = [], milestoneMs: Record<string, number> = {};
  for (const line of lines) {
    if (!line.includes('"type":"milestone"')) continue;
    const event = parseEvent(line);
    if (event.type !== "milestone" || event.origin === "present_at_start") continue;
    reached.push(event.name);
    milestoneMs[event.name] ??= Date.parse(event.t) - startMs;
  }
  const end = parseEvent(last);
  return end.type === "run_end"
    ? { metrics: { reached, milestoneMs, turns: end.turns, wallMs: end.wall_ms }, ended: true }
    : { metrics: { reached, milestoneMs, turns: end.turn, wallMs: Date.parse(end.t) - startMs }, ended: false };
}

// Recorded runs from runs/, cached once ended (an ended run's log never changes).
export function recordedRuns(runsRoot: string): RunSource {
  const cache = new Map<string, TrialMetrics>();
  const metrics = (runId: string): TrialMetrics | null => {
    const hit = cache.get(runId);
    if (hit !== undefined) return hit;
    let scanned;
    try {
      scanned = scanRun(readFileSync(join(runDir(runsRoot, runId), "events.jsonl"), "utf8"));
    } catch (error) {
      if (error instanceof RunsError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (scanned.ended) cache.set(runId, scanned.metrics);
    return scanned.metrics;
  };
  return {
    trial: metrics,
    recent: () => listRuns(runsRoot).filter((s) => s.ended && s.problem === null && s.reason !== "operator_abort").reverse().flatMap((s) => {
      const start = readStart(runsRoot, s.id), config = configOf(start);
      const m = config === null ? null : metrics(s.id);
      return config === null || m === null ? [] : [{ id: s.id, model: config.model, start: start.start_state.kind, maxTurns: config.maxTurns, maxWallMs: config.maxWallMs, features: config.features, reached: m.reached }];
    }),
  };
}
