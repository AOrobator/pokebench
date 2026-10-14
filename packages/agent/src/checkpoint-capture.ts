import {createHash} from "node:crypto";
import {join} from "node:path";
import type {RunEvent} from "./events.js";
import {MILESTONES} from "./milestones.js";

export interface CheckpointDeps {
 readonly serverUrl:string;
 readonly dir:string;
 readonly fetch:(url:string,init?:{method?:string;headers?:Record<string,string>;body?:string})=>Promise<Response>;
 readonly write:(path:string,data:Buffer|string)=>void;
 readonly rename:(from:string,to:string)=>void;
}

// The native milestone at which a run saves its state, from POKEBENCH_CHECKPOINT_AT.
export function checkpointTarget(env:NodeJS.ProcessEnv):string|null {
 const value=env["POKEBENCH_CHECKPOINT_AT"];
 if(value===undefined||value==="")return null;
 if(!MILESTONES.some(m=>m.name===value&&m.kind!=="legacy"))throw new Error(`POKEBENCH_CHECKPOINT_AT must name a native milestone, got ${value}`);
 return value;
}

// Saves a native state the first time the target milestone is observed in this run.
export class CheckpointCapture {
 private pending:Promise<void>=Promise.resolve();
 private done=false;
 private closed=false;
 constructor(private readonly target:string,private readonly deps:CheckpointDeps){}
 observe(event:RunEvent):void {
  if(this.done||this.closed||event.type!=="milestone"||event.name!==this.target||event.origin==="present_at_start")return;
  this.done=true;
  this.pending=this.capture(event.run,event.seq,event.turn);
 }
 settled():Promise<void>{return this.pending;}
 // After close, later milestones (for example in the final snapshot while the server stops) start no capture.
 close():Promise<void>{this.closed=true;return this.pending;}
 private async post(path:string,body:unknown):Promise<Response>{
  return this.deps.fetch(`${this.deps.serverUrl}${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 }
 private async capture(run:string,seq:number,turn:number):Promise<void>{
  try {
   const paused=await this.post("/pokebench/pause",{paused:true});
   if(!paused.ok)throw new Error(`pause request failed with HTTP ${String(paused.status)}; no checkpoint saved`);
   const reply=await this.post("/pokebench/checkpoint",{});
   if(!reply.ok)throw new Error(`checkpoint request failed with HTTP ${String(reply.status)}`);
   const body=await reply.json() as {state_base64?:unknown;sha1?:unknown;sha256?:unknown};
   if(typeof body.state_base64!=="string"||typeof body.sha1!=="string"||typeof body.sha256!=="string")throw new Error("checkpoint reply is missing its state or digests");
   const data=Buffer.from(body.state_base64,"base64");
   const sha1=createHash("sha1").update(data).digest("hex"),sha256=createHash("sha256").update(data).digest("hex");
   if(sha1!==body.sha1||sha256!==body.sha256)throw new Error("checkpoint digest does not match the returned state");
   const state=join(this.deps.dir,`${this.target}.state`),meta=join(this.deps.dir,`${this.target}.json`);
   // Both files are written under temporary names first, so a failure never leaves a state without provenance.
   this.deps.write(`${state}.partial`,data);
   this.deps.write(`${meta}.partial`,JSON.stringify({run,milestone:this.target,milestone_seq:seq,turn,sha1,sha256,bytes:data.length}));
   this.deps.rename(`${meta}.partial`,meta);
   this.deps.rename(`${state}.partial`,state);
  } finally {
   await this.post("/pokebench/pause",{paused:false});
  }
 }
}
