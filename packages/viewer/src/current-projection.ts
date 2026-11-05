import type {CurrentState} from "./current-state.js";
import {currentView} from "./current-state.js";
import type {CurrentSource} from "./current-store.js";
import type {ProjectorAux} from "./current-service.js";
import type {CurrentSnapshot,CurrentSummary} from "./current-public.js";
import {configuration} from "./run-config.js";
function pick<T extends object,K extends keyof T>(value:T,keys:readonly K[]):Pick<T,K>{return Object.fromEntries(keys.map(key=>[key,value[key]])) as Pick<T,K>; }
export interface CurrentPublication {summary:string;detail:string;started:number;ended:number|null}
export function publishCurrent(s:CurrentState,source:CurrentSource,revision:number,aux:ProjectorAux):CurrentPublication{
 if(s.start===null)throw new Error("Current projection requires header");const v=currentView(s),header={...s.start,system_prompt:""},clockAt=Math.max(s.at,aux.observedAt),tools=Object.values(s.openTools),end=s.end;
 const ended=end===null?null:s.warning===null?Date.parse(end.t):aux.observedAt;
 const elapsed=aux.complete&&v.startMs!==null?Math.max(0,(end===null?clockAt:s.at)-v.startMs-v.control.pausedMs(end===null?clockAt:s.at)):null;
 const config=configuration(header);if(aux.complete&&s.control.maxWallMs!==null)config.extendedWallMs=s.control.maxWallMs;
 const summary:CurrentSummary={version:1,id:s.run,generation:source.generation,revision,seq:s.seq,at:s.at,clockAt,updatedAt:aux.updatedAt,observedAt:aux.observedAt,complete:aux.complete,header,
 run:{id:s.run,cohort:null,arm:header.evaluation?.experiment?.arm??null,experiment:header.evaluation?.experiment??null,model:header.controller?.kind==="human"?`Human · ${header.controller.name}`:header.model.id,started:header.t,status:end!==null?"ended":aux.health.enabled&&(!aux.health.owner||aux.health.ok===false)?"unresponsive":aux.complete&&s.control.state==="paused"?"paused":"live",reason:end?.reason??null,problem:aux.problem,excluded:null,elapsedMs:elapsed,turn:s.turn,config,splits:[],...(s.warning===null?{}:{clockWarning:s.warning}),card:v.cardState===null?null:{name:v.cardState.name,location:v.cardState.location,party:v.partyMembers.flatMap(m=>m.level===null||m.level<1?[]:[{speciesId:m.species_id??null,level:m.level,egg:m.is_egg===true}])}},
 endedAt:ended,totals:aux.complete?pick(s.totals,["input","output","retries","modelErrors","toolErrors","compactions","requests","latencyMs"]):null,control:aux.complete?pick(s.control,["state","pausedMs","pauseAt","maxWallMs","maxTurns","lastExtensionRequest","emulatorFrozen"]):null,context:{estimated:s.context.estimated===null?null:pick(s.context.estimated,["tokens","turn","seq","at"]),measured:s.context.measured===null?null:pick(s.context.measured,["tokens","turn","seq","at"])},retry:s.retry===null?null:pick(s.retry,["count","attempt","limit"]),warning:s.warning,problem:aux.problem,
 phase:{kind:end!==null?"ended":s.seq===0?"indexing":aux.complete&&s.control.state==="paused"?"paused":tools.length>0?"tool":s.requestAt!==null?"thinking":"idle",pending:tools.length,tools:tools.slice(0,16).map(t=>t.name)},health:pick(aux.health,["enabled","owner","ok","checkedAt"]),
 progress:{validation:"unverified",recorded:s.milestones.map(m=>({name:m.name,seq:m.seq,turn:m.turn,at:Date.parse(m.t),native:m.origin==="observed"&&m.evidence!==undefined}))}};
 const detail:CurrentSnapshot={...summary,end,display:{state:s.state,...(s.partyState!==null&&s.partyState.seq===s.state?.seq?{partyState:null,partyIsState:true as const}:{partyState:s.partyState}),card:s.card===null?null:pick(s.card,["name","location","party"]),health:s.health===null?null:pick(s.health,["source","party","slots"]),frame:s.frame,thought:s.thought,streaming:s.streaming,thinkingSince:s.requestAt}},compact=JSON.stringify(summary),full=JSON.stringify(detail);
 if(Buffer.byteLength(compact)>65536||Buffer.byteLength(full)>8*1024*1024)throw new Error("Current public display exceeds size bound");return {summary:compact,detail:full,started:Date.parse(header.t),ended};
}
