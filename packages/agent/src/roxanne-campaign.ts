import {createHash} from "node:crypto";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
const closed={additionalProperties:false};
const name=Type.String({pattern:"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"});
const hash=Type.String({pattern:"^[a-f0-9]{64}$"});
const ms=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
export const PHASES=["explore","revise","replicate","validate","controls"] as const;
export type CampaignPhase=typeof PHASES[number];
export const PHASE_CAPS:Readonly<Record<CampaignPhase,number>>={explore:10_800_000,revise:7_200_000,replicate:3_600_000,validate:28_800_000,controls:4_800_000};
export const CAMPAIGN_CAP_MS=57_600_000;
export const CAMPAIGN_EPISODE_CAP=38;
const JobSchema=Type.Object({id:name,arm:name,family:name,endpoint:name,capMs:Type.Integer({minimum:1,maximum:1_800_000}),promptHash:hash,restoreHash:hash},closed);
export type CampaignJob=Static<typeof JobSchema>;
const BatchSchema=Type.Object({phase:Type.Enum(PHASES),jobs:Type.Array(JobSchema,{minItems:1,maxItems:16}),hash},closed);
export type FrozenBatch=Static<typeof BatchSchema>;
const TrackedJobSchema=Type.Object({...JobSchema.properties,phase:Type.Enum(PHASES),status:Type.Enum(["pending","running","complete"] as const),startedAt:Type.Union([ms,Type.Null()]),finishedAt:Type.Union([ms,Type.Null()]),reason:Type.Union([Type.String({minLength:1}),Type.Null()]),traceHash:Type.Union([hash,Type.Null()])},closed);
const StateSchema=Type.Object({version:Type.Literal(1),id:name,revision:Type.Integer({minimum:0}),startedAt:Type.Number({minimum:0}),priorGpuMs:Type.Integer({minimum:0,maximum:CAMPAIGN_CAP_MS}),priorEpisodes:Type.Integer({minimum:0,maximum:CAMPAIGN_EPISODE_CAP}),spentMs:ms,reservedMs:ms,contingencySpentMs:Type.Integer({minimum:0,maximum:2_400_000}),batches:Type.Array(Type.Object({phase:Type.Enum(PHASES),hash,jobIds:Type.Array(name,{minItems:1,maxItems:16}),gradeHash:Type.Union([hash,Type.Null()]),blindMap:Type.Union([Type.Record(name,name),Type.Null()])},closed),{maxItems:5}),jobs:Type.Array(TrackedJobSchema,{maxItems:36}),stopped:Type.Union([Type.String({minLength:1}),Type.Null()])},closed);
export type CampaignState=Static<typeof StateSchema>;
export const digest=(value:unknown):string=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createCampaign(id:string,startedAt:number,prior:{readonly gpuMs:number;readonly episodes:number}={gpuMs:0,episodes:0}):CampaignState{return parseState({version:1,id,revision:0,startedAt,priorGpuMs:prior.gpuMs,priorEpisodes:prior.episodes,spentMs:prior.gpuMs,reservedMs:0,contingencySpentMs:0,batches:[],jobs:[],stopped:null});}
export function parseState(value:unknown):CampaignState{if(!Value.Check(StateSchema,value))throw new Error("invalid campaign state");return structuredClone(value);}
export interface CampaignStore{read():CampaignState;commit(expectedRevision:number,next:CampaignState):void}
export class MemoryCampaignStore implements CampaignStore{
 constructor(private value:CampaignState){}
 read():CampaignState{return structuredClone(this.value);}
 commit(expectedRevision:number,next:CampaignState):void{if(this.value.revision!==expectedRevision)throw new Error("campaign revision changed");this.value=parseState(next);}
}
export function freezeBatch(phase:CampaignPhase,jobs:readonly CampaignJob[]):FrozenBatch{
 const body={phase,jobs:structuredClone(jobs)};const batch={...body,hash:digest(body)};if(!Value.Check(BatchSchema,batch))throw new Error("invalid frozen batch");return batch;
}
export class CampaignController{
 private current:CampaignState;
 constructor(private readonly store:CampaignStore){this.current=store.read();this.audit();}
 get state():CampaignState{return structuredClone(this.current);}
 private change(update:(next:CampaignState)=>void):void{const next=this.state;update(next);next.revision++;parseState(next);this.store.commit(this.current.revision,next);this.current=next;this.audit();}
 private audit():void{
  parseState(this.current);
  if(this.current.priorEpisodes+this.current.jobs.length>CAMPAIGN_EPISODE_CAP)throw new Error("campaign episode accounting mismatch");
  const ids=new Set<string>(),running=new Set<string>();
  for(const j of this.current.jobs){
   if(ids.has(j.id))throw new Error("duplicate durable episode");ids.add(j.id);
   if(j.status==="pending"&&(j.startedAt!==null||j.finishedAt!==null||j.reason!==null||j.traceHash!==null)||j.status==="running"&&(j.startedAt===null||j.finishedAt!==null||j.reason!==null||j.traceHash!==null)||j.status==="complete"&&(j.startedAt===null||j.finishedAt===null||j.finishedAt<j.startedAt||j.reason===null||j.traceHash===null))throw new Error("inconsistent durable episode outcome");
   if(j.status==="running"){if(running.has(j.endpoint))throw new Error("duplicate durable endpoint occupancy");running.add(j.endpoint);}
  }
  const batched=new Set<string>();
  for(const [i,b]of this.current.batches.entries()){
   const jobs=b.jobIds.map(id=>{const j=this.current.jobs.find(j=>j.id===id);if(j===undefined||j.phase!==b.phase||batched.has(id))throw new Error("invalid durable batch membership");batched.add(id);return j;});
   const frozen=jobs.map(({id,arm,family,endpoint,capMs,promptHash,restoreHash})=>({id,arm,family,endpoint,capMs,promptHash,restoreHash}));
   if(PHASES[i]!==b.phase||freezeBatch(b.phase,frozen).hash!==b.hash||i<this.current.batches.length-1&&b.gradeHash===null)throw new Error("durable frozen batch changed");
   if(b.blindMap!==null&&(digest(Object.values(b.blindMap).sort())!==digest([...b.jobIds].sort())||jobs.some(j=>j.status!=="complete")))throw new Error("invalid durable blind map");
   if(b.gradeHash!==null&&b.blindMap===null)throw new Error("durable grade has no blind map");
  }
  if(batched.size!==this.current.jobs.length)throw new Error("unbatched durable episode");
  const pending=this.current.jobs.filter(j=>j.status!=="complete").reduce((sum,j)=>sum+j.capMs,0);
  const spent=this.current.jobs.reduce((sum,j)=>sum+(j.status==="complete"?(j.finishedAt??0)-(j.startedAt??0):0),0);
  if(pending!==this.current.reservedMs||spent+this.current.priorGpuMs!==this.current.spentMs||(this.current.spentMs+this.current.reservedMs+this.current.contingencySpentMs>CAMPAIGN_CAP_MS&&this.current.stopped===null))throw new Error("campaign accounting mismatch");
 }
 resume():void{if(this.current.jobs.some(j=>j.status==="running"))throw new Error("uncertain running episode: reconcile recorded outcome; never resample");}
 freeze(batch:FrozenBatch):void{
  if(this.current.stopped!==null)throw new Error("campaign stopped");
  const expected=freezeBatch(batch.phase,batch.jobs);if(expected.hash!==batch.hash)throw new Error("frozen batch hash mismatch");
  const limit=({explore:6,revise:4,replicate:2,validate:16,controls:8} as const)[batch.phase];
  const last=this.current.batches.at(-1);if(last!==undefined&&last.gradeHash===null)throw new Error("previous frozen batch has no locked grades");
  if(PHASES[this.current.batches.length]!==batch.phase||batch.jobs.length>limit)throw new Error("phase order or episode count exceeds plan");
  if(new Set(batch.jobs.map(j=>j.id)).size!==batch.jobs.length||batch.jobs.some(j=>this.current.jobs.some(old=>old.id===j.id)))throw new Error("duplicate episode identity");
  if(batch.jobs.some(j=>j.capMs>(batch.phase==="controls"?600_000:1_800_000))||batch.jobs.reduce((sum,j)=>sum+j.capMs,0)>PHASE_CAPS[batch.phase])throw new Error("batch exceeds protected phase budget");
  if(this.current.priorEpisodes+this.current.jobs.length+batch.jobs.length>CAMPAIGN_EPISODE_CAP)throw new Error("remaining episode budget insufficient for the complete phase");
  if(this.current.spentMs+this.current.reservedMs+this.current.contingencySpentMs+batch.jobs.reduce((sum,j)=>sum+j.capMs,0)>CAMPAIGN_CAP_MS)throw new Error("remaining campaign budget insufficient for the complete phase");
  this.change(next=>{next.batches.push({phase:batch.phase,hash:batch.hash,jobIds:batch.jobs.map(j=>j.id),gradeHash:null,blindMap:null});for(const j of batch.jobs)next.jobs.push({...j,phase:batch.phase,status:"pending",startedAt:null,finishedAt:null,reason:null,traceHash:null});next.reservedMs+=batch.jobs.reduce((sum,j)=>sum+j.capMs,0);});
 }
 start(id:string,at:number):void{
  const j=this.current.jobs.find(j=>j.id===id);if(this.current.stopped!==null||j?.status!=="pending"||!Number.isSafeInteger(at)||at<0)throw new Error("episode not startable");
  if(this.current.jobs.some(old=>old.status==="running"&&old.endpoint===j.endpoint))throw new Error("endpoint already occupied");
  this.change(next=>{const job=next.jobs.find(j=>j.id===id);if(job!==undefined){job.status="running";job.startedAt=at;}});
 }
 finish(id:string,at:number,reason:string,traceHash:string):void{
  const j=this.current.jobs.find(j=>j.id===id);if(j?.status!=="running"||j.startedAt===null||!Number.isSafeInteger(at)||at<j.startedAt||!reason||!/^[a-f0-9]{64}$/.test(traceHash))throw new Error("invalid or over-budget episode outcome");
  this.change(next=>{const job=next.jobs.find(j=>j.id===id);if(job!==undefined){job.status="complete";job.finishedAt=at;job.reason=reason;job.traceHash=traceHash;next.spentMs+=at-(job.startedAt??0);next.reservedMs-=job.capMs;if(at-(job.startedAt??0)>job.capMs)next.stopped="episode occupancy exceeded frozen cap";}});
 }
 bindBlinding(mapping:Readonly<Record<string,string>>):void{
  const batch=this.current.batches.at(-1);if(batch===undefined||batch.blindMap!==null||this.current.jobs.some(j=>batch.jobIds.includes(j.id)&&j.status!=="complete")||Object.keys(mapping).length!==batch.jobIds.length||new Set(Object.values(mapping)).size!==batch.jobIds.length||digest(Object.values(mapping).sort())!==digest([...batch.jobIds].sort()))throw new Error("blinding requires every completed episode exactly once");
  this.change(next=>{const b=next.batches.at(-1);if(b!==undefined)b.blindMap={...mapping};});
 }
 lockGrades(hash:string,jobIds:readonly string[]):void{
  const batch=this.current.batches.at(-1);if(batch===undefined||batch.gradeHash!==null||batch.blindMap===null||!/^[a-f0-9]{64}$/.test(hash)||digest([...jobIds].sort())!==digest([...batch.jobIds].sort())||this.current.jobs.some(j=>batch.jobIds.includes(j.id)&&j.status!=="complete"))throw new Error("grades require the entire completed frozen batch");
  this.change(next=>{const b=next.batches.at(-1);if(b!==undefined)b.gradeHash=hash;});
 }
 stop(reason:string):void{if(!reason)throw new Error("stop reason required");this.change(next=>{next.stopped=reason;});}
}
/** Frozen pseudo-random order; no random decisions after outcomes exist. */
export function makeTargetValidation(arm:string,promptHash:string,families:readonly [string,string],endpoints:readonly [string,string],restores:readonly [string,string],seed:number):CampaignJob[]{
 if(new Set(families).size!==2||new Set(endpoints).size!==2||!Number.isSafeInteger(seed))throw new Error("two distinct heldout families/endpoints required");
 let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};const jobs:CampaignJob[]=[];
 for(const [i,family]of families.entries())for(const endpoint of endpoints){const arms=["baseline","baseline",arm,arm];for(let n=arms.length-1;n>0;n--){const k=Math.floor(random()*(n+1));[arms[n],arms[k]]=[arms[k]??"baseline",arms[n]??"baseline"];}
  for(const a of arms)jobs.push({id:`heldout-${String(jobs.length+1)}`,arm:a,family,endpoint,capMs:1_800_000,promptHash:a==="baseline"?digest(""):promptHash,restoreHash:restores[i]??""});
 }
 return jobs;
}
