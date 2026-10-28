import {existsSync,readdirSync,realpathSync,lstatSync,mkdirSync} from "node:fs";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {setImmediate as yieldImmediate} from "node:timers/promises";
import {performance} from "node:perf_hooks";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {RUN_ID_PATTERN} from "@pokebench/agent/events";
import {emptyCurrent,foldCurrent,type CurrentState} from "./current-state.js";
import {openCurrentStore,type SavedCurrent,type HistoryOffset} from "./current-store.js";
import {CurrentSourceFile,openCurrentSource,currentRunDirectory,lineCursor,readCurrentLines,prefixSignature,sourceEvidence,SourceBudgetError,type LineCursor,type CurrentLine} from "./current-source.js";
import {newDigest,parseDigest,updateDigest,finishDigest,checkpointDigest} from "./current-digest.js";
import {RUN_LOG_MAX_BYTES} from "./run-log.js";
const N=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER}),closed={additionalProperties:false};
const Prefix=Type.Object({signature:Type.String(),offset:N,seq:N,ms:N,done:Type.Boolean(),digest:Type.Object({h:Type.Array(Type.Integer({minimum:0,maximum:0xffffffff}),{minItems:8,maxItems:8}),tail:Type.Array(N,{maxItems:0}),bytes:N},closed)},closed);
const Auxiliary=Type.Object({v:Type.Literal(1),complete:Type.Boolean(),reconstruct:Type.Boolean(),updatedAt:N,observedAt:N,problem:Type.Union([Type.String(),Type.Null()]),headerEnd:N,namespace:N,health:Type.Object({ok:Type.Union([Type.Boolean(),Type.Null()]),checkedAt:Type.Union([N,Type.Null()]),enabled:Type.Boolean(),owner:Type.Boolean()},closed),regions:Type.Array(Type.Object({first:N,last:N},closed),{maxItems:4}),prefix:Type.Union([Prefix,Type.Null()])},closed);
export type ProjectorAux=Static<typeof Auxiliary>;
export function parseProjectorAux(text:string):ProjectorAux{const value:unknown=JSON.parse(text);if(!Value.Check(Auxiliary,value))throw new Error("Invalid projector metadata");if(value.regions.some(r=>r.first>r.last))throw new Error("Invalid history coverage");if(value.prefix!==null){parseDigest(value.prefix.digest);if(value.prefix.offset<value.prefix.digest.bytes||value.prefix.offset-value.prefix.digest.bytes>63)throw new Error("Invalid prefix hash cursor");}return value;}
export const PROJECTOR_LIMITS={chunkBytes:256*1024,tailBytes:256*1024,records:64,bytesPerSecond:20*1024*1024,burstBytes:4*1024*1024,hotRuns:16,candidates:8192,commitMs:250,sliceMs:10,discoveryMs:1000,healthMs:2000,recentMs:24*3600000,recentEnded:16};
export interface ProjectorOptions{runsRoot:string;database:string;now?:()=>number;monotonic?:()=>number;healthy?:(port:number,signal:AbortSignal)=>Promise<boolean>;storeFactory?:(path:string)=>ReturnType<typeof openCurrentStore>;limits?:Partial<typeof PROJECTOR_LIMITS>;read?:(record:{run:string;path:string;bytes:number;offset:number;purpose:"data"|"anchor"})=>void}
interface Job{run:string;current:SavedCurrent|null;stage:SavedCurrent|null;aux:ProjectorAux;cursor:LineCursor;rebuild:LineCursor;prefixCursor:LineCursor|null;dirty:boolean;force:boolean;lastCommit:number;index:HistoryOffset[];init:LineCursor;generation:string;fresh:boolean}
function cover(aux:ProjectorAux,lines:readonly CurrentLine[]):void{for(const line of lines)aux.regions.push({first:line.event.seq,last:line.event.seq});const regions=aux.regions.sort((a,b)=>a.first-b.first),merged:ProjectorAux["regions"]=[];for(const r of regions){const last=merged.at(-1);if(last!==undefined&&(r.first<=last.last+1||(last.last===0&&r.first===aux.namespace)))last.last=Math.max(last.last,r.last);else merged.push({...r});}if(merged.length>4)throw new Error("Too many disjoint history regions");aux.regions=merged;}
const indexes=(lines:readonly CurrentLine[]):HistoryOffset[]=>lines.filter((l,i)=>i===0||l.event.seq%16===0||l.event.type==="turn_start").map(l=>({seq:l.event.seq,turn:l.event.turn,offset:l.offset,end:l.end}));
function rootLease(root:string):DatabaseSync{
 const cache=join(root,".viewer-cache"),folder=join(cache,"current-v1"),path=join(folder,"projector-owner.sqlite");
 for(const candidate of [cache,folder,path,path+"-journal"])if(lstatSync(candidate,{throwIfNoEntry:false})?.isSymbolicLink()===true)throw new Error("Projector ownership refuses symbolic links");
 mkdirSync(folder,{recursive:true});const db=new DatabaseSync(path);try{db.exec("PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner(id INTEGER); BEGIN EXCLUSIVE;");return db;}catch(error){db.close();throw error;}
}
export class CurrentProjector{
 readonly store:ReturnType<typeof openCurrentStore>;private readonly lease:DatabaseSync;private readonly root:string;private readonly now:()=>number;private readonly monotonic:()=>number;private readonly limits:typeof PROJECTOR_LIMITS;private readonly workBytes:number;private jobs=new Map<string,Job>();private initializing=new Map<string,LineCursor>();private ids:string[]=[];private rotation=0;private discoveryAt=-Infinity;private tokens:number;private tokenAt:number;private closed=false;private stepping=false;private owners=new Map<number,{run:string;at:number}>();private probes=new Map<number,{run:string;generation:string;controller:AbortController;timer:ReturnType<typeof setTimeout>;done:boolean}>();private failures=new Map<string,string>();private recentEnds=new Set<string>();private priority=new Set<string>();private scanned=new Set<string>();private priorityAt=0;private healthAt=new Map<number,number>();private failedSource=new Map<string,string>();private waitingHeaders=new Map<string,string>();
 constructor(private readonly options:ProjectorOptions){
  this.root=realpathSync(options.runsRoot);this.now=options.now??Date.now;this.monotonic=options.monotonic??options.now??(()=>performance.now());this.limits={...PROJECTOR_LIMITS,...options.limits};
  for(const key of Object.keys(PROJECTOR_LIMITS) as (keyof typeof PROJECTOR_LIMITS)[]){const value=this.limits[key];if(!Number.isSafeInteger(value)||value<1||value>PROJECTOR_LIMITS[key])throw new Error("Invalid projector limits");}
  this.workBytes=Math.max(3*this.limits.chunkBytes+65536,this.limits.chunkBytes+this.limits.tailBytes+32768);if(this.limits.burstBytes<this.workBytes)throw new Error("Projector burst cannot cover a bounded batch");
  this.tokens=this.limits.burstBytes;this.tokenAt=this.monotonic();if(!Number.isFinite(this.tokenAt)||this.tokenAt<0)throw new Error("Invalid monotonic clock");this.lease=rootLease(this.root);let opened:ReturnType<typeof openCurrentStore>|undefined;
  try{opened=(options.storeFactory??openCurrentStore)(options.database);const stat=lstatSync(this.root);opened.bindRoot(`${this.root}:${String(stat.dev)}:${String(stat.ino)}`);this.store=opened;this.priority=new Set(this.store.active());this.ids=this.store.runIds();}catch(error){opened?.close();this.lease.close();throw error;}
 }
 current(run:string):SavedCurrent|null{return this.store.get(run);}
 reconstruction(run:string):SavedCurrent|null{return this.store.rebuilding(run);}
 status(run:string):ProjectorAux|null{const value=this.store.auxiliary(run);return value===null?null:parseProjectorAux(value);}
 problem(run:string):string|null{return this.failures.get(run)??null;}
 diagnostics():{sources:number;problems:number;credit:number;cap:number}{return {sources:this.ids.length,problems:this.failures.size,credit:this.tokens,cap:this.limits.burstBytes};}
 private sourceKey(file:CurrentSourceFile):string{let prefix:string;try{prefix=sourceEvidence(file.path);}catch{prefix="invalid";}return `${file.identity}:${String(file.stat.size)}:${String(file.stat.mtimeMs)}:${String(file.stat.ctimeMs)}:${prefix}`;}
 private source(run:string,prefix=false):CurrentSourceFile{return openCurrentSource(this.root,run,{allowance:()=>Math.floor(this.tokens),read:(bytes,offset,purpose)=>{this.tokens-=bytes;this.options.read?.({run,path:prefix?"restoration-prefix.jsonl":"events.jsonl",bytes,offset,purpose});}},prefix);}
 private discover():void{
  if(this.ids.length>0&&this.monotonic()-this.discoveryAt<this.limits.discoveryMs)return;
  const ids=new Set<string>();for(const base of [this.root,join(this.root,"human")])if(existsSync(base)){for(const entry of readdirSync(base,{withFileTypes:true})){if(entry.isDirectory()&&new RegExp(RUN_ID_PATTERN).test(entry.name)&&existsSync(join(base,entry.name,"events.jsonl")))ids.add(entry.name);if(ids.size>this.limits.candidates)throw new Error("Source discovery candidate limit exceeded");}}
  for(const run of this.ids)if(!ids.has(run)){this.store.remove(run);this.jobs.delete(run);this.initializing.delete(run);this.priority.delete(run);this.scanned.delete(run);this.failures.delete(run);this.failedSource.delete(run);this.waitingHeaders.delete(run);for(const [port,probe] of this.probes)if(probe.run===run){probe.controller.abort();clearTimeout(probe.timer);this.probes.delete(port);}for(const [port,owner] of this.owners)if(owner.run===run)this.owners.delete(port);}
  this.ids=[...ids].sort().reverse();this.discoveryAt=this.monotonic();
 }
 private healthOwner(job:Job):void{
  const start=job.current?.state.start??job.stage?.state.start;if(start===null||start===undefined)return;const port=start.isolation.port,at=Date.parse(start.t),owner=this.owners.get(port),ended=(job.current?.state??job.stage?.state)?.end!==null;
  if(owner===undefined||at>owner.at||(at===owner.at&&job.run>owner.run)){this.owners.set(port,{run:job.run,at});if(owner?.run!==job.run)this.healthAt.delete(port);}
  const owns=!ended&&this.ids.every(id=>this.scanned.has(id))&&this.owners.get(port)?.run===job.run;if(job.aux.health.owner!==owns){job.dirty=true;job.force=true;}job.aux.health.owner=owns;
  if(!owns){if(job.aux.health.ok!==null)job.dirty=true;job.aux.health.ok=null;const pending=this.probes.get(port);if(pending?.run===job.run){pending.controller.abort();clearTimeout(pending.timer);this.probes.delete(port);}return;}
  const priorProbe=this.probes.get(port);
  if(priorProbe!==undefined&&(priorProbe.run!==job.run||priorProbe.generation!==job.generation)){priorProbe.controller.abort();clearTimeout(priorProbe.timer);this.probes.delete(port);this.healthAt.delete(port);}
  if(this.options.healthy===undefined||this.probes.has(port)||this.probes.size>=this.limits.hotRuns||(this.healthAt.has(port)&&this.monotonic()-(this.healthAt.get(port)??0)<this.limits.healthMs))return;
  const controller=new AbortController();
  const probe={run:job.run,generation:job.generation,controller,timer:setTimeout(()=>{controller.abort();complete(false);},this.limits.healthMs),done:false};probe.timer.unref();
  const complete=(ok:boolean):void=>{if(probe.done)return;probe.done=true;clearTimeout(probe.timer);if(this.probes.get(port)===probe)this.probes.delete(port);if(!this.closed&&this.jobs.get(job.run)===job&&this.owners.get(port)?.run===job.run&&job.generation===probe.generation&&(job.current?.state??job.stage?.state)?.end===null){job.aux.health={enabled:true,owner:true,ok,checkedAt:this.now()};this.healthAt.set(port,this.monotonic());job.dirty=true;}};
  this.probes.set(port,probe);const healthy=this.options.healthy;void Promise.resolve().then(()=>healthy(port,controller.signal)).then(complete,()=>{complete(false);});
 }
 private start(run:string,source:CurrentSourceFile):Job|null{
  const current=this.store.get(run),stage=this.store.rebuilding(run),raw=this.store.auxiliary(run),saved=current??stage;
  if(saved!==null&&raw!==null){const aux=parseProjectorAux(raw);if(source.compatible(saved.source)&&(stage===null||source.compatible(stage.source))&&saved.source.evidence===sourceEvidence(source.path)){
    const job:Job={run,current,stage,aux,cursor:lineCursor(current?.source.offset??aux.headerEnd),rebuild:lineCursor(stage?.source.offset??aux.headerEnd),prefixCursor:null,dirty:false,force:false,lastCommit:this.monotonic()-this.limits.commitMs,index:[],init:lineCursor(),generation:saved.source.generation,fresh:false};
    if(!aux.complete&&aux.reconstruct&&stage===null){const start=current?.state.start;if(start===null||start===undefined)throw new Error("Missing reconstruction start");const state=foldCurrent(emptyCurrent(),start,aux.namespace);job.stage=this.store.stage(state,source.capture(aux.headerEnd,job.generation,sourceEvidence(source.path)),[],JSON.stringify(aux));}
    this.initializing.delete(run);return job;
   }
   this.store.remove(run);
  }
  const cursor=this.initializing.get(run)??lineCursor();if(this.initializing.size>=1&&!this.initializing.has(run))return null;this.initializing.set(run,cursor);const batch=readCurrentLines(source,cursor,this.limits.chunkBytes,1);
  const first=batch.lines[0];if(first===undefined){if(batch.atEnd){this.initializing.delete(run);this.waitingHeaders.set(run,this.sourceKey(source));this.scanned.add(run);}return null;}this.waitingHeaders.delete(run);
  const start=first.event;if(start.type!=="run_start"||start.seq!==0||start.run!==run)throw new Error("Source run header identity mismatch");
  const bound=start.restoration;if(bound!==undefined&&(start.start_state.kind!=="save_state"||bound.source_run===run||bound.source_turn<1||!Number.isSafeInteger(bound.prefix_last_seq+1)))throw new Error("Invalid restoration provenance");
  const namespace=bound===undefined?1:bound.prefix_last_seq+1,signature=sourceEvidence(source.path),prefixSig=prefixSignature(source.path),generation=randomUUID(),state=foldCurrent(emptyCurrent(),start,namespace);
  const aux:ProjectorAux={v:1,complete:false,reconstruct:true,updatedAt:this.now(),observedAt:this.now(),problem:null,headerEnd:first.end,namespace,health:{enabled:this.options.healthy!==undefined,owner:false,ok:null,checkedAt:null},regions:[{first:0,last:0}],prefix:bound===undefined?null:{signature:prefixSig,offset:0,seq:0,ms:0,done:false,digest:newDigest()}};
  if(bound!==undefined&&prefixSig==="")throw new Error("Restoration prefix missing");
  const job:Job={run,current:null,stage:null,aux,cursor:lineCursor(first.end),rebuild:lineCursor(first.end),prefixCursor:null,dirty:false,force:false,lastCommit:this.monotonic(),index:[],init:cursor,generation,fresh:true};
  job.stage=this.store.seed(state,source.capture(first.end,generation,signature),indexes([first]),JSON.stringify(aux));job.current=job.stage;
  const tail=this.tail(source,first.end);
  if(tail.length>0){const firstSeq=tail[0]?.event.seq??namespace;if(firstSeq<namespace)throw new Error("Invalid provisional sequence namespace");let provisional={...state,nextSeq:firstSeq};for(const line of tail){if(line.event.run!==run)throw new Error("Foreign provisional source event");provisional=foldCurrent(provisional,line.event);}cover(aux,tail);if(provisional.end!==null){const recent=this.now()-Date.parse(provisional.end.t)<=this.limits.recentMs&&(this.recentEnds.has(run)||this.recentEnds.size<this.limits.recentEnded);aux.reconstruct=recent;if(recent)this.recentEnds.add(run);}
   job.current=this.store.commit(provisional,source.capture(tail.at(-1)?.end??first.end,generation,signature),[...indexes([first]),...indexes(tail)],1024,JSON.stringify(aux));job.cursor=lineCursor(job.current.source.offset);}
  this.initializing.delete(run);return job;
 }
 private tail(source:CurrentSourceFile,headerEnd:number):CurrentLine[]{
  const offset=Math.max(headerEnd,source.stat.size-this.limits.tailBytes),raw=source.exact(offset,source.stat.size-offset);let start=offset>headerEnd?raw.indexOf(10)+1:0;if(offset>headerEnd&&start===0)return [];
  const ends:number[]=[];for(let at=raw.indexOf(10,start);at>=0;at=raw.indexOf(10,at+1))ends.push(at);
  if(ends.length>this.limits.records)start=(ends[ends.length-this.limits.records-1]??-1)+1;
  const cursor=lineCursor(offset+start);cursor.buffer=raw.subarray(start);cursor.readOffset=source.stat.size;return readCurrentLines(source,cursor,0,this.limits.records).lines;
 }
 private async verifyPrefix(job:Job,source:CurrentSourceFile):Promise<boolean>{
  const prefix=job.aux.prefix,start=job.stage?.state.start,bound=start?.restoration;if(prefix===null||prefix.done)return true;if(bound===undefined||start===null||start===undefined)throw new Error("Missing restoration binding");
  const file=this.source(job.run,true);
  try{
   if(prefix.signature!==prefixSignature(source.path)||file.stat.size>RUN_LOG_MAX_BYTES)throw new Error("Restoration prefix identity or size changed");
   let digest=parseDigest(prefix.digest);if(prefix.offset>digest.bytes)digest=updateDigest(digest,file.exact(digest.bytes,prefix.offset-digest.bytes));
   const cursor=job.prefixCursor??lineCursor(prefix.offset);job.prefixCursor=cursor;const batch=readCurrentLines(file,cursor,this.limits.chunkBytes,this.limits.records);let slice=performance.now();
   for(const line of batch.lines){const event=line.event,ms=Date.parse(event.t);if(event.run!==bound.source_run||event.seq!==prefix.seq||!Number.isFinite(ms)||ms<prefix.ms||ms>Date.parse(start.t)||(event.seq===0)!==(event.type==="run_start")||event.type==="run_end"||event.turn>bound.source_turn)throw new Error("Restoration prefix event identity/order invalid");prefix.seq++;prefix.ms=ms;prefix.offset=line.end;digest=updateDigest(digest,line.raw);if(performance.now()-slice>=this.limits.sliceMs){await yieldImmediate();slice=performance.now();}}
   prefix.digest=checkpointDigest(digest);job.dirty ||= batch.lines.length>0;
   if(batch.atEnd){if(cursor.buffer.length!==0||prefix.offset===0)throw new Error("Restoration prefix incomplete");if(prefix.seq!==bound.prefix_last_seq+1||finishDigest(digest)!==bound.prefix_sha256||!file.samePath()||prefix.signature!==prefixSignature(source.path))throw new Error("Restoration prefix does not match bound provenance");prefix.done=true;job.dirty=true;job.force=true;}
   return prefix.done;
  }finally{file.close();}
 }
 private async fold(job:Job,state:CurrentState,lines:readonly CurrentLine[]):Promise<CurrentState>{let next=state,slice=performance.now();for(const line of lines){if(line.event.run!==job.run)throw new Error("Foreign source run event");next=foldCurrent(next,line.event);if(line.event.type==="run_end"||line.event.type==="operator_control")job.force=true;if(performance.now()-slice>=this.limits.sliceMs){await yieldImmediate();slice=performance.now();}}return next;}
 private async advance(job:Job,source:CurrentSourceFile,reconstruct:boolean):Promise<boolean>{
  const signature=sourceEvidence(source.path),saved=job.current??job.stage;if(saved===null)throw new Error("Missing source checkpoint");
  if(!source.compatible(saved.source)||signature!==saved.source.evidence||(job.stage!==null&&!source.compatible(job.stage.source))){this.store.remove(job.run);this.jobs.delete(job.run);this.initializing.delete(job.run);return true;}
  job.aux.observedAt=this.now();if(job.aux.problem!==null){job.aux.problem=null;job.dirty=true;}this.healthOwner(job);if(job.current?.state.end===null&&this.monotonic()-job.lastCommit>=this.limits.healthMs)job.dirty=true;let progress=false;
  if(job.current!==null&&job.current.state.end===null){
   const batch=readCurrentLines(source,job.cursor,this.limits.chunkBytes,this.limits.records);if(batch.lines.length>0){job.current={...job.current,state:await this.fold(job,job.current.state,batch.lines),source:source.capture(job.cursor.offset,job.generation,signature)};cover(job.aux,batch.lines);job.index.push(...indexes(batch.lines));job.dirty=true;progress=true;}
  }
  if(reconstruct&&!job.aux.complete&&job.aux.reconstruct&&job.stage!==null){
   if(await this.verifyPrefix(job,source)){
    const batch=readCurrentLines(source,job.rebuild,this.limits.chunkBytes,this.limits.records);if(batch.lines.length>0){job.stage={...job.stage,state:await this.fold(job,job.stage.state,batch.lines),source:source.capture(job.rebuild.offset,job.generation,signature)};cover(job.aux,batch.lines);job.index.push(...indexes(batch.lines));job.dirty=true;progress=true;}
    if(batch.atEnd&&job.stage.source.offset>=(job.current?.source.offset??0)){job.aux.complete=true;job.current=job.stage;job.stage=null;job.cursor=job.rebuild;job.force=true;job.dirty=true;}
   }else progress=true;
  }
  if(job.current!==null&&(job.current.source.size!==source.stat.size||job.current.source.mtime!==source.stat.mtimeMs)){job.current={...job.current,source:{...job.current.source,size:source.stat.size,mtime:source.stat.mtimeMs}};job.dirty=true;}
  if(!source.samePath())throw new Error("Source replaced during batch");if(job.current!==null&&job.current.state.end!==null)this.healthOwner(job);this.flush(job);return progress;
 }
 private flush(job:Job):void{
  if(!job.dirty||(!job.force&&this.monotonic()-job.lastCommit<this.limits.commitMs))return;
  job.aux.updatedAt=this.now();job.aux.problem=null;
  // Prefix reconstruction and the provisional tail may cover different offsets.
  // Index rows are written with the matching consumed cursor, never the other lane.
  if(job.stage!==null){const stage=job.stage,staged=job.index.filter(i=>i.end<=stage.source.offset&&i.seq<=stage.state.seq);job.stage=this.store.stage(stage.state,stage.source,staged,JSON.stringify(job.aux));}
  if(job.current!==null){const snapshot=job.current,current=job.index.filter(i=>i.end<=snapshot.source.offset&&i.seq<=snapshot.state.seq);job.current=this.store.commit(snapshot.state,snapshot.source,current,1024,JSON.stringify(job.aux),job.aux.complete);}
  job.index=[];job.dirty=false;job.force=false;job.lastCommit=this.monotonic();
 }
 async step():Promise<boolean>{
  if(this.closed)throw new Error("Projector is closed");if(this.stepping)throw new Error("Projector step already running");this.stepping=true;
  try{
   const now=this.now();if(!Number.isSafeInteger(now)||now<0)throw new Error("Invalid projector clock");const clock=this.monotonic();if(!Number.isFinite(clock)||clock<0)throw new Error("Invalid monotonic clock");this.tokens=Math.min(this.limits.burstBytes,this.tokens+Math.max(0,clock-this.tokenAt)*this.limits.bytesPerSecond/1000);this.tokenAt=clock;this.discover();let progress=false,reconstruction=false;
   const priority=[...new Set([...this.priority,...this.ids.filter(id=>!this.scanned.has(id)).slice(0,1)])],ordered:string[]=[];
   for(let n=0;n<Math.min(priority.length,this.limits.hotRuns);n++){const run=priority[(this.priorityAt+n)%priority.length];if(run!==undefined)ordered.push(run);}this.priorityAt++;
   for(let n=0;n<this.ids.length&&ordered.length<Math.min(this.ids.length,this.limits.hotRuns);n++){const run=this.ids[this.rotation++%this.ids.length];if(run!==undefined&&!ordered.includes(run))ordered.push(run);}
   const count=ordered.length;
   for(let n=0;n<count;n++){
    if(this.tokens<this.workBytes)break;const run=ordered[n];if(run===undefined)break;let file:CurrentSourceFile|null=null;
    try{
     currentRunDirectory(this.root,run);file=this.source(run);if(this.failedSource.get(run)===this.sourceKey(file)||this.waitingHeaders.get(run)===this.sourceKey(file))continue;let job=this.jobs.get(run);
     if(job===undefined){job=this.start(run,file)??undefined;if(job===undefined){progress=true;continue;}if(this.jobs.size>=this.limits.hotRuns){const oldest=this.jobs.keys().next().value;if(oldest!==undefined){const previous=this.jobs.get(oldest);if(previous!==undefined){previous.force=true;this.flush(previous);}this.jobs.delete(oldest);}}this.jobs.set(run,job);this.scanned.add(run);if(job.current?.state.end===null)this.priority.add(run);this.healthOwner(job);if(job.fresh){job.fresh=false;progress=true;continue;}}
     this.jobs.delete(run);this.jobs.set(run,job);
     const reconstruct=!reconstruction;reconstruction ||= !job.aux.complete&&job.aux.reconstruct&&job.stage!==null;progress=(await this.advance(job,file,reconstruct))||progress;this.failures.delete(run);this.failedSource.delete(run);if(job.current?.state.end!==null)this.priority.delete(run);
    }catch(error){
     if(error instanceof SourceBudgetError){this.jobs.delete(run);if(this.store.get(run)===null&&this.store.rebuilding(run)===null)this.initializing.delete(run);continue;}
     this.scanned.add(run);this.initializing.delete(run);if(file!==null)this.failedSource.set(run,this.sourceKey(file));
     if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="ENOENT"){if(this.store.get(run)!==null||this.store.rebuilding(run)!==null||this.store.auxiliary(run)!==null)this.store.remove(run);this.jobs.delete(run);this.priority.delete(run);this.initializing.delete(run);this.failures.delete(run);continue;}
     const problem=error instanceof Error?error.message.slice(0,500):"Projector source failed";this.failures.set(run,problem);const raw=this.store.auxiliary(run),current=this.store.get(run),stage=this.store.rebuilding(run),saved=current??stage;
     if(raw!==null&&saved!==null){const aux=parseProjectorAux(raw);aux.problem=problem;aux.updatedAt=this.now();if(current!==null)this.store.commit(saved.state,saved.source,[],1024,JSON.stringify(aux));else this.store.stage(saved.state,saved.source,[],JSON.stringify(aux));}this.jobs.delete(run);
    }finally{file?.close();}
    await yieldImmediate();
   }
   return progress||this.store.pending()||this.initializing.size>0;
  }finally{this.stepping=false;}
 }
 // Explicit finite drain for offline consumers; the daemon calls step on its clock.
 async drain(maxSteps:number):Promise<void>{for(let i=0;i<maxSteps;i++){if(!await this.step())break;}for(const job of this.jobs.values()){job.force=true;this.flush(job);}}
 close():void{if(!this.closed){this.closed=true;for(const probe of this.probes.values()){probe.controller.abort();clearTimeout(probe.timer);}this.probes.clear();this.jobs.clear();this.initializing.clear();try{this.store.close();}finally{this.lease.close();}}}
}
export function createCurrentProjector(options:ProjectorOptions):CurrentProjector{return new CurrentProjector(options);}
