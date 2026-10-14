// Runs approved experiments one at a time under the shared gameplay lease.
// Every trial gets its own run id, run dir and preset (INV-7); the ledger is
// append-only and a rerun resumes from it. Nothing here approves, promotes or
// changes defaults.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { comparePatchResults, type PatchArm, type PatchResult } from "@pokebench/agent/patch-results";
import { ApprovalSchema, definitionHash, experimentArms, parseLedger, type Arm, type Experiment, type LedgerEntry } from "@pokebench/agent/experiments";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
import { Value } from "typebox/value";
import type { PlayPresetV2 } from "@pokebench/agent/play-preset";
import { experimentDir, loadExperiments, queueSnapshot, runnerPath, type ExperimentView, type QueuePaths, type RunSource } from "./experiment-store.js";
import { LEASE } from "./next-run.js";

export interface DiscoveredModel { readonly id: string; readonly fingerprint: string }
export interface TrialLaunch { readonly runId: string; readonly presetPath: string; readonly model: string; readonly stdout: string; readonly stderr: string }
export interface RunnerHost {
  now(): Date;
  runId(model: string): string;
  // A problem that stops the runner, or null.
  verifySource(experiment: Experiment): Promise<string | null>;
  liveRuns(): Promise<string[]>;
  discover(lane: string): Promise<DiscoveredModel>;
  // Resolves with the child's exit code once the run's process ends.
  launch(trial: TrialLaunch): Promise<number | null>;
  log(line: string): void;
}
export interface RunnerOptions { readonly paths: QueuePaths; readonly source: RunSource; readonly host: RunnerHost; readonly dryRun?: boolean; readonly once?: boolean; readonly stopRequested?: () => boolean }
export interface RunnerOutcome { readonly ran: number; readonly stopped: string }

export class RunnerError extends Error {
  override readonly name = "RunnerError";
}

const ledgerPath = (paths: QueuePaths, id: string): string => join(experimentDir(paths.runsRoot, id), "trials.jsonl");
function append(paths: QueuePaths, id: string, entry: LedgerEntry): void {
  mkdirSync(experimentDir(paths.runsRoot, id), { recursive: true });
  appendFileSync(ledgerPath(paths, id), `${JSON.stringify(entry)}\n`);
}

function ledgerEntries(paths: QueuePaths, id: string): LedgerEntry[] {
  const path = ledgerPath(paths, id);
  return existsSync(path) ? parseLedger(readFileSync(path, "utf8")).entries : [];
}
// INV-Q2, re-checked before every trial: the approval on disk still matches the definition.
function approved(paths: QueuePaths, experiment: Experiment): boolean {
  const path = join(experimentDir(paths.runsRoot, experiment.id), "approval.json");
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Value.Check(ApprovalSchema, value) && value.experiment === experiment.id && value.sha256 === definitionHash(experiment);
  } catch {
    return false;
  }
}

function presetFile(paths: QueuePaths, experiment: Experiment, arm: Arm): string {
  const arms = experimentArms(experiment);
  const path = join(experimentDir(paths.runsRoot, experiment.id), "presets", `${arm}.json`);
  const body = `${JSON.stringify(arms[arm], null, 1)}\n`;
  if (existsSync(path) && readFileSync(path, "utf8") !== body) throw new RunnerError(`${experiment.id}: ${arm} preset on disk differs from the definition`);
  mkdirSync(join(experimentDir(paths.runsRoot, experiment.id), "presets"), { recursive: true });
  writeFileSync(path, body);
  return path;
}

function endReason(runsRoot: string, runId: string): string {
  const path = join(runsRoot, runId, "events.jsonl");
  if (!existsSync(path)) return "incomplete";
  const last = readFileSync(path, "utf8").trimEnd().split("\n").at(-1) ?? "";
  try {
    const event = parseEvent(last);
    return event.type === "run_end" ? event.reason : "incomplete";
  } catch {
    return "incomplete";
  }
}

// INV-Q3: one measured run machine-wide; the lease is the same one NEXT RUN and cohorts use.
function takeLease(runsRoot: string, owner: Record<string, unknown>): string {
  const lease = join(runsRoot, LEASE);
  try {
    mkdirSync(lease);
  } catch {
    throw new RunnerError("the gameplay lease is held (another run, cohort or queue is active)");
  }
  try {
    writeFileSync(join(lease, "owner.json"), JSON.stringify(owner), { flag: "wx" });
  } catch (error) {
    rmSync(lease, { recursive: true, force: true });
    throw error;
  }
  return lease;
}

export function nextExperiment(queue: readonly ExperimentView[]): ExperimentView | null {
  return queue.find((v) => v.state === "approved" || v.state === "held") ?? null;
}

export async function runQueue(options: RunnerOptions): Promise<RunnerOutcome> {
  let ran = 0;
  const finished: string[] = [];
  for (;;) {
    const step = await runNext(options);
    ran += step.ran;
    if (step.finished === null || options.once === true || options.dryRun === true) {
      return { ran, stopped: finished.length === 0 ? step.stopped : `${finished.join("; ")}; ${step.stopped}` };
    }
    finished.push(step.stopped);
    if (nextExperiment(queueSnapshot(options.paths, options.source).queue) === null) return { ran, stopped: finished.join("; ") };
  }
}

async function runNext({ paths, source, host, dryRun = false, once = false, stopRequested = () => false }: RunnerOptions): Promise<RunnerOutcome & { finished: string | null }> {
  const snapshot = queueSnapshot(paths, source);
  for (const problem of snapshot.problems) host.log(`problem: ${problem}`);
  const view = nextExperiment(snapshot.queue);
  const hold = (ran: number, stopped: string) => ({ ran, stopped, finished: null });
  if (view === null) return hold(0, `nothing to run: ${snapshot.queue.map((v) => `${v.id} is ${v.state}`).join("; ") || "the queue is empty"}`);
  const experiment = loadExperiments(paths.experimentsDir, []).find((e) => e.id === view.id);
  if (experiment === undefined) throw new RunnerError(`${view.id}: definition disappeared`);
  const todo = view.trials.filter((t) => t.state !== "done");
  host.log(`${experiment.id}: ${view.state}; ${String(todo.length)} of ${String(view.trials.length)} trials to run (${todo.map((t) => `${String(t.index + 1)}${t.arm === "incumbent" ? "A" : "B"}`).join(" ")})`);
  if (dryRun) return hold(0, "dry run");
  const problem = await host.verifySource(experiment);
  if (problem !== null) throw new RunnerError(`${experiment.id}: ${problem}`);
  const live = await host.liveRuns();
  if (live.length > 0) throw new RunnerError(`live run ${live[0] ?? ""} is still running`);
  const model = await host.discover(experiment.modelLane);
  const lease = takeLease(paths.runsRoot, { pid: process.pid, owner: "experiment-queue", experiment: experiment.id });
  // The ledger is read once; appends go to disk and to this copy.
  const entries = ledgerEntries(paths, experiment.id);
  const record = (entry: LedgerEntry): void => { append(paths, experiment.id, entry); entries.push(entry); };
  const presets = new Map<Arm, string>();
  const logs = join(experimentDir(paths.runsRoot, experiment.id), "logs");
  mkdirSync(logs, { recursive: true });
  let ran = 0;
  try {
    for (const trial of todo) {
      if (stopRequested()) return hold(ran, "stop requested");
      if (!approved(paths, experiment)) return hold(ran, "held: the approval no longer matches the definition");
      const recheck = await host.verifySource(experiment);
      if (recheck !== null) return hold(ran, `held: ${recheck}`);
      const used = entries.flatMap((e) => (e.type === "launch" ? [e.run] : [])).reduce((sum, run) => sum + (source.trial(run)?.wallMs ?? 0), 0);
      if (used + experiment.incumbent.limits.maxWallMs > experiment.budget.maxWallMs) return hold(ran, "held: the next trial could exceed the experiment budget");
      const at = (): string => host.now().toISOString();
      if (trial.state === "interrupted" && trial.run !== null) record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), message: "interrupted: no outcome was recorded" });
      const presetPath = presets.get(trial.arm) ?? presetFile(paths, experiment, trial.arm);
      presets.set(trial.arm, presetPath);
      const runId = host.runId(model.id);
      record({ type: "launch", trial: trial.index, arm: trial.arm, run: runId, at: at(), model: model.id, environment: model.fingerprint });
      writeFileSync(runnerPath(paths.runsRoot), JSON.stringify({ pid: process.pid, experiment: experiment.id, trial: trial.index }));
      let code: number | null;
      try {
        code = await host.launch({ runId, presetPath, model: model.id, stdout: join(logs, `${runId}.stdout.log`), stderr: join(logs, `${runId}.stderr.log`) });
      } catch (error) {
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: at(), message: error instanceof Error ? error.message : String(error) });
        return hold(ran, `held: trial ${String(trial.index + 1)} failed to launch`);
      }
      const reason = endReason(paths.runsRoot, runId);
      // An operator stop is not a model result: keep it on record, rerun the trial later, never grade it.
      if (reason === "operator_abort") {
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: at(), message: "operator stopped the trial" });
        return hold(ran, `held: trial ${String(trial.index + 1)} was stopped by the operator; it will be rerun`);
      }
      // A run that recorded its own end (crash, model_error, ...) is a result even when play exits nonzero (PB2);
      // a run with no recorded end is a launcher failure, whatever the exit code.
      if (reason === "incomplete") {
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: at(), message: code === 0 ? "play exited with 0 but recorded no run_end" : `play exited with ${String(code)}` });
        return hold(ran, code === 0 ? `held: trial ${String(trial.index + 1)} ended without a recorded run_end` : `held: trial ${String(trial.index + 1)} exited with ${String(code)}`);
      }
      record({ type: "outcome", trial: trial.index, arm: trial.arm, run: runId, at: at(), reason });
      ran += 1;
      host.log(`${experiment.id}: trial ${String(trial.index + 1)} (${trial.arm}) finished as ${runId}`);
      if (once && trial !== todo.at(-1)) return hold(ran, "one trial run (--once)");
    }
    writeResult(paths, experiment);
    const done = `${experiment.id} finished; result in ${join(experimentDir(paths.runsRoot, experiment.id), "result.json")}`;
    return { ran, stopped: done, finished: experiment.id };
  } finally {
    rmSync(runnerPath(paths.runsRoot), { force: true });
    rmSync(lease, { recursive: true, force: true });
  }
}

function readEvents(runsRoot: string, runId: string): RunEvent[] {
  return readFileSync(join(runsRoot, runId, "events.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => parseEvent(line));
}

export interface ExperimentResult { readonly experiment: string; readonly gradedAt: string; readonly result: PatchResult | null; readonly problem: string | null }
// Grades the finished trials with the patch evaluator; no promotion follows from it (INV-Q7).
export function gradeExperiment(paths: QueuePaths, experiment: Experiment, now: Date = new Date()): ExperimentResult {
  const entries = ledgerEntries(paths, experiment.id);
  const arms = experimentArms(experiment);
  const flags = (preset: PlayPresetV2): Record<string, boolean> => ({ ...preset.features });
  try {
    const armOf = (arm: Arm): PatchArm => ({
      preset: arms[arm].id, flags: flags(arms[arm]),
      trials: entries.filter((e) => e.type === "outcome" && e.arm === arm).map((e) => {
        const launch = entries.find((l) => l.type === "launch" && l.run === e.run);
        const environment = launch?.type === "launch" ? launch.environment ?? "" : "";
        return { events: readEvents(paths.runsRoot, e.run), environment: { fingerprint: environment, receipt: ledgerPath(paths, experiment.id) }, issues: [] };
      }),
    });
    const result = comparePatchResults({ patchId: experiment.id, target: experiment.primaryMilestone, changedFeature: experiment.changedFeature, stage: "screening", speedMarginPercent: experiment.criteria.speedMarginPercent, completionTolerance: experiment.criteria.completionTolerance, incumbent: armOf("incumbent"), candidate: armOf("candidate") });
    return { experiment: experiment.id, gradedAt: now.toISOString(), result, problem: null };
  } catch (error) {
    return { experiment: experiment.id, gradedAt: now.toISOString(), result: null, problem: error instanceof Error ? error.message : String(error) };
  }
}

export function writeResult(paths: QueuePaths, experiment: Experiment): ExperimentResult {
  const graded = gradeExperiment(paths, experiment);
  writeFileSync(join(experimentDir(paths.runsRoot, experiment.id), "result.json"), `${JSON.stringify(graded, null, 1)}\n`);
  return graded;
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
