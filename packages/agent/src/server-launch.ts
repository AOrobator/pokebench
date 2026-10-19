// Pure argv construction for the owned game-server launcher. Keeping this
// separate makes save-state forwarding provable without spawning gameplay.
export function gameServerLauncherArgs(
  python:string,runDir:string,runId:string,port:number,loadState?:string,
):string[]{
  return [python,"-m","pokebench_env.launcher","--run-dir",runDir,"--run-id",runId,"--port",String(port),...(loadState===undefined?[]:["--load-state",loadState])];
}
