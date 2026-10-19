import {createHash} from "node:crypto";
import {join} from "node:path";
import type {RunEvent} from "./events.js";
import {MILESTONES,REQUIRED_FRONTIER_MILESTONES} from "./milestones.js";
import type {RunStartMeta} from "./recorder.js";

export type CheckpointSelection={readonly kind:"single";readonly target:string}|{readonly kind:"frontier"};

export interface CheckpointDeps {
 readonly serverUrl:string;
 readonly dir:string;
 readonly libraryDir?:string;
 readonly fetch:(url:string,init?:{method?:string;headers?:Record<string,string>;body?:string})=>Promise<Response>;
 readonly write:(path:string,data:Buffer|string)=>void;
 readonly writeExclusive?: (path:string,data:string)=>void;
 readonly rename:(from:string,to:string)=>void;
}

const nativeMilestone=(name:string):boolean=>MILESTONES.some(m=>m.name===name&&m.kind!=="legacy");

// The original single-target setting remains valid. All-frontier capture is an
// explicit opt-in because pausing and writing a native state is measurement work.
export function checkpointSelection(env:NodeJS.ProcessEnv):CheckpointSelection|null {
 const target=env["POKEBENCH_CHECKPOINT_AT"],frontier=env["POKEBENCH_CHECKPOINT_FRONTIER"];
 if(frontier!==undefined&&frontier!==""&&frontier!=="1")throw new Error("POKEBENCH_CHECKPOINT_FRONTIER must be 1 when set");
 if(target!==undefined&&target!==""&&frontier==="1")throw new Error("choose one of POKEBENCH_CHECKPOINT_AT and POKEBENCH_CHECKPOINT_FRONTIER");
 if(target!==undefined&&target!==""){
  if(!nativeMilestone(target))throw new Error(`POKEBENCH_CHECKPOINT_AT must name a native milestone, got ${target}`);
  return {kind:"single",target};
 }
 return frontier==="1"?{kind:"frontier"}:null;
}

// Backwards-compatible accessor for callers that only support the original setting.
export function checkpointTarget(env:NodeJS.ProcessEnv):string|null {
 const selection=checkpointSelection(env);
 return selection?.kind==="single"?selection.target:null;
}

type MilestoneEvent=Extract<RunEvent,{type:"milestone"}>;
interface CaptureFailure {readonly milestone:string;readonly error:Error}
const frontier=new Set(REQUIRED_FRONTIER_MILESTONES);
const errorOf=(value:unknown):Error=>value instanceof Error?value:new Error(String(value));
const isExists=(value:unknown):boolean=>value instanceof Error&&"code" in value&&value.code==="EEXIST";

function source(meta:RunStartMeta):Record<string,unknown>{
 return {
  ...(meta.rom_sha1===undefined?{}:{rom_sha1:meta.rom_sha1}),
  model:meta.model,harness:meta.harness,vendor_pin:meta.vendor_pin,pi_version:meta.pi_version,
  start_state:meta.start_state,harness_features:[...meta.harness_features],
  ...(meta.evaluation?.features===undefined?{}:{evaluation_features:{...meta.evaluation.features}}),
 };
}

// Saves native states in milestone observation order. Captures use the first
// recorded observation and pause before asking the server for its native state;
// the server exposes no stronger emulator-wide stability certificate.
export class CheckpointCapture {
 private pending:Promise<void>=Promise.resolve();
 private readonly seen=new Set<string>();
 private readonly failures:CaptureFailure[]=[];
 private closed=false;
 constructor(private readonly selection:CheckpointSelection,private readonly deps:CheckpointDeps,private readonly start:RunStartMeta){}
 observe(event:RunEvent):void {
  if(this.closed||event.type!=="milestone"||event.origin==="present_at_start"||this.seen.has(event.name)||!this.selected(event.name))return;
  this.seen.add(event.name);
  this.pending=this.pending.then(()=>this.capture(event)).catch((value:unknown)=>{
   const error=errorOf(value);this.failures.push({milestone:event.name,error});this.recordFailure(event,error);
  });
 }
 async settled():Promise<void>{
  await this.pending;
  const first=this.failures[0];if(this.failures.length===1&&first!==undefined)throw first.error;
  if(this.failures.length>1)throw new Error(`${String(this.failures.length)} checkpoint captures failed: ${this.failures.map(f=>`${f.milestone}: ${f.error.message}`).join("; ")}`);
 }
 // After close, later milestones cannot start a capture. Call this only after
 // the recorder's final snapshot so a last native transition is not dropped.
 async close():Promise<void>{this.closed=true;await this.settled();}
 private selected(name:string):boolean{return this.selection.kind==="single"?name===this.selection.target:frontier.has(name);}
 private async post(path:string,body:unknown):Promise<Response>{return this.deps.fetch(`${this.deps.serverUrl}${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});}
 private metadata(event:MilestoneEvent,data:Buffer,sha1:string,sha256:string):Record<string,unknown>{
  return {version:1,run:event.run,milestone:event.name,milestone_event:{seq:event.seq,t:event.t,turn:event.turn,server_timestamp:event.server_timestamp,...(event.kind===undefined?{}:{kind:event.kind}),...(event.origin===undefined?{}:{origin:event.origin}),...(event.evidence===undefined?{}:{evidence:[...event.evidence]})},state:{sha1,sha256,bytes:data.length},source:source(this.start),capture:{basis:"first_observed_native_milestone",stability:"paused_after_recorded_observation"}};
 }
 private pair(dir:string,name:string,data:Buffer,meta:string):void{
  const state=join(dir,`${name}.state`),sidecar=join(dir,`${name}.json`);
  this.deps.write(`${state}.partial`,data);this.deps.write(`${sidecar}.partial`,meta);
  // Provenance publishes first. A failure can leave a harmless sidecar or partial state, never a usable state without provenance.
  this.deps.rename(`${sidecar}.partial`,sidecar);this.deps.rename(`${state}.partial`,state);
 }
 private promote(event:MilestoneEvent,data:Buffer,meta:string,sha1:string,sha256:string):void{
  if(this.selection.kind!=="frontier"||this.deps.libraryDir===undefined||this.deps.writeExclusive===undefined)return;
  const root=join(this.deps.libraryDir,event.name),relative=join("candidates",event.run),candidate=join(root,relative);
  this.pair(candidate,event.name,data,meta);
  const winner=JSON.stringify({version:1,milestone:event.name,run:event.run,candidate:relative,state:{sha1,sha256,bytes:data.length},milestone_seq:event.seq,observed_at:event.t});
  try {this.deps.writeExclusive(join(root,"first-arrival.json"),winner);} catch(error) {if(!isExists(error))throw error;}
 }
 private recordFailure(event:MilestoneEvent,error:Error):void{
  const path=join(this.deps.dir,`${event.name}.error.json`),partial=`${path}.partial`;
  try {this.deps.write(partial,JSON.stringify({version:1,run:event.run,milestone:event.name,milestone_seq:event.seq,observed_at:event.t,error:error.message}));this.deps.rename(partial,path);} catch { /* The rejection remains the authoritative surface when disk recording also fails. */ }
 }
 private async capture(event:MilestoneEvent):Promise<void>{
  try {
   const paused=await this.post("/pokebench/pause",{paused:true});if(!paused.ok)throw new Error(`pause request failed with HTTP ${String(paused.status)}; no checkpoint saved`);
   const reply=await this.post("/pokebench/checkpoint",{});if(!reply.ok)throw new Error(`checkpoint request failed with HTTP ${String(reply.status)}`);
   const body=await reply.json() as {state_base64?:unknown;sha1?:unknown;sha256?:unknown};
   if(typeof body.state_base64!=="string"||typeof body.sha1!=="string"||typeof body.sha256!=="string")throw new Error("checkpoint reply is missing its state or digests");
   const data=Buffer.from(body.state_base64,"base64");if(data.length===0||data.length>8*1024*1024)throw new Error("checkpoint state size is invalid");
   const sha1=createHash("sha1").update(data).digest("hex"),sha256=createHash("sha256").update(data).digest("hex");if(sha1!==body.sha1||sha256!==body.sha256)throw new Error("checkpoint digest does not match the returned state");
   const meta=JSON.stringify(this.metadata(event,data,sha1,sha256));this.pair(this.deps.dir,event.name,data,meta);this.promote(event,data,meta,sha1,sha256);
  } finally {await this.post("/pokebench/pause",{paused:false});}
 }
}
