// The winner gate (operator 2026-10-15): a finished experiment only nominates finalists. They and
// the incumbent then run from boot, and only a finalist that wins those finals becomes the
// incumbent for the experiments still queued. Pure logic and record schemas; the viewer runs it.
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {SWITCHABLE_FEATURES,dependencyProblems,stateOnlyProblems,type FeatureSet,type SwitchableFeature} from "./features.js";
import {MILESTONE_HINTS} from "./milestone-hint.js";
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

// Runs are ranked along the main story path, in the order the recorded human run earned it.
const MAIN_PATH=MILESTONE_HINTS.map(h=>h.name);
export interface RunOutcome {readonly reached:readonly string[];readonly milestoneMs:Readonly<Record<string,number>>}
export interface ArmRuns {readonly arm:string;readonly runs:readonly RunOutcome[]}

// How far along the main path a run got (-1: nowhere), and when it got there.
export function furthestIndex(run:RunOutcome):number {
 return run.reached.reduce((best,name)=>Math.max(best,MAIN_PATH.indexOf(name)),-1);
}
// One order for every run (operator 2026-10-15): the further main-path milestone wins; at the same
// milestone the earlier arrival wins. 1: a is better, -1: b is better, 0: a tie.
export function compareRuns(a:RunOutcome,b:RunOutcome):number {
 const fa=furthestIndex(a),fb=furthestIndex(b);
 if(fa!==fb)return fa>fb?1:-1;
 const name=MAIN_PATH[fa];
 const ta=name===undefined?undefined:a.milestoneMs[name],tb=name===undefined?undefined:b.milestoneMs[name];
 if(ta===undefined||tb===undefined||ta===tb)return 0;
 return ta<tb?1:-1;
}
export interface Superiority {readonly share:number;readonly wins:number;readonly ties:number;readonly pairs:number}
// Probability of superiority: over every (a, b) pair of runs, how often a's run is better, ties counting half.
export function superiority(a:readonly RunOutcome[],b:readonly RunOutcome[]):Superiority {
 let wins=0,ties=0;
 for(const x of a)for(const y of b){const c=compareRuns(x,y);if(c>0)wins+=1;else if(c===0)ties+=1;}
 const pairs=a.length*b.length;
 return {share:pairs===0?0.5:(wins+ties/2)/pairs,wins,ties,pairs};
}
// The "large effect" cutoff for the probability of superiority: about 46 of 64 pairs at 8 runs each.
export const WIN_SHARE=0.71;

export const RankSchema=Type.Object({arm:Type.String({minLength:1}),runs:Type.Integer({minimum:0}),reached:Type.Integer({minimum:0}),share:Type.Number({minimum:0,maximum:1})},{additionalProperties:false});
export type ArmRank=Static<typeof RankSchema>;
// Each arm's probability of superiority over the incumbent arm (0.5 for the incumbent itself),
// best first; equal shares keep the order given (simplest arm first). `reached` counts runs
// reaching the primary milestone, for display only.
export function rankArms(arms:readonly ArmRuns[],primary:string,incumbentArm:string):ArmRank[] {
 const base=arms.find(a=>a.arm===incumbentArm);
 if(base===undefined)throw new Error(`no incumbent arm ${incumbentArm} in the ranking`);
 const ranks=arms.map(({arm,runs})=>({arm,runs:runs.length,reached:runs.filter(r=>r.reached.includes(primary)).length,share:arm===incumbentArm?0.5:superiority(runs,base.runs).share}));
 return ranks.map((r,i)=>({r,i})).sort((a,b)=>b.r.share-a.r.share||a.i-b.i).map(x=>x.r);
}

// Finalists beat the incumbent arm in more than half their pairs, best first, at most three.
export function nominate(ranked:readonly ArmRank[],incumbentArm:string):string[] {
 return ranked.filter(r=>r.arm!==incumbentArm&&r.share>0.5).slice(0,MAX_FINALISTS).map(r=>r.arm);
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

// Finals never stop a run for lack of a milestone; every run plays the full wall limit
// (operator 2026-10-15 14:02 UTC: the stall stop would have cut a run that later chose a starter).
// Text-only replies get a supervisor note instead of ending the run (operator 2026-10-15 14:41 UTC).
export function finalsPreset(base:PlayPresetV2,experiment:string,arm:string,switches:Partial<Record<SwitchableFeature,boolean>>,config:FinalsConfig):PlayPresetV2 {
 const features:FeatureSet={...base.features,...switches,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":true};
 const problems=[...dependencyProblems(features),...stateOnlyProblems(features)];
 if(problems.length>0)throw new Error(`Invalid finals preset ${arm}: ${problems.join("; ")}`);
 return {version:2,sampling:base.sampling,id:`${experiment}-finals-${arm}`,target:config.target,limits:{maxTurns:FINALS_MAX_TURNS,maxWallMs:config.maxWallMs,failureLimit:base.limits.failureLimit},features};
}

export interface FinalsVerdict {readonly arm:string;readonly pass:boolean;readonly reasons:readonly string[];readonly share:number;readonly wins:number;readonly ties:number;readonly pairs:number}
export interface FinalsDecision {readonly winner:string|null;readonly verdicts:readonly FinalsVerdict[]}
export interface FinalsInput {readonly incumbent:readonly RunOutcome[];readonly finalists:readonly ArmRuns[]}

// A finalist passes when its runs from boot beat the incumbent's in at least WIN_SHARE of all
// pairs. The passing finalist with the highest share wins; equal shares go to nomination order.
export function decideFinals({incumbent,finalists}:FinalsInput):FinalsDecision {
 const verdicts=finalists.map(({arm,runs}):FinalsVerdict=>{
  const s=superiority(runs,incumbent),pass=s.pairs>0&&s.share>=WIN_SHARE;
  const reasons=pass?[]:[`better in ${String(s.wins)} and tied in ${String(s.ties)} of ${String(s.pairs)} pairs (${s.share.toFixed(2)}); a winner needs ${String(WIN_SHARE)}`];
  return {arm,pass,reasons,...s};
 });
 const best=verdicts.filter(v=>v.pass).reduce<FinalsVerdict|null>((top,v)=>top===null||v.share>top.share?v:top,null);
 return {winner:best?.arm??null,verdicts};
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
