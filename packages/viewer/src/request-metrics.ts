import type {RunEvent,RunEndReason} from "@pokebench/agent/events";

export interface RequestMetric {
 readonly run:string;readonly turn:number;readonly seq:number;readonly at:string;
 readonly promptMode:"full"|"jit"|"jit-v2"|"unrecorded";
 readonly screen:string;readonly stateSeq:number|null;
 readonly input:number;readonly cacheRead:number;readonly cacheWrite:number|null;readonly logicalInput:number|null;readonly recordedPromptTokens:number;readonly output:number;
 readonly ttftMs:number|null;readonly inferenceMs:number;readonly stopReason:string;
 readonly toolCalls:number;failedToolResults:number;
 readonly reasoningTokens:null;readonly prefillTokens:null;readonly correctAction:null;readonly usefulDecisionsPerSecond:null;readonly invalidToolCalls:null;
}
export interface IncompleteRequest {readonly turn:number;readonly reason:RunEndReason;readonly at:string;readonly seq:number}
export interface RequestMetricSeries {readonly run:string|null;readonly requests:RequestMetric[];readonly pendingTurn:number|null;readonly incompleteRequest:IncompleteRequest|null;readonly lastEventAt:string|null}
// Read-only projection of one recording. Rebuilding after a poll is idempotent;
// pending calls never become zero-valued completed samples. No gameplay or scheduling imports.
export function requestMetrics(events:readonly RunEvent[]):RequestMetricSeries {
 let run:string|null=null,pendingTurn:number|null=null,lastEventAt:string|null=null,screen="unknown",stateSeq:number|null=null;
 let incompleteRequest:IncompleteRequest|null=null;
 const requests:RequestMetric[]=[],byTurn=new Map<number,RequestMetric>(),turnScreens=new Map<number,{screen:string;seq:number|null}>();
 let lastSeq=-1;
 for(const event of events){
  if(run!==null&&event.run!==run)throw new Error("request metrics require one run identity");
  run=event.run;
  if(event.seq<=lastSeq)throw new Error("request metrics require increasing event sequence");
  lastSeq=event.seq;lastEventAt=event.t;
  if(event.type==="state"&&"screen" in event){screen=event.screen;stateSeq=event.seq;}
  if(event.type==="turn_start"){pendingTurn=event.turn;turnScreens.set(event.turn,{screen,seq:stateSeq});}
  if(event.type==="assistant"){
   const input=event.usage.input,cacheRead=event.usage.cache_read,cacheWrite=event.usage.cache_write??null;
   const before=turnScreens.get(event.turn);
   const metric:RequestMetric={run:event.run,turn:event.turn,seq:event.seq,at:event.t,promptMode:event.request_context?.mode??"unrecorded",screen:event.request_context?.scene??before?.screen??"unknown",stateSeq:event.request_context?.state_seq??before?.seq??null,input,cacheRead,cacheWrite,logicalInput:cacheWrite===null?null:input+cacheRead+cacheWrite,recordedPromptTokens:input+cacheRead+(cacheWrite??0),output:event.usage.output,ttftMs:event.ttft_ms,inferenceMs:event.latency_ms,stopReason:event.stop_reason,toolCalls:event.tool_calls.length,failedToolResults:0,reasoningTokens:null,prefillTokens:null,correctAction:null,usefulDecisionsPerSecond:null,invalidToolCalls:null};
   requests.push(metric);byTurn.set(event.turn,metric);
   if(pendingTurn===event.turn)pendingTurn=null;
  }
  if(event.type==="tool_result"&&event.is_error){const request=byTurn.get(event.turn);if(request!==undefined)request.failedToolResults++;}
  if(event.type==="run_end"&&pendingTurn!==null){
   incompleteRequest={turn:pendingTurn,reason:event.reason,at:event.t,seq:event.seq};
   pendingTurn=null;
  }
 }
 return {run,requests,pendingTurn,incompleteRequest,lastEventAt};
}
