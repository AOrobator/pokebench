// Pure argv construction for the owned game-server launcher. Keeping this
// separate makes save-state forwarding provable without spawning gameplay.
export function gameServerLauncherArgs(
  python:string,runDir:string,runId:string,port:number,loadState?:string,
):string[]{
  return [python,"-m","pokebench_env.launcher","--run-dir",runDir,"--run-id",runId,"--port",String(port),...(loadState===undefined?[]:["--load-state",loadState])];
}

/** Resolve only this continuation's recorded launcher group. A reused or foreign
 * PID is refused before a signal can be sent; null command means it already exited. */
export function ownedCampaignServerGroup(runDir:string,runId:string,receipt:unknown,command:string|null):number|null{
 if(typeof receipt!=="object"||receipt===null||!("pid"in receipt)||!("runId"in receipt)||!("port"in receipt)||typeof receipt.pid!=="number"||!Number.isSafeInteger(receipt.pid)||receipt.pid<=1||receipt.runId!==runId||typeof receipt.port!=="number"||!Number.isInteger(receipt.port)||receipt.port<1024||receipt.port>65535)throw new Error("invalid owned campaign server receipt");
 if(command===null)return null;
 if(!command.includes(`-m pokebench_env.launcher --run-dir ${runDir} --run-id ${runId} --port ${String(receipt.port)}`))throw new Error("campaign server PID belongs to a different process");
 return -receipt.pid;
}

/** A healthy response is insufficient when some other run already owns the port. */
export function verifyCampaignListenerGroups(group:number|undefined,listeners:readonly number[]):void{
 if(group===undefined||!Number.isSafeInteger(group)||group<=1||listeners.length===0||listeners.some(p=>p!==group))throw new Error("campaign game port is owned by a different process group");
}
