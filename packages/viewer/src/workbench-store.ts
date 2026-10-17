import { visualEvidenceSignature } from "./frontier-visual.js";
import { recoveredSignature } from "./recovered-fields.js";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { FEATURES } from "@pokebench/agent/features";
import { MILESTONES, qualifiedNativeMilestone } from "@pokebench/agent/milestones";
import { filesystemComparisonHost, prepareComparison, sha256 } from "@pokebench/agent/serial-comparison";
import { RUN_END_REASONS, type RunEvent, type StartIdentity } from "@pokebench/agent/events";
import { configOf } from "./history.js";
import { readNativeRecording, readStartlessLog } from "./frontier-recording.js";
import { defaultViewerBuild, skewOf, type BuildIdentity, type ViewerBuild } from "./build-stamp.js";
import { applyHistoricalProvenance } from "./frontier-provenance.js";
import { parseNavigationReceipt } from "./frontier-queue.js";
import { dirname } from "node:path";
import { eventsPath, listRuns, readStart, readStartIdentity } from "./runs.js";
import { parseLedger } from "@pokebench/agent/experiments";
import { parseFinalsLedger } from "@pokebench/agent/experiment-gate";
import { isFixedLedgerText, parseFixedLedger } from "./fixed-ledger.js";
import type { HealthProbe } from "./next-run.js";
import { parseWorkbench, type WorkbenchCohort, type WorkbenchConfig, type WorkbenchData, type WorkbenchRun } from "./workbench-data.js";
import type { RunStore } from "./baseline-store.js";
import { distinctLabels, experimentDefinitions, legacyCohort, taggedCohorts, type TaggedRun } from "./experiment-cohorts.js";
const MAX_PLAN_BYTES = 1024 * 1024;
// What the snapshot needs from a run's RunView, as plain data: it crosses worker threads and disk.
export interface RunTiming { startMs: number | null; ended: boolean; lastMs: number | null; paused: boolean; pauses: { startMs: number; endMs: number | null }[] }
// skew: the run's build and the events a tolerant read skipped (null when none were skipped); startless when run_start was one.
export interface LoadedRun { run: WorkbenchRun; port: number | null; tag: { experiment: string; commit: string } | null; timing: RunTiming | null; skew: { commit: string; dirty: boolean; count: number; first: string; startless?: true } | null }
interface Loaded extends LoadedRun { signature: string }
export type WorkbenchCompute = (root: string, id: string, viewer: BuildIdentity | null) => Promise<LoadedRun>;
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
// The log's identity for caching: size, mtime, inode and any verified visual evidence.
function runSignature(path: string): string {
  const stat = statSync(path);
  return `${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ino)}` + visualEvidenceSignature(path) + recoveredSignature(dirname(path));
}
// True when the log at `now` is the log at `then` with more bytes appended: same inode, larger, and the
// same visual evidence and viewer build. A rewrite, truncation or replacement is not.
function appendedSince(then: string, now: string): boolean {
  const parse = (signature: string): { size: number; ino: string; rest: string } | null => {
    const m = /^(\d+):[^:]*:(\d+)(.*)$/s.exec(signature);
    return m === null ? null : { size: Number(m[1]), ino: m[2] ?? "", rest: m[3] ?? "" };
  };
  const a = parse(then), b = parse(now);
  return a !== null && b !== null && a.ino === b.ino && a.rest === b.rest && b.size > a.size;
}
function invalidRun(id: string, problem: string | null): WorkbenchRun {
  return { id, cohort: null, arm: null, model: null, started: null, status: "invalid", reason: null, problem, excluded: null, elapsedMs: null, turn: 0, config: null, splits: [] };
}
// Reduces one run's whole log. Pure and plain-valued, so it can run on a worker thread. viewer is this
// viewer's build stamp: when the run's build is not that exact clean build, schema-rejected events with
// an in-order envelope are stepped over and reported in skew; the loader decides what they mean.
export function loadRun(root: string, id: string, viewer: BuildIdentity | null = null): LoadedRun {
  const path = eventsPath(root, id);
  let run = invalidRun(id, null), port: number | null, timing: RunTiming | null, tag: LoadedRun["tag"] = null, skew: LoadedRun["skew"] = null;
  let start: Extract<RunEvent, { type: "run_start" }>;
  try { start = startOf(root, id); } catch (error) { return startlessRun(root, id, viewer, errorText(error)); }
  try {
    run ={ ...run, arm: start.evaluation?.experiment?.arm ?? null, model: start.controller?.kind === "human" ? `Human · ${start.controller.name}` : start.model.id, started: start.t, config: configuration(start), excluded: start.harness_features.includes("probe") ? "Excluded probe session" : null };
    const tagged = start.evaluation?.experiment; run.experiment = tagged === undefined ? null : { id: tagged.id, arm: tagged.arm, trial: tagged.trial, of: tagged.of };
    port = start.isolation.port;
    const experiment = start.evaluation?.experiment; if (experiment !== undefined) tag = { experiment: experiment.id, commit: start.harness.commit };
    const tolerate = viewer !== null && !(viewer.commit === start.harness.commit && !viewer.dirty && !start.harness.dirty);
    const recording = readNativeRecording(path, id, qualifiedNativeMilestone, undefined, tolerate), view = recording.view;
    run.splits = recording.splits; run.measurement = recording.measurement;
    const last = recording.last; run.card = last === null ? null : { name: last.name, location: last.location, party: last.party.flatMap(m => m.level === null || m.level < 1 ? [] : [{ speciesId: m.species_id ?? null, level: m.level, egg: m.is_egg === true }]) };
    if (recording.skipped !== null) skew = { commit: start.harness.commit, dirty: start.harness.dirty, ...recording.skipped };
    run.status = view.end === null ? "unresponsive" : "ended"; run.reason = view.end?.reason ?? null; run.turn = view.turn;
    if (run.reason === "operator_abort") run.excluded ??= "Excluded operator-aborted run";
    timing = { startMs: view.startMs, ended: view.end !== null, lastMs: view.lastMs, paused: view.control.state === "paused", pauses: view.control.pauses.map(p => ({ ...p })) };
  } catch (error) { run.problem = errorText(error); run.status = "invalid"; run.splits = []; delete run.measurement; timing = null; port = null; skew = null; }
  return { run, port, tag, timing, skew };
}
// A run whose run_start the strict read refused (problem). When the viewer knows its build and run_start's
// loose identity names this run and another build, the rest of the log gives status, turn, timing and
// port, with no splits: the run cannot be graded. skew.startless marks it; the loader decides what it means.
function startlessRun(root: string, id: string, viewer: BuildIdentity | null, problem: string): LoadedRun {
  const strict: LoadedRun = { run: invalidRun(id, problem), port: null, tag: null, timing: null, skew: null };
  const path = eventsPath(root, id);
  let identity: StartIdentity | null = null;
  try { identity = viewer === null || lstatSync(path).isSymbolicLink() ? null : readStartIdentity(root, id); } catch { /* no log to read loosely */ }
  if (viewer === null || identity === null || (identity.commit === viewer.commit && !viewer.dirty && !identity.dirty)) return strict;
  try {
    const { view, skipped } = readStartlessLog(path, id), reason = view.end?.reason ?? null;
    const run: WorkbenchRun = { ...invalidRun(id, null), model: identity.model, started: identity.t, status: view.end === null ? "unresponsive" : "ended", reason, turn: view.turn, excluded: reason === "operator_abort" ? "Excluded operator-aborted run" : null };
    const timing: RunTiming = { startMs: view.startMs, ended: view.end !== null, lastMs: view.lastMs, paused: view.control.state === "paused", pauses: view.control.pauses.map(p => ({ ...p })) };
    return { run, port: identity.port, tag: null, timing, skew: { commit: identity.commit, dirty: identity.dirty, ...skipped, startless: true } };
  } catch (error) { return { ...strict, run: invalidRun(id, errorText(error)) }; }
}
// A run with skipped events keeps its status and says to restart the viewer when the run's build is not
// contained in the viewer's (skewOf); otherwise its first rejected event makes it invalid, as a strict read
// (a run whose run_start was unreadable gets the strict read's own message).
export function settleSkew(loaded: LoadedRun, build: ViewerBuild | null): LoadedRun {
  if (loaded.skew === null) return loaded;
  const skew = skewOf(build, loaded.skew), run = structuredClone(loaded.run), startless = loaded.skew.startless === true;
  if (skew !== null) { run.problem = skew.describe(loaded.skew.count, loaded.skew.first, startless); return { ...loaded, run }; }
  if (startless) return { run: invalidRun(run.id, `run ${run.id} has no readable run_start`), port: null, tag: null, timing: null, skew: null };
  const strict = { ...invalidRun(loaded.run.id, loaded.skew.first), arm: run.arm, model: run.model, started: run.started, config: run.config, excluded: run.excluded === "Excluded operator-aborted run" ? null : run.excluded };
  return { run: strict, port: null, tag: loaded.tag, timing: null, skew: null };
}
// Run time without operator pauses, as runSeconds computes it from a RunView.
export function timingSeconds(timing: RunTiming, nowMs: number): number {
  if (timing.startMs === null) return 0;
  const end = timing.ended ? (timing.lastMs ?? nowMs) : nowMs;
  const paused = timing.pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(end, pause.endMs ?? end) - pause.startMs), 0);
  return Math.max(0, (end - timing.startMs - paused) / 1000);
}
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nullableFinite = (v: unknown): v is number | null => v === null || finite(v);
// A LoadedRun from a worker or the disk cache, or null when it does not validate.
export function parseLoadedRun(value: unknown): LoadedRun | null {
  if (!record(value)) return null;
  const { run, port, tag, timing, skew } = value;
  try { parseWorkbench({ version: 1, at: 0, milestones: [], problems: [], runs: [run] }); } catch { return null; }
  if (!(port === null || (Number.isSafeInteger(port) && typeof port === "number" && port > 0 && port < 65536))) return null;
  if (!(tag === null || (record(tag) && typeof tag.experiment === "string" && typeof tag.commit === "string"))) return null;
  if (!(skew === null || (record(skew) && typeof skew.commit === "string" && /^[0-9a-f]{40}$/.test(skew.commit) && typeof skew.dirty === "boolean" && Number.isSafeInteger(skew.count) && typeof skew.count === "number" && skew.count > 0 && typeof skew.first === "string" && (skew.startless === undefined || skew.startless === true)))) return null;
  if (!(timing === null || (record(timing) && nullableFinite(timing.startMs) && typeof timing.ended === "boolean" && nullableFinite(timing.lastMs) && typeof timing.paused === "boolean" && Array.isArray(timing.pauses) && timing.pauses.every(p => record(p) && finite(p.startMs) && nullableFinite(p.endMs))))) return null;
  return value as unknown as LoadedRun;
}
export interface WorkbenchLoader {
  load(root: string, id: string): Promise<Loaded>;
  // Without waiting: the record for the log as it is now, else the previous record of a log that
  // has since grown, else null. Either way a load of the current log is under way.
  current(root: string, id: string): Loaded | null;
  forget(keep: (path: string) => boolean): void;
}
// Caches each run by its log signature, shares a load already in flight, and persists ended
// runs (their logs never change) for the next viewer of the same code.
// build is this viewer's own build (default: dist/build-stamp.json; null when unknown). Workers get its
// stamp as plain data; git ancestry (skewOf) runs here on the main thread, cached per run commit.
export function createWorkbenchLoader(options: { compute?: WorkbenchCompute; store?: RunStore<LoadedRun>; build?: ViewerBuild | null } = {}): WorkbenchLoader {
  const compute = options.compute ?? ((root: string, id: string, viewer: BuildIdentity | null): Promise<LoadedRun> => Promise.resolve().then(() => loadRun(root, id, viewer)));
  const build = options.build === undefined ? defaultViewerBuild() : options.build;
  const stamp: BuildIdentity | null = build === null ? null : { commit: build.commit, dirty: build.dirty };
  const buildKey = `:viewer=${stamp === null ? "unknown" : `${stamp.commit}${stamp.dirty ? "+dirty" : ""}`}`;
  const cache = new Map<string, Loaded>(), inflight = new Map<string, Promise<Loaded>>();
  const signatureOf = (path: string, id: string): { signature: string } | { invalid: Loaded } => {
    try { return { signature: runSignature(path) + buildKey }; } catch (error) {
      const entry: Loaded = { signature: "", run: invalidRun(id, errorText(error)), port: null, tag: null, timing: null, skew: null };
      cache.set(path, entry); return { invalid: entry };
    }
  };
  // The newest finished record per log, kept even when the log grew while it loaded (a live run
  // always does), and the one partial-mode reload in flight per log.
  const latest = new Map<string, Loaded>(), reloading = new Map<string, Promise<Loaded>>();
  const start = (root: string, id: string, path: string, signature: string): Promise<Loaded> => {
    const key = `${path}\0${signature}`;
    let pending = inflight.get(key);
    if (pending === undefined) {
      pending = (async (): Promise<Loaded> => {
        const stored = options.store?.get(id, signature) ?? null;
        const loaded = stored ?? await compute(root, id, stamp);
        const entry: Loaded = { ...settleSkew(loaded, build), signature };
        latest.set(path, entry);
        let after: string | null = null; try { after = runSignature(path) + buildKey; } catch { /* removed while loading */ }
        if (after === signature) {
          cache.set(path, entry);
          if (stored === null && loaded.run.status === "ended") options.store?.put(id, signature, loaded);
        }
        return entry;
      })();
      const settled = pending;
      inflight.set(key, settled);
      const clear = (): void => { if (inflight.get(key) === settled) inflight.delete(key); };
      settled.then(clear, clear);
    }
    return pending;
  };
  return {
    load: async (root, id) => {
      const path = eventsPath(root, id), sig = signatureOf(path, id);
      if ("invalid" in sig) return sig.invalid;
      const prior = cache.get(path);
      if (prior?.signature === sig.signature) return prior;
      return start(root, id, path, sig.signature);
    },
    current: (root, id) => {
      const path = eventsPath(root, id), sig = signatureOf(path, id);
      if ("invalid" in sig) return sig.invalid;
      const fresh = (): Loaded | null => { const hit = cache.get(path); return hit?.signature === sig.signature ? hit : null; };
      if (fresh() !== null) return fresh();
      if (!reloading.has(path)) {
        const run = start(root, id, path, sig.signature);
        reloading.set(path, run);
        const done = (): void => { if (reloading.get(path) === run) reloading.delete(path); };
        run.then(done, done);
        run.catch(() => undefined);
      }
      // A disk-cache hit lands synchronously; otherwise only an appended-to log may show its previous record.
      const now = fresh(); if (now !== null) return now;
      const prior = latest.get(path) ?? cache.get(path) ?? null;
      return prior !== null && appendedSince(prior.signature, sig.signature) ? prior : null;
    },
    forget: (keep) => { for (const path of cache.keys()) if (!keep(path)) cache.delete(path); },
  };
}
const defaultLoader = createWorkbenchLoader();
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
// partial: serve what is loaded now (a grown log keeps its previous record until its reload lands)
// and report the rest as still loading, instead of waiting for a cold cache.
export async function workbenchSnapshot(root: string, healthy: HealthProbe, now: number, experimentsDir: string = join(dirname(root), "experiments"), loader: WorkbenchLoader = defaultLoader, mode: { partial?: boolean } = {}): Promise<WorkbenchData> {
  const cohorts = await cohortMembership(root); const summaries = listRuns(root);
  const found = mode.partial === true ? summaries.map(s => loader.current(root, s.id)) : await Promise.all(summaries.map(s => loader.load(root, s.id)));
  const loadedRuns = found.filter((l): l is Loaded => l !== null), waiting = found.length - loadedRuns.length, definitions = experimentDefinitions(experimentsDir, root);
  const tagged = taggedCohorts(loadedRuns.flatMap(l => l.tag === null ? [] : [{ run: l.run.id, experiment: l.tag.experiment, commit: l.tag.commit, started: l.run.started }]), definitions);
  const newest = new Map<number, { id: string; at: number }>();
  for (const loaded of loadedRuns) if (loaded.port !== null && loaded.run.status === "unresponsive") {
    const at = Date.parse(loaded.run.started ?? ""); const prior = newest.get(loaded.port);
    if (prior === undefined || at > prior.at) newest.set(loaded.port, { id: loaded.run.id, at });
  }
  const health = new Map<number, Promise<boolean>>();
  const runs = await Promise.all(loadedRuns.map(async loaded => {
    const run = structuredClone(loaded.run);
    if (loaded.timing !== null) {
      if (run.status !== "ended" && loaded.port !== null && newest.get(loaded.port)?.id === run.id) {
        let probe = health.get(loaded.port); if (probe === undefined) { probe = healthy(loaded.port); health.set(loaded.port, probe); }
        if (await probe) run.status = loaded.timing.paused ? "paused" : "live";
      }
      const clock = run.status === "live" || run.status === "paused" ? now : loaded.timing.lastMs ?? now;
      run.elapsedMs = Math.round(timingSeconds(loaded.timing, clock) * 1000);
    }
    // Provenance reads the legacy cohort, so a run-tagged run keeps its receipts; then the run's own tag decides its cohort.
    run.cohort = cohorts.membership.get(run.id) ?? null;
    applyHistoricalProvenance(root, run);
    const own = tagged.membership.get(run.id); if (own !== undefined) run.cohort = own;
    const failure = cohorts.failures.get(run.id) ?? (own === undefined ? undefined : cohorts.named.get(run.id) ?? cohorts.unverified.get(run.id)); if (failure !== undefined) run.excluded = failure;
    return run;
  }));
  loader.forget(path => summaries.some(s => eventsPath(root, s.id) === path) || !path.startsWith(root + "/"));
  runs.sort((a, b) => Date.parse(b.started ?? "") - Date.parse(a.started ?? "") || b.id.localeCompare(a.id));
  const problems = [...(waiting > 0 ? [`Still loading ${String(waiting)} of ${String(found.length)} recorded runs; this page fills in as they finish.`] : []), ...cohorts.problems, ...runs.flatMap(run => run.status !== "invalid" && run.problem !== null ? [`Run ${run.id}: ${run.problem}`] : [])], taggedValues = new Set(tagged.cohorts.map(c => c.id)), legacy = new Map<string, WorkbenchCohort>();
  for (const run of runs) {
    if (run.cohort === null || tagged.membership.has(run.id)) continue;
    if (taggedValues.has(run.cohort)) problems.push(`Legacy cohort ${run.cohort} has the value of a run-tagged cohort; run ${run.id} is not tagged`);
    else if (!legacy.has(run.cohort)) legacy.set(run.cohort, legacyCohort(run.cohort, definitions));
  }
  return { version: 1, at: now, milestones: MILESTONES.filter(m => m.kind !== "legacy").map(m => ({ id: m.name, label: m.name.replace(/_/g, " ") })), runs, problems, cohorts: distinctLabels([...tagged.cohorts, ...legacy.values()]) };
}
