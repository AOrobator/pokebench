import {Worker} from "node:worker_threads";
import {parseCurrentQuery,parseCurrentAnswer,type CurrentQuery,type CurrentAnswer} from "./current-public.js";
export interface CurrentRequest {id:number;query:CurrentQuery}
export interface CurrentSourceRead {run:string;bytes:number;offset:number;purpose:"data"|"anchor"}
export interface CurrentWorkerLike {
 postMessage(request:CurrentRequest):void;
 on(event:"message",listener:(value:unknown)=>void):unknown;
 on(event:"error",listener:(error:Error)=>void):unknown;
 on(event:"exit",listener:(code:number)=>void):unknown;
 unref():void;terminate():Promise<number>;
}
export interface CurrentPool {query(query:CurrentQuery):Promise<CurrentAnswer>;close():Promise<void>}
export interface CurrentPoolOptions {runsRoot:string;database:string;spawn?:()=>CurrentWorkerLike;queueLimit?:number;timeoutMs?:number;onRead?:(value:CurrentSourceRead)=>void}
export class CurrentPoolError extends Error {override readonly name="CurrentPoolError";constructor(readonly status:number,message:string){super(message);}}
interface Job {request:CurrentRequest;resolve:(value:CurrentAnswer)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
export function createCurrentPool(options:CurrentPoolOptions):CurrentPool {
 const size=options.queueLimit??16,deadline=options.timeoutMs??5000;
 if(!Number.isSafeInteger(size)||size<1||size>16||!Number.isSafeInteger(deadline)||deadline<1||deadline>5000)throw new Error("Invalid current pool limits");
 let worker:CurrentWorkerLike|null=null,active:Job|null=null,closed=false,failed=false,id=0,termination:Promise<unknown>=Promise.resolve();const queue:Job[]=[];
 const retire=(reason:Error):void=>{failed=true;const owned=worker;worker=null;const jobs=[...queue.splice(0),...(active===null?[]:[active])];active=null;for(const job of jobs){clearTimeout(job.timer);job.reject(reason);}if(owned!==null)termination=owned.terminate().catch(()=>undefined);};
 const pump=():void=>{
  if(closed||failed||active!==null||queue.length===0)return;
  if(worker===null){
   try{worker=options.spawn?.()??new Worker(new URL("../dist/current-worker.js",import.meta.url),{workerData:{runsRoot:options.runsRoot,database:options.database,audit:options.onRead!==undefined}});worker.unref();}
   catch{retire(new CurrentPoolError(503,"Current worker unavailable"));return;}
   worker.on("message",(value:unknown)=>{
    if(worker===null||active===null)return;
    try{
     if(!object(value)||value["id"]!==active.request.id)throw new Error("identity");
     if(value["kind"]==="source-read"){
      const r=value["record"];if(!object(r)||typeof r["run"]!=="string"||r["run"]!==("run" in active.request.query?active.request.query.run:undefined)||active.request.query.kind!=="history"||!Number.isSafeInteger(r["bytes"])||Number(r["bytes"])<0||!Number.isSafeInteger(r["offset"])||Number(r["offset"])<0||(r["purpose"]!=="data"&&r["purpose"]!=="anchor"))throw new Error("audit");
      options.onRead?.(r as unknown as CurrentSourceRead);return;
     }
     const job=active;
     if("failure" in value){if(typeof value["failure"]!=="string"||value["failure"].length>1024||![400,409,413,503].includes(Number(value["status"])))throw new Error("failure");clearTimeout(job.timer);active=null;job.reject(new CurrentPoolError(Number(value["status"]),value["failure"]));}
     else{const answer=parseCurrentAnswer(value["answer"]);if(answer.kind!=="unavailable"&&answer.kind!==job.request.query.kind)throw new Error("kind");clearTimeout(job.timer);active=null;job.resolve(answer);}
     pump();
    }catch{retire(new CurrentPoolError(503,"Invalid current worker response"));}
   });
   worker.on("error",()=>{retire(new CurrentPoolError(503,"Current worker unavailable"));});
   worker.on("exit",()=>{if(worker!==null)retire(new CurrentPoolError(503,"Current worker unavailable"));});
  }
  const priority=queue.findIndex(job=>job.request.query.kind!=="history"),job=queue.splice(priority<0?0:priority,1)[0];if(job===undefined)return;active=job;
  try{worker.postMessage(job.request);}catch{retire(new CurrentPoolError(503,"Current worker unavailable"));}
 };
 return {query:async(value:CurrentQuery):Promise<CurrentAnswer>=>{
  let query:CurrentQuery;try{query=parseCurrentQuery(value);}catch{throw new CurrentPoolError(400,"Invalid current query");}
  if(closed||failed)throw new CurrentPoolError(503,"Current worker unavailable");if(queue.length+(active===null?0:1)>=size)throw new CurrentPoolError(503,"Current reader busy");
  if(query.kind==="history"&&queue.filter(job=>job.request.query.kind==="history").length>=2)throw new CurrentPoolError(503,"Current history reader busy");
  return new Promise<CurrentAnswer>((resolve,reject)=>{id++;const job:Job={request:{id,query},resolve,reject,timer:setTimeout(()=>{retire(new CurrentPoolError(503,"Current read timed out"));},deadline)};queue.push(job);pump();});
 },close:async()=>{if(!closed){closed=true;retire(new CurrentPoolError(503,"Current reader closed"));}await termination;}};
}
