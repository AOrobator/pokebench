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
const NAME_PATTERN = "^[a-z0-9][a-z0-9-]{0,79}$";
const Name = Type.String({ pattern: NAME_PATTERN });

const LaneSchema = Type.Object({ id: Type.String({ pattern: "^[A-Z]$" }), gpu: Type.String({ pattern: "^(GPU[0-9]|MAC)$" }), gamePort: Type.Integer({ minimum: 1024, maximum: 65535 }), modelUrl: Type.String({ minLength: 1 }), runName: Type.Optional(Type.String({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 40 })) }, closed);
// A phase loads its own pinned save, or powers on.
const SaveStart = Type.Object({ kind: Type.Literal("save_state"), path: Type.String({ minLength: 1 }), sha1: Type.String({ pattern: "^[0-9a-f]{40}$" }) }, closed);
const PhaseStart = Type.Union([SaveStart, Type.Object({ kind: Type.Literal("boot") }, closed)]);
const ArmSchema = Type.Union([Type.Literal("control"), Type.Literal("bundle")]);
// singleArm: an unpaired, exploratory trial of one arm on one lane (`fixed-run rerun`).
const PhaseSchema = Type.Object({ id: Name, perArm: positive, maxWallMs: Type.Integer({ minimum: 60_000 }), primary: Type.Boolean(), start: PhaseStart, singlePair: Type.Optional(Type.Boolean()), singleArm: Type.Optional(ArmSchema) }, closed);
const SlotSchema = Type.Object({ slot: positive, phase: Name, block: positive, lane: Type.String(), arm: ArmSchema }, closed);

const draftShape = {
  version: Type.Literal(1),
  id: Name,
  title: Type.String({ minLength: 1, maxLength: 120 }),
  worklog: Type.String({ minLength: 1 }),
  primaryMilestone: Type.String({ minLength: 1 }),
  primaryOutcome: Type.Optional(Type.Union([Type.Literal("milestone"),Type.Literal("frontier")])),
  // Every trial, save or New Game, must record this ROM.
  romSha1: Type.String({ pattern: "^[0-9a-f]{40}$" }),
  // The preset the control arm reproduces outside the switches and off-in-both flags, pinned by bytes.
  controlBase: Type.Object({ path: Type.String({ minLength: 1 }), presetId: Name, sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }) }, closed),
  base: Type.Object({
    target: Type.Union([Type.Null(),Type.String({minLength:1})]),
    stopAt: Type.Optional(Type.String({minLength:1})),
    // Reply failures never end a trial: the wall cap is the only behavioral end.
    limits: Type.Object({ maxTurns: positive, failureLimit: positive, replyFailuresEndRun: Type.Literal(false) }, closed),
    sampling: Type.Object({ thinkingLevel: Type.Enum(["off", "minimal", "low", "medium", "high", "xhigh"] as const), maxTokens: positive }, closed),
    features: Type.Record(Type.String(), Type.Boolean()),
  }, closed),
  bundleMaxTokens: Type.Optional(positive),
  switches: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
  offInBoth: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  // Fixes on in both arms: the only features allowed to differ from the control base outside the switches.
  onInBoth: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  phases: Type.Array(PhaseSchema, { minItems: 1 }),
  lanes: Type.Array(LaneSchema, { minItems: 1 }),
  serving: Type.Object({ model: Type.String({ minLength: 1 }), build: Type.String({ minLength: 1 }), contextTokens: positive, slots: positive }, closed),
  replacementReserveMs: Type.Integer({ minimum: 0 }),
  terminalErrorsAsOutcomes: Type.Optional(Type.Boolean()),
  progressOrder: Type.Optional(Type.Array(Type.String({minLength:1}),{minItems:1,uniqueItems:true})),
};
export const FixedDraftSchema = Type.Object({ ...draftShape, seed: Type.Optional(Type.String({ pattern: "^[0-9a-f]{16}$" })) }, closed);
export const FixedDefinitionSchema = Type.Object({ ...draftShape, seed: Type.String({ pattern: "^[0-9a-f]{16}$" }), plan: Type.Array(SlotSchema) }, closed);
export const FeatureRecipeSchema=Type.Object({version:Type.Literal(1),id:Name,romSha1:draftShape.romSha1,controlBase:draftShape.controlBase,features:draftShape.base.properties.features,switches:draftShape.switches,offInBoth:draftShape.offInBoth,onInBoth:draftShape.onInBoth},closed);
const protocolShape=Type.Omit(Type.Object(draftShape,closed),["controlBase","switches","offInBoth","onInBoth","base"]).properties;
const protocolBase=Type.Omit(draftShape.base,["features"]).properties;
const FeatureSourceSchema=Type.Object({...protocolShape,base:Type.Object(protocolBase,closed),featureRecipe:Name,seed:Type.Optional(Type.String({pattern:"^[0-9a-f]{16}$"})),plan:Type.Optional(Type.Array(SlotSchema))},closed);
export type FeatureRecipe=Static<typeof FeatureRecipeSchema>;
export function materializeFixedSource(value:unknown,readRecipe?:(id:string)=>string):unknown {
 if(typeof value!=="object"||value===null||!("featureRecipe" in value))return value;
 if(!Value.Check(FeatureSourceSchema,value))throw new FixedDesignError("invalid feature-referenced protocol; keep all feature settings in its recipe");
 if(readRecipe===undefined)throw new FixedDesignError(`feature recipe ${value.featureRecipe} requires a source loader`);
 const recipe:unknown=JSON.parse(readRecipe(value.featureRecipe));
 if(!Value.Check(FeatureRecipeSchema,recipe))throw new FixedDesignError("invalid feature recipe");
 const {featureRecipe,...protocol}=value;
 if(recipe.id!==featureRecipe)throw new FixedDesignError("feature recipe identity differs from its reference");
 if(recipe.romSha1!==value.romSha1)throw new FixedDesignError("feature recipe ROM differs from the protocol");
 return {...protocol,controlBase:recipe.controlBase,base:{...value.base,features:recipe.features},switches:recipe.switches,offInBoth:recipe.offInBoth,onInBoth:recipe.onInBoth};
}
export type FixedDefinition = Static<typeof FixedDefinitionSchema>;
export type FixedLane = Static<typeof LaneSchema>;
export type FixedPhase = Static<typeof PhaseSchema>;
export type FixedStart = Static<typeof PhaseStart>;
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
    if (phase.singleArm !== undefined) {
      block += 1;
      for (const lane of def.lanes) plan.push({ slot: plan.length + 1, phase: phase.id, block, lane: lane.id, arm: phase.singleArm });
      continue;
    }
    if (phase.singlePair === true) {
      block += 1;
      const lanes = shuffled(def.lanes, def.seed, phase.id, block);
      const arms = shuffled([...FIXED_ARMS], def.seed, phase.id, block + 1);
      lanes.forEach((lane, index) => {
        const arm = arms[index];
        if (arm !== undefined) plan.push({ slot: plan.length + 1, phase: phase.id, block, lane: lane.id, arm });
      });
      continue;
    }
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

// The bits that tell the arms apart, and the flags off in both, as each arm should record them.
export function armFeatureBits(def: FixedDefinition, arm: FixedArm): Record<string, boolean> {
  return Object.fromEntries([...def.switches.map((s) => [s, arm === "bundle"] as const), ...def.offInBoth.map((s) => [s, false] as const), ...def.onInBoth.map((s) => [s, true] as const)]);
}

export function armPreset(def: FixedDefinition, phaseId: string, arm: FixedArm): PlayPresetV2 {
  const phase = phaseOf(def, phaseId);
  const { maxTurns, failureLimit, replyFailuresEndRun } = def.base.limits;
  return {
    version: 2,
    id: `${def.id}-${phase.id}-${arm}`,
    target: def.base.target,
    ...(def.base.stopAt===undefined?{}:{stopAt:def.base.stopAt}),
    limits: { maxTurns, maxWallMs: phase.maxWallMs, failureLimit, replyFailuresEndRun },
    sampling: { ...def.base.sampling, ...(arm==="bundle"&&def.bundleMaxTokens!==undefined?{maxTokens:def.bundleMaxTokens}:{}) },
    features: armFeatures(def, arm) as PlayPresetV2["features"],
    ...(phase.start.kind === "save_state" ? { start: phase.start } : {}),
  };
}

function laneProblems(def: FixedDefinition): string[] {
  const problems: string[] = [];
  const distinct = (values: readonly unknown[]): boolean => new Set(values).size === values.length;
  if (!distinct(def.lanes.map((l) => l.id))) problems.push("lane ids must be unique");
  if (!distinct(def.lanes.map((l) => l.gamePort))) problems.push("lanes must use distinct game ports");
  if (!distinct(def.lanes.map((l) => l.modelUrl))) problems.push("lanes must use distinct model URLs");
  for (const lane of def.lanes) if (!/^http:\/\/127\.0\.0\.1:[0-9]{2,5}$/.test(lane.modelUrl)) problems.push(`lane ${lane.id}: modelUrl must be http://127.0.0.1:<port> with no path`);
  for (const lane of def.lanes) if (lane.gpu === "MAC" && lane.runName === undefined) problems.push(`lane ${lane.id}: a MAC lane must name its runs with runName`);
  return problems;
}

function phaseProblems(def: FixedDefinition): string[] {
  const problems: string[] = [];
  if (new Set(def.phases.map((p) => p.id)).size !== def.phases.length) problems.push("phase ids must be unique");
  if (def.phases.filter((p) => p.primary).length > 1) problems.push("at most one phase may be primary");
  for (const p of def.phases) {
    if (p.singleArm !== undefined) {
      if (p.perArm !== 1 || def.lanes.length !== 1 || p.primary || p.singlePair === true) problems.push(`phase ${p.id}: singleArm requires one exploratory trial on one lane`);
    } else if (p.singlePair === true) {
      if (p.perArm !== 1 || def.lanes.length !== 2) problems.push(`phase ${p.id}: singlePair requires one trial per arm and two lanes`);
    } else if (p.perArm % def.lanes.length !== 0) problems.push(`phase ${p.id}: perArm ${String(p.perArm)} is not a multiple of ${String(def.lanes.length)} lanes`);
  }
  return problems;
}

function featureProblems(def: FixedDefinition): string[] {
  const problems: string[] = [];
  const known = new Set(Object.keys(FeatureSetSchema.properties));
  for (const s of [...def.switches, ...def.offInBoth, ...def.onInBoth, ...Object.keys(def.base.features)]) if (!known.has(s)) problems.push(`unknown feature ${s}`);
  // Without the enforced guard's supervisor the loop guard's stop notice ends a run "stuck"; only the wall cap may end a trial.
  if (def.base.features["deterministic-loop-guard-v1"] !== true || def.base.features["loop-guard-supervisor-v1"] !== true) problems.push("deterministic-loop-guard-v1 and loop-guard-supervisor-v1 must both be on: otherwise the loop guard can end a trial stuck before its wall cap");
  for (const s of def.switches) if (def.base.features[s] === true) problems.push(`bundle switch ${s} must be off in the base (control) features`);
  for (const s of def.offInBoth) {
    if (def.switches.includes(s)) problems.push(`${s} is both a bundle switch and off in both arms`);
    else if (def.base.features[s] !== false) problems.push(`${s} must be off in both arms`);
  }
  for (const s of def.onInBoth) {
    if (def.switches.includes(s)) problems.push(`${s} is both a bundle switch and on in both arms`);
    else if (def.offInBoth.includes(s)) problems.push(`${s} is both off in both arms and on in both arms`);
    else if (def.base.features[s] !== true) problems.push(`${s} must be on in both arms`);
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

const shown = (value: unknown): string => (value === undefined ? "unset" : JSON.stringify(value));

// The control base must equal the recorded preset, byte-pinned, in every flag but the switches and
// off-in-both flags, and in sampling and turn/failure limits, so the control cannot drift silently.
export function controlBaseProblems(def: FixedDefinition, presetText: string): string[] {
  const { path, presetId, sha256 } = def.controlBase;
  const actual = createHash("sha256").update(presetText).digest("hex");
  if (actual !== sha256) return [`control base ${path} has sha256 ${actual}, the definition records ${sha256}`];
  let preset: { id?: unknown; target?: unknown; stopAt?: unknown; limits?: Record<string, unknown>; sampling?: unknown; features?: Record<string, unknown> };
  try {
    preset = JSON.parse(presetText) as typeof preset;
  } catch {
    return [`control base ${path} is not a preset`];
  }
  const problems: string[] = [];
  if (preset.id !== presetId) problems.push(`control base preset id is ${typeof preset.id === "string" ? preset.id : shown(preset.id)}, the definition records ${presetId}`);
  if(preset.stopAt!==def.base.stopAt)problems.push("base stopAt differs from the control base");
  if (preset.target !== def.base.target) problems.push(`base target is ${shown(def.base.target)}, the control base has ${shown(preset.target)}`);
  if (JSON.stringify(preset.sampling) !== JSON.stringify(def.base.sampling)) problems.push("base sampling differs from the control base");
  for (const key of ["maxTurns", "failureLimit"] as const) {
    if (preset.limits?.[key] !== def.base.limits[key]) problems.push(`base limits.${key} is ${String(def.base.limits[key])}, the control base has ${shown(preset.limits?.[key])}`);
  }
  const features = preset.features ?? {};
  const designed = new Set([...def.switches, ...def.offInBoth, ...def.onInBoth]);
  for (const key of [...new Set([...Object.keys(def.base.features), ...Object.keys(features)])].sort()) {
    if (designed.has(key) || def.base.features[key] === features[key]) continue;
    problems.push(`base feature ${key} is ${shown(def.base.features[key])}, the control base has ${shown(features[key])}`);
  }
  return problems;
}

export function definitionProblems(def: FixedDefinition): string[] {
  const problems = [...laneProblems(def), ...phaseProblems(def), ...featureProblems(def)];
  if((def.base.stopAt??def.base.target)!==null&&(def.base.stopAt??def.base.target)!==def.primaryMilestone)problems.push("base stopping target must equal primaryMilestone");
  for(const name of def.progressOrder??[])if(!MILESTONE_ORDER.includes(name))problems.push(`unknown progress milestone ${name}`);
  if (!MILESTONE_ORDER.includes(def.primaryMilestone)) problems.push(`unknown primary milestone ${def.primaryMilestone}`);
  if (JSON.stringify(def.plan) !== JSON.stringify(generatePlan(def))) problems.push(`plan does not match seed ${def.seed}: regenerate it with \`just fixed-run plan\``);
  return [...new Set(problems)];
}

export function parseFixedDefinition(text: string, readRecipe?:(id:string)=>string): { definition: FixedDefinition; sha256: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new FixedDesignError(`not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const recipeSource:{text:string|null}={text:null};
  value=materializeFixedSource(value,id=>{if(readRecipe===undefined)throw new FixedDesignError(`feature recipe ${id} requires a source loader`);recipeSource.text=readRecipe(id);return recipeSource.text;});
  if (!Value.Check(FixedDefinitionSchema, value)) {
    const [first] = Value.Errors(FixedDefinitionSchema, value);
    throw new FixedDesignError(`not a fixed-run definition: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);
  }
  const problems = definitionProblems(value);
  if (problems.length > 0) throw new FixedDesignError(problems.join("\n"));
  return { definition: value, sha256: createHash("sha256").update(recipeSource.text===null?text:JSON.stringify([text,recipeSource.text])).digest("hex") };
}

export function dryRunDefinition(def: FixedDefinition, wallMs: number, phaseId: string = def.phases[0]?.id ?? ""): FixedDefinition {
  const phase = phaseOf(def, phaseId);
  const draft = { ...def, id: `${def.id}-dryrun-${phase.id}`, title: `${def.title} (dry run, ${phase.id})`, phases: [{ id: "dry-run", perArm: def.lanes.length, maxWallMs: wallMs, primary: false, start: phase.start }], replacementReserveMs: 0 };
  return { ...draft, plan: generatePlan(draft) };
}


// One unpaired trial of one arm on one lane, at a phase's start and cap, as its own experiment
// <id>-solo-<arm>-<lane>-<n>: never part of the paired experiment's ledger or analysis.
export function soloDefinition(def: FixedDefinition, arm: FixedArm, laneId: string, phaseId: string, n: number): FixedDefinition {
  const phase = phaseOf(def, phaseId);
  const lane = def.lanes.find((l) => l.id === laneId);
  if (lane === undefined) throw new FixedDesignError(`no lane ${laneId}; lanes: ${def.lanes.map((l) => l.id).join(", ")}`);
  const id = `${def.id}-solo-${arm}-${lane.id.toLowerCase()}-${String(n)}`;
  if (!new RegExp(NAME_PATTERN).test(id)) throw new FixedDesignError(`${id} is not a valid experiment id`);
  const draft = { ...def, id, title: `${def.title} (exploratory: ${arm} only, lane ${lane.id}, ${phase.id}, #${String(n)})`, phases: [{ id: phase.id, perArm: 1, maxWallMs: phase.maxWallMs, primary: false, start: phase.start, singleArm: arm }], lanes: [lane], replacementReserveMs: 0 };
  return { ...draft, plan: generatePlan(draft) };
}
