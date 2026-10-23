import type {Message} from "@mariozechner/pi-ai";
import {CampaignController,digest,freezeBatch,type CampaignJob,type CampaignPhase} from "./roxanne-campaign.js";
import {maskIntervention,type ReminderReceipt} from "./roxanne-restore.js";
import type {RecoveryScore} from "./roxanne-score.js";

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
export interface EpisodeOutcome{readonly reason:string;readonly traceHash:string;readonly messages:readonly Message[];readonly reminder:ReminderReceipt|null;readonly nativeScore:RecoveryScore}
export interface EpisodeHost{
 now():number;
 acquire(endpoint:string):Promise<()=>Promise<void>>;
 /** Must honor the signal/deadline, record terminal evidence and return only after teardown. */
 episode(job:CampaignJob,signal:AbortSignal,deadline:number):Promise<EpisodeOutcome>;
 record(id:string,outcome:EpisodeOutcome):Promise<void>;
 grade(episodes:readonly {id:string;messages:readonly Message[];nativeScore:RecoveryScore;traceHash:string}[]):Promise<{hash:string;ids:readonly string[]}>;
 /** Injected clock timer: production deadline or fake clock; no polling inference. */
 deadline(at:number,abort:()=>void):()=>void;
}
/** No transport/discovery imports. A launch-capable host must be authorized separately. */
export async function runFrozenBatch(controller:CampaignController,phase:CampaignPhase,jobs:readonly CampaignJob[],host:EpisodeHost):Promise<void>{
 controller.freeze(freezeBatch(phase,jobs));const outcomes=new Map<string,EpisodeOutcome>();
 const endpoints=[...new Set(jobs.map(j=>j.endpoint))];let failed:Error|undefined;
 const settled=await Promise.allSettled(endpoints.map(async endpoint=>{
  const release=await host.acquire(endpoint);
  try{
   for(const job of jobs.filter(j=>j.endpoint===endpoint)){
    if(controller.state.stopped!==null)break;
    const signal=new AbortController();const start=host.now();controller.start(job.id,start);
    const cancel=host.deadline(start+job.capMs,()=> { signal.abort(); });
    try{const outcome=await host.episode(job,signal.signal,start+job.capMs);await host.record(job.id,outcome);controller.finish(job.id,host.now(),outcome.reason,outcome.traceHash);outcomes.set(job.id,outcome);}
    finally{cancel();}
   }
  }finally{await release();}
 }));
 for(const result of settled)if(result.status==="rejected"){failed=result.reason instanceof Error?result.reason:new Error("episode host rejected without an Error");break;}
 if(failed!==undefined){controller.stop(`incomplete frozen batch: ${failed.message}`);throw failed;}
 if(outcomes.size!==jobs.length){controller.stop("incomplete frozen batch");throw new Error("not all frozen episodes terminated");}
 // Treatment mapping never goes to the grader. Full originals were recorded above.
 const mapping=new Map<string,string>();const projected=jobs.map((job,i)=>{const id=`E${String(i+1).padStart(4,"0")}`;mapping.set(id,job.id);const o=outcomes.get(job.id);if(o===undefined)throw new Error("missing terminal trace");return {id,messages:maskIntervention(o.messages,o.reminder),nativeScore:o.nativeScore,traceHash:o.traceHash};});
 const grades=await host.grade(projected);
 if(grades.ids.length!==projected.length||new Set(grades.ids).size!==projected.length)throw new Error("incomplete blinded grading");
 controller.lockGrades(grades.hash,grades.ids.map(id=>{const source=mapping.get(id);if(source===undefined)throw new Error("unknown blinded episode");return source;}));
}
export interface DevelopmentResult{readonly candidate:Candidate;readonly family:string;readonly recovered:boolean;readonly baselineRecovered:boolean;readonly unchanged:number;readonly wins:number;readonly tokens:number;readonly factualError:boolean;readonly evidence:string;readonly diagnosis:Diagnosis}
export function selectParent(rows:readonly DevelopmentResult[]):Candidate|null{
 const ids=[...new Set(rows.map(r=>r.candidate.hash))];const groups=ids.map(hash=>rows.filter(r=>r.candidate.hash===hash));
 groups.sort((a,b)=>{
  const count=(rs:readonly DevelopmentResult[],f:(r:DevelopmentResult)=>number)=>rs.reduce((sum,r)=>sum+f(r),0);
  return count(b,r=>Number(r.recovered))-count(a,r=>Number(r.recovered))||count(a,r=>r.unchanged)-count(b,r=>r.unchanged)||count(b,r=>r.wins)-count(a,r=>r.wins)||count(a,r=>r.tokens)-count(b,r=>r.tokens)||(a[0]?.candidate.id??"").localeCompare(b[0]?.candidate.id??"");
 });return groups[0]?.[0]?.candidate??null;
}
export function nominatable(rows:readonly DevelopmentResult[],promptHash:string,families:readonly [string,string],replicated:boolean):boolean{
 const own=rows.filter(r=>r.candidate.hash===promptHash);if(!replicated||own.some(r=>r.factualError)||new Set(families).size!==2)return false;
 let lift=0;for(const family of families){const rs=own.filter(r=>r.family===family);if(rs.length===0||!rs.some(r=>r.recovered))return false;lift+=rs.reduce((s,r)=>s+Number(r.recovered)-Number(r.baselineRecovered),0)/rs.length;}
 return lift/2>=.25;
}
