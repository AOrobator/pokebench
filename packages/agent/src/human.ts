// Human sessions share the ordinary durable run lifecycle, never the model loop.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ControlFile, RunControl, freezeGame } from "./run-control.js";
import type { RunRecorder } from "./recorder.js";
import type { RunEndReason } from "./events.js";
import type { RunPlan } from './run.js';
export function humanPlan(runsRoot:string,runId:string,port:number,romSha1:string):RunPlan {
 return {runsRoot,runId,port,controller:{kind:'human',name:'Operator',rom_sha1:romSha1,input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275},model:{id:'Human · Operator',context_window:0,max_tokens:0,vision:false},sampling:{thinking_level:'none',max_tokens:0},systemPrompt:'Human playthrough; no model inference.',tools:[],startState:{kind:'boot'},harnessFeatures:['human-play-v1','ram-state-v1','story-state-v1','story-milestones-v2','clock-milestone-v1','new-game-created-v1'],budgets:{},piVersion:'not-used'};
}
export function humanLease(runsRoot:string,runId:string):()=>void {
 mkdirSync(runsRoot,{recursive:true}); const path=join(runsRoot,'.human-gameplay.lock');
 mkdirSync(path);
 try {writeFileSync(join(path,'owner.json'),JSON.stringify({pid:process.pid,owner:'human-play',run:runId}),{flag:'wx'});} catch(error){rmSync(path,{recursive:true});throw error;}
 let released=false;return ()=>{if(!released){released=true;rmSync(path,{recursive:true});}};
}

export interface HumanLoop {
 readonly stopped:()=> boolean;
 readonly sample:()=> Promise<void>;
 readonly boundary:()=> Promise<void>;
 readonly wait:()=> Promise<void>;
}
export async function humanLoop(deps:HumanLoop):Promise<void> {
 while(!deps.stopped()) {
  await deps.boundary(); if(deps.stopped()) break;
  await deps.sample(); await deps.wait();
 }
}

export async function driveHuman(recorder:Pick<RunRecorder,"recordControl"|"checkMilestones">,url:string,path:string,signal:AbortSignal,fetchFn:typeof fetch=fetch):Promise<RunEndReason> {
 const abort=new AbortController();const onAbort=():void=>{abort.abort();};
 signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)abort.abort();
 const result:{reason:RunEndReason;error:unknown}={reason:"operator_abort",error:null};
 const file=new ControlFile(path);
 const control=new RunControl({record:body=>{recorder.recordControl(body);},freeze:paused=>freezeGame(url,paused,fetchFn),end:reason=>{result.reason=reason;abort.abort();},now:()=>Date.now(),poll:()=>file.poll()});
 const poll=():void=>{try{for(const request of file.poll())control.apply(request);if(file.problems.length>0)throw Error(file.problems.join("; "));}catch(error){result.error=error;abort.abort();}};
 const timer=setInterval(poll,100);
 try{
  await humanLoop({stopped:()=>abort.signal.aborted,boundary:async()=>{poll();await control.gate(abort.signal);if(control.takeStop()){result.reason="operator_stop";abort.abort();}},sample:()=>recorder.checkMilestones(),wait:()=>new Promise(resolve=>setTimeout(resolve,100))});
  if(result.error!==null)throw result.error instanceof Error ? result.error : new Error("human control polling failed",{cause:result.error});
  return result.reason;
 }finally{clearInterval(timer);signal.removeEventListener("abort",onAbort);}
}
