import { visualEvidenceSignature } from "./frontier-visual.js";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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
import { parseLedger } from "@pokebench/agent/experiments";
import { parseFinalsLedger } from "@pokebench/agent/experiment-gate";
import { isFixedLedgerText, parseFixedLedger } from "./fixed-ledger.js";
import type { HealthProbe } from "./next-run.js";
import type { WorkbenchCohort, WorkbenchConfig, WorkbenchData, WorkbenchRun } from "./workbench-data.js";
import { distinctLabels, experimentDefinitions, legacyCohort, taggedCohorts, type TaggedRun } from "./experiment-cohorts.js";
const MAX_PLAN_BYTES = 1024 * 1024;
interface Loaded { signature: string; run: WorkbenchRun; port: number | null; view: RunView | null; tag: { experiment: string; commit: string } | null }
const cache = new Map<string, Loaded>();
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function errorText(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
function metadata(path: string): { value: unknown; digest: string } {
  if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("Receipt is symlinked or exceeds the metadata size bound");
  const bytes = readFileSync(path, "utf8");
  return { value: JSON.parse(bytes) as unknown, digest: sha256(bytes) };
}
function resumeCheckpoint(start: Extract<RunEvent, { type: "run_start" }>): string | null {
  if (start.start_state.kind !== "save_state") return null;
  const file = start.start_state.path.split(/[/\\]/).pop() ?? "";
  return file === "CLOCK_SET.state" ? "CLOCK_SET" : file === "MAIN_MENU.state" ? "MAIN_MENU" : null;
}
function configuration(start: Extract<RunEvent, { type: "run_start" }>): WorkbenchConfig {
  const known = configOf(start);
  return {
    source: start.harness.commit, dirty: start.harness.dirty, vendor: start.vendor_pin, pi: start.pi_version,
    preset: start.evaluation?.preset_id ?? null, target: start.evaluation?.target ?? null, thinking: start.sampling.thinking_level,
    maxTokens: start.sampling.max_tokens, maxTurns: start.budgets.max_turns ?? null, maxWallMs: start.budgets.max_wall_ms ?? null,
    failureLimit: start.evaluation?.failure_limit ?? null, context: start.model.context_window, vision: start.model.vision,
    start: start.start_state.kind, resume: resumeCheckpoint(start), tools: start.tools,
    features: FEATURES.filter(f => f.switchable).map(f => ({ id: f.id, label: f.title, on: known === null ? (start.harness_features.includes(f.id) ? true : null) : known.features[f.id as keyof typeof known.features] })),
  };
}
// The run_start the workbench trusts: the log is not symlinked and names this run.
function startOf(root: string, id: string): Extract<RunEvent, { type: "run_start" }> {
  if (lstatSync(eventsPath(root, id)).isSymbolicLink()) throw new Error("Run log is symlinked; no split graded");
  const start = readStart(root, id);
  if (start.run !== id) throw new Error("Run identity is invalid; no split graded");
  return start;
}
function load(root: string, id: string): Loaded {
  const path = eventsPath(root, id), stat = statSync(path); let signature = `${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ino)}`;
  const prior = cache.get(path);
  let run: WorkbenchRun = { id, cohort: null, model: null, started: null, status: "invalid", reason: null, problem: null, excluded: null, elapsedMs: null, turn: 0, config: null, splits: [] };
  let port: number | null, view: RunView | null, tag: Loaded["tag"] = null;
  try {
    signature += visualEvidenceSignature(path);
    if (prior?.signature === signature) return prior;
    const start = startOf(root, id);
    run = { ...run, model: start.controller?.kind === "human" ? `Human · ${start.controller.name}` : start.model.id, started: start.t, config: configuration(start), excluded: start.harness_features.includes("probe") ? "Excluded probe session" : null };
    port = start.isolation.port;
    const experiment = start.evaluation?.experiment; if (experiment !== undefined) tag = { experiment: experiment.id, commit: start.harness.commit };
    const recording = readNativeRecording(path, id, qualifiedNativeMilestone); view = recording.view;
    run.splits = recording.splits; run.measurement = recording.measurement;
    run.status = view.end === null ? "unresponsive" : "ended"; run.reason = view.end?.reason ?? null; run.turn = view.turn;
    if (run.reason === "operator_abort") run.excluded ??= "Excluded operator-aborted run";
  } catch (error) { run.problem = errorText(error); run.status = "invalid"; run.splits = []; view = null; port = null; }
  if (view !== null) view.events.length = 0;
  const entry = { signature, run, port, view, tag }; cache.set(path, entry); return entry;
}
function boundedLedger(path: string): unknown[] {
  if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("Cohort ledger exceeds metadata bounds");
  return readFileSync(path, "utf8").split("\n").filter(line => line.trim() !== "").map((line): unknown => JSON.parse(line));
}
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LEDGER_RUN = /"(?:run|run_id|runId)"\s*:\s*"([A-Za-z0-9][A-Za-z0-9._-]*)"/g;
// A ledger that fails its all-or-nothing parse cannot vouch for any trial it names. Every run id its
// text mentions is marked unverified, which excludes a run-tagged run (legacy membership is unchanged).
function unreadable(root: string, path: string, unverified: Map<string, string>): void {
  try {
    if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) return;
    const why = `Unverified: ledger ${relative(root, path)} is unreadable, so this trial's validity is unknown`;
    for (const match of readFileSync(path, "utf8").matchAll(LEDGER_RUN)) { const run = match[1] ?? ""; if (!run.includes("..") && !unverified.has(run)) unverified.set(run, why); }
  } catch { /* A ledger that vanished names nothing. */ }
}
// The runner may be mid-append: an unterminated last line that is not JSON yet is not read.
function untorn(text: string): string {
  const cut = text.lastIndexOf("\n") + 1, last = text.slice(cut);
  if (last.trim() === "") return text;
  try { JSON.parse(last); return text; } catch { return text.slice(0, cut); }
}
// The plan shape applyHistoricalProvenance reads (order and presets).
function provenancePlan(path: string): boolean {
  try { const plan = metadata(path).value; return record(plan) && Array.isArray(plan.order) && record(plan.presets); } catch { return false; }
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
// membership and failures are the legacy ledger readers' verdicts. named holds the infrastructure failure
// any ledger records for a run, even one another ledger owns, so a run-tagged run is excluded wherever its
// ledger lives; unverified holds the runs an unreadable ledger names.
interface Membership { failures: Map<string, string>; named: Map<string, string>; unverified: Map<string, string>; membership: Map<string, string>; problems: string[] }
async function cohortMembership(root: string): Promise<Membership> {
  const unverified = new Map<string, string>(), named = new Map<string, string>(), failures = new Map<string, string>(), membership = new Map<string, string>(), problems: string[] = [], accepted = new Set<string>(), claimed = new Set<string>(), reserved = new Set<string>();
  for (const path of plans(root)) {
    let ledgerPath: string | null = null;
    try {
      const receipt = metadata(path), raw = receipt.value;
      if (record(raw) && raw.id === "navigation-memory-think-fast-n4" && Array.isArray(raw.order)) {
        claimed.add(dirname(path)); reserved.add(raw.id);
        ledgerPath = join(dirname(path), "trials.jsonl");
        const rows: unknown[] = existsSync(ledgerPath) ? boundedLedger(ledgerPath) : [];
        if (typeof raw.root !== "string" || realpathSync(join(raw.root, "runs")) !== realpathSync(root)) throw new Error("Navigation receipt root does not own this run store");
        const custom = parseNavigationReceipt(raw, rows, receipt.digest, raw.root);
        if (accepted.has(custom.id)) continue; accepted.add(custom.id);
        for (const trial of custom.trials) {
          if (trial.run !== null) {
            try { const start = readStart(root, trial.run); if (start.harness.commit === custom.source && start.model.id === custom.model) { membership.set(trial.run, custom.id); if (trial.failed) failures.set(trial.run, `Infrastructure outcome: ${custom.failure ?? "child process failed"}`); } else problems.push(`Navigation run ${trial.run} source/model does not match its receipt`); } catch { /* A launched child may not have written run_start yet. */ }
          }
        }
        continue;
      }
      if (!record(raw) || !Array.isArray(raw.trials) || !Array.isArray(raw.lanes)) continue;
      claimed.add(dirname(path));
      if (typeof raw.id === "string") { reserved.add(raw.id); if (RUN_ID.test(raw.id) && !raw.id.includes("..")) claimed.add(join(root, "launch-receipts", raw.id)); }
      const m = prepareComparison(raw); ledgerPath = join(root, "launch-receipts", m.id, "trials.jsonl");
      if (join(m.repoRoot, "runs") !== root || !existsSync(ledgerPath)) continue;
      if (lstatSync(ledgerPath).isSymbolicLink() || statSync(ledgerPath).size > MAX_PLAN_BYTES) throw new Error("Cohort ledger exceeds metadata bounds");
      const rows = await filesystemComparisonHost(m).readLedger();
      const digest = sha256(JSON.stringify(m));
      if (rows.length === 0 || !rows.every(row => record(row) && row.manifestSha256 === digest)) continue;
      if (accepted.has(m.id)) continue;
      const receiptFailures = new Map<string, string>(); let cohortFailed = false;
      for (const [index, row] of rows.entries()) {
        const trial = m.trials[Math.floor(index / 2)];
        if (trial === undefined || row.runId !== trial.runId || row.type !== (index % 2 === 0 ? "launch" : "outcome") || !Number.isFinite(Date.parse(row.at)) || (row.type === "outcome" && Date.parse(row.at) < Date.parse(rows[index - 1]?.at ?? "")) || cohortFailed) throw new Error("Cohort ledger has invalid serial order or timestamps");
        if (row.type === "outcome") {
          if (row.reason === undefined) throw new Error("Cohort outcome has no reason");
          if (row.exitCode !== 0 || row.eventsSha256 === null || !RUN_END_REASONS.some(reason => reason === row.reason)) { cohortFailed = true; receiptFailures.set(row.runId, `Infrastructure outcome: ${row.failureCode ?? (row.eventsSha256 === null ? "missing event digest" : row.reason)}`); }
        }
      }
      accepted.add(m.id);
      for (const trial of m.trials) membership.set(trial.runId, m.id);
      for (const [id, failure] of receiptFailures) failures.set(id, failure);
    } catch (error) { problems.push(`Comparison receipt: ${errorText(error)}`); if (ledgerPath !== null && existsSync(ledgerPath)) unreadable(root, ledgerPath, unverified); }
  }
  experimentCohorts(root, failures, unverified, membership, problems);
  archivedDryRuns(root, failures, named, unverified, membership, problems);
  receiptValidity(root, claimed, named, unverified);
  handRunCohorts(root, claimed, reserved, failures, membership, problems);
  return { failures, named, unverified, membership, problems };
}
// Experiment-queue ledgers under runs/experiments/<id>/: trials.jsonl joins cohort experiment:<id>
// and finals.jsonl (every finals arm: the incumbent and each finalist) joins experiment:<id>:finals.
// Every launched run joins its cohort and launcher errors are excluded.
function experimentCohorts(root: string, failures: Map<string, string>, unverified: Map<string, string>, membership: Map<string, string>, problems: string[]): void {
  const base = join(root, "experiments");
  if (!existsSync(base)) return;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const [file, cohort, label] of [["trials.jsonl", `experiment:${entry.name}`, "ledger"], ["finals.jsonl", `experiment:${entry.name}:finals`, "finals ledger"]] as const) {
      const path = join(base, entry.name, file);
      if (!existsSync(path)) continue;
      try {
        if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("Experiment ledger exceeds metadata bounds");
        const text = untorn(readFileSync(path, "utf8"));
        if (file === "trials.jsonl" && isFixedLedgerText(text)) { if (!fixedCohort(text, cohort, entry.name, failures, membership, problems)) unreadable(root, path, unverified); continue; }
        const { entries, problems: bad } = file === "trials.jsonl" ? parseLedger(text) : parseFinalsLedger(text);
        // All or nothing: a ledger with any unreadable row contributes no cohort annotations.
        if (bad.length > 0) { problems.push(...bad.map(p => `Experiment ${entry.name} ${label} ${p}`)); unreadable(root, path, unverified); continue; }
        const launched = new Set<string>(), errors = new Map<string, string>();
        for (const e of entries) {
          if (e.type === "launch") launched.add(e.run);
          else if (!launched.has(e.run)) throw new Error(`run ${e.run} has an ${e.type} without a launch`);
          else if (e.type === "launcher_error") errors.set(e.run, `Launcher outcome: ${e.message}`);
        }
        for (const run of launched) membership.set(run, cohort);
        for (const [run, message] of errors) failures.set(run, message);
      } catch (error) { problems.push(`Experiment ${entry.name} ${label}: ${errorText(error)}`); unreadable(root, path, unverified); }
    }
  }
}
// A fixed-run ledger (the fixed-N two-arm driver) joins experiment:<id> the same way: all or nothing,
// every launched run is a member, and a trial the driver judged invalid is excluded with its reason.
// False when the ledger is unreadable and contributed nothing.
function fixedCohort(text: string, cohort: string, name: string, failures: Map<string, string>, membership: Map<string, string>, problems: string[]): boolean {
  const { entries, problems: bad } = parseFixedLedger(text);
  if (bad.length > 0) { problems.push(...bad.map(p => `Experiment ${name} ledger line ${p}`)); return false; }
  const launched = new Set<string>(), invalid = new Map<string, string>();
  for (const e of entries) {
    if (e.kind === "launch") launched.add(e.run);
    else if (!launched.has(e.run)) { problems.push(`Experiment ${name} ledger: run ${e.run} has a ${e.kind} without a launch`); return false; }
    else if (e.kind === "outcome" && !e.valid) invalid.set(e.run, `Invalid fixed-run trial: ${e.reason}`);
  }
  for (const run of launched) membership.set(run, cohort);
  for (const [run, message] of invalid) failures.set(run, message);
  return true;
}
// A finished dry run's ledger is moved aside to runs/dryruns/<dir>/ before the next dry run of the
// same id (fixed-cli refuses otherwise). Its trials stay filterable as experiment:<dir>; a run a
// live ledger already claims keeps that cohort.
function archivedDryRuns(root: string, failures: Map<string, string>, named: Map<string, string>, unverified: Map<string, string>, membership: Map<string, string>, problems: string[]): void {
  const base = join(root, "dryruns");
  if (!existsSync(base)) return;
  const source = new Map<string, string>();
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(base, entry.name, "trials.jsonl");
    if (!entry.isDirectory() || !existsSync(path)) continue;
    try {
      if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("ledger exceeds metadata bounds");
      const text = untorn(readFileSync(path, "utf8"));
      if (!isFixedLedgerText(text)) continue;
      const found = new Map<string, string>(), invalid = new Map<string, string>();
      if (!fixedCohort(text, `experiment:${entry.name}`, `dry run ${entry.name}`, invalid, found, problems)) unreadable(root, path, unverified);
      for (const [run, why] of invalid) if (!named.has(run)) named.set(run, why);
      for (const [run, cohort] of found) {
        const prior = source.get(run);
        if (prior !== undefined) { problems.push(`Dry runs ${prior} and ${entry.name} both name run ${run}; it stays in ${prior}`); continue; }
        if (membership.has(run)) continue;
        membership.set(run, cohort); source.set(run, entry.name);
        const why = invalid.get(run); if (why !== undefined) failures.set(run, why);
      }
    } catch (error) { problems.push(`Dry run ${entry.name}: ${errorText(error)}`); unreadable(root, path, unverified); }
  }
}
function runOf(row: Record<string, unknown>): string | null {
  const run = row.run ?? row.run_id;
  return typeof run === "string" && RUN_ID.test(run) && !run.includes("..") ? run : null;
}
// The infrastructure failure a hand-run ledger row records for its run, if any.
function rowFailure(row: Record<string, unknown>): string | null {
  if (row.type === "launcher_error") {
    const why = [row.message, row.error].find((v): v is string => typeof v === "string") ?? "launcher error";
    return `Launcher outcome: ${why}`.slice(0, 500);
  }
  const code = row.exit ?? row.code ?? row.exit_code;
  if (typeof code === "number" && code !== 0) return `Infrastructure outcome: exit ${String(code)}`;
  if (typeof row.signal === "string") return `Infrastructure outcome: ${row.signal}`;
  return null;
}
function jsonRows(path: string): Record<string, unknown>[] {
  if (lstatSync(path).isSymbolicLink() || statSync(path).size > MAX_PLAN_BYTES) throw new Error("ledger exceeds metadata bounds");
  const lines = readFileSync(path, "utf8").split("\n"), rows: Record<string, unknown>[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    let row: unknown;
    try { row = JSON.parse(line); } catch {
      // A driver may be mid-write: only an unterminated last line is tolerated.
      if (index === lines.length - 1) continue;
      throw new Error(`line ${String(index + 1)} is not JSON`);
    }
    if (!record(row)) throw new Error(`line ${String(index + 1)} is not an object`);
    rows.push(row);
  }
  return rows;
}
// Hand-run cohorts under runs/launch-receipts/<dir>/ that no verified receipt claimed: runs named by
// trials.jsonl rows or manifest.json attempts join the manifest's id (else the directory name).
// They never relabel a run that a verified receipt or the experiment queue already owns, never take
// a verified cohort's name, and a directory whose plan.json historical provenance can use is left to it.
// Validity only, for run-tagged runs: every launch-receipt directory that no verified receipt reader
// claimed, including plan.json provenance cohorts and directories whose cohort name is refused below.
function receiptValidity(root: string, claimed: ReadonlySet<string>, named: Map<string, string>, unverified: Map<string, string>): void {
  const base = join(root, "launch-receipts");
  if (!existsSync(base)) return;
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const here = join(base, entry.name), manifestPath = join(here, "manifest.json"), ledgerPath = join(here, "trials.jsonl");
    if (!entry.isDirectory() || claimed.has(here)) continue;
    const rows: Record<string, unknown>[] = [];
    if (existsSync(ledgerPath)) { try { rows.push(...jsonRows(ledgerPath)); } catch { unreadable(root, ledgerPath, unverified); } }
    try { const manifest = existsSync(manifestPath) ? metadata(manifestPath).value : null; if (record(manifest) && Array.isArray(manifest.attempts)) rows.push(...manifest.attempts.filter(record)); } catch { /* handRunCohorts reports the manifest. */ }
    for (const row of rows) { const run = runOf(row), failure = rowFailure(row); if (run !== null && failure !== null && !named.has(run)) named.set(run, failure); }
  }
}
function handRunCohorts(root: string, claimed: ReadonlySet<string>, reserved: ReadonlySet<string>, failures: Map<string, string>, membership: Map<string, string>, problems: string[]): void {
  const base = join(root, "launch-receipts");
  if (!existsSync(base)) return;
  const owned = new Set(membership.keys()), verified = new Set([...reserved, ...membership.values()]), source = new Map<string, string>();
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const here = join(base, entry.name);
    if (!entry.isDirectory() || claimed.has(here) || provenancePlan(join(here, "plan.json"))) continue;
    try {
      const manifestPath = join(here, "manifest.json"), ledgerPath = join(here, "trials.jsonl");
      const manifest = existsSync(manifestPath) ? metadata(manifestPath).value : null;
      const rows = existsSync(ledgerPath) ? jsonRows(ledgerPath) : [];
      if (record(manifest) && Array.isArray(manifest.attempts)) rows.push(...manifest.attempts.filter(record));
      const cohort = record(manifest) && typeof manifest.id === "string" && manifest.id !== "" ? manifest.id : entry.name;
      if (verified.has(cohort) || cohort.startsWith("experiment:")) throw new Error(`cohort id ${cohort} belongs to a verified receipt or the experiment queue`);
      for (const row of rows) {
        const run = runOf(row), failure = rowFailure(row);
        if (run === null || owned.has(run)) continue;
        const prior = source.get(run);
        if (prior !== undefined && prior !== entry.name) { problems.push(`Launch receipts ${prior} and ${entry.name} both name run ${run}; it stays in ${membership.get(run) ?? prior}`); continue; }
        try { readStart(root, run); } catch { continue; }
        membership.set(run, cohort); source.set(run, entry.name);
        if (failure !== null && !failures.has(run)) failures.set(run, failure);
      }
    } catch (error) { problems.push(`Launch receipt ${entry.name}: ${errorText(error)}`); }
  }
}
// Each run's dropdown cohort without loading recordings: the fast path for just experiments-audit. A
// run-tagged run's cohort is exactly the snapshot's; an untagged run's omits plan.json provenance.
export async function cohortIndex(root: string, experimentsDir: string = join(dirname(root), "experiments")): Promise<{ runs: { id: string; cohort: string | null; problem: string | null }[] }> {
  const cohorts = await cohortMembership(root), definitions = experimentDefinitions(experimentsDir, root), tags: TaggedRun[] = [], problems = new Map<string, string>();
  const ids = listRuns(root).map(s => s.id);
  for (const id of ids) {
    try { const start = startOf(root, id), experiment = start.evaluation?.experiment; if (experiment !== undefined) tags.push({ run: id, experiment: experiment.id, commit: start.harness.commit, started: start.t }); } catch (error) { problems.set(id, errorText(error)); }
  }
  const tagged = taggedCohorts(tags, definitions);
  return { runs: ids.map(id => ({ id, cohort: tagged.membership.get(id) ?? cohorts.membership.get(id) ?? null, problem: problems.get(id) ?? null })) };
}
// experimentsDir holds the definitions that label the EXPERIMENT dropdown (the repo's experiments/ next to runs/).
export async function workbenchSnapshot(root: string, healthy: HealthProbe, now: number, experimentsDir: string = join(dirname(root), "experiments")): Promise<WorkbenchData> {
  const cohorts = await cohortMembership(root); const summaries = listRuns(root);
  const loadedRuns = summaries.map(s => load(root, s.id)), definitions = experimentDefinitions(experimentsDir, root);
  const tagged = taggedCohorts(loadedRuns.flatMap(l => l.tag === null ? [] : [{ run: l.run.id, experiment: l.tag.experiment, commit: l.tag.commit, started: l.run.started }]), definitions);
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
    // Provenance reads the legacy cohort, so a run-tagged run keeps its receipts; then the run's own tag decides its cohort.
    run.cohort = cohorts.membership.get(run.id) ?? null;
    applyHistoricalProvenance(root, run);
    const own = tagged.membership.get(run.id); if (own !== undefined) run.cohort = own;
    const failure = cohorts.failures.get(run.id) ?? (own === undefined ? undefined : cohorts.named.get(run.id) ?? cohorts.unverified.get(run.id)); if (failure !== undefined) run.excluded = failure;
    return run;
  }));
  for (const path of cache.keys()) if (!summaries.some(s => eventsPath(root, s.id) === path) && path.startsWith(root + "/")) cache.delete(path);
  runs.sort((a, b) => Date.parse(b.started ?? "") - Date.parse(a.started ?? "") || b.id.localeCompare(a.id));
  const problems = [...cohorts.problems], taggedValues = new Set(tagged.cohorts.map(c => c.id)), legacy = new Map<string, WorkbenchCohort>();
  for (const run of runs) {
    if (run.cohort === null || tagged.membership.has(run.id)) continue;
    if (taggedValues.has(run.cohort)) problems.push(`Legacy cohort ${run.cohort} has the value of a run-tagged cohort; run ${run.id} is not tagged`);
    else if (!legacy.has(run.cohort)) legacy.set(run.cohort, legacyCohort(run.cohort, definitions));
  }
  return { version: 1, at: now, milestones: MILESTONES.filter(m => m.kind !== "legacy").map(m => ({ id: m.name, label: m.name.replace(/_/g, " ") })), runs, problems, cohorts: distinctLabels([...tagged.cohorts, ...legacy.values()]) };
}
