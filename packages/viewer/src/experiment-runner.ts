// Runs approved experiments one at a time under the shared gameplay lease.
// Every trial gets its own run id, run dir and preset (INV-7); the ledger is
// append-only and a rerun resumes from it. Nothing here approves or changes
// defaults. With the winner gate on, a finished experiment's finalists run from
// boot before anything new, and only a finals winner becomes the incumbent.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { comparePatchResults, type PatchArm, type PatchResult } from "@pokebench/agent/patch-results";
import { ApprovalSchema, definitionHash, experimentArms, parseLedger, trialOrder, type Approval, type Arm, type Experiment, type LedgerEntry } from "@pokebench/agent/experiments";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
import { Value } from "typebox/value";
import type { PlayPresetV2 } from "@pokebench/agent/play-preset";
import { finalsPreset, type FinalsEntry, type Nomination } from "@pokebench/agent/experiment-gate";
import { experimentDir, loadExperiments, queueSnapshot, readRunnerFile, runnerPath, type ExperimentView, type QueuePaths, type QueueSnapshot, type RunSource } from "./experiment-store.js";
import { cohortNomination, decide, effectiveExperiment, finalsLedger, finalsLedgerPath, finalsResultPath, finalsRunner, finalsTrials, finalsWithdrawnPath, findCohort, nominationPath, promotionsPath, queueNomination, readNomination, readPromotions, type FinalsResult } from "./experiment-gate-store.js";
import { pidAlive, takeLease } from "./lease.js";

export interface DiscoveredModel { readonly id: string; readonly fingerprint: string }
export interface TrialLaunch { readonly runId: string; readonly presetPath: string; readonly model: string; readonly stdout: string; readonly stderr: string; readonly started?: (pid: number) => void }
export interface RunnerHost {
  now(): Date;
  runId(model: string): string;
  // The commit main's checkout is at now.
  head(): Promise<string>;
  // A problem that stops the runner, or null.
  verifySource(experiment: Experiment, commit: string): Promise<string | null>;
  liveRuns(): Promise<string[]>;
  discover(lane: string): Promise<DiscoveredModel>;
  // Resolves with the child's exit code once the run's process ends.
  launch(trial: TrialLaunch): Promise<number | null>;
  log(line: string): void;
  // A hand-run cohort driver or chain still alive (it frees the lease between steps), or null.
  activeCohort?(): Promise<string | null>;
  // Whether a pid lives (default: signal 0), and a pause between checks on an adopted trial.
  alive?(pid: number): boolean;
  wait?(ms: number): Promise<void>;
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
function approval(paths: QueuePaths, experiment: Experiment): Approval | null {
  const path = join(experimentDir(paths.runsRoot, experiment.id), "approval.json");
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Value.Check(ApprovalSchema, value) && value.experiment === experiment.id && value.sha256 === definitionHash(experiment) ? value : null;
  } catch {
    return null;
  }
}
const approved = (paths: QueuePaths, experiment: Experiment): boolean => approval(paths, experiment) !== null;
// The build trials run on: the one the operator approved (older approvals: the definition's pin).
// Both arms run on one build: the commit the first trial launched on. Before any trial, main as
// it is now, so an approval holds across merges instead of pinning the commit it was given on.
async function buildCommit(paths: QueuePaths, experiment: Experiment, host: RunnerHost): Promise<string> {
  for (const e of ledgerEntries(paths, experiment.id)) if (e.type === "launch" && e.commit !== undefined) return e.commit;
  return host.head();
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

export const ADOPT_POLL_MS = 5_000;
// Trials a viewer launched and never recorded: a restarted viewer adopts them instead of relaunching.
const orphans = (todo: readonly { state: string; run: string | null }[]): Set<string> => new Set(todo.flatMap((t) => (t.run !== null && (t.state === "interrupted" || t.state === "running") ? [t.run] : [])));

// Waits under the lease until an adopted trial stops playing, then reads how it ended (null: stop requested).
async function settleOrphan(runsRoot: string, host: RunnerHost, run: string, position: Readonly<Record<string, unknown>>, stopRequested: () => boolean): Promise<string | null> {
  const alive = (pid: number): boolean => (host.alive ?? pidAlive)(pid);
  const file = readRunnerFile(runsRoot);
  const child = file?.run === run ? (file.child ?? null) : null;
  writeFileSync(runnerPath(runsRoot), JSON.stringify({ ...position, run, ...(child === null ? {} : { child }) }));
  for (;;) {
    const playing = (await host.liveRuns()).includes(run) || (child !== null && alive(child) && endReason(runsRoot, run) === "incomplete");
    if (!playing) return endReason(runsRoot, run);
    if (stopRequested()) return null;
    await (host.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(ADOPT_POLL_MS);
  }
}

// The detached play pid joins the runner position; a failed write only loses that pid.
function noteChild(runsRoot: string, position: Readonly<Record<string, unknown>>, child: number): void {
  try {
    writeFileSync(runnerPath(runsRoot), JSON.stringify({ ...position, child }));
  } catch {
    // The position still names the run, which adoption falls back to.
  }
}

export function nextExperiment(queue: readonly ExperimentView[]): ExperimentView | null {
  return queue.find((v) => v.state === "approved" || v.state === "held") ?? null;
}

export type Step = { readonly kind: "experiment"; readonly view: ExperimentView } | { readonly kind: "nominate"; readonly id: string } | { readonly kind: "finals"; readonly id: string } | { readonly kind: "blocked"; readonly reason: string };
// INV-G1: while a nomination is unsettled, nothing new starts; its finals run first.
export function nextStep(snapshot: QueueSnapshot): Step | null {
  const open = snapshot.gate.find((g) => g.state === "waiting" || g.state === "nominating" || g.state === "finals" || g.state === "held" || g.state === "withdrawn");
  if (open !== undefined) {
    if (open.state === "nominating") return { kind: "nominate", id: open.experiment };
    if (open.state === "finals" || open.state === "held") return { kind: "finals", id: open.experiment };
    return { kind: "blocked", reason: `${open.experiment}: ${open.reason}` };
  }
  const view = nextExperiment(snapshot.queue);
  return view === null ? null : { kind: "experiment", view };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 1)}\n`);
  renameSync(`${path}.tmp`, path);
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
    const next = nextStep(queueSnapshot(options.paths, options.source));
    if (next === null || next.kind === "blocked") return { ran, stopped: finished.join("; ") };
  }
}

async function runNext(options: RunnerOptions): Promise<RunnerOutcome & { finished: string | null }> {
  const { paths, source, host, dryRun = false, once = false, stopRequested = () => false } = options;
  const snapshot = queueSnapshot(paths, source);
  for (const problem of snapshot.problems) host.log(`problem: ${problem}`);
  const step = nextStep(snapshot);
  const hold = (ran: number, stopped: string) => ({ ran, stopped, finished: null });
  if (step === null) return hold(0, `nothing to run: ${snapshot.queue.map((v) => `${v.id} is ${v.state}`).join("; ") || "the queue is empty"}`);
  if (step.kind === "blocked") return hold(0, `waiting: ${step.reason}`);
  if (step.kind === "nominate") {
    if (dryRun) return hold(0, `dry run: ${step.id} nominates its cohort's finalists next`);
    return nominateCohort(paths, source, host, step.id);
  }
  if (paths.winnerGate === true && !dryRun) {
    const cohort = (await host.activeCohort?.()) ?? null;
    if (cohort !== null) throw new RunnerError(`cohort ${cohort} is still running`);
  }
  if (step.kind === "finals") return runFinals(options, step.id);
  const view = step.view;
  const file = loadExperiments(paths.experimentsDir, []).find((e) => e.id === view.id);
  if (file === undefined) throw new RunnerError(`${view.id}: definition disappeared`);
  const gated = paths.winnerGate === true ? effectiveExperiment(file, ledgerEntries(paths, file.id), readPromotions(paths.runsRoot)) : null;
  const experiment = gated?.experiment ?? file;
  const promotion = gated === null ? {} : { promotion: gated.promotion };
  const todo = view.trials.filter((t) => t.state !== "done");
  host.log(`${experiment.id}: ${view.state}; ${String(todo.length)} of ${String(view.trials.length)} trials to run (${todo.map((t) => `${String(t.index + 1)}${t.arm === "incumbent" ? "A" : "B"}`).join(" ")})`);
  if (dryRun) return hold(0, "dry run");
  // Every trial already finished: grading reads only the ledger and run logs, so no build, model or lease is needed.
  if (todo.length === 0) return finish(paths, source, experiment, 0);
  const commit = await buildCommit(paths, experiment, host);
  const adoptable = orphans(todo);
  const live = (await host.liveRuns()).filter((run) => !adoptable.has(run));
  if (live.length > 0) throw new RunnerError(`live run ${live[0] ?? ""} is still running`);
  // The lease comes first: verifying the source may rebuild the agent dist every gameplay launcher loads.
  const lease = takeLease(paths.runsRoot, { pid: process.pid, owner: "experiment-queue", experiment: experiment.id }, (pid) => (host.alive ?? pidAlive)(pid), adoptable);
  let ran = 0;
  try {
    const problem = await host.verifySource(experiment, commit);
    if (problem !== null) throw new RunnerError(`${experiment.id}: ${problem}`);
    const model = await host.discover(experiment.modelLane);
    // The ledger is read once; appends go to disk and to this copy.
    const entries = ledgerEntries(paths, experiment.id);
    const record = (entry: LedgerEntry): void => { append(paths, experiment.id, entry); entries.push(entry); };
    const presets = new Map<Arm, string>();
    const logs = join(experimentDir(paths.runsRoot, experiment.id), "logs");
    mkdirSync(logs, { recursive: true });
    for (const trial of todo) {
      if (stopRequested()) return hold(ran, "stop requested");
      if (!approved(paths, experiment)) return hold(ran, "held: the approval no longer matches the definition");
      const recheck = await host.verifySource(experiment, commit);
      if (recheck !== null) return hold(ran, `held: ${recheck}`);
      const used = entries.flatMap((e) => (e.type === "launch" ? [e.run] : [])).reduce((sum, run) => sum + (source.trial(run)?.wallMs ?? 0), 0);
      if (used + experiment.incumbent.limits.maxWallMs > experiment.budget.maxWallMs) return hold(ran, "held: the next trial could exceed the experiment budget");
      const at = (): string => host.now().toISOString();
      if (trial.run !== null && adoptable.has(trial.run)) {
        const ended = await settleOrphan(paths.runsRoot, host, trial.run, { pid: process.pid, experiment: experiment.id, trial: trial.index }, stopRequested);
        if (ended === null) return hold(ran, "stop requested");
        if (ended === "operator_abort") {
          record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), message: "operator stopped the trial" });
          return hold(ran, `held: trial ${String(trial.index + 1)} was stopped by the operator; it will be rerun`);
        }
        if (ended !== "incomplete") {
          record({ type: "outcome", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), reason: ended });
          ran += 1;
          host.log(`${experiment.id}: adopted trial ${String(trial.index + 1)} (${trial.arm}) finished as ${trial.run}`);
          if (once && trial !== todo.at(-1)) return hold(ran, "one trial run (--once)");
          continue;
        }
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), message: "interrupted: no outcome was recorded" });
      }
      const presetPath = presets.get(trial.arm) ?? presetFile(paths, experiment, trial.arm);
      presets.set(trial.arm, presetPath);
      const runId = host.runId(model.id);
      record({ type: "launch", trial: trial.index, arm: trial.arm, run: runId, at: at(), model: model.id, environment: model.fingerprint, commit, ...promotion });
      const position = { pid: process.pid, experiment: experiment.id, trial: trial.index, run: runId };
      writeFileSync(runnerPath(paths.runsRoot), JSON.stringify(position));
      let code: number | null;
      try {
        code = await host.launch({ runId, presetPath, model: model.id, stdout: join(logs, `${runId}.stdout.log`), stderr: join(logs, `${runId}.stderr.log`), started: (child) => { noteChild(paths.runsRoot, position, child); } });
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
    return finish(paths, source, experiment, ran);
  } finally {
    rmSync(runnerPath(paths.runsRoot), { force: true });
    rmSync(lease, { recursive: true, force: true });
  }
}

function finish(paths: QueuePaths, source: RunSource, experiment: Experiment, ran: number): RunnerOutcome & { finished: string | null } {
  if (!approved(paths, experiment)) return { ran, stopped: "held: the approval no longer matches the definition", finished: null };
  const graded = writeResult(paths, experiment);
  if (graded.result === null) return { ran, stopped: `held: grading failed: ${graded.problem ?? "no result"}`, finished: null };
  const done = `${experiment.id} finished; result in ${join(experimentDir(paths.runsRoot, experiment.id), "result.json")}`;
  if (paths.winnerGate !== true) return { ran, stopped: done, finished: experiment.id };
  // The result only nominates (INV-Q7 as amended 2026-10-15): finals decide.
  const n = queueNomination(experiment, ledgerEntries(paths, experiment.id), source, new Date());
  writeJson(nominationPath(paths.runsRoot, experiment.id), n);
  return { ran, stopped: `${done}; ${n.reason}`, finished: experiment.id };
}

function nominateCohort(paths: QueuePaths, source: RunSource, host: RunnerHost, id: string): RunnerOutcome & { finished: string | null } {
  const experiment = loadExperiments(paths.experimentsDir, []).find((e) => e.id === id);
  const cohort = experiment?.externalCohort === undefined ? null : findCohort(paths.runsRoot, experiment.externalCohort);
  if (experiment === undefined || cohort === null) throw new RunnerError(`${id}: its cohort disappeared`);
  const n = cohortNomination(experiment, cohort, source, host.now());
  mkdirSync(experimentDir(paths.runsRoot, id), { recursive: true });
  writeJson(nominationPath(paths.runsRoot, id), n);
  host.log(`${id}: ${n.reason}`);
  return { ran: 0, stopped: `${id}: ${n.reason}`, finished: id };
}

const finalsPresetOf = (n: Nomination, arm: string): PlayPresetV2 => {
  const f = n.finalists.find((x) => x.arm === arm);
  // Rebuild the incumbent too, so a nomination recorded under older finals rules plays by the current ones.
  return finalsPreset(n.incumbent, n.experiment, f === undefined ? "incumbent" : arm, f?.switches ?? {}, n.finals);
};

// INV-G2: every finals arm starts from boot with the same limits; the ledger resumes like trials.jsonl.
async function runFinals({ paths, source, host, once = false, stopRequested = () => false }: RunnerOptions, id: string): Promise<RunnerOutcome & { finished: string | null }> {
  const hold = (ran: number, stopped: string) => ({ ran, stopped, finished: null });
  const n = readNomination(paths.runsRoot, id, []);
  const file = loadExperiments(paths.experimentsDir, []).find((e) => e.id === id);
  if (n === null || file === undefined) throw new RunnerError(`${id}: its nomination or definition disappeared`);
  const entries: FinalsEntry[] = finalsLedger(paths.runsRoot, id);
  const todo = finalsTrials(n, entries, null).filter((t) => t.state !== "done");
  host.log(`${id}: finals; ${String(todo.length)} run(s) from boot to go (${todo.map((t) => `${String(t.index + 1)}${t.arm}`).join(" ")})`);
  if (todo.length === 0) return settleFinals(paths, source, host, n, file, entries);
  const commit = entries.find((e) => e.type === "launch")?.type === "launch" ? (entries.find((e) => e.type === "launch") as Extract<FinalsEntry, { type: "launch" }>).commit : await host.head();
  const adoptable = orphans(todo);
  const live = (await host.liveRuns()).filter((run) => !adoptable.has(run));
  if (live.length > 0) throw new RunnerError(`live run ${live[0] ?? ""} is still running`);
  const lease = takeLease(paths.runsRoot, { pid: process.pid, owner: "experiment-queue", experiment: id, finals: true }, (pid) => (host.alive ?? pidAlive)(pid), adoptable);
  let ran = 0;
  try {
    const problem = await host.verifySource(file, commit);
    if (problem !== null) throw new RunnerError(`${id}: ${problem}`);
    const model = await host.discover(file.modelLane);
    const record = (entry: FinalsEntry): void => { appendFileSync(finalsLedgerPath(paths.runsRoot, id), `${JSON.stringify(entry)}\n`); entries.push(entry); };
    const dir = join(experimentDir(paths.runsRoot, id), "presets"), logs = join(experimentDir(paths.runsRoot, id), "logs");
    mkdirSync(dir, { recursive: true });
    mkdirSync(logs, { recursive: true });
    for (const trial of todo) {
      if (stopRequested()) return hold(ran, "stop requested");
      if (existsSync(finalsWithdrawnPath(paths.runsRoot, id))) return hold(ran, "held: the finals were withdrawn");
      const recheck = await host.verifySource(file, commit);
      if (recheck !== null) return hold(ran, `held: ${recheck}`);
      const at = (): string => host.now().toISOString();
      if (trial.run !== null && adoptable.has(trial.run)) {
        const ended = await settleOrphan(paths.runsRoot, host, trial.run, { pid: process.pid, experiment: finalsRunner(id), trial: trial.index }, stopRequested);
        if (ended === null) return hold(ran, "stop requested");
        if (ended === "operator_abort") {
          record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), message: "operator stopped the run" });
          return hold(ran, `held: finals run ${String(trial.index + 1)} was stopped by the operator; it will be rerun`);
        }
        if (ended !== "incomplete") {
          record({ type: "outcome", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), reason: ended });
          ran += 1;
          host.log(`${id}: adopted finals run ${String(trial.index + 1)} (${trial.arm}) finished as ${trial.run}`);
          if (once && trial !== todo.at(-1)) return hold(ran, "one finals run (--once)");
          continue;
        }
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: trial.run, at: at(), message: "interrupted: no outcome was recorded" });
      }
      const presetPath = join(dir, `finals-${trial.arm}.json`);
      const body = `${JSON.stringify(finalsPresetOf(n, trial.arm), null, 1)}\n`;
      if (existsSync(presetPath) && readFileSync(presetPath, "utf8") !== body) throw new RunnerError(`${id}: finals ${trial.arm} preset on disk differs from the nomination`);
      writeFileSync(presetPath, body);
      const runId = host.runId(model.id);
      record({ type: "launch", trial: trial.index, arm: trial.arm, run: runId, at: at(), model: model.id, commit });
      const position = { pid: process.pid, experiment: finalsRunner(id), trial: trial.index, run: runId };
      writeFileSync(runnerPath(paths.runsRoot), JSON.stringify(position));
      let code: number | null;
      try {
        code = await host.launch({ runId, presetPath, model: model.id, stdout: join(logs, `${runId}.stdout.log`), stderr: join(logs, `${runId}.stderr.log`), started: (child) => { noteChild(paths.runsRoot, position, child); } });
      } catch (error) {
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: at(), message: error instanceof Error ? error.message : String(error) });
        return hold(ran, `held: finals run ${String(trial.index + 1)} failed to launch`);
      }
      const reason = endReason(paths.runsRoot, runId);
      if (reason === "operator_abort" || reason === "incomplete") {
        record({ type: "launcher_error", trial: trial.index, arm: trial.arm, run: runId, at: at(), message: reason === "operator_abort" ? "operator stopped the run" : `play exited with ${String(code)} and recorded no run_end` });
        return hold(ran, `held: finals run ${String(trial.index + 1)} ${reason === "operator_abort" ? "was stopped by the operator; it will be rerun" : "ended without a recorded run_end"}`);
      }
      record({ type: "outcome", trial: trial.index, arm: trial.arm, run: runId, at: at(), reason });
      ran += 1;
      host.log(`${id}: finals run ${String(trial.index + 1)} (${trial.arm}) finished as ${runId}`);
      if (once && trial !== todo.at(-1)) return hold(ran, "one finals run (--once)");
    }
  } finally {
    rmSync(runnerPath(paths.runsRoot), { force: true });
    rmSync(lease, { recursive: true, force: true });
  }
  const settled = settleFinals(paths, source, host, n, file, entries);
  return { ...settled, ran };
}

// INV-G3: only a finals winner is appended to promotions.jsonl, once.
function settleFinals(paths: QueuePaths, source: RunSource, host: RunnerHost, n: Nomination, experiment: Experiment, entries: readonly FinalsEntry[]): RunnerOutcome & { finished: string | null } {
  const decision = decide(n, entries, source);
  if (decision === null) return { ran: 0, stopped: `held: ${n.experiment} finals are incomplete`, finished: null };
  let promotion: string | null = null;
  const winner = decision.winner === null ? undefined : n.finalists.find((f) => f.arm === decision.winner);
  if (winner !== undefined) {
    promotion = `${n.experiment}:${winner.arm}`;
    if (!readPromotions(paths.runsRoot).some((p) => p.id === promotion)) {
      const runs = finalsTrials(n, entries, null).filter((t) => t.arm === winner.arm).flatMap((t) => (t.run === null ? [] : [t.run]));
      appendFileSync(promotionsPath(paths.runsRoot), `${JSON.stringify({ id: promotion, from: n.experiment, arm: winner.arm, features: winner.switches, at: host.now().toISOString(), finals: runs })}\n`);
    }
  }
  const result: FinalsResult = { experiment: n.experiment, decidedAt: host.now().toISOString(), decision, promotion };
  writeJson(finalsResultPath(paths.runsRoot, n.experiment), result);
  const stopped = promotion === null ? `${n.experiment} finals: no finalist beat the incumbent; the incumbent stays` : `${n.experiment} finals: ${winner?.arm ?? ""} won and is now the incumbent`;
  host.log(stopped);
  return { ran: 0, stopped, finished: n.experiment };
}

function readEvents(runsRoot: string, runId: string): RunEvent[] {
  return readFileSync(join(runsRoot, runId, "events.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => parseEvent(line));
}

export interface ExperimentResult { readonly experiment: string; readonly definitionSha256: string; readonly gradedAt: string; readonly result: PatchResult | null; readonly problem: string | null }
// Grades the finished trials with the patch evaluator; no promotion follows from it (INV-Q7).
export function gradeExperiment(paths: QueuePaths, experiment: Experiment, now: Date = new Date()): ExperimentResult {
  const entries = ledgerEntries(paths, experiment.id);
  const arms = experimentArms(experiment);
  const flags = (preset: PlayPresetV2): Record<string, boolean> => ({ ...preset.features });
  try {
    // The latest outcome of each trial the definition has, in trial order.
    const order = trialOrder(experiment), latest = new Map<number, LedgerEntry>();
    for (const e of entries) if (e.type === "outcome" && e.trial < order.length && e.arm === order[e.trial]) latest.set(e.trial, e);
    const launches = new Map(entries.flatMap((e) => (e.type === "launch" ? [[e.run, e] as const] : [])));
    const armOf = (arm: Arm): PatchArm => ({
      preset: arms[arm].id, flags: flags(arms[arm]),
      trials: [...latest.entries()].sort(([a], [b]) => a - b).map(([, e]) => e).filter((e) => e.arm === arm).map((e) => {
        const launch = launches.get(e.run);
        const environment = launch?.type === "launch" ? launch.environment ?? "" : "";
        return { events: readEvents(paths.runsRoot, e.run), environment: { fingerprint: environment, receipt: ledgerPath(paths, experiment.id) }, issues: [] };
      }),
    });
    const result = comparePatchResults({ patchId: experiment.id, target: experiment.primaryMilestone, changedFeature: experiment.changedFeature, stage: "screening", speedMarginPercent: experiment.criteria.speedMarginPercent, completionTolerance: experiment.criteria.completionTolerance, trialsPerArm: experiment.trialsPerArm, incumbent: armOf("incumbent"), candidate: armOf("candidate") });
    return { experiment: experiment.id, definitionSha256: definitionHash(experiment), gradedAt: now.toISOString(), result, problem: null };
  } catch (error) {
    return { experiment: experiment.id, definitionSha256: definitionHash(experiment), gradedAt: now.toISOString(), result: null, problem: error instanceof Error ? error.message : String(error) };
  }
}

export function writeResult(paths: QueuePaths, experiment: Experiment): ExperimentResult {
  const graded = gradeExperiment(paths, experiment);
  // Written whole then renamed, so a half-written result never marks the experiment done.
  const path = join(experimentDir(paths.runsRoot, experiment.id), "result.json");
  writeFileSync(`${path}.tmp`, `${JSON.stringify(graded, null, 1)}\n`);
  renameSync(`${path}.tmp`, path);
  return graded;
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
