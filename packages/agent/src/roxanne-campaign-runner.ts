import {easternTimestamp} from "./run-log.js";
import {randomUUID} from "node:crypto";
import type {Message} from "@mariozechner/pi-ai";
import {CampaignController,digest,freezeBatch,type CampaignJob,type CampaignPhase} from "./roxanne-campaign.js";
import {maskIntervention,type ReminderReceipt} from "./roxanne-restore.js";
import {scoreRecovery,scoreReadiness,recoveryFrames,type RecoveryScore,type RecoveryFrame} from "./roxanne-score.js";
import {checkEvent,type RunEvent} from "./events.js";

export const INITIAL_PROMPTS={
 a:"Your goal is to make story progress. Compare the party you have now with the party that started the last battle you lost: Pokémon, levels, evolution and known moves. Restoring HP after a full-health loss does not change those capabilities. Any earlier strategy you proposed is your own plan and may be revised. Use the observed evidence to choose your next strategy and act on it.",
 b:"After a loss, use observed facts to decide whether you need different capabilities before another attempt. If you choose preparation, choose a concrete goal and carry it through across turns; check the game's actual results before deciding you are ready to return. Use actions supported by your current location and tool instructions. You choose the strategy, destination and actions.",
} as const;
export interface Candidate{readonly id:string;readonly text:string;readonly parent:string|null;readonly hash:string;readonly evidence:readonly string[]}
export const candidate=(id:string,text:string,parent:string|null=null,evidence:readonly string[]=[]):Candidate=>({id,text,parent,hash:digest(text),evidence});
export type Diagnosis="invalid_action"|"unsupported_fact"|"abandonment"|"none";
const revisions:Readonly<Record<Exclude<Diagnosis,"none">,string>>={invalid_action:"Before each action, check that its target and parameters are supported on your current map; a destination elsewhere does not make a current-map tool act there.",unsupported_fact:"Separate facts shown in this run from guesses. Check uncertain preparation assumptions using available game observations before committing to them.",abandonment:"Keep track of your chosen preparation goal and the capability actually gained. Reconsider the goal when observations contradict it, rather than abandoning it merely because the gym is available."};
export function revise(parent:Candidate,diagnosis:Diagnosis,evidence:readonly string[]):Candidate{
 if(parent.parent!==null||diagnosis==="none"||evidence.length===0)throw new Error("one evidenced revision round only");
 return candidate(`${parent.id}-r1`,`${parent.text}\n\n${revisions[diagnosis]}`,parent.id,evidence);
}
export type EpisodeTrace={readonly kind:"native";readonly events:readonly RunEvent[];readonly startSeq:number;readonly startedAtMs:number}|{readonly kind:"fixture";readonly frames:readonly RecoveryFrame[]};
export interface EpisodeOutcome{readonly trace:EpisodeTrace;readonly reason:string;readonly traceHash:string;readonly messages:readonly Message[];readonly reminder:ReminderReceipt|null;readonly nativeScore:RecoveryScore;readonly readinessPassed?:boolean}
export interface BlindJudgment{readonly id:string;readonly diagnosis:Diagnosis;readonly factualError:boolean;readonly verified:boolean;readonly tokens:number;readonly evidence:readonly string[]}
export const gradeDigest=(ids:readonly string[],judgments:readonly BlindJudgment[]=[]):string=>digest({ids:[...ids].sort(),judgments:[...judgments].sort((a,b)=>a.id.localeCompare(b.id))});
export interface EpisodeHost{
 readonly mode:"measured"|"offline-fixture";
 now():number;
 acquire(endpoint:string):Promise<()=>Promise<void>>;
 /** Must honor the signal/deadline, record terminal evidence and return only after teardown. */
 episode(job:CampaignJob,signal:AbortSignal,deadline:number):Promise<EpisodeOutcome>;
 record(id:string,outcome:EpisodeOutcome):Promise<void>;
 grade(episodes:readonly {id:string;messages:readonly Message[];nativeScore:RecoveryScore;traceHash:string;trace:EpisodeTrace}[]):Promise<{hash:string;ids:readonly string[];judgments?:readonly BlindJudgment[]}>;
 /** Injected clock timer: production deadline or fake clock; no polling inference. */
 deadline(at:number,abort:()=>void):()=>void;
}
/** Hash the original behavioral evidence, including model messages; recompute scores independently. */
export const episodeTraceHash=(outcome:Pick<EpisodeOutcome,"reason"|"messages"|"reminder"|"trace">):string=>digest({reason:outcome.reason,messages:outcome.messages,reminder:outcome.reminder,trace:outcome.trace});
export function verifyEpisodeOutcome(job:CampaignJob,outcome:EpisodeOutcome,mode:EpisodeHost["mode"]):void{
 if(mode==="measured"&&outcome.trace.kind!=="native")throw new Error("measured episode requires native trace evidence");
 const frames=outcome.trace.kind==="native"?recoveryFrames(outcome.trace.events.map(checkEvent),outcome.trace.startSeq,outcome.trace.startedAtMs):outcome.trace.frames;
 const score=scoreRecovery(frames,{turns:job.capMs===600_000?70:210,ms:job.capMs});
 if(outcome.traceHash!==episodeTraceHash(outcome)||digest(score)!==digest(outcome.nativeScore)||job.capMs===600_000&&outcome.readinessPassed!==scoreReadiness(frames))throw new Error("trace hash or independently recomputed score mismatch");
 if(job.arm==="baseline"?outcome.reminder!==null:outcome.reminder?.sha256!==job.promptHash)throw new Error("delivered reminder does not match frozen arm");
}
/** Grading is behavioral: prompt/context/usage telemetry stays only in the original record. */
function anonymousMessages(messages:readonly Message[],receipt:ReminderReceipt|null):readonly Message[]{
 return maskIntervention(messages,receipt).map(m=>m.role!=="assistant"?{...m,timestamp:0}:{...m,timestamp:0,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
}
function anonymousTrace(trace:EpisodeTrace,id:string):EpisodeTrace{
 if(trace.kind==="fixture")return trace;
 return {...trace,startedAtMs:0,events:trace.events.filter(e=>e.type!=="run_start").map(event=>{
  const e={...event,run:id,t:easternTimestamp(new Date(Date.parse(event.t)-trace.startedAtMs))};
  switch(e.type){
   case "turn_start":return {...e,context:{messages:0,images:0,est_tokens:0}};
   case "assistant":{const behavior={...e};delete behavior.request_context;return {...behavior,usage:{input:0,output:0,cache_read:0},latency_ms:0,ttft_ms:null};}
   case "compaction":return {...e,from_tokens:0,to_tokens:0};
   case "run_end":return {...e,tokens:{input:0,output:0},wall_ms:0};
   default:return e;
  }
 })};
}
/** No transport/discovery imports. A launch-capable host must be authorized separately. */
function assertActive(controller:CampaignController):void{if(controller.state.stopped!==null)throw new Error(controller.state.stopped);}
export async function runFrozenBatch(controller:CampaignController,phase:CampaignPhase,jobs:readonly CampaignJob[],host:EpisodeHost):Promise<{outcomes:ReadonlyMap<string,EpisodeOutcome>;judgments:ReadonlyMap<string,BlindJudgment>}>{
 controller.freeze(freezeBatch(phase,jobs));const outcomes=new Map<string,EpisodeOutcome>();
 const endpoints=[...new Set(jobs.map(j=>j.endpoint))];let failed:Error|undefined;const active=new Set<AbortController>();
 const settled=await Promise.allSettled(endpoints.map(async endpoint=>{
  try{
   for(const job of jobs.filter(j=>j.endpoint===endpoint)){
    if(controller.state.stopped!==null)break;
    const release=await host.acquire(endpoint);
    let released=false;const signal=new AbortController();let cancel:()=>void=()=>undefined;
    try{
     active.add(signal);const start=host.now();controller.start(job.id,start);
     cancel=host.deadline(start+job.capMs,()=> { signal.abort(); });
     let outcome:EpisodeOutcome;
     try{outcome=await host.episode(job,signal.signal,start+job.capMs);await host.record(job.id,outcome);}
     finally{released=true;await release();}
     controller.finish(job.id,host.now(),outcome.reason,episodeTraceHash(outcome));
     verifyEpisodeOutcome(job,outcome,host.mode);outcomes.set(job.id,outcome);
     assertActive(controller);
    }finally{active.delete(signal);cancel();if(!released)await release();}
   }
  }catch(error){controller.stop(error instanceof Error?error.message:"episode host failed");for(const owned of active)owned.abort();throw error;}
 }));
 for(const result of settled)if(result.status==="rejected"){failed=result.reason instanceof Error?result.reason:new Error("episode host rejected without an Error");break;}
 if(failed!==undefined){controller.stop(`incomplete frozen batch: ${failed.message}`);throw failed;}
 if(outcomes.size!==jobs.length){controller.stop("incomplete frozen batch");throw new Error("not all frozen episodes terminated");}
 // Treatment mapping never goes to the grader. Full originals were recorded above.
 const mapping=new Map<string,string>();const projected=jobs.map(job=>{const id=`E${randomUUID()}`;mapping.set(id,job.id);const o=outcomes.get(job.id);if(o===undefined)throw new Error("missing terminal trace");const view={messages:anonymousMessages(o.messages,o.reminder),nativeScore:o.nativeScore,trace:anonymousTrace(o.trace,id)};return {id,...view,traceHash:digest(view)};});
 projected.sort((a,b)=>a.id.localeCompare(b.id));
 controller.bindBlinding(Object.fromEntries(mapping));
 const grades=await host.grade(projected);
 if(grades.ids.length!==projected.length||new Set(grades.ids).size!==projected.length)throw new Error("incomplete blinded grading");
 const judgments=new Map<string,BlindJudgment>();for(const judgment of grades.judgments??[]){const id=mapping.get(judgment.id);if(id===undefined||judgments.has(id))throw new Error("invalid blinded judgment identity");judgments.set(id,judgment);}
 if(grades.hash!==gradeDigest(grades.ids,grades.judgments))throw new Error("grade lock digest does not match actual judgments");
 controller.lockGrades(grades.hash,grades.ids.map(id=>{const source=mapping.get(id);if(source===undefined)throw new Error("unknown blinded episode");return source;}));
 return {outcomes,judgments};
}
export interface DevelopmentResult{readonly candidate:Candidate;readonly family:string;readonly recovered:boolean;readonly baselineRecovered:boolean;readonly unchanged:number;readonly wins:number;readonly tokens:number;readonly factualError:boolean;readonly evidence:string;readonly diagnosis:Diagnosis}
export function selectParent(rows:readonly DevelopmentResult[]):Candidate|null{
 const ids=[...new Set(rows.map(r=>r.candidate.hash))];const groups=ids.map(hash=>rows.filter(r=>r.candidate.hash===hash));
 groups.sort((a,b)=>{
  const mean=(rs:readonly DevelopmentResult[],f:(r:DevelopmentResult)=>number)=>{const families=[...new Set(rs.map(r=>r.family))];return families.reduce((s,k)=>{const group=rs.filter(r=>r.family===k);return s+group.reduce((sum,r)=>sum+f(r),0)/group.length;},0)/families.length;};
  return mean(b,r=>Number(r.recovered))-mean(a,r=>Number(r.recovered))||mean(a,r=>r.unchanged)-mean(b,r=>r.unchanged)||mean(b,r=>r.wins)-mean(a,r=>r.wins)||mean(a,r=>r.tokens)-mean(b,r=>r.tokens)||(a[0]?.candidate.id??"").localeCompare(b[0]?.candidate.id??"");
 });return groups[0]?.[0]?.candidate??null;
}
export function nominatable(rows:readonly DevelopmentResult[],promptHash:string,families:readonly [string,string],replicated:boolean):boolean{
 const own=rows.filter(r=>r.candidate.hash===promptHash);if(!replicated||own.some(r=>r.factualError)||new Set(families).size!==2)return false;
 let lift=0;for(const family of families){const rs=own.filter(r=>r.family===family);if(rs.length===0||!rs.some(r=>r.recovered))return false;lift+=rs.reduce((s,r)=>s+Number(r.recovered)-Number(r.baselineRecovered),0)/rs.length;}
 return lift/2>=.25;
}
