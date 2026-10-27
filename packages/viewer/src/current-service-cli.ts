import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";
import {createCurrentProjector,type ProjectorOptions} from "./current-service.js";
import type {CurrentStore} from "./current-store.js";
interface LoopActor {step:()=>Promise<boolean>;close:()=>void;store:Pick<CurrentStore,"epoch"|"revision">}
export interface ServiceHost {factory?:(options:ProjectorOptions)=>LoopActor;wait?:(signal:AbortSignal)=>Promise<void>;report?:(value:{ready:true;epoch:string;revision:number})=>void}
export function currentServiceArgs(args:readonly string[]):{runsRoot:string;database:string;health:boolean}{let runsRoot:string|undefined,database:string|undefined,health=false;for(let i=0;i<args.length;i++){const arg=args[i];if(arg==="--health"){health=true;continue;}if(arg!=="--runs-root"&&arg!=="--database")throw new Error("Unknown snapshot service argument");const value=args[++i];if(value===undefined||value.length===0||value.startsWith("--"))throw new Error("Missing snapshot service path");if(arg==="--runs-root"){if(runsRoot!==undefined)throw new Error("Duplicate runs root");runsRoot=resolve(value);}else{if(database!==undefined)throw new Error("Duplicate database");database=resolve(value);}}if(runsRoot===undefined||database===undefined)throw new Error("Explicit --runs-root and --database are required");return {runsRoot,database,health};}
export async function runCurrentService(args:readonly string[],signal:AbortSignal,host:ServiceHost={}):Promise<void>{
 const aborted=():boolean=>signal.aborted;if(aborted())return;const options=currentServiceArgs(args),healthy=options.health?async(port:number,abort:AbortSignal):Promise<boolean>=>{const result=await fetch(`http://127.0.0.1:${String(port)}/health`,{signal:AbortSignal.any([abort,AbortSignal.timeout(1000)])});return result.ok;}:undefined;
 const actor=(host.factory??createCurrentProjector)({runsRoot:options.runsRoot,database:options.database,...(healthy===undefined?{}:{healthy})}),report=host.report??(value=>{process.stdout.write(JSON.stringify(value)+"\n");});
 try{report({ready:true,epoch:actor.store.epoch,revision:actor.store.revision()});while(!aborted()){await actor.step();report({ready:true,epoch:actor.store.epoch,revision:actor.store.revision()});try{await (host.wait??(async abort=>{await delay(100,undefined,{signal:abort});}))(signal);}catch(error){if(!aborted())throw error;}}}finally{actor.close();}
}
if(process.argv[1]!==undefined&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController(),stop=():void=>{controller.abort();};process.on("SIGTERM",stop);process.on("SIGINT",stop);
 void runCurrentService(process.argv.slice(2),controller.signal).catch((error:unknown)=>{process.stderr.write((error instanceof Error?error.message:"Snapshot service failed")+"\n");process.exitCode=1;}).finally(()=>{process.off("SIGTERM",stop);process.off("SIGINT",stop);});
}
