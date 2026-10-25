export const WORKBENCH_POLL_MS = 5000;
import type { RecordingMeasurement, RecordingSplit } from "./frontier-recording.js";
// The read-only workbench wire contract. This module also runs in the browser.
export type WorkbenchSplit = RecordingSplit;
export interface WorkbenchConfig {
  source: string; dirty: boolean; vendor: string; pi: string; preset: string | null; target: string | null;
  thinking: string; maxTokens: number; maxTurns: number | null; maxWallMs: number | null; failureLimit: number | null;
  extendedWallMs?: number;
  context: number; vision: boolean; start: string; resume?: string | null; tools: string[]; features: { id: string; label: string; on: boolean | null }[];
}
export interface WorkbenchRun {
  id: string; cohort: string | null; arm: string | null; model: string | null; started: string | null; status: "live" | "paused" | "ended" | "unresponsive" | "invalid";
  reason: string | null; problem: string | null; excluded: string | null; elapsedMs: number | null; turn: number;
  measurement?: RecordingMeasurement;
  clockWarning?: string;
  config: WorkbenchConfig | null; splits: WorkbenchSplit[];
  // What the trainer card shows from the run's last game state; null before the game reports one.
  card?: WorkbenchCard | null;
  // The experiment, arm and trial the run's header records; null when it records none.
  experiment?: WorkbenchExperiment | null;
}
export interface WorkbenchExperiment { id: string; arm: string; trial: number; of: number }
export interface WorkbenchMon { speciesId: number | null; level: number; egg: boolean }
export interface WorkbenchCard { name: string | null; location: string | null; party: WorkbenchMon[] }
// One EXPERIMENT dropdown entry: its option value (id), readable label, the experiment it resolves to,
// the build (harness.commit) of a run-tagged entry (null for a legacy ledger cohort) and whether it is a dry run.
export interface WorkbenchCohort { id: string; label: string; experiment: string | null; build: string | null; dryRun: boolean }
export interface WorkbenchData { version: 1; at: number; milestones: { id: string; label: string }[]; runs: WorkbenchRun[]; problems: string[]; cohorts?: WorkbenchCohort[] }

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string";
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v);
const nullableInteger = (v: unknown): v is number | null => v === null || integer(v);
const nullableString = (v: unknown): v is string | null => v === null || string(v);
const nullableNumber = (v: unknown): v is number | null => v === null || number(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(string);
function measurement(v: unknown): boolean {
  const hash = (x: unknown): boolean => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
  const receipt = (x: unknown): boolean => object(x) && string(x.path) && hash(x.sha256);
  return object(v) && (v.controller === "agent" || v.controller === "human") && strings(v.features) && (v.recoveredFeatures===undefined||strings(v.recoveredFeatures)) && hash(v.logSha256) && (v.logBytes === undefined || integer(v.logBytes)) && integer(v.pausedMs) && Array.isArray(v.rawSplits) && v.rawSplits.every(s => object(s) && string(s.name) && integer(s.elapsedMs) && Array.isArray(s.evidence) && s.evidence.every(integer)) && (v.receipts === undefined || (Array.isArray(v.receipts) && v.receipts.every(receipt))) && (v.artifact === undefined || (object(v.artifact) && string(v.artifact.id) && string(v.artifact.receipt) && hash(v.artifact.sha256)));
}
function config(v: unknown): boolean {
  return v === null || (object(v) && string(v.source) && typeof v.dirty === "boolean" && string(v.vendor) && string(v.pi) && nullableString(v.preset) && nullableString(v.target) && string(v.thinking) && integer(v.maxTokens) && nullableInteger(v.maxTurns) && nullableNumber(v.maxWallMs) && (v.extendedWallMs === undefined || number(v.extendedWallMs)) && nullableInteger(v.failureLimit) && integer(v.context) && typeof v.vision === "boolean" && string(v.start) && (v.resume === undefined || v.resume === null || string(v.resume)) && strings(v.tools) && Array.isArray(v.features) && v.features.every(f => object(f) && string(f.id) && string(f.label) && (f.on === null || typeof f.on === "boolean")));
}
function card(v: unknown): boolean {
  const mon = (m: unknown): boolean => object(m) && (m.speciesId === null || (integer(m.speciesId) && m.speciesId >= 1 && m.speciesId <= 411)) && integer(m.level) && m.level >= 1 && m.level <= 100 && typeof m.egg === "boolean";
  return v === undefined || v === null || (object(v) && nullableString(v.name) && nullableString(v.location) && Array.isArray(v.party) && v.party.length <= 6 && v.party.every(mon));
}
function experiment(v: unknown): boolean {
  return v === undefined || v === null || (object(v) && string(v.id) && string(v.arm) && integer(v.trial) && v.trial >= 1 && integer(v.of) && v.of >= 1);
}
function cohorts(v: unknown): boolean {
  return v === undefined || (Array.isArray(v) && v.every(c => object(c) && string(c.id) && string(c.label) && nullableString(c.experiment) && nullableString(c.build) && typeof c.dryRun === "boolean"));
}
export function parseWorkbench(value: unknown): WorkbenchData {
  if (!object(value) || value.version !== 1 || !cohorts(value.cohorts) || !number(value.at) || !Array.isArray(value.milestones) || !value.milestones.every(m => object(m) && string(m.id) && string(m.label)) || !strings(value.problems) || !Array.isArray(value.runs) || !value.runs.every(r => object(r) && string(r.id) && nullableString(r.cohort) && nullableString(r.arm) && nullableString(r.model) && nullableString(r.started) && typeof r.status === "string" && ["live", "paused", "ended", "unresponsive", "invalid"].includes(r.status) && nullableString(r.reason) && nullableString(r.problem) && (r.clockWarning === undefined || string(r.clockWarning)) && nullableString(r.excluded) && nullableNumber(r.elapsedMs) && integer(r.turn) && config(r.config) && card(r.card) && experiment(r.experiment) && (r.measurement === undefined || measurement(r.measurement)) && Array.isArray(r.splits) && r.splits.every(s => object(s) && string(s.name) && number(s.elapsedMs) && number(s.segmentMs) && integer(s.seq) && integer(s.turn) && integer(s.inputTokens) && integer(s.outputTokens) && (s.derived === undefined || s.derived === true) && (s.observedMs === undefined || (s.derived === true && number(s.observedMs))) && (s.screenshotEvidence === undefined || (s.derived === true && Array.isArray(s.screenshotEvidence) && s.screenshotEvidence.length > 0 && s.screenshotEvidence.length <= 6 && s.screenshotEvidence.every(f => object(f) && integer(f.seq) && typeof f.path === "string" && /^frames\/[0-9]{6,}_[0-9]+[.]png$/.test(f.path) && typeof f.sha1 === "string" && /^[a-f0-9]{40}$/.test(f.sha1))))))) throw new Error("Invalid workbench response; recorded run data could not be validated.");
  return value as unknown as WorkbenchData;
}
// /api/features (the agent's FEATURES catalog) as id → what the switch does; the legend's switch tooltips. Empty descriptions are dropped.
export function parseFeatureDescriptions(value: unknown): ReadonlyMap<string, string> {
  const list = object(value) ? value.features : null;
  if (!Array.isArray(list) || !list.every((f): f is { id: string; description: string } => object(f) && string(f.id) && string(f.description))) throw new Error("Invalid feature catalog; switch descriptions are unavailable.");
  return new Map(list.filter(f => f.description !== "").map(f => [f.id, f.description]));
}
