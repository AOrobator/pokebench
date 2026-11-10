import {createHash} from "node:crypto";
import {join} from "node:path";
import type {RunEvent} from "./events.js";
import type {TargetProof} from "./target-stop.js";

export const GAME_CLEAR="GAME_CLEAR_CONFIRMED";
export const FINAL_SAVE="GAME_CLEAR_FINAL";
const CREDITS="credits";

// game-clear-completion-v1. The game sets FLAG_SYS_GAME_CLEAR before the Hall of Fame screen writes its own save
// (hall_of_fame.c Task_Hof_TrySaveData); the credits start only after that (CB2_StartCreditsSequence). So the run
// is complete at the first credits state after this run observed the flag, not at the flag itself.
export class GameClearStop{
 private clear:number|null=null;proof:TargetProof|null=null;
 constructor(private readonly run:string,private readonly reached:(proof:TargetProof)=>void){}
 observe(event:RunEvent):void{
  if(event.run!==this.run||this.proof!==null)return;
  if(event.type==="milestone"){if(event.name===GAME_CLEAR&&event.origin==="observed")this.clear??=event.seq;return;}
  if(this.clear===null||event.type!=="state"||!("started" in event)||event.screen!==CREDITS)return;
  this.proof={name:GAME_CLEAR,milestone_seq:this.clear,state_evidence:[event.seq]};
  this.reached(this.proof);
 }
}

export interface FinalSaveDeps{
 readonly run:string;
 readonly serverUrl:string;
 readonly dir:string;
 readonly fetch:(url:string,init?:{method?:string;headers?:Record<string,string>;body?:string})=>Promise<Response>;
 readonly write:(path:string,data:Buffer|string)=>void;
 readonly rename:(from:string,to:string)=>void;
}

// One save-state of the finished game, beside the milestone checkpoints. Provenance publishes before the state,
// as CheckpointCapture does, so a failure never leaves a usable state without its record.
export async function saveFinalState(deps:FinalSaveDeps,proof:TargetProof):Promise<void>{
 const reply=await deps.fetch(`${deps.serverUrl}/pokebench/checkpoint`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 if(!reply.ok)throw new Error(`final save request failed with HTTP ${String(reply.status)}`);
 const body=await reply.json() as {state_base64?:unknown;sha1?:unknown;sha256?:unknown};
 if(typeof body.state_base64!=="string"||typeof body.sha1!=="string"||typeof body.sha256!=="string")throw new Error("final save reply is missing its state or digests");
 const data=Buffer.from(body.state_base64,"base64");if(data.length===0||data.length>8*1024*1024)throw new Error("final save state size is invalid");
 const sha1=createHash("sha1").update(data).digest("hex"),sha256=createHash("sha256").update(data).digest("hex");
 if(sha1!==body.sha1||sha256!==body.sha256)throw new Error("final save digest does not match the returned state");
 const meta=JSON.stringify({version:1,run:deps.run,save:FINAL_SAVE,proof:{...proof,state_evidence:[...proof.state_evidence]},state:{sha1,sha256,bytes:data.length},capture:{basis:"credits_after_observed_game_clear",stability:"saved_under_frame_loop_lock"}});
 const state=join(deps.dir,`${FINAL_SAVE}.state`),sidecar=join(deps.dir,`${FINAL_SAVE}.json`);
 deps.write(`${state}.partial`,data);deps.write(`${sidecar}.partial`,meta);
 deps.rename(`${sidecar}.partial`,sidecar);deps.rename(`${state}.partial`,state);
}

export interface GameClearRecorder{subscribe(observer:(event:RunEvent)=>void):void;setTargetProof(proof:TargetProof):void;checkpointFailure(error:unknown):void;}
export interface GameClearGovernor{readonly stopReason:string|null;stop(reason:"completed"):void;abort(reason:"budget"):void;}
export interface GameClearLifecycle{beforeRunEnd(hook:()=>Promise<void>):void;}

// The production wiring, exported so a test proves the switch's path: the proof, the final save and the
// completed end. A run already past its wall limit when the credits start ends on its budget, as a target does.
export function attachGameClearStop(recorder:GameClearRecorder,governor:GameClearGovernor,lifecycle:GameClearLifecycle,deps:FinalSaveDeps,overBudget:()=>boolean):GameClearStop{
 let save:Promise<void>=Promise.resolve();
 const stop=new GameClearStop(deps.run,proof=>{
  if(governor.stopReason!==null)return;
  if(overBudget()){governor.abort("budget");return;}
  save=saveFinalState(deps,proof).catch((error:unknown)=>{recorder.checkpointFailure(error);});
  recorder.setTargetProof(proof);
  governor.stop("completed");
 });
 recorder.subscribe(event=>{stop.observe(event);});
 lifecycle.beforeRunEnd(async()=>{await save;});
 return stop;
}
