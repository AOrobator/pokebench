import {createHash} from "node:crypto";
import {closeSync,existsSync,lstatSync,openSync,readFileSync,readSync,statSync} from "node:fs";
import {basename,join} from "node:path";
import {gunzipSync} from "node:zlib";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {RawRamReferenceSchema,StoryProgressSchema,type RunEvent} from "@pokebench/agent/events";
import {STORY_PROGRESS_FEATURE} from "@pokebench/agent/story-progress";
const ROM="f3ae088181bf583e55daf962a92bb46f4f1d07b7", MAX=64*1024*1024, ARCHIVE_MAX=2*1024*1024;
const closed={additionalProperties:false};
const Header=Type.Object({v:Type.Literal(1),run:Type.String(),source:Type.Literal("raw-ram-all-gym-story-v1"),rom_sha1:Type.Literal(ROM),through_seq:Type.Integer({minimum:0}),log_bytes:Type.Integer({minimum:1}),log_sha256:Type.String({pattern:"^[0-9a-f]{64}$"}),rows:Type.Integer({minimum:0})},closed);
const Row=Type.Object({seq:Type.Integer({minimum:0}),raw_ram:RawRamReferenceSchema,story_progress:Type.Union([StoryProgressSchema,Type.Null()])},closed);
type Row=Static<typeof Row>;
const pathOf=(dir:string):string=>join(dir,"derived","story_progress.jsonl");
const plain=(path:string):boolean=>existsSync(path)&&lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink();
const digest=(body:Buffer|string):string=>createHash("sha256").update(body).digest("hex");
export function progressSignature(dir:string):string {
 const path=pathOf(dir);if(!existsSync(path))return "";
 if(lstatSync(join(dir,"derived")).isSymbolicLink()||!plain(path))return ":progress=refused";
 const stat=statSync(path);return stat.size>MAX?":progress=oversize":`:progress=${digest(readFileSync(path))}`;
}
function prefixHash(path:string,bytes:number):string|null {
 const fd=openSync(path,"r");try {const hash=createHash("sha256"),buffer=Buffer.alloc(1024*1024);let offset=0;
  while(offset<bytes){const n=readSync(fd,buffer,0,Math.min(buffer.length,bytes-offset),offset);if(n===0)return null;hash.update(buffer.subarray(0,n));offset+=n;}return hash.digest("hex");
 }finally{closeSync(fd);}
}
function decode(dir:string,row:Row):Static<typeof StoryProgressSchema>|null {
 const path=join(dir,row.raw_ram.path);
 if(lstatSync(join(dir,"raw-ram")).isSymbolicLink()||!plain(path)||statSync(path).size>ARCHIVE_MAX)throw Error("invalid progress archive");
 const body=readFileSync(path);if(digest(body)!==row.raw_ram.sha256)throw Error("progress archive hash mismatch");
 const raw:unknown=JSON.parse(gunzipSync(body,{maxOutputLength:ARCHIVE_MAX}).toString("utf8"));
 if(typeof raw!=="object"||raw===null||!("regions" in raw)||!Array.isArray(raw.regions)||!("rom_sha1" in raw)||raw.rom_sha1!==ROM||!("sequence" in raw)||raw.sequence!==row.raw_ram.sequence||!("frame" in raw)||raw.frame!==row.raw_ram.frame)throw Error("progress archive identity mismatch");
 const regions=new Map<number,Buffer>();
 for(const r of raw.regions as unknown[]){
  if(typeof r!=="object"||r===null||!("address" in r)||typeof r.address!=="number"||!("data_base64" in r)||typeof r.data_base64!=="string"||!("size" in r)||!("sha256" in r))throw Error("invalid progress region");
  const data=Buffer.from(r.data_base64,"base64");if(data.length!==r.size||digest(data)!==r.sha256||regions.has(r.address))throw Error("progress region hash mismatch");regions.set(r.address,data);
 }
 const ew=regions.get(0x02000000),iw=regions.get(0x03000000);if(ew?.length!==0x40000||iw?.length!==0x8000)throw Error("missing progress memory");
 const ptr=iw.readUInt32LE(0x5d8c),save=ptr-0x02000000;if(save<0||save>0x40000-0x159c||save%4!==0)return null;
 const stage=(id:number,max:number):number|null=>{const n=ew.readUInt16LE(save+0x139c+2*(id-0x4000));return n<=max?n:null;};
 let letter=false;for(let i=0;i<30;i++)if(ew.readUInt16LE(save+0x5d8+i*4)===274)letter=true;
 return {variables:ew.subarray(save+0x139c,save+0x159c).toString("hex"),avatar_flags:ew[0x37590]??0,flags:ew.subarray(save+0x1270,save+0x139c).toString("hex"),rustboro_stage:stage(0x405a,8),devon_stage:stage(0x408f,1),letter};
}
export function progressAttacher(dir:string):(event:RunEvent)=>RunEvent {
 const rows=new Map<number,Row>();let through=-1,stopped=false,native=false;
 try {
  const path=pathOf(dir);if(!existsSync(path))return e=>e;
  if(lstatSync(join(dir,"derived")).isSymbolicLink()||!plain(path)||statSync(path).size>MAX)return e=>e;
  const lines=readFileSync(path,"utf8").trim().split("\n"),header:unknown=JSON.parse(lines.pop()??"");
  if(!Value.Check(Header,header)||header.run!==basename(dir)||prefixHash(join(dir,"events.jsonl"),header.log_bytes)!==header.log_sha256)return e=>e;
  through=header.through_seq;
  for(const line of lines){const row:unknown=JSON.parse(line);if(!Value.Check(Row,row)||rows.has(row.seq)||row.seq>through)throw Error("invalid progress row");rows.set(row.seq,row);}
  if(rows.size!==header.rows)throw Error("progress row count mismatch");
 }catch{return e=>e;}
 return event=>{
  if(event.type==="run_start")native=event.harness_features.includes(STORY_PROGRESS_FEATURE);
  if(native||stopped||event.type!=="state"||!("started" in event)||!event.started||event.raw_ram===undefined)return event;
  if(event.seq>through) {
   try {return event.story_progress===undefined?{...event,story_progress:event.screen==="field_transition"||event.screen==="unknown"?null:decode(dir,{seq:event.seq,raw_ram:event.raw_ram,story_progress:null})}:event;}
   catch{stopped=true;return event;}
  }
  const row=rows.get(event.seq);
  if(row===undefined||row.raw_ram.path!==event.raw_ram.path||row.raw_ram.sha256!==event.raw_ram.sha256||row.raw_ram.sequence!==event.raw_ram.sequence||row.raw_ram.frame!==event.raw_ram.frame){stopped=true;return event;}
  try{
   const decoded=event.screen==="field_transition"||event.screen==="unknown"?null:decode(dir,row);
   if(decoded===null?row.story_progress!==null:row.story_progress===null||Object.entries(row.story_progress).some(([key,value])=>decoded[key as keyof typeof decoded]!==value)){stopped=true;return event;}
   return event.story_progress===undefined?{...event,story_progress:decoded}:event;
  }catch{stopped=true;return event;}
 };
}
