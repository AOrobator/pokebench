// Runs approved experiments one at a time under the shared gameplay lease.
// Every trial gets its own run id, run dir and preset (INV-7); the ledger is
// append-only and a rerun resumes from it. Nothing here approves, promotes or
// changes defaults.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { comparePatchResults, type PatchArm, type PatchResult } from "@pokebench/agent/patch-results";
import { experimentArms, parseLedger, type Arm, type Experiment, type LedgerEntry } from "@pokebench/agent/experiments";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
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
const ledgerRuns = (paths: QueuePaths, id: string): string[] => ledgerEntries(paths, id).flatMap((e) => (e.type === "launch" ? [e.run] : []));

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
  writeFileSync(join(lease, "owner.json"), JSON.stringify(owner), { flag: "wx" });
  return lease;
}

export function nextExperiment(queue: readonly ExperimentView[]): ExperimentView | null {
  return queue.find((v) => v.state === "approved" || v.state === "held") ?? null;
}

export async function runQueue({ paths, source, host, dryRun = false, once = false, stopRequested = () => false }: RunnerOptions): Promise<RunnerOutcome> {
  const snapshot = queueSnapshot(paths, source);
  for (const problem of snapshot.problems) host.log(`problem: ${problem}`);
  const view = nextExperiment(snapshot.queue);
  if (view === null) return { ran: 0, stopped: `nothing to run: ${snapshot.queue.map((v) => `${v.id} is ${v.state}`).join("; ") || "the queue is empty"}` };
  const experiment = loadExperiments(paths.experimentsDir, []).find((e) => e.id === view.id);
  if (experiment === undefined) throw new RunnerError(`${view.id}: definition disappeared`);
  const todo = view.trials.filter((t) => t.state !== "done");
  host.log(`${experiment.id}: ${view.state}; ${String(todo.length)} of ${String(view.trials.length)} trials to run (${todo.map((t) => `${String(t.index + 1)}${t.arm === "incumbent" ? "A" : "B"}`).join(" ")})`);
  if (dryRun) return { ran: 0, stopped: "dry run" };
  const problem = await host.verifySource(experiment);
  if (problem !== null) throw new RunnerError(`${experiment.id}: ${problem}`);
  const live = await host.liveRuns();
  if (live.length > 0) throw new RunnerError(`live run ${live[0] ?? ""} is still running`);
  const model = await host.discover(experiment.modelLane);
  const lease = takeLease(paths.runsRoot, { pid: process.pid, owner: "experiment-queue", experiment: experiment.id });
  let ran = 0;
  try {
    for (const trial of todo) {
      if (stopRequested()) return { ran, stopped: "stop requested" };
      const recheck = await host.verifySource(experiment);
      if (recheck !== null) return { ran, stopped: `held: ${recheck}` };
      const used = ledgerRuns(paths, experiment.id).reduce((sum, run) => sum + (source.trial(run)?.wallMs ?? 0), 0);
      if (used + experiment.incumbent.limits.maxWallMs > experiment.budget.maxWallMs) return { ran, stopped: "held: the next trial could exceed the experiment budget" };
      if (trial.state === "interrupted" && trial.run !== null) append(paths, experiment.id, { type: "launcher_error", trial: trial.index, arm: trial.arm, run: trial.run, at: host.now().toISOString(), message: "interrupted: no outcome was recorded" });
      const runId = host.runId(model.id), presetPath = presetFile(paths, experiment, trial.arm);
      append(paths, experiment.id, { type: "launch", trial: trial.index, arm: trial.arm, run: runId, at: host.now().toISOString(), model: model.id, environment: model.fingerprint });
      writeFileSync(runnerPath(paths.runsRoot), JSON.stringify({ pid: process.pid, experiment: experiment.id, trial: trial.index }));
      const logs = join(experimentDir(paths.runsRoot, experiment.id), "logs");
      mkdirSync(logs, { recursive: true });
      let code: number | null;
      try {
        code = await host.launch({ runId, presetPath, model: model.id, stdout: join(logs, `${runId}.stdout.log`), stderr: join(logs, `${runId}.stderr.log`) });
      } catch (error) {
        append(paths, experiment.id, { type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: host.now().toISOString(), message: error instanceof Error ? error.message : String(error) });
        return { ran, stopped: `held: trial ${String(trial.index + 1)} failed to launch` };
      }
      if (code !== 0) {
        append(paths, experiment.id, { type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: host.now().toISOString(), message: `play exited with ${String(code)}` });
        return { ran, stopped: `held: trial ${String(trial.index + 1)} exited with ${String(code)}` };
      }
      append(paths, experiment.id, { type: "outcome", trial: trial.index, arm: trial.arm, run: runId, at: host.now().toISOString(), reason: endReason(paths.runsRoot, runId) });
      ran += 1;
      host.log(`${experiment.id}: trial ${String(trial.index + 1)} (${trial.arm}) finished as ${runId}`);
      if (once) return { ran, stopped: "one trial run (--once)" };
    }
    writeResult(paths, experiment);
    return { ran, stopped: `${experiment.id} finished; result in ${join(experimentDir(paths.runsRoot, experiment.id), "result.json")}` };
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
