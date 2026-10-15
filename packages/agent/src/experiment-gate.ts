// The winner gate (operator 2026-10-15): a finished experiment only nominates finalists. They and
// the incumbent then run from boot, and only a finalist that wins those finals becomes the
// incumbent for the experiments still queued. Pure logic and record schemas; the viewer runs it.
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {SWITCHABLE_FEATURES,dependencyProblems,stateOnlyProblems,type FeatureSet,type SwitchableFeature} from "./features.js";
import {MILESTONES} from "./milestones.js";
import {PlayPresetV2Schema,parsePlayPreset,type PlayPresetV2} from "./play-preset.js";
import type {Experiment} from "./experiments.js";

export interface FinalsConfig {readonly runsPerArm:number;readonly maxWallMs:number;readonly target:string|null}
// Operator 2026-10-15: "we'll give the full run 45 minutes"; 8 runs each. Experiments may shorten them.
export const DEFAULT_FINALS:FinalsConfig={runsPerArm:8,maxWallMs:45*60_000,target:null};
// High enough that the wall limit or the stop milestone ends a finals run, never the turn count.
export const FINALS_MAX_TURNS=20_000;
export const MAX_FINALISTS=3;

export function finalsConfig(experiment:Experiment):FinalsConfig {
 const f=experiment.finals;
 return {runsPerArm:f?.runsPerArm??DEFAULT_FINALS.runsPerArm,maxWallMs:f?.maxWallMs??DEFAULT_FINALS.maxWallMs,target:f?.target??DEFAULT_FINALS.target};
}

const ORDER=MILESTONES.filter(m=>m.kind!=="legacy").map(m=>m.name);
export interface RunOutcome {readonly reached:readonly string[];readonly milestoneMs:Readonly<Record<string,number>>}
export interface ArmRuns {readonly arm:string;readonly runs:readonly RunOutcome[]}

export function furthestIndex(run:RunOutcome):number {
 return run.reached.reduce((best,name)=>Math.max(best,ORDER.indexOf(name)),-1);
}
function median(values:readonly number[]):number|null {
 if(values.length===0)return null;
 const s=[...values].sort((a,b)=>a-b),mid=Math.floor(s.length/2);
 return s.length%2===1?(s[mid]??0):((s[mid-1]??0)+(s[mid]??0))/2;
}

export const RankSchema=Type.Object({arm:Type.String({minLength:1}),runs:Type.Integer({minimum:0}),reached:Type.Integer({minimum:0}),medianFurthest:Type.Number(),medianPrimaryMs:Type.Union([Type.Number(),Type.Null()])},{additionalProperties:false});
export type ArmRank=Static<typeof RankSchema>;
// The chain's predeclared ranking (pick_best.py), generalized: most runs reaching the primary
// milestone, then the furthest median native milestone, then the fastest median time to the
// primary among runs that reached it, then the order given (simplest arm first).
export function rankArms(arms:readonly ArmRuns[],primary:string):ArmRank[] {
 const ranks=arms.map(({arm,runs})=>({arm,runs:runs.length,reached:runs.filter(r=>r.reached.includes(primary)).length,
  medianFurthest:median(runs.map(furthestIndex))??-1,medianPrimaryMs:median(runs.flatMap(r=>{const ms=r.milestoneMs[primary];return ms===undefined?[]:[ms];}))}));
 const slow=(r:ArmRank):number=>r.medianPrimaryMs??Number.POSITIVE_INFINITY;
 return ranks.map((r,i)=>({r,i})).sort((a,b)=>b.r.reached-a.r.reached||b.r.medianFurthest-a.r.medianFurthest||slow(a.r)-slow(b.r)||a.i-b.i).map(x=>x.r);
}

// Finalists are the arms ranked above the incumbent arm, at most three (operator 2026-10-15).
export function nominate(ranked:readonly ArmRank[],incumbentArm:string):string[] {
 const at=ranked.findIndex(r=>r.arm===incumbentArm);
 if(at<0)throw new Error(`no incumbent arm ${incumbentArm} in the ranking`);
 return ranked.slice(0,at).slice(0,MAX_FINALISTS).map(r=>r.arm);
}

// Williams-balanced rows (each arm once per row, each first equally often); two arms give ABBA.
export function finalsOrder(arms:readonly string[],perArm:number):string[] {
 const n=arms.length,first=Array.from({length:n},(_,i)=>i%2===0?i/2:n-(i+1)/2);
 const rows=Array.from({length:n},(_,r)=>first.map(x=>(x+r)%n));
 const all=n%2===0?rows:[...rows,...rows.map(row=>[...row].reverse())];
 return Array.from({length:perArm},(_,b)=>(all[b%all.length]??[]).map(i=>arms[i]??"")).flat();
}

// The finals still to run: the balanced order with the first `reused` incumbent slots taken by
// recorded runs that already match the finals incumbent (operator 2026-10-15: reuse them).
export function finalsPlan(arms:readonly string[],perArm:number,reused:number):string[] {
 let skip=Math.min(reused,perArm);
 return finalsOrder(arms,perArm).filter(arm=>arm!=="incumbent"||skip--<=0);
}

// Every finals arm ends a run after 10 minutes without a new milestone (operator 2026-10-15).
export function finalsPreset(base:PlayPresetV2,experiment:string,arm:string,switches:Partial<Record<SwitchableFeature,boolean>>,config:FinalsConfig):PlayPresetV2 {
 const features:FeatureSet={...base.features,...switches,"milestone-stall-stop-v1":true};
 const problems=[...dependencyProblems(features),...stateOnlyProblems(features)];
 if(problems.length>0)throw new Error(`Invalid finals preset ${arm}: ${problems.join("; ")}`);
 return {version:2,sampling:base.sampling,id:`${experiment}-finals-${arm}`,target:config.target,limits:{maxTurns:FINALS_MAX_TURNS,maxWallMs:config.maxWallMs,failureLimit:base.limits.failureLimit},features};
}

export interface FinalsVerdict {readonly arm:string;readonly pass:boolean;readonly reasons:readonly string[];readonly medianFurthest:number;readonly medianMs:number|null}
export interface FinalsDecision {readonly winner:string|null;readonly incumbent:{readonly medianFurthest:number;readonly medianMs:number|null};readonly verdicts:readonly FinalsVerdict[]}
export interface FinalsInput {readonly incumbent:readonly RunOutcome[];readonly finalists:readonly ArmRuns[];readonly speedMarginPercent:number;readonly completionTolerance:number}

// A finalist passes when it reaches further at the median, or the same milestone at least
// speedMarginPercent faster, and no milestone up to the incumbent's median furthest is reached
// in fewer runs than the incumbent's count minus completionTolerance. The best passing finalist,
// in nomination order, wins.
export function decideFinals({incumbent,finalists,speedMarginPercent,completionTolerance}:FinalsInput):FinalsDecision {
 const furthestOf=(runs:readonly RunOutcome[]):number=>median(runs.map(furthestIndex))??-1;
 const msTo=(runs:readonly RunOutcome[],index:number):number|null=>{const name=ORDER[Math.floor(index)];return name===undefined?null:median(runs.flatMap(r=>{const ms=r.milestoneMs[name];return ms===undefined?[]:[ms];}));};
 const base=furthestOf(incumbent),baseMs=msTo(incumbent,base);
 const count=(runs:readonly RunOutcome[],name:string):number=>runs.filter(r=>r.reached.includes(name)).length;
 const verdicts=finalists.map(({arm,runs}):FinalsVerdict=>{
  const furthest=furthestOf(runs),ms=furthest===base?msTo(runs,furthest):null,reasons:string[]=[];
  const further=furthest>base,faster=furthest===base&&base>=0&&ms!==null&&baseMs!==null&&ms<=baseMs*(1-speedMarginPercent/100);
  if(!further&&!faster)reasons.push(`not further and not ${String(speedMarginPercent)}% faster than the incumbent`);
  for(const name of ORDER.slice(0,Math.floor(base)+1)){
   const theirs=count(runs,name),ours=count(incumbent,name);
   if(theirs<ours-completionTolerance)reasons.push(`reached ${name} in ${String(theirs)} of ${String(runs.length)} runs; the incumbent did in ${String(ours)}`);
  }
  return {arm,pass:reasons.length===0,reasons,medianFurthest:furthest,medianMs:ms};
 });
 return {winner:verdicts.find(v=>v.pass)?.arm??null,incumbent:{medianFurthest:base,medianMs:baseMs},verdicts};
}

export const PromotionSchema=Type.Object({id:Type.String({minLength:1}),from:Type.String({minLength:1}),arm:Type.String({minLength:1}),features:Type.Record(Type.String(),Type.Boolean()),at:Type.String({minLength:1}),finals:Type.Array(Type.String())},{additionalProperties:false});
export type Promotion=Static<typeof PromotionSchema>;

// A declared winner's switches become every unstarted experiment's incumbent. The definition hash
// stays the file as written, so approvals carry over. An experiment testing a switch the winner
// decided is superseded instead of having its arms change underneath its approval.
export function withPromotion(experiment:Experiment,promotion:Promotion|null):{experiment:Experiment;superseded:string|null} {
 if(promotion===null)return {experiment,superseded:null};
 if(experiment.changedFeature in promotion.features)return {experiment,superseded:`${experiment.changedFeature} was decided by the ${promotion.from} finals (now ${promotion.features[experiment.changedFeature]===true?"on":"off"} in the incumbent); discard this experiment or redefine it`};
 const switches=Object.fromEntries(Object.entries(promotion.features).filter(([id])=>(SWITCHABLE_FEATURES as readonly string[]).includes(id)));
 return {experiment:{...experiment,incumbent:{...experiment.incumbent,features:{...experiment.incumbent.features,...switches}}},superseded:null};
}

const FinalistSchema=Type.Object({arm:Type.String({pattern:"^[a-z0-9][a-z0-9-]{0,40}$"}),switches:Type.Record(Type.String(),Type.Boolean())},{additionalProperties:false});
const FinalsConfigSchema=Type.Object({runsPerArm:Type.Integer({minimum:1}),maxWallMs:Type.Integer({minimum:1}),target:Type.Union([Type.String({minLength:1}),Type.Null()])},{additionalProperties:false});
export const NominationSchema=Type.Object({experiment:Type.String({minLength:1}),source:Type.Enum(["queue","cohort"] as const),cohort:Type.Optional(Type.String({minLength:1})),at:Type.String({minLength:1}),
 // The finals incumbent: boot start and finals limits already applied.
 incumbent:PlayPresetV2Schema,finals:FinalsConfigSchema,ranking:Type.Array(RankSchema),
 // Recorded runs of the finals incumbent counted toward its runs instead of running them again.
 reusedIncumbent:Type.Array(Type.String({minLength:1})),finalists:Type.Array(FinalistSchema,{maxItems:MAX_FINALISTS}),reason:Type.String()},{additionalProperties:false});
export type Nomination=Omit<Static<typeof NominationSchema>,"incumbent">&{readonly incumbent:PlayPresetV2};
export function parseNomination(value:unknown):Nomination {
 if(!Value.Check(NominationSchema,value)){const [first]=Value.Errors(NominationSchema,value);throw new Error(`Invalid nomination: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);}
 for(const f of value.finalists){
  if(f.arm==="incumbent")throw new Error("Invalid nomination: a finalist cannot be named incumbent");
  const unknown=Object.keys(f.switches).filter(id=>!(SWITCHABLE_FEATURES as readonly string[]).includes(id));
  if(unknown.length>0)throw new Error(`Invalid nomination: ${f.arm} names ${unknown.join(", ")}, not a switch in this build`);
 }
 return {...value,incumbent:parsePlayPreset(value.incumbent) as PlayPresetV2};
}

const arm=Type.String({minLength:1});
export const FinalsEntrySchema=Type.Union([
 Type.Object({type:Type.Literal("launch"),trial:Type.Integer({minimum:0}),arm,run:Type.String({minLength:1}),at:Type.String(),model:Type.String({minLength:1}),commit:Type.String({pattern:"^[0-9a-f]{40}$"})},{additionalProperties:false}),
 Type.Object({type:Type.Literal("outcome"),trial:Type.Integer({minimum:0}),arm,run:Type.String({minLength:1}),at:Type.String(),reason:Type.String()},{additionalProperties:false}),
 Type.Object({type:Type.Literal("launcher_error"),trial:Type.Integer({minimum:0}),arm,run:Type.String({minLength:1}),at:Type.String(),message:Type.String()},{additionalProperties:false}),
]);
export type FinalsEntry=Static<typeof FinalsEntrySchema>;
function lines<T>(text:string,check:(v:unknown)=>v is T,what:string):{items:T[];problems:string[]} {
 const items:T[]=[],problems:string[]=[];
 text.split("\n").forEach((line,i)=>{
  if(line.trim()==="")return;
  let value:unknown;try{value=JSON.parse(line);}catch{problems.push(`line ${String(i+1)}: not JSON`);return;}
  if(check(value))items.push(value);else problems.push(`line ${String(i+1)}: not a ${what}`);
 });
 return {items,problems};
}
export function parseFinalsLedger(text:string):{entries:FinalsEntry[];problems:string[]} {
 const {items,problems}=lines(text,(v):v is FinalsEntry=>Value.Check(FinalsEntrySchema,v),"finals entry");
 return {entries:items,problems};
}
export function parsePromotions(text:string):{promotions:Promotion[];problems:string[]} {
 const {items,problems}=lines(text,(v):v is Promotion=>Value.Check(PromotionSchema,v),"promotion");
 return {promotions:items,problems};
}
