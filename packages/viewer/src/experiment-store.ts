// Read side of the experiment queue: tracked definitions, the operator's
// approvals, trial ledgers, the runner's position, recorded run outcomes and
// the readiness verdicts in docs/experiments/readiness.md.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ApprovalSchema, definitionHash, deriveStatus, parseExperiment, parseLedger, readinessOf, type Approval, type Experiment, type ExperimentState, type LedgerEntry, type Readiness, type ReadinessRun, type RunnerPosition, type TrialProgress } from "@pokebench/agent/experiments";
import { readRun, summarize } from "@pokebench/agent/summary";
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

export function experimentView(e: Experiment, input: { approval: Approval | null; ledger: readonly LedgerEntry[]; runner: RunnerPosition | null; recent: readonly ReadinessRun[]; source: RunSource; recorded: RecordedReadiness | null; graded: boolean }): ExperimentView {
  const readiness = readinessOf(e, input.recent);
  const status = deriveStatus({ experiment: e, approval: input.approval, ledger: input.ledger, runner: input.runner, readiness, graded: input.graded });
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
    notes: e.notes ?? null,
  };
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
  const views = experiments.map((e) => experimentView(e, { approval: approvalOf(paths.runsRoot, e.id, problems), ledger: ledgerOf(paths.runsRoot, e.id, problems), runner, recent, source, recorded: recorded.get(e.changedFeature) ?? null, graded: existsSync(join(experimentDir(paths.runsRoot, e.id), "result.json")) }));
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

// Recorded runs from runs/, cached once ended (an ended run's log never changes).
export function recordedRuns(runsRoot: string): RunSource {
  const cache = new Map<string, TrialMetrics>();
  const metrics = (runId: string): TrialMetrics | null => {
    const hit = cache.get(runId);
    if (hit !== undefined) return hit;
    let summary;
    try {
      summary = summarize(readRun(runDir(runsRoot, runId)));
    } catch (error) {
      if (error instanceof RunsError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const value: TrialMetrics = { reached: summary.milestones.map((m) => m.name), milestoneMs: Object.fromEntries(summary.milestones.map((m) => [m.name, m.wallMs])), turns: summary.turns, wallMs: summary.wallMs };
    if (summary.reason !== "incomplete") cache.set(runId, value);
    return value;
  };
  return {
    trial: metrics,
    recent: () => listRuns(runsRoot).filter((s) => s.ended && s.problem === null && s.reason !== "operator_abort").reverse().flatMap((s) => {
      const config = configOf(readStart(runsRoot, s.id));
      const m = config === null ? null : metrics(s.id);
      return config === null || m === null ? [] : [{ id: s.id, model: config.model, maxTurns: config.maxTurns, maxWallMs: config.maxWallMs, features: config.features, reached: m.reached }];
    }),
  };
}
