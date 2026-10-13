// The read-only workbench wire contract. This module also runs in the browser.
export interface WorkbenchSplit {
  name: string; elapsedMs: number; segmentMs: number; seq: number; turn: number; inputTokens: number; outputTokens: number;
}
export interface WorkbenchConfig {
  source: string; dirty: boolean; vendor: string; pi: string; preset: string | null; target: string | null;
  thinking: string; maxTokens: number; maxTurns: number | null; maxWallMs: number | null; failureLimit: number | null;
  context: number; vision: boolean; start: string; tools: string[]; features: { id: string; label: string; on: boolean | null }[];
}
export interface WorkbenchRun {
  id: string; cohort: string | null; model: string | null; started: string | null; status: "live" | "paused" | "ended" | "unresponsive" | "invalid";
  reason: string | null; problem: string | null; excluded: string | null; elapsedMs: number | null; turn: number;
  objective: { title: string; status: string; nextDecision: string } | null; config: WorkbenchConfig | null; splits: WorkbenchSplit[];
}
export interface WorkbenchQueueItem { id: string; cohort: string | null; model: string | null; arm: string | null; status: "queued" | "launching" | "running" | "withheld" | "failed"; reason: string | null }
export interface WorkbenchData { version: 1; at: number; milestones: { id: string; label: string }[]; runs: WorkbenchRun[]; queue: WorkbenchQueueItem[]; problems: string[] }

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string";
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const nullableString = (v: unknown): v is string | null => v === null || string(v);
const nullableNumber = (v: unknown): v is number | null => v === null || number(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(string);
function config(v: unknown): boolean {
  return v === null || (object(v) && string(v.source) && typeof v.dirty === "boolean" && string(v.vendor) && string(v.pi) && nullableString(v.preset) && nullableString(v.target) && string(v.thinking) && number(v.maxTokens) && nullableNumber(v.maxTurns) && nullableNumber(v.maxWallMs) && nullableNumber(v.failureLimit) && number(v.context) && typeof v.vision === "boolean" && string(v.start) && strings(v.tools) && Array.isArray(v.features) && v.features.every(f => object(f) && string(f.id) && string(f.label) && (f.on === null || typeof f.on === "boolean")));
}
export function parseWorkbench(value: unknown): WorkbenchData {
  if (!object(value) || value.version !== 1 || !number(value.at) || !Array.isArray(value.milestones) || !value.milestones.every(m => object(m) && string(m.id) && string(m.label)) || !strings(value.problems) || !Array.isArray(value.queue) || !value.queue.every(q => object(q) && string(q.id) && nullableString(q.cohort) && nullableString(q.model) && nullableString(q.arm) && typeof q.status === "string" && ["queued", "launching", "running", "withheld", "failed"].includes(q.status) && nullableString(q.reason)) || !Array.isArray(value.runs) || !value.runs.every(r => object(r) && string(r.id) && nullableString(r.cohort) && nullableString(r.model) && nullableString(r.started) && typeof r.status === "string" && ["live", "paused", "ended", "unresponsive", "invalid"].includes(r.status) && nullableString(r.reason) && nullableString(r.problem) && nullableString(r.excluded) && nullableNumber(r.elapsedMs) && number(r.turn) && config(r.config) && (r.objective === null || (object(r.objective) && string(r.objective.title) && string(r.objective.status) && string(r.objective.nextDecision))) && Array.isArray(r.splits) && r.splits.every(s => object(s) && string(s.name) && number(s.elapsedMs) && number(s.segmentMs) && number(s.seq) && number(s.turn) && number(s.inputTokens) && number(s.outputTokens)))) throw new Error("Invalid workbench response; recorded run data could not be validated.");
  return value as unknown as WorkbenchData;
}
