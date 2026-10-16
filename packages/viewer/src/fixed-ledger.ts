// The append-only trial ledger of a fixed-run experiment, the queue derived from it,
// and the infrastructure-only rule that judges each finished trial valid or invalid.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { DEPTH_ORDER, deeperMilestone } from "@pokebench/agent/milestones";
import { phaseOf, type FixedArm, type FixedDefinition } from "./fixed-design.js";

export class FixedLedgerError extends Error {
  override readonly name = "FixedLedgerError";
}

const Arm = Type.Union([Type.Literal("control"), Type.Literal("bundle")]);
const LaunchSchema = Type.Object({
  kind: Type.Literal("launch"), slot: Type.Integer({ minimum: 1 }), lane: Type.String(), phase: Type.String(), arm: Arm, run: Type.String({ minLength: 1 }), at: Type.String(),
  commit: Type.String(), sources: Type.String(), presetSha256: Type.String(), serving: Type.String(), replaces: Type.Optional(Type.Integer({ minimum: 1 })),
}, { additionalProperties: false });
const StartedSchema = Type.Object({ kind: Type.Literal("started"), slot: Type.Integer({ minimum: 1 }), run: Type.String(), pid: Type.Integer({ minimum: 1 }), at: Type.String() }, { additionalProperties: false });
const outcomeShape = {
  valid: Type.Boolean(), reason: Type.String(), endReason: Type.Union([Type.String(), Type.Null()]),
  primaryReached: Type.Boolean(), primaryMs: Type.Union([Type.Number(), Type.Null()]), furthest: Type.Union([Type.String(), Type.Null()]), furthestDepth: Type.Integer({ minimum: -1 }), furthestMs: Type.Union([Type.Number(), Type.Null()]),
  wallMs: Type.Union([Type.Number(), Type.Null()]), turns: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
};
const OutcomeSchema = Type.Object({ kind: Type.Literal("outcome"), slot: Type.Integer({ minimum: 1 }), run: Type.String(), at: Type.String(), ...outcomeShape }, { additionalProperties: false });
const EntrySchema = Type.Union([LaunchSchema, StartedSchema, OutcomeSchema]);
export type FixedLedgerEntry = Static<typeof EntrySchema>;
export type FixedLaunchEntry = Static<typeof LaunchSchema>;
export type FixedOutcomeEntry = Static<typeof OutcomeSchema>;
export type FixedOutcome = Static<ReturnType<typeof Type.Object<typeof outcomeShape>>>;

export function readLedger(path: string): FixedLedgerEntry[] {
  if (!existsSync(path)) return [];
  const { entries, problems } = parseFixedLedger(readFileSync(path, "utf8"));
  if (problems.length > 0) throw new FixedLedgerError(`${path}:${problems[0] ?? ""}`);
  return entries;
}

// Each unreadable line is reported as `<line>: not a fixed-run ledger entry`.
export function parseFixedLedger(text: string): { entries: FixedLedgerEntry[]; problems: string[] } {
  const entries: FixedLedgerEntry[] = [], problems: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      value = null;
    }
    if (Value.Check(EntrySchema, value)) entries.push(value);
    else problems.push(`${String(i + 1)} is not a fixed-run ledger entry`);
  });
  return { entries, problems };
}

// The fixed-run driver and the experiment queue both write runs/experiments/<id>/trials.jsonl;
// fixed-run rows carry `kind`, queue rows carry `type`.
export function isFixedLedgerText(text: string): boolean {
  const first = text.split("\n").find(line => line.trim() !== "");
  if (first === undefined) return false;
  try {
    const value: unknown = JSON.parse(first);
    return typeof value === "object" && value !== null && "kind" in value;
  } catch {
    return false;
  }
}

export function appendLedger(path: string, entry: FixedLedgerEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

export interface QueueSlot {
  readonly slot: number;
  readonly phase: string;
  readonly block: number | null;
  readonly lane: string;
  readonly arm: FixedArm;
  readonly replaces: number | null;
}
export interface QueueState {
  // Per phase in definition order: the planned slots, then replacements in the order they arose.
  readonly slots: readonly QueueSlot[];
  readonly launches: ReadonlyMap<number, FixedLaunchEntry>;
  readonly started: ReadonlyMap<number, Static<typeof StartedSchema>>;
  readonly outcomes: ReadonlyMap<number, FixedOutcomeEntry>;
  readonly reserveUsedMs: number;
}

export function queueState(def: FixedDefinition, entries: readonly FixedLedgerEntry[]): QueueState {
  const launches = new Map<number, FixedLaunchEntry>();
  const started = new Map<number, Static<typeof StartedSchema>>();
  const outcomes = new Map<number, FixedOutcomeEntry>();
  const replacements: QueueSlot[] = [];
  const planned: QueueSlot[] = def.plan.map((s) => ({ ...s, replaces: null }));
  const find = (slot: number): QueueSlot | undefined => planned.find((s) => s.slot === slot) ?? replacements.find((s) => s.slot === slot);
  for (const entry of entries) {
    if (entry.kind === "launch") launches.set(entry.slot, entry);
    else if (entry.kind === "started") started.set(entry.slot, entry);
    else if (!outcomes.has(entry.slot)) {
      outcomes.set(entry.slot, entry);
      const failed = find(entry.slot);
      if (!entry.valid && failed !== undefined) replacements.push({ slot: def.plan.length + replacements.length + 1, phase: failed.phase, block: null, lane: failed.lane, arm: failed.arm, replaces: failed.slot });
    }
  }
  const slots = def.phases.flatMap((p) => [...planned.filter((s) => s.phase === p.id), ...replacements.filter((s) => s.phase === p.id)]);
  const reserveUsedMs = slots.filter((s) => s.replaces !== null && launches.has(s.slot)).reduce((sum, s) => sum + phaseOf(def, s.phase).maxWallMs, 0);
  return { slots, launches, started, outcomes, reserveUsedMs };
}

export type NextStep = { kind: "slot"; slot: QueueSlot } | { kind: "wait"; reason: string } | { kind: "blocked"; reason: string } | { kind: "done" };

const gpuHours = (ms: number): string => (ms / 3_600_000).toFixed(2);

export function nextFor(def: FixedDefinition, state: QueueState, lane: string): NextStep {
  for (const [index, phase] of def.phases.entries()) {
    const next = state.slots.find((s) => s.phase === phase.id && s.lane === lane && !state.launches.has(s.slot));
    if (next === undefined) continue;
    const earlier = new Set(def.phases.slice(0, index).map((p) => p.id));
    const unfinished = state.slots.filter((s) => earlier.has(s.phase) && !state.outcomes.has(s.slot));
    if (unfinished.length > 0) {
      const total = state.slots.filter((s) => earlier.has(s.phase)).length;
      return { kind: "wait", reason: `${phase.id} trials start once all ${String(total)} ${[...earlier].join(", ")} trials have finished (${String(unfinished.length)} still to run)` };
    }
    if (next.replaces !== null && state.reserveUsedMs + phase.maxWallMs > def.replacementReserveMs) {
      const invalid = [...state.outcomes.values()].filter((o) => !o.valid).length;
      const left = Math.max(0, def.replacementReserveMs - state.reserveUsedMs);
      return { kind: "blocked", reason: `replacement reserve used up: a ${phase.id} replacement needs ${gpuHours(phase.maxWallMs)} GPU-h but ${gpuHours(left)} of ${gpuHours(def.replacementReserveMs)} GPU-h remain (${String(invalid)} invalid trial${invalid === 1 ? "" : "s"} so far); waiting for the operator` };
    }
    return { kind: "slot", slot: next };
  }
  return { kind: "done" };
}

export interface InvalidTrial { readonly slot: number; readonly lane: string; readonly arm: FixedArm; readonly phase: string; readonly run: string; readonly reason: string }
export interface Progress {
  readonly total: number;
  readonly valid: number;
  readonly invalid: number;
  readonly running: readonly number[];
  readonly invalidTrials: readonly InvalidTrial[];
  readonly reserveUsedMs: number;
  readonly reserveMs: number;
  readonly lanes: Readonly<Record<string, { valid: number; total: number }>>;
}

export function progress(def: FixedDefinition, state: QueueState): Progress {
  const outcomes = [...state.outcomes.values()];
  const slotOf = new Map(state.slots.map((s) => [s.slot, s]));
  const invalidTrials = outcomes.filter((o) => !o.valid).flatMap((o) => {
    const s = slotOf.get(o.slot);
    return s === undefined ? [] : [{ slot: o.slot, lane: s.lane, arm: s.arm, phase: s.phase, run: o.run, reason: o.reason }];
  });
  const lanes = Object.fromEntries(def.lanes.map((l) => [l.id, {
    valid: outcomes.filter((o) => o.valid && slotOf.get(o.slot)?.lane === l.id).length,
    total: def.plan.filter((s) => s.lane === l.id).length,
  }]));
  return {
    total: def.plan.length,
    valid: outcomes.filter((o) => o.valid).length,
    invalid: invalidTrials.length,
    running: [...state.launches.keys()].filter((slot) => !state.outcomes.has(slot)),
    invalidTrials,
    reserveUsedMs: state.reserveUsedMs,
    reserveMs: def.replacementReserveMs,
    lanes,
  };
}

export const WALL_CAP = "wall cap";

export interface TrialExpectation {
  readonly maxWallMs: number;
  readonly primary: string;
  // Absent for cohorts run before this driver: their configuration is not checked.
  readonly presetId?: string;
  readonly start?: { readonly kind: "save_state"; readonly sha1: string } | { readonly kind: "boot" };
  readonly romSha1?: string;
  readonly port?: number;
  readonly model?: string;
  // The arm's value of every switch and every off-in-both flag.
  readonly features?: Readonly<Record<string, boolean>>;
}

interface Parsed { readonly type?: unknown; readonly t?: unknown; readonly [key: string]: unknown }
const record = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

function configProblems(start: Parsed, expect: TrialExpectation): string[] {
  if (expect.presetId === undefined) return [];
  const evaluation = record(start["evaluation"]);
  const budgets = record(start["budgets"]);
  const startState = record(start["start_state"]);
  const isolation = record(start["isolation"]);
  const model = record(start["model"]);
  const problems: string[] = [];
  const preset = typeof evaluation["preset_id"] === "string" ? evaluation["preset_id"] : "none";
  if (preset !== expect.presetId) problems.push(`preset ${preset} (planned ${expect.presetId})`);
  else if (evaluation["reply_failures_end_run"] !== false) problems.push("preset limits do not keep reply failures from ending the run");
  if (budgets["max_wall_ms"] !== expect.maxWallMs) problems.push(`wall cap ${String(budgets["max_wall_ms"])} ms (planned ${String(expect.maxWallMs)})`);
  const planned = expect.start;
  const startMatches = planned === undefined || (planned.kind === "boot" ? startState["kind"] === "boot" : startState["kind"] === "save_state" && startState["sha1"] === planned.sha1);
  if (!startMatches) problems.push(`start ${String(startState["kind"])}${typeof startState["sha1"] === "string" ? ` ${startState["sha1"]}` : ""} (planned ${planned.kind === "save_state" ? `save_state ${planned.sha1}` : "boot"})`);
  if (expect.romSha1 !== undefined && start["rom_sha1"] !== expect.romSha1) problems.push(`ROM ${typeof start["rom_sha1"] === "string" ? start["rom_sha1"] : "unrecorded"} (planned ${expect.romSha1})`);
  if (expect.port !== undefined && isolation["port"] !== expect.port) problems.push(`port ${String(isolation["port"])} (planned ${String(expect.port)})`);
  if (expect.model !== undefined && model["id"] !== expect.model) problems.push(`model ${String(model["id"])} (planned ${expect.model})`);
  if (expect.features !== undefined) {
    const recorded = evaluation["features"];
    if (typeof recorded !== "object" || recorded === null) problems.push("run_start does not record its feature set");
    else {
      const bits = record(recorded);
      const onOff = (on: unknown): string => (on === true ? "on" : on === false ? "off" : "unrecorded");
      for (const [name, planned] of Object.entries(expect.features)) if (bits[name] !== planned) problems.push(`${name} ${onOff(bits[name])} (planned ${onOff(planned)})`);
    }
  }
  return problems;
}

const exitText = (exit: number | null | undefined): string => (exit === undefined ? "unknown" : exit === null ? "signal" : String(exit));

// Invalid means infrastructure failed (model or gateway, emulator or server, checkpoint load,
// a run that did not run the plan); whatever the model did in a run that ran is valid.
export function classifyTrial(text: string | null, expect: TrialExpectation, exit: number | null | undefined): FixedOutcome {
  const events: Parsed[] = (text ?? "").split("\n").flatMap((line) => {
    if (line.trim() === "") return [];
    try {
      return [record(JSON.parse(line))];
    } catch {
      return [];
    }
  });
  const start = events[0];
  const blank = { endReason: null, primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: null, turns: null };
  if (start?.type !== "run_start") return { valid: false, reason: `no run_start: the run never began (exit ${exitText(exit)}); a server, emulator or checkpoint load failure`, ...blank };
  const t0 = Date.parse(String(start.t));
  const reached = new Map<string, number>();
  // Milestone times count only unpaused time, as the production wall cap (BudgetTimer) does.
  let pausedMs = 0;
  for (const e of events) {
    if (e.type === "operator_control" && e["status"] === "applied" && typeof e["paused_ms"] === "number") pausedMs += e["paused_ms"];
    if (e.type !== "milestone" || e["origin"] === "present_at_start" || typeof e["name"] !== "string" || reached.has(e["name"])) continue;
    const ms = Date.parse(String(e.t)) - t0 - pausedMs;
    if (ms <= expect.maxWallMs) reached.set(e["name"], ms);
  }
  const furthest = [...reached.keys()].reduce<string | null>(deeperMilestone, null);
  const primaryMs = reached.get(expect.primary) ?? null;
  const end = events.at(-1);
  const metrics = {
    primaryReached: primaryMs !== null, primaryMs, furthest, furthestDepth: furthest === null ? -1 : DEPTH_ORDER.indexOf(furthest), furthestMs: furthest === null ? null : (reached.get(furthest) ?? null),
    wallMs: end?.type === "run_end" && typeof end["wall_ms"] === "number" ? end["wall_ms"] : null,
    turns: end?.type === "run_end" && typeof end["turns"] === "number" ? end["turns"] : null,
  };
  const config = configProblems(start, expect);
  if (config.length > 0) return { valid: false, reason: `run_start does not match the plan: ${config.join("; ")}`, endReason: null, ...metrics };
  if (end?.type !== "run_end") return { valid: false, reason: `no run_end: the play process died mid-run (exit ${exitText(exit)})`, endReason: null, ...metrics };
  const reason = String(end["reason"]);
  const verdict = (valid: boolean, why: string): FixedOutcome => ({ valid, reason: why, endReason: reason, ...metrics });
  if (reason === "budget") {
    if (metrics.wallMs !== null && metrics.wallMs < expect.maxWallMs * 0.98) return verdict(true, `turn cap (${String(metrics.turns)} turns) before the wall cap`);
    return verdict(true, WALL_CAP);
  }
  if (reason === "model_error") {
    const lastRetry = events.filter((e) => e.type === "retry").at(-1);
    const why = typeof lastRetry?.["reason"] === "string" ? lastRetry["reason"] : "no retry recorded";
    return why.startsWith("model error:") || lastRetry === undefined ? verdict(false, `model/gateway error: ${why}`) : verdict(true, `model behavior: ${why}`);
  }
  if (reason === "crash") return verdict(false, "emulator or game server crash");
  if (reason === "operator_abort" || reason === "operator_stop") return verdict(false, `the operator stopped the trial (${reason})`);
  return verdict(true, `ended ${reason} before the wall cap`);
}
