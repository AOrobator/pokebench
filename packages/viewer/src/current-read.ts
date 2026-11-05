import {lstatSync,realpathSync} from "node:fs";
import {RUN_ID_PATTERN} from "@pokebench/agent/events";
import {openCurrentStore,checkCurrentState,type CurrentStore,type PublicationRow} from "./current-store.js";
import {parseCurrentSummary,parseCurrentSnapshot,publicCheckpoint,type CurrentQuery,type CurrentAnswer} from "./current-public.js";
import {parseProjectorAux} from "./current-service.js";
import {openCurrentSource,sourceEvidence,lineCursor,readCurrentLines,type SourceOptions} from "./current-source.js";
import {historyPage} from "./history-page.js";
export const CURRENT_READ_LIMITS={events:64,bytes:32*1024*1024,replyBytes:2*1024*1024,list:50,updates:128,recentMs:600000};
export class CurrentReadError extends Error {override readonly name="CurrentReadError";constructor(readonly status:number,message:string){super(message);}}
export interface CurrentReaderOptions {runsRoot:string;database:string;read?:(value:{run:string;bytes:number;offset:number;purpose:"data"|"anchor"})=>void;limits?:Partial<typeof CURRENT_READ_LIMITS>;beforeReadRows?:()=>void}
export interface CurrentReader {read:(query:CurrentQuery)=>CurrentAnswer;close:()=>void}
const record=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const n=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const runId=(id:string):void=>{if(!new RegExp(RUN_ID_PATTERN).test(id))throw new CurrentReadError(400,"Invalid current run id");};
export function currentCursor(value:Record<string,unknown>):string{return Buffer.from(JSON.stringify({v:1,...value})).toString("base64url");}
function cursor(text:string,kind:string):Record<string,unknown>{
 if(text.length>512||!/^[A-Za-z0-9_-]+$/.test(text))throw new CurrentReadError(400,"Invalid current cursor");let value:unknown;try{value=JSON.parse(Buffer.from(text,"base64url").toString("utf8"));}catch{throw new CurrentReadError(400,"Invalid current cursor");}
 if(!record(value)||value["v"]!==1||value["kind"]!==kind||typeof value["epoch"]!=="string"||value["epoch"].length>128)throw new CurrentReadError(400,"Invalid current cursor");return value;
}
const updateCursor=(epoch:string,revision:number)=>currentCursor({kind:"updates",epoch,revision});
function parseRow(row:PublicationRow){const summary=parseCurrentSummary(JSON.parse(row.summary) as unknown);if(summary.id!==row.run||summary.generation!==row.generation||summary.revision!==row.revision)throw new Error("Current public row identity mismatch");checkCurrentState(publicCheckpoint(summary));return summary;}
function parseDetail(row:PublicationRow){if(row.detail===undefined)throw new Error("Missing current detail");const detail=parseCurrentSnapshot(JSON.parse(row.detail) as unknown);if(detail.id!==row.run||detail.generation!==row.generation||detail.revision!==row.revision)throw new Error("Current public row identity mismatch");checkCurrentState(publicCheckpoint(detail,detail.display,detail.end));return detail;}
export function createCurrentReader(options:CurrentReaderOptions):CurrentReader{
 const limits={...CURRENT_READ_LIMITS,...options.limits};for(const key of Object.keys(CURRENT_READ_LIMITS) as (keyof typeof CURRENT_READ_LIMITS)[])if(!n(limits[key])||limits[key]<1||limits[key]>CURRENT_READ_LIMITS[key])throw new Error("Invalid current reader limits");
 let store:CurrentStore|null=null,identity="",closed=false;
 const connect=():CurrentStore=>{const file=lstatSync(options.database);if(file.isSymbolicLink()||!file.isFile())throw new Error("Invalid current database");const next=`${String(file.dev)}:${String(file.ino)}`;if(next!==identity){store?.close();store=null;identity="";store=openCurrentStore(options.database,{readOnly:true,...(options.beforeReadRows===undefined?{}:{beforeReadRows:options.beforeReadRows})});identity=next;}
  const root=realpathSync(options.runsRoot),stat=lstatSync(root);if(store===null||store.boundRoot()!==`${root}:${String(stat.dev)}:${String(stat.ino)}`)throw new Error("Current database recordings root mismatch");return store;};
 const history=(db:CurrentStore,q:Extract<CurrentQuery,{kind:"history"}>):CurrentAnswer=>{
  runId(q.run);const decoded=q.before===null?null:cursor(q.before,"history");if(decoded!==null&&(decoded["run"]!==q.run||typeof decoded["generation"]!=="string"||!n(decoded["before"])))throw new CurrentReadError(400,"Invalid history cursor binding");
  const before=decoded===null?Number.MAX_SAFE_INTEGER:decoded["before"] as number,page=historyPage(decoded!==null,limits.events,limits.replyBytes),window=db.historyWindow(q.run,before,page.scan-1),saved=window.current;
  const answer=(state:"ready"|"indexing"|"reset"|"oversized",events:Extract<CurrentAnswer,{kind:"history"}>["events"]=[],next:string|null=q.before):CurrentAnswer=>({kind:"history",version:1,epoch:window.epoch,generation:saved?.source.generation??"",state,events,before:next});
  if(saved===null||typeof window.auxiliary!=="string")return answer("indexing");
  if(decoded!==null&&(decoded["epoch"]!==window.epoch||decoded["generation"]!==saved.source.generation))return answer("reset",[],null);
  const target=decoded===null?saved.state.seq+1:before;if(target>saved.state.seq+1)throw new CurrentReadError(400,"History cursor is ahead of the committed source");if(target===0)return answer("ready",[],null);
  const aux=parseProjectorAux(window.auxiliary),start=Math.max(0,target-page.scan),prior=window.entry===null?null:Number(window.entry["seq"]);
  const index=window.entry===null||(n(prior)&&start-prior>16&&!(prior===0&&start<aux.namespace))?window.following:window.entry;if(index===null)return answer("indexing");const seq=Number(index["seq"]),offset=Number(index["offset"]),end=Number(index["end"]);
  if(![seq,offset,end].every(n)||end<=offset||end>saved.source.offset||seq>=target)throw new Error("Invalid history index");
  if(start-seq>16&&!(seq===0&&start<aux.namespace))return answer("indexing");
  const sourceOptions:SourceOptions={read:(bytes,at,purpose)=>{options.read?.({run:q.run,bytes,offset:at,purpose});}};const file=openCurrentSource(options.runsRoot,q.run,sourceOptions);
  try{
   if(!file.compatible(saved.source)||sourceEvidence(file.path)!==saved.source.evidence)return answer("reset",[],null);
   const upper=saved.source.offset,c=lineCursor(offset),bounded={stat:{size:upper},read:(at:number,length:number,purpose?:"data"|"anchor")=>file.read(at,Math.max(0,Math.min(length,upper-at)),purpose)};let bytes=0,reached=false;
   for(let steps=0;steps<page.scan+17;steps++){
    const batch=readCurrentLines(bounded,c,limits.bytes-bytes,1);bytes+=batch.bytes;const line=batch.lines[0];
    if(line===undefined){if(batch.atEnd){reached=true;break;}return answer("oversized",[],q.before);}
    if(line.event.run!==q.run)throw new Error("Foreign indexed history event");if(line.event.seq>=target){reached=true;break;}
    if(line.raw.length>limits.replyBytes)return answer("oversized",[],q.before);page.add(line.event,line.raw.length);
    if(c.offset>=upper){reached=true;break;}
   }
   if(!file.samePath())return answer("reset",[],null);if(!reached)return answer("indexing",[],q.before);
   const edge=page.before();return answer("ready",page.events,edge===null?null:currentCursor({kind:"history",epoch:window.epoch,run:q.run,generation:saved.source.generation,before:edge}));
  }finally{file.close();}
 };
 return {read:(q:CurrentQuery):CurrentAnswer=>{
  if(closed)throw new Error("Current reader is closed");if(!n(q.now))throw new CurrentReadError(400,"Invalid current clock");let db:CurrentStore;try{db=connect();}catch{return {kind:"unavailable",version:1,problem:"Current snapshots are not ready"};}
  try{
   if(q.kind==="list"){
    const limit=q.limit??limits.list;if(!n(limit)||limit<1||limit>100)throw new CurrentReadError(400,"Invalid current list limit");const after=q.after==null?null:cursor(q.after,"list");
    if(after!==null&&(after["epoch"]!==db.epoch||!n(after["started"])||typeof after["run"]!=="string"))throw new CurrentReadError(409,"Current list changed; start again");
    const data=db.readPublicList(Math.max(0,q.now-limits.recentMs),after===null?null:{started:after["started"] as number,run:after["run"] as string},limit),rows=data.rows.slice(0,limit),last=rows.at(-1);
    const discovery:unknown=data.discovery===null?null:JSON.parse(data.discovery);const indexing=!record(discovery)||discovery["complete"]!==true||data.published<data.known;const problems=record(discovery)&&typeof discovery["problems"]==="number"&&discovery["problems"]>0?["Some recordings could not be read"]:[];return {kind:"list",version:1,epoch:data.epoch,cursor:updateCursor(data.epoch,data.revision),runs:rows.map(parseRow),indexing,problems,next:data.rows.length>limit&&last!==undefined?currentCursor({kind:"list",epoch:data.epoch,started:last.started,run:last.run}):null};
   }
   if(q.kind==="current"){runId(q.run);const data=db.readPublicCurrent(q.run);return {kind:"current",version:1,epoch:data.epoch,cursor:updateCursor(data.epoch,data.revision),snapshot:data.row===null?null:parseDetail(data.row)};}
   if(q.kind==="updates"){
    if(q.run!==undefined)runId(q.run);let native="invalid";if(q.after!==null){if(q.after.length>512)throw new CurrentReadError(400,"Invalid current cursor");try{const d=cursor(q.after,"updates");if(n(d["revision"]))native=`${String(d["epoch"])}:${String(d["revision"])}`;}catch{native="invalid";}}
    const data=db.readPublicUpdates(native,limits.updates,q.run),dedup=new Map(data.rows.map(row=>[row.run,row]));let reset=data.reset;
    const changes:Extract<CurrentAnswer,{kind:"updates"}>["changes"]=[];for(const row of dedup.values()){
     if(row.row===null){if(row.exists)reset=true;else changes.push({id:row.run,removed:true});continue;}
     if(row.run!==q.run&&row.row.ended!==null&&row.row.ended<q.now-limits.recentMs){changes.push({id:row.run,removed:true});continue;}
     changes.push({id:row.run,removed:false,summary:parseRow(row.row),...(row.run===q.run?{snapshot:parseDetail(row.row)}:{})});
    }
    return {kind:"updates",version:1,epoch:data.epoch,cursor:updateCursor(data.epoch,reset?data.revision:data.through),reset,more:!reset&&data.more,changes:reset?[]:changes};
   }
   return history(db,q);
  }catch(error){if(error instanceof CurrentReadError)throw error;return {kind:"unavailable",version:1,problem:"Current snapshots could not be read"};}
 },close:()=>{if(!closed){closed=true;store?.close();store=null;}}};
}
