// A fixed-N two-arm experiment: control has every bundle switch off, bundle has them all on,
// and everything else is shared. The plan is a seeded sequence of balanced blocks, frozen in
// the definition before launch and checked against its seed at every load.
import { createHash } from "node:crypto";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { MILESTONE_ORDER } from "@pokebench/agent/milestones";
import { FeatureSetSchema, parsePlayPreset, type PlayPresetV2 } from "@pokebench/agent/play-preset";

export class FixedDesignError extends Error {
  override readonly name = "FixedDesignError";
}

export const FIXED_ARMS = ["control", "bundle"] as const;
export type FixedArm = (typeof FIXED_ARMS)[number];

const closed = { additionalProperties: false } as const;
const positive = Type.Integer({ minimum: 1 });
const Name = Type.String({ pattern: "^[a-z0-9][a-z0-9-]{0,79}$" });

const LaneSchema = Type.Object({ id: Type.String({ pattern: "^[A-Z]$" }), gpu: Type.String({ pattern: "^GPU[0-9]$" }), gamePort: Type.Integer({ minimum: 1024, maximum: 65535 }), modelUrl: Type.String({ minLength: 1 }) }, closed);
const PhaseSchema = Type.Object({ id: Name, perArm: positive, maxWallMs: Type.Integer({ minimum: 60_000 }), primary: Type.Boolean() }, closed);
const SlotSchema = Type.Object({ slot: positive, phase: Name, block: positive, lane: Type.String(), arm: Type.Union([Type.Literal("control"), Type.Literal("bundle")]) }, closed);

const draftShape = {
  version: Type.Literal(1),
  id: Name,
  title: Type.String({ minLength: 1, maxLength: 120 }),
  worklog: Type.String({ minLength: 1 }),
  primaryMilestone: Type.String({ minLength: 1 }),
  start: Type.Object({ kind: Type.Literal("save_state"), path: Type.String({ minLength: 1 }), sha1: Type.String({ pattern: "^[0-9a-f]{40}$" }) }, closed),
  base: Type.Object({
    target: Type.Null(),
    // Reply failures never end a trial: the wall cap is the only behavioral end.
    limits: Type.Object({ maxTurns: positive, failureLimit: positive, replyFailuresEndRun: Type.Literal(false) }, closed),
    sampling: Type.Object({ thinkingLevel: Type.Enum(["off", "minimal", "low", "medium", "high", "xhigh"] as const), maxTokens: positive }, closed),
    features: Type.Record(Type.String(), Type.Boolean()),
  }, closed),
  switches: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
  offInBoth: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  phases: Type.Array(PhaseSchema, { minItems: 1 }),
  lanes: Type.Array(LaneSchema, { minItems: 1 }),
  serving: Type.Object({ model: Type.String({ minLength: 1 }), build: Type.String({ minLength: 1 }), contextTokens: positive, slots: positive }, closed),
  replacementReserveMs: Type.Integer({ minimum: 0 }),
};
export const FixedDraftSchema = Type.Object({ ...draftShape, seed: Type.Optional(Type.String({ pattern: "^[0-9a-f]{16}$" })) }, closed);
export const FixedDefinitionSchema = Type.Object({ ...draftShape, seed: Type.String({ pattern: "^[0-9a-f]{16}$" }), plan: Type.Array(SlotSchema) }, closed);
export type FixedDefinition = Static<typeof FixedDefinitionSchema>;
export type FixedLane = Static<typeof LaneSchema>;
export type FixedPhase = Static<typeof PhaseSchema>;
export type PlannedSlot = Static<typeof SlotSchema>;

// Fisher-Yates over sha256(seed:phase:block:i), so the plan can be rebuilt from the seed by anyone.
function shuffled<T>(items: readonly T[], seed: string, phase: string, block: number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const draw = createHash("sha256").update(`${seed}:${phase}:${String(block)}:${String(i)}`).digest().readUInt32BE(0);
    const j = draw % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function generatePlan(def: Pick<FixedDefinition, "seed" | "phases" | "lanes">): PlannedSlot[] {
  const plan: PlannedSlot[] = [];
  let block = 0;
  for (const phase of def.phases) {
    for (let b = 0; b < Math.floor(phase.perArm / def.lanes.length); b++) {
      block += 1;
      const cells = def.lanes.flatMap((lane) => FIXED_ARMS.map((arm) => ({ lane: lane.id, arm })));
      for (const cell of shuffled(cells, def.seed, phase.id, block)) plan.push({ slot: plan.length + 1, phase: phase.id, block, ...cell });
    }
  }
  return plan;
}

export function planOrder(def: FixedDefinition, lane: string): PlannedSlot[] {
  return def.plan.filter((s) => s.lane === lane);
}

export function phaseOf(def: Pick<FixedDefinition, "phases">, id: string): FixedPhase {
  const phase = def.phases.find((p) => p.id === id);
  if (phase === undefined) throw new FixedDesignError(`no phase ${id}`);
  return phase;
}

export function armFeatures(def: Pick<FixedDefinition, "base" | "switches">, arm: FixedArm): Record<string, boolean> {
  return { ...def.base.features, ...Object.fromEntries(def.switches.map((s) => [s, arm === "bundle"])) };
}

export function armPreset(def: FixedDefinition, phaseId: string, arm: FixedArm): PlayPresetV2 {
  const phase = phaseOf(def, phaseId);
  const { maxTurns, failureLimit, replyFailuresEndRun } = def.base.limits;
  return {
    version: 2,
    id: `${def.id}-${phase.id}-${arm}`,
    target: null,
    limits: { maxTurns, maxWallMs: phase.maxWallMs, failureLimit, replyFailuresEndRun },
    sampling: def.base.sampling,
    features: armFeatures(def, arm) as PlayPresetV2["features"],
    start: def.start,
  };
}

function laneProblems(def: FixedDefinition): string[] {
  const problems: string[] = [];
  const distinct = (values: readonly unknown[]): boolean => new Set(values).size === values.length;
  if (!distinct(def.lanes.map((l) => l.id))) problems.push("lane ids must be unique");
  if (!distinct(def.lanes.map((l) => l.gamePort))) problems.push("lanes must use distinct game ports");
  if (!distinct(def.lanes.map((l) => l.modelUrl))) problems.push("lanes must use distinct model URLs");
  for (const lane of def.lanes) if (!/^http:\/\/127\.0\.0\.1:[0-9]{2,5}$/.test(lane.modelUrl)) problems.push(`lane ${lane.id}: modelUrl must be http://127.0.0.1:<port> with no path`);
  return problems;
}

function phaseProblems(def: FixedDefinition): string[] {
  const problems: string[] = [];
  if (new Set(def.phases.map((p) => p.id)).size !== def.phases.length) problems.push("phase ids must be unique");
  if (def.phases.filter((p) => p.primary).length > 1) problems.push("at most one phase may be primary");
  for (const p of def.phases) if (p.perArm % def.lanes.length !== 0) problems.push(`phase ${p.id}: perArm ${String(p.perArm)} is not a multiple of ${String(def.lanes.length)} lanes`);
  return problems;
}

function featureProblems(def: FixedDefinition): string[] {
  const problems: string[] = [];
  const known = new Set(Object.keys(FeatureSetSchema.properties));
  for (const s of [...def.switches, ...def.offInBoth, ...Object.keys(def.base.features)]) if (!known.has(s)) problems.push(`unknown feature ${s}`);
  // An enforced loop guard without its supervisor ends a run "stuck"; only the wall cap may end a trial.
  if (def.base.features["deterministic-loop-guard-v1"] === true && def.base.features["loop-guard-supervisor-v1"] !== true) problems.push("deterministic-loop-guard-v1 without loop-guard-supervisor-v1 can end a trial before its wall cap");
  for (const s of def.switches) if (def.base.features[s] === true) problems.push(`bundle switch ${s} must be off in the base (control) features`);
  for (const s of def.offInBoth) {
    if (def.switches.includes(s)) problems.push(`${s} is both a bundle switch and off in both arms`);
    else if (def.base.features[s] !== false) problems.push(`${s} must be off in both arms`);
  }
  for (const phase of def.phases) {
    for (const arm of FIXED_ARMS) {
      try {
        parsePlayPreset(armPreset(def, phase.id, arm));
      } catch (error) {
        problems.push(`${phase.id} ${arm} preset: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return problems;
}

export function definitionProblems(def: FixedDefinition): string[] {
  const problems = [...laneProblems(def), ...phaseProblems(def), ...featureProblems(def)];
  if (!MILESTONE_ORDER.includes(def.primaryMilestone)) problems.push(`unknown primary milestone ${def.primaryMilestone}`);
  if (JSON.stringify(def.plan) !== JSON.stringify(generatePlan(def))) problems.push(`plan does not match seed ${def.seed}: regenerate it with \`just fixed-run plan\``);
  return [...new Set(problems)];
}

export function parseFixedDefinition(text: string): { definition: FixedDefinition; sha256: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new FixedDesignError(`not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Value.Check(FixedDefinitionSchema, value)) {
    const [first] = Value.Errors(FixedDefinitionSchema, value);
    throw new FixedDesignError(`not a fixed-run definition: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);
  }
  const problems = definitionProblems(value);
  if (problems.length > 0) throw new FixedDesignError(problems.join("\n"));
  return { definition: value, sha256: createHash("sha256").update(text).digest("hex") };
}

export function dryRunDefinition(def: FixedDefinition, wallMs: number): FixedDefinition {
  const draft = { ...def, id: `${def.id}-dryrun`, title: `${def.title} (dry run)`, phases: [{ id: "dry-run", perArm: def.lanes.length, maxWallMs: wallMs, primary: false }], replacementReserveMs: 0 };
  return { ...draft, plan: generatePlan(draft) };
}
