export const WORKBENCH_POLL_MS = 5000;
import type { RecordingMeasurement, RecordingSplit } from "./frontier-recording.js";
// The read-only workbench wire contract. This module also runs in the browser.
export type WorkbenchSplit = RecordingSplit;
export interface WorkbenchConfig {
  source: string; dirty: boolean; vendor: string; pi: string; preset: string | null; target: string | null;
  thinking: string; maxTokens: number; maxTurns: number | null; maxWallMs: number | null; failureLimit: number | null;
  context: number; vision: boolean; start: string; resume?: string | null; tools: string[]; features: { id: string; label: string; on: boolean | null }[];
}
export interface WorkbenchRun {
  id: string; cohort: string | null; model: string | null; started: string | null; status: "live" | "paused" | "ended" | "unresponsive" | "invalid";
  reason: string | null; problem: string | null; excluded: string | null; elapsedMs: number | null; turn: number;
  measurement?: RecordingMeasurement;
  objective: { title: string; status: string; nextDecision: string } | null; config: WorkbenchConfig | null; splits: WorkbenchSplit[];
}
export interface WorkbenchQueueItem { id: string; cohort: string | null; model: string | null; arm: string | null; status: "queued" | "launching" | "running" | "withheld" | "failed" | "completed"; reason: string | null }
export interface WorkbenchData { version: 1; at: number; milestones: { id: string; label: string }[]; runs: WorkbenchRun[]; queue: WorkbenchQueueItem[]; problems: string[] }

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
  return object(v) && (v.controller === "agent" || v.controller === "human") && strings(v.features) && hash(v.logSha256) && (v.logBytes === undefined || integer(v.logBytes)) && integer(v.pausedMs) && Array.isArray(v.rawSplits) && v.rawSplits.every(s => object(s) && string(s.name) && integer(s.elapsedMs) && Array.isArray(s.evidence) && s.evidence.every(integer)) && (v.receipts === undefined || (Array.isArray(v.receipts) && v.receipts.every(receipt))) && (v.artifact === undefined || (object(v.artifact) && string(v.artifact.id) && string(v.artifact.receipt) && hash(v.artifact.sha256)));
}
function config(v: unknown): boolean {
  return v === null || (object(v) && string(v.source) && typeof v.dirty === "boolean" && string(v.vendor) && string(v.pi) && nullableString(v.preset) && nullableString(v.target) && string(v.thinking) && integer(v.maxTokens) && nullableInteger(v.maxTurns) && nullableNumber(v.maxWallMs) && nullableInteger(v.failureLimit) && integer(v.context) && typeof v.vision === "boolean" && string(v.start) && (v.resume === undefined || v.resume === null || string(v.resume)) && strings(v.tools) && Array.isArray(v.features) && v.features.every(f => object(f) && string(f.id) && string(f.label) && (f.on === null || typeof f.on === "boolean")));
}
export function parseWorkbench(value: unknown): WorkbenchData {
  if (!object(value) || value.version !== 1 || !number(value.at) || !Array.isArray(value.milestones) || !value.milestones.every(m => object(m) && string(m.id) && string(m.label)) || !strings(value.problems) || !Array.isArray(value.queue) || !value.queue.every(q => object(q) && string(q.id) && nullableString(q.cohort) && nullableString(q.model) && nullableString(q.arm) && typeof q.status === "string" && ["queued", "launching", "running", "withheld", "failed", "completed"].includes(q.status) && nullableString(q.reason)) || !Array.isArray(value.runs) || !value.runs.every(r => object(r) && string(r.id) && nullableString(r.cohort) && nullableString(r.model) && nullableString(r.started) && typeof r.status === "string" && ["live", "paused", "ended", "unresponsive", "invalid"].includes(r.status) && nullableString(r.reason) && nullableString(r.problem) && nullableString(r.excluded) && nullableNumber(r.elapsedMs) && integer(r.turn) && config(r.config) && (r.measurement === undefined || measurement(r.measurement)) && (r.objective === null || (object(r.objective) && string(r.objective.title) && string(r.objective.status) && string(r.objective.nextDecision))) && Array.isArray(r.splits) && r.splits.every(s => object(s) && string(s.name) && number(s.elapsedMs) && number(s.segmentMs) && integer(s.seq) && integer(s.turn) && integer(s.inputTokens) && integer(s.outputTokens) && (s.derived === undefined || s.derived === true) && (s.screenshotEvidence === undefined || (s.derived === true && Array.isArray(s.screenshotEvidence) && s.screenshotEvidence.length > 0 && s.screenshotEvidence.length <= 6 && s.screenshotEvidence.every(f => object(f) && integer(f.seq) && typeof f.path === "string" && /^frames\/[0-9]{6,}_[0-9]+[.]png$/.test(f.path) && typeof f.sha1 === "string" && /^[a-f0-9]{40}$/.test(f.sha1))))))) throw new Error("Invalid workbench response; recorded run data could not be validated.");
  return value as unknown as WorkbenchData;
}
