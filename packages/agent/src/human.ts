// Human sessions share the ordinary durable run lifecycle, never the model loop.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ControlFile, RunControl, freezeGame } from "./run-control.js";
import type { RunRecorder } from "./recorder.js";
import { HUMAN_BUTTONS, RUN_ID_PATTERN, type HumanButton, type RunEndReason, type BodyOf } from "./events.js";
import { parseGameState, type GameStateSnapshot } from "./game-state.js";
import { HUMAN_GAMEPLAY_LEASE_NAME, newRunId, type RunPlan } from './run.js';
export function humanRunId(assigned:string|undefined,now:Date,random:()=>string):string {
 if(assigned!==undefined){if(!new RegExp(RUN_ID_PATTERN).test(assigned))throw new Error('invalid human run id');return assigned;}
 return newRunId(now,'human',random);
}
export function humanPlan(runsRoot:string,runId:string,port:number,romSha1:string):RunPlan {
 return {runsRoot,runId,port,controller:{kind:'human',name:'Operator',rom_sha1:romSha1,input_policy:'frame-held-v1',sample_ms:100,screenshot_ms:500,nominal_fps:59.7275},model:{id:'Human · Operator',context_window:0,max_tokens:0,vision:false},sampling:{thinking_level:'none',max_tokens:0},systemPrompt:'Human playthrough; no model inference.',tools:[],startState:{kind:'boot'},harnessFeatures:['human-play-v1','human-audio-1x-v1','ram-state-v1','story-state-v1','story-milestones-v2','clock-milestone-v1','new-game-created-v1','rustboro-gym-trainer-milestones-v1','native-progress-activity-v1','post-clock-navigation-milestones-v1'],budgets:{},piVersion:'not-used'};
}
export function humanLease(runsRoot:string,runId:string):()=>void {
 mkdirSync(runsRoot,{recursive:true}); const path=join(runsRoot,HUMAN_GAMEPLAY_LEASE_NAME);
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

export async function driveHuman(recorder:Pick<RunRecorder,"recordControl"|"checkMilestones"> & Partial<HumanRecording>,url:string,path:string,signal:AbortSignal,fetchFn:typeof fetch=fetch,internalToken?:string):Promise<RunEndReason> {
 const abort=new AbortController();const onAbort=():void=>{abort.abort();};
 signal.addEventListener("abort",onAbort,{once:true});if(signal.aborted)abort.abort();
 const result:{reason:RunEndReason;error:unknown}={reason:"operator_abort",error:null};
 const file=new ControlFile(path);
 if(internalToken!==undefined&&(recorder.recordHumanInput===undefined||recorder.recordHumanSample===undefined))throw Error("Human recording methods are required");
 const sample:(forceScreenshot?:boolean)=>Promise<void>=internalToken===undefined?()=>recorder.checkMilestones():humanSampler(recorder as HumanRecording,url,internalToken,fetchFn);
 let pauseRequest=0;let resumeRequest=0;
 const requests=():ReturnType<ControlFile["poll"]>=>{
  const pending=file.poll();
  for(const request of pending){if(request.action==="pause")pauseRequest=request.seq;if(request.action==="resume")resumeRequest=request.seq;}
  return pending;
 };
 // Human time excludes a pause only after the real emulator confirms its freeze.
 // Abort before RunControl.gate can turn a rejected freeze into an applied pause.
 const freeze=async(paused:boolean):Promise<void>=>{
  try{await freezeGame(url,paused,fetchFn);}catch(error){
   result.error=error;abort.abort();
   recorder.recordControl({action:paused?"pause":"resume",status:"failed",request:paused?pauseRequest:resumeRequest});
   throw error;
  }
 };
 const control=new RunControl({record:body=>{recorder.recordControl(body);},freeze,end:reason=>{result.reason=reason;abort.abort();},now:()=>Date.now(),poll:requests});
 const poll=():void=>{try{for(const request of requests())control.apply(request);if(file.problems.length>0)throw Error(file.problems.join("; "));}catch(error){result.error=error;abort.abort();}};
 const timer=setInterval(poll,100);
 try{
  await humanLoop({stopped:()=>abort.signal.aborted,boundary:async()=>{poll();await control.gate(abort.signal);if(control.takeStop()){result.reason="operator_stop";abort.abort();}},sample,wait:()=>new Promise(resolve=>setTimeout(resolve,100))});
  if(result.error!==null)throw result.error instanceof Error ? result.error : new Error("human control polling failed",{cause:result.error});
  if(internalToken!==undefined){await freezeGame(url,true,fetchFn);await sample(true);}
  return result.reason;
 }catch(error){
  if(internalToken!==undefined)await freezeGame(url,true,fetchFn).catch(()=>{});
  throw error;
 }finally{clearInterval(timer);signal.removeEventListener("abort",onAbort);}
}


type HumanSegment=Omit<BodyOf<"human_input">,"type"|"turn">;
export interface HumanRecording {
 recordHumanInput(body:HumanSegment):void;
 recordHumanSample(frame:number,paused:boolean,pngBase64:string,state:GameStateSnapshot,forceScreenshot?:boolean):void;
}
function object(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function integer(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}

/** The server only prunes on the NEXT request carrying a durably committed cursor. */
export function humanSampler(recorder:HumanRecording,url:string,token:string,fetchFn:typeof fetch=fetch):(forceScreenshot?:boolean)=>Promise<void> {
 let cursor=0;let frame=-1;let wall=-1;
 return async(forceScreenshot=false)=>{
  const response=await fetchFn(`${url}/pokebench/human/snapshot?after=${String(cursor)}`,{headers:{"x-human-token":token},signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error(`Human snapshot failed (${String(response.status)})`);
  const payload:unknown=await response.json();
  if(!object(payload)||!integer(payload.frame)||payload.frame<frame||typeof payload.paused!=="boolean"||typeof payload.failed!=="boolean"||!integer(payload.last_id)||!Array.isArray(payload.segments)||!object(payload.observation))throw Error("Invalid or regressing human snapshot");
  if(payload.failed)throw Error("Human input controller failed; recording stopped");
  const observation=payload.observation;
  if(typeof observation.screenshot_base64!=="string"||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(observation.screenshot_base64))throw Error("Human snapshot has no valid PNG");
  const state=parseGameState(observation.state);
  let next=cursor;let nextFrame=frame;let nextWall=wall;
  const segments:HumanSegment[]=[];
  for(const raw of payload.segments){
   if(!object(raw)||!integer(raw.id)||raw.id!==next+1||!integer(raw.start_frame)||!integer(raw.end_frame)||raw.end_frame<=raw.start_frame||raw.end_frame>payload.frame||raw.start_frame!==Math.max(0,nextFrame)||!integer(raw.start_ms)||!integer(raw.end_ms)||raw.end_ms<raw.start_ms||raw.start_ms<nextWall||!integer(raw.request_seq)||typeof raw.session!=="string"||raw.session.length===0||!Array.isArray(raw.buttons)||!raw.buttons.every((button:unknown)=>typeof button==="string"&&(HUMAN_BUTTONS as readonly string[]).includes(button))||new Set(raw.buttons).size!==raw.buttons.length)throw Error("Invalid human input journal interval");
   const segment:HumanSegment={id:raw.id,start_frame:raw.start_frame,end_frame:raw.end_frame,start_ms:raw.start_ms,end_ms:raw.end_ms,buttons:raw.buttons as HumanButton[],request_seq:raw.request_seq,session:raw.session};
   segments.push(segment);next=raw.id;nextFrame=raw.end_frame;nextWall=raw.end_ms;
  }
  if(payload.last_id!==next||Math.max(0,nextFrame)!==payload.frame)throw Error("Human journal cursor does not cover snapshot");
  for(const segment of segments)recorder.recordHumanInput(segment);
  recorder.recordHumanSample(payload.frame,payload.paused,observation.screenshot_base64,state,forceScreenshot);
  cursor=next;frame=payload.frame;wall=nextWall;
 };
}
