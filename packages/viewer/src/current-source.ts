import {constants,openSync,closeSync,fstatSync,lstatSync,readSync,realpathSync,existsSync,type Stats} from "node:fs";
import {join,dirname,relative,sep} from "node:path";
import {createHash} from "node:crypto";
import {RUN_ID_PATTERN,parseEvent,type RunEvent} from "@pokebench/agent/events";
import type {CurrentSource} from "./current-store.js";
export const CURRENT_READ_BYTES=64*1024,CURRENT_LINE_BYTES=1024*1024;
export class SourceBudgetError extends Error{}
export interface SourceOptions {allowance?:()=>number;read?:(bytes:number,offset:number,purpose:"data"|"anchor")=>void}
export interface CurrentLine {event:RunEvent;offset:number;end:number;raw:Buffer}
export interface LineCursor {offset:number;buffer:Buffer;readOffset:number}
export const lineCursor=(offset=0):LineCursor=>({offset,buffer:Buffer.alloc(0),readOffset:offset});
const coordinate=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;
export function currentRunDirectory(root:string,run:string):string{
 if(!new RegExp(RUN_ID_PATTERN).test(run))throw new Error("Invalid source run id");
 const model=join(root,run),human=join(root,"human",run);if(existsSync(model)&&existsSync(human))throw new Error("Ambiguous source run id");
 const path=existsSync(human)?human:model,stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("Source run is not a regular directory");
 const base=realpathSync(root),resolved=realpathSync(path),inside=relative(base,resolved);if(inside.startsWith(".."+sep)||inside==="..")throw new Error("Source escapes runs root");
 return resolved;
}
export class CurrentSourceFile{
 readonly stat:Stats;readonly identity:string;private fd:number;private closed=false;
 constructor(readonly path:string,private readonly options:SourceOptions={}){
  if(lstatSync(path).isSymbolicLink())throw new Error("Source refuses symbolic links");
  this.fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{this.stat=fstatSync(this.fd);if(!this.stat.isFile()||!coordinate(this.stat.size))throw new Error("Invalid source file");this.identity=`${String(this.stat.dev)}:${String(this.stat.ino)}`;}catch(error){closeSync(this.fd);throw error;}
 }
 read(offset:number,length:number,purpose:"data"|"anchor"="data"):Buffer{
  if(!coordinate(offset)||!coordinate(length)||offset>this.stat.size)throw new Error("Invalid source read coordinate");
  const requested=Math.min(length,CURRENT_READ_BYTES,this.stat.size-offset);if(requested===0)return Buffer.alloc(0);
  const allowance=Math.floor(this.options.allowance?.()??requested);if(allowance<1)throw new SourceBudgetError("Source read budget exhausted");
  const buffer=Buffer.alloc(Math.min(requested,allowance)),count=readSync(this.fd,buffer,0,buffer.length,offset);this.options.read?.(count,offset,purpose);
  if(count!==buffer.length)throw new Error("Source changed while reading");return buffer.subarray(0,count);
 }
 exact(offset:number,length:number,purpose:"data"|"anchor"="data"):Buffer{const pieces:Buffer[]=[];let total=0;while(total<length){const more=this.read(offset+total,length-total,purpose);if(more.length===0)throw new Error("Source changed while reading");pieces.push(more);total+=more.length;}return Buffer.concat(pieces,total);}
 anchor(offset:number):string{
  if(!coordinate(offset)||offset>this.stat.size)throw new Error("Source truncated before cursor");const length=Math.min(4096,offset);
  return createHash("sha256").update(this.exact(0,length,"anchor")).update(this.exact(offset-length,length,"anchor")).digest("hex");
 }
 compatible(source:CurrentSource):boolean{return source.identity===this.identity&&source.offset<=this.stat.size&&source.anchor===this.anchor(source.offset);}
 capture(offset:number,generation:string,evidence:string):CurrentSource{return {generation,identity:this.identity,offset,size:this.stat.size,mtime:this.stat.mtimeMs,anchor:this.anchor(offset),evidence};}
 samePath():boolean{const now=lstatSync(this.path);return !now.isSymbolicLink()&&now.isFile()&&`${String(now.dev)}:${String(now.ino)}`===this.identity&&now.size>=this.stat.size;}
 close():void{if(!this.closed){this.closed=true;closeSync(this.fd);}}
}
export function openCurrentSource(root:string,run:string,options:SourceOptions={},prefix=false):CurrentSourceFile{return new CurrentSourceFile(join(currentRunDirectory(root,run),prefix?"restoration-prefix.jsonl":"events.jsonl"),options);}
export function prefixSignature(path:string):string{
 const file=join(dirname(path),"restoration-prefix.jsonl");if(!existsSync(file))return "";const stat=lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile())throw new Error("Invalid restoration prefix source");return `${String(stat.dev)}:${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ctimeMs)}`;
}
export interface CurrentLineSource {readonly stat:{readonly size:number};read:(offset:number,length:number,purpose?:"data"|"anchor")=>Buffer}
export function readCurrentLines(source:CurrentLineSource,cursor:LineCursor,maxBytes:number,maxRecords:number,lineBytes=CURRENT_LINE_BYTES):{lines:CurrentLine[];bytes:number;atEnd:boolean}{
 if(!coordinate(maxBytes)||!Number.isSafeInteger(maxRecords)||maxRecords<1||!Number.isSafeInteger(lineBytes)||lineBytes<1)throw new Error("Invalid source limits");
 const lines:CurrentLine[]=[];let bytes=0;
 while(lines.length<maxRecords){
  const newline=cursor.buffer.indexOf(10);
  if(newline>=0){
   if(newline>lineBytes)throw new Error("Source event exceeds line bound");const raw=cursor.buffer.subarray(0,newline+1),offset=cursor.offset;cursor.offset+=raw.length;cursor.buffer=cursor.buffer.subarray(raw.length);
   const text=raw.subarray(0,-1).toString("utf8");if(text.trim()==="")throw new Error("Source contains a blank event");let event:RunEvent;try{event=parseEvent(text);}catch{throw new Error(`Invalid source event at byte ${String(offset)}`);}lines.push({event,offset,end:cursor.offset,raw});continue;
  }
  if(cursor.buffer.length>lineBytes)throw new Error("Source event exceeds line bound");
  if(bytes>=maxBytes||cursor.readOffset>=source.stat.size)break;
  const more=source.read(cursor.readOffset,Math.min(maxBytes-bytes,lineBytes+1-cursor.buffer.length));cursor.readOffset+=more.length;bytes+=more.length;cursor.buffer=Buffer.concat([cursor.buffer,more]);
 }
 return {lines,bytes,atEnd:cursor.readOffset>=source.stat.size&&cursor.buffer.indexOf(10)<0};
}
// Receipt metadata is an invalidation signal only. This display projector does
// not re-grade receipts or synchronously read recovered traces/screenshots.
export function sourceEvidence(path:string):string{
 const folder=dirname(path),receipts=["viewer-visual-milestones.v1.json",join("derived","route103_rival.jsonl"),join("derived","story_progress.jsonl")],keys:string[]=[];
 for(const name of receipts){const file=join(folder,name);if(!existsSync(file))continue;const parent=dirname(file);if(lstatSync(parent).isSymbolicLink())throw new Error("Evidence directory refuses symbolic links");const stat=lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile())throw new Error("Invalid evidence receipt source");keys.push(`${name}:${String(stat.dev)}:${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ctimeMs)}`);}
 return JSON.stringify({prefix:prefixSignature(path),receipts:keys});
}
