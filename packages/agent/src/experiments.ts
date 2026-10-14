// Feature-switch experiments: one tracked definition per experiment under
// experiments/, two arms that differ in exactly one switch, an append-only
// trial ledger and an operator approval under runs/experiments/<id>/. Status
// is always derived from those records, never stored.
import {createHash} from "node:crypto";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {SWITCHABLE_FEATURES,dependencyProblems,stateOnlyProblems,type FeatureSet,type SwitchableFeature} from "./features.js";
import {MILESTONES} from "./milestones.js";
import {PlayPresetV2Schema,parsePlayPreset,type PlayPresetV2} from "./play-preset.js";

const closed={additionalProperties:false} as const;
const positive=Type.Integer({minimum:1});
export const ExperimentSchema=Type.Object({
 version:Type.Literal(1),
 id:Type.String({pattern:"^[a-z0-9][a-z0-9-]{0,60}$"}),
 title:Type.String({minLength:1,maxLength:80}),
 changedFeature:Type.Enum(SWITCHABLE_FEATURES),
 hypothesis:Type.String({minLength:1}),
 // The earliest native milestone at which the switch can change what the model sees or does.
 activationMilestone:Type.String({minLength:1}),
 primaryMilestone:Type.String({minLength:1}),
 // Absent: a pending experiment, registered but not in the queue.
 queuePosition:Type.Optional(positive),
 // Trials run from the main checkout, which must be at this commit with a clean tree and a fresh build.
 source:Type.Object({checkout:Type.Literal("main"),commit:Type.String({pattern:"^[0-9a-f]{40}$"})},closed),
 incumbent:PlayPresetV2Schema,
 trialsPerArm:Type.Integer({minimum:4,maximum:8}),
 modelLane:Type.String({minLength:1}),
 budget:Type.Object({maxWallMs:positive},closed),
 // Bounds match comparePatchResults, so every accepted definition can be graded.
 criteria:Type.Object({completionTolerance:Type.Integer({minimum:0}),speedMarginPercent:Type.Number({exclusiveMinimum:0,maximum:100})},closed),
 readiness:Type.Object({window:positive,minReached:positive},closed),
 blocked:Type.Optional(Type.String({minLength:1})),
 // Set when the operator drops the experiment; it then leaves both the queue and the pending list.
 discarded:Type.Optional(Type.String({minLength:1})),
 notes:Type.Optional(Type.String()),
},closed);
export type Experiment=Omit<Static<typeof ExperimentSchema>,"incumbent"|"changedFeature"> & {readonly changedFeature:SwitchableFeature;readonly incumbent:PlayPresetV2};
export type Arm="incumbent"|"candidate";

const native=(name:string):boolean=>MILESTONES.some(m=>m.name===name&&m.kind!=="legacy");
export function parseExperiment(value:unknown):Experiment {
 if(!Value.Check(ExperimentSchema,value)){const [first]=Value.Errors(ExperimentSchema,value);throw new Error(`Invalid experiment: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);}
 const incumbent=parsePlayPreset(value.incumbent);
 if(incumbent.version!==2)throw new Error("Invalid experiment: incumbent must be a version 2 preset");
 for(const field of ["activationMilestone","primaryMilestone"] as const)if(!native(value[field]))throw new Error(`Invalid experiment: ${field} ${value[field]} is not a native milestone`);
 if(value.criteria.completionTolerance>value.trialsPerArm)throw new Error("Invalid experiment: criteria completionTolerance exceeds trialsPerArm");
 if(value.readiness.minReached>value.readiness.window)throw new Error("Invalid experiment: readiness minReached exceeds its window");
 if(value.budget.maxWallMs<incumbent.limits.maxWallMs)throw new Error("Invalid experiment: budget is shorter than one trial");
 const experiment:Experiment={...value,changedFeature:value.changedFeature,incumbent};
 experimentArms(experiment);
 return experiment;
}

// INV-Q1: the candidate is the incumbent with only the changed switch flipped.
export function experimentArms(experiment:Experiment):{incumbent:PlayPresetV2;candidate:PlayPresetV2} {
 const feature=experiment.changedFeature,base=experiment.incumbent.features;
 const candidateFeatures:FeatureSet={...base,[feature]:!base[feature]};
 const problems=[...dependencyProblems(candidateFeatures),...stateOnlyProblems(candidateFeatures)];
 if(problems.length>0)throw new Error(`Invalid experiment: candidate: ${problems.join("; ")}`);
 return {incumbent:{...experiment.incumbent,id:`${experiment.id}-incumbent`},candidate:{...experiment.incumbent,id:`${experiment.id}-candidate`,features:candidateFeatures}};
}

// ABBA blocks, so neither arm always runs first or last.
export function trialOrder(experiment:Experiment):Arm[] {
 return Array.from({length:experiment.trialsPerArm*2},(_,i)=>i%4===0||i%4===3?"incumbent":"candidate");
}

function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(typeof value==="object"&&value!==null)return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
 return JSON.stringify(value);
}
// Reordering the queue or editing notes keeps an approval valid; anything else invalidates it.
export function definitionHash(experiment:Experiment):string {
 return createHash("sha256").update(canonical({...experiment,queuePosition:undefined,notes:undefined})).digest("hex");
}

export interface ReadinessRun {readonly id:string;readonly model:string;readonly start:"boot"|"save_state";readonly maxTurns:number|null;readonly maxWallMs:number|null;readonly features:FeatureSet;readonly reached:readonly string[]}
export interface Readiness {
 readonly ready:boolean;
 // comparable: runs matching the incumbent on every switch but the changed one. recent: too few of
 // those, so the latest model runs of any registry configuration stand in for the frontier.
 readonly basis:"comparable"|"recent";
 readonly milestone:string;readonly window:number;readonly minReached:number;readonly reached:number;readonly considered:readonly string[];
}
// Runs are in chronological order.
export function readinessOf(experiment:Experiment,runs:readonly ReadinessRun[]):Readiness {
 const {window,minReached}=experiment.readiness,milestone=experiment.activationMilestone,incumbent=experiment.incumbent.features;
 // Experiments start from boot, so only boot starts on the same model lane count (a checkpoint start skips early milestones).
 const lane=runs.filter(r=>r.model===experiment.modelLane&&r.start==="boot"),limits=experiment.incumbent.limits;
 const comparable=lane.filter(r=>r.maxTurns===limits.maxTurns&&r.maxWallMs===limits.maxWallMs&&SWITCHABLE_FEATURES.every(id=>id===experiment.changedFeature||r.features[id]===incumbent[id]));
 const basis=comparable.length>=window?"comparable":"recent";
 const latest=(basis==="comparable"?comparable:lane).slice(-window);
 const reached=latest.filter(r=>r.reached.includes(milestone)).length;
 return {ready:latest.length===window&&reached>=minReached,basis,milestone,window,minReached,reached,considered:latest.map(r=>r.id)};
}

const LaunchSchema=Type.Object({type:Type.Literal("launch"),trial:Type.Integer({minimum:0}),arm:Type.Enum(["incumbent","candidate"] as const),run:Type.String({minLength:1}),at:Type.String(),model:Type.Optional(Type.String({minLength:1})),environment:Type.Optional(Type.String({pattern:"^[0-9a-f]{64}$"})),commit:Type.Optional(Type.String({pattern:"^[0-9a-f]{40}$"}))},closed);
const OutcomeSchema=Type.Object({type:Type.Literal("outcome"),trial:Type.Integer({minimum:0}),arm:Type.Enum(["incumbent","candidate"] as const),run:Type.String({minLength:1}),at:Type.String(),reason:Type.String()},closed);
const ErrorSchema=Type.Object({type:Type.Literal("launcher_error"),trial:Type.Integer({minimum:0}),arm:Type.Enum(["incumbent","candidate"] as const),run:Type.String({minLength:1}),at:Type.String(),message:Type.String()},closed);
export const LedgerEntrySchema=Type.Union([LaunchSchema,OutcomeSchema,ErrorSchema]);
export type LedgerEntry=Static<typeof LedgerEntrySchema>;
export function parseLedger(text:string):{entries:LedgerEntry[];problems:string[]} {
 const entries:LedgerEntry[]=[],problems:string[]=[];
 text.split("\n").forEach((line,i)=>{
  if(line.trim()==="")return;
  let value:unknown;try{value=JSON.parse(line);}catch{problems.push(`line ${String(i+1)}: not JSON`);return;}
  if(Value.Check(LedgerEntrySchema,value))entries.push(value);else problems.push(`line ${String(i+1)}: not a ledger entry`);
 });
 return {entries,problems};
}

export const ApprovalSchema=Type.Object({experiment:Type.String({minLength:1}),sha256:Type.String({pattern:"^[0-9a-f]{64}$"}),approvedAt:Type.String({minLength:1}),approvedBy:Type.String({minLength:1}),
 // The main build the operator approved; trials run only on it. Older approvals fall back to source.commit.
 commit:Type.Optional(Type.String({pattern:"^[0-9a-f]{40}$"}))},closed);
export type Approval=Static<typeof ApprovalSchema>;
export interface RunnerPosition {readonly experiment:string;readonly trial:number}

export type TrialState="waiting"|"running"|"done"|"failed"|"interrupted";
export interface TrialProgress {readonly index:number;readonly arm:Arm;readonly state:TrialState;readonly run:string|null;readonly runs:readonly string[]}
export function trialProgress(experiment:Experiment,ledger:readonly LedgerEntry[],runner:RunnerPosition|null):TrialProgress[] {
 return trialOrder(experiment).map((arm,index)=>{
  const mine=ledger.filter(e=>e.trial===index),runs=mine.filter(e=>e.type==="launch").map(e=>e.run),run=runs.at(-1)??null;
  if(run===null)return {index,arm,state:"waiting",run,runs};
  const ended=mine.find(e=>e.run===run&&e.type!=="launch");
  const state:TrialState=ended?.type==="outcome"?"done":ended?.type==="launcher_error"?"failed":runner?.experiment===experiment.id&&runner.trial===index?"running":"interrupted";
  return {index,arm,state,run,runs};
 });
}

export type ExperimentState="discarded"|"pending"|"blocked"|"not-ready"|"draft"|"stale"|"approved"|"running"|"held"|"done";
export interface ExperimentStatus {readonly state:ExperimentState;readonly reason:string;readonly trials:readonly TrialProgress[];readonly completed:number}
// graded: result.json holds a comparison result (not only a grading problem).
export interface StatusInput {readonly experiment:Experiment;readonly approval:Approval|null;readonly ledger:readonly LedgerEntry[];readonly runner:RunnerPosition|null;readonly readiness:Readiness;readonly graded?:boolean}

export function readinessText(r:Readiness):string {
 return r.basis==="comparable"
  ? `${String(r.reached)} of the last ${String(r.window)} comparable runs reached ${r.milestone} (needs ${String(r.minReached)})`
  : `${String(r.reached)} of the last ${String(r.considered.length)} runs of any configuration reached ${r.milestone} (needs ${String(r.minReached)} of ${String(r.window)}; too few runs match the incumbent)`;
}

export function deriveStatus({experiment,approval,ledger,runner,readiness,graded=false}:StatusInput):ExperimentStatus {
 const trials=trialProgress(experiment,ledger,runner),completed=trials.filter(t=>t.state==="done").length,total=String(trials.length);
 const at=(state:ExperimentState,reason:string):ExperimentStatus=>({state,reason,trials,completed});
 if(experiment.discarded!==undefined)return at("discarded",experiment.discarded);
 if(experiment.blocked!==undefined)return at("blocked",experiment.blocked);
 if(completed===trials.length&&graded)return at("done",`all ${total} trials finished`);
 if(completed===trials.length&&(approval===null||approval.sha256!==definitionHash(experiment)))return at("stale","the definition changed after approval; it needs a new approval before its trials are graded");
 if(completed===trials.length)return at("held",`all ${total} trials finished; running the queue grades it`);
 if(runner?.experiment===experiment.id)return at("running",`trial ${String(runner.trial+1)} of ${total} running`);
 if(approval!==null&&approval.sha256!==definitionHash(experiment))return at("stale","the definition changed after approval; it needs a new approval");
 if(ledger.length>0&&approval===null)return at("stale","trials have started but there is no valid approval; it needs a new approval to resume");
 if(ledger.length>0)return at("held",`stopped after ${String(completed)} of ${total} trials; running the queue resumes it`);
 if(experiment.queuePosition===undefined)return at("pending",readiness.ready?`ready to queue: ${readinessText(readiness)}`:`not ready: ${readinessText(readiness)}`);
 if(!readiness.ready)return at("not-ready",`not ready: ${readinessText(readiness)}`);
 if(approval===null)return at("draft","queued; needs the operator's approval");
 return at("approved","approved; runs when it reaches the front of the queue");
}
