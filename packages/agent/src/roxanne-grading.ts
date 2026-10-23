import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {Type} from "typebox";
import {Value} from "typebox/value";
import type {Message} from "@mariozechner/pi-ai";
import {checkEvent,type RunEvent} from "./events.js";
import {digest} from "./roxanne-campaign.js";
import type {ReminderReceipt} from "./roxanne-restore.js";
import type {BlindJudgment} from "./roxanne-campaign-runner.js";
export interface CapturedContext{readonly messages:readonly Record<string,unknown>[];readonly tools:readonly unknown[]}
export interface ContextUpdate{readonly offset:number;readonly turn:number;readonly prefix:number;readonly remove:number;readonly insert:readonly Record<string,unknown>[];readonly tools?:readonly unknown[];readonly requestSha256:string}
export interface GradeWindow{readonly fromSeq?:number;readonly toSeq?:number;readonly updates?:readonly ContextUpdate[];readonly fromMessage:number;readonly toMessage:number;readonly fromTurn:number;readonly toTurn:number;readonly context:CapturedContext;readonly requestSha256:string}
const Integer=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
const Receipt=Type.Object({index:Integer,turn:Integer,offset:Integer,sha256:Type.String({pattern:"^[a-f0-9]{64}$"})},{additionalProperties:false});
export const MAX_GRADING_BYTES=600_000;
/** Pixels remain in the retained originals. Hashing them does not remove textual behavior. */
export function gradingJson(value:unknown):string{return JSON.stringify(value,(_key:string,v:unknown)=>{
 if(typeof v==="string"&&v.startsWith("data:image/"))return `[retained image sha256:${digest(v)}; image pixels unavailable]`;
 if(typeof v==="object"&&v!==null&&"type"in v&&v.type==="image")return {type:"text",text:`[retained image sha256:${digest(v)}; image pixels unavailable]`};return v;
});}
export function parseCapturedContext(bytes:Buffer,sha256:string):CapturedContext{
 if(createHash("sha256").update(bytes).digest("hex")!==sha256)throw new Error("captured request hash mismatch");
 const value:unknown=JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}).toString());
 const Schema=Type.Object({messages:Type.Array(Type.Record(Type.String(),Type.Unknown())),tools:Type.Optional(Type.Array(Type.Unknown()))});
 if(!Value.Check(Schema,value)||value.messages.length===0||value.messages.some(m=>!["system","developer","user","assistant","tool"].includes(String(m["role"]))))throw new Error("invalid captured request context");
 return {messages:value.messages,tools:value.tools??[]};
}
const NativePath=Type.Array(Type.Union([Type.String(),Integer]),{minItems:1});
const NativeSet=Type.Object({path:NativePath,value:Type.Unknown()},{additionalProperties:false});
const NativeText=Type.Object({path:NativePath,prefix:Integer,remove:Integer,insert:Type.String()},{additionalProperties:false});
const NativeArray=Type.Object({path:NativePath,items:Type.Array(Type.Union([Integer,Type.Object({value:Type.Unknown()},{additionalProperties:false})]))},{additionalProperties:false});
const PackedNative=Type.Union([
 Type.Object({kind:Type.Literal("full"),event:Type.Unknown(),sha256:Type.String({pattern:"^[a-f0-9]{64}$"})},{additionalProperties:false}),
 Type.Object({kind:Type.Literal("delta"),base:Integer,set:Type.Array(NativeSet),remove:Type.Array(NativePath,{uniqueItems:true}),text:Type.Array(NativeText),arrays:Type.Array(NativeArray),sha256:Type.String({pattern:"^[a-f0-9]{64}$"})},{additionalProperties:false}),
]);
export type PackedNativeEvent=import("typebox").Static<typeof PackedNative>;
type NativePatch={set:import("typebox").Static<typeof NativeSet>[];remove:import("typebox").Static<typeof NativePath>[];text:import("typebox").Static<typeof NativeText>[];arrays:import("typebox").Static<typeof NativeArray>[]};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(record(value))return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>[key,canonical(v)]));
 return value;
}
const nativeHash=(event:RunEvent):string=>digest(canonical(event));
function nativePatch(before:unknown,after:unknown,path:readonly (string|number)[]=[]):NativePatch{
 if(JSON.stringify(before)===JSON.stringify(after))return {set:[],remove:[],text:[],arrays:[]};
 const whole:NativePatch={set:[{path:[...path],value:after}],remove:[],text:[],arrays:[]},parts:NativePatch={set:[],remove:[],text:[],arrays:[]};
 const add=(patch:NativePatch)=>{parts.set.push(...patch.set);parts.remove.push(...patch.remove);parts.text.push(...patch.text);parts.arrays.push(...patch.arrays);};
 if(record(before)&&record(after)){
  for(const key of Object.keys(before))if(!Object.hasOwn(after,key))parts.remove.push([...path,key]);
  for(const [key,value]of Object.entries(after))add(Object.hasOwn(before,key)?nativePatch(before[key],value,[...path,key]):{set:[{path:[...path,key],value}],remove:[],text:[],arrays:[]});
 }else if(typeof before==="string"&&typeof after==="string"){
  let prefix=0,suffix=0;while(prefix<before.length&&prefix<after.length&&before.charCodeAt(prefix)===after.charCodeAt(prefix))prefix++;
  while(suffix<before.length-prefix&&suffix<after.length-prefix&&before.charCodeAt(before.length-1-suffix)===after.charCodeAt(after.length-1-suffix))suffix++;
  parts.text.push({path:[...path],prefix,remove:before.length-prefix-suffix,insert:after.slice(prefix,after.length-suffix)});
 }else if(Array.isArray(before)&&Array.isArray(after)){
  const earlier:readonly unknown[]=before,later:readonly unknown[]=after;
  const indexes=new Map(earlier.map((value,index)=>[JSON.stringify(value),index]));
  const reused:NativePatch={set:[],remove:[],text:[],arrays:[{path:[...path],items:later.map(value=>indexes.get(JSON.stringify(value))??{value})}]};
  if(before.length===after.length){for(const [i,value]of after.entries())add(nativePatch(before[i],value,[...path,i]));}
  else Object.assign(parts,whole);
  if(JSON.stringify(reused).length<JSON.stringify(parts).length)Object.assign(parts,reused);
 }
 else return whole;
 return path.length===0||JSON.stringify(parts).length<JSON.stringify(whole).length?parts:whole;
}
function nativeParent(value:unknown,path:readonly (string|number)[]):{parent:Record<string,unknown>|unknown[];key:string|number}{
 let parent:unknown=value;
 for(const key of path.slice(0,-1)){
  if(Array.isArray(parent)&&typeof key==="number"&&key<parent.length)parent=parent[key];
  else if(record(parent)&&typeof key==="string"&&Object.hasOwn(parent,key))parent=parent[key];
  else throw new Error("invalid packed native path");
 }
 const key=path.at(-1);
 if(Array.isArray(parent)&&typeof key==="number"&&key<parent.length||record(parent)&&typeof key==="string")return {parent,key};
 throw new Error("invalid packed native path");
}
/** Lossless field deltas remove repeated map structure, never evidence. */
export function packNativeEvents(events:readonly RunEvent[]):PackedNativeEvent[]{
 const values:RunEvent[]=[],latest=new Map<RunEvent["type"],number>();
 return events.map(event=>{
  const value=checkEvent(JSON.parse(gradingJson(event))),sha256=nativeHash(value),full:PackedNativeEvent={kind:"full",event:value,sha256};
  const base=latest.get(value.type);let selected:PackedNativeEvent=full;
  if(base!==undefined){const previous=values[base];if(previous===undefined)throw new Error("missing native event base");
   const delta:PackedNativeEvent={kind:"delta",base,...nativePatch(previous,value),sha256};
   if(Buffer.byteLength(JSON.stringify(delta))<Buffer.byteLength(JSON.stringify(full)))selected=delta;
  }
  latest.set(value.type,values.length);values.push(value);return selected;
 });
}
export function unpackNativeEvents(records:readonly unknown[]):RunEvent[]{
 const values:RunEvent[]=[];
 for(const row of records){
  if(!Value.Check(PackedNative,row))throw new Error("invalid packed native event");
  let value:RunEvent;
  if(row.kind==="full")value=checkEvent(row.event);
  else{const base=values[row.base];if(base===undefined)throw new Error("invalid packed native base");const restored:unknown=structuredClone(base);
   for(const path of row.remove){const {parent,key}=nativeParent(restored,path);if(!record(parent)||typeof key!=="string"||!Object.hasOwn(parent,key))throw new Error("invalid packed native removal");Reflect.deleteProperty(parent,key);}
   for(const change of row.set){const {parent,key}=nativeParent(restored,change.path);if(Array.isArray(parent)&&typeof key==="number")parent[key]=change.value;else if(record(parent)&&typeof key==="string")Object.defineProperty(parent,key,{value:change.value,writable:true,enumerable:true,configurable:true});}
   for(const change of row.arrays){const {parent,key}=nativeParent(restored,change.path);const before=Array.isArray(parent)&&typeof key==="number"?parent[key]:record(parent)&&typeof key==="string"?parent[key]:undefined;
    if(!Array.isArray(before))throw new Error("invalid packed native array");
    const elements:readonly unknown[]=before;
    const next=change.items.map(item=>{if(typeof item!=="number")return item.value;if(item>=before.length)throw new Error("invalid packed native array index");return structuredClone(elements[item]);});
    Object.defineProperty(parent,key,{value:next,writable:true,enumerable:true,configurable:true});
   }
   for(const change of row.text){const {parent,key}=nativeParent(restored,change.path);const before=Array.isArray(parent)&&typeof key==="number"?parent[key]:record(parent)&&typeof key==="string"?parent[key]:undefined;
    if(typeof before!=="string"||change.prefix+change.remove>before.length)throw new Error("invalid packed native text range");const text=before.slice(0,change.prefix)+change.insert+before.slice(change.prefix+change.remove);
    Object.defineProperty(parent,key,{value:text,writable:true,enumerable:true,configurable:true});
   }
   value=checkEvent(restored);
  }
  if(nativeHash(value)!==row.sha256)throw new Error("packed native event hash mismatch");values.push(value);
 }
 return values;
}
/** Sequence shards repeat the complete decision/context but partition native evidence. */
export function eventsForGradeWindow(events:readonly RunEvent[],window:GradeWindow):RunEvent[]{
 return events.filter(e=>e.turn>=window.fromTurn&&e.turn<window.toTurn&&e.type!=="run_start"&&(window.fromSeq===undefined||e.seq>=window.fromSeq)&&(window.toSeq===undefined||e.seq<window.toSeq));
}
function shardDecision(window:GradeWindow,messages:readonly Message[],events:readonly RunEvent[],limit:number):GradeWindow[]{
 const selected=eventsForGradeWindow(events,window),out:GradeWindow[]=[];
 let offset=0;
 while(offset<selected.length){
  let chosen:GradeWindow|undefined,next=offset;
  let low=offset+1,high=selected.length;
  while(low<=high){
   const end=Math.floor((low+high)/2);
   const first=selected[offset],last=selected[end-1];if(first===undefined||last===undefined)throw new Error("missing native shard event");
   const shard={...window,fromSeq:first.seq,toSeq:last.seq+1};
   const bytes=Buffer.byteLength(gradingJson({window:shard,messages:messages.slice(window.fromMessage,window.toMessage),events:packNativeEvents(selected.slice(offset,end))}));
   if(bytes>limit){high=end-1;}else{chosen=shard;next=end;low=end+1;}
  }
  if(chosen===undefined)throw new Error("one grading decision context or native event exceeds bounded context");
  out.push(chosen);offset=next;
 }
 if(out.length===0)throw new Error("one grading decision exceeds bounded context");
 return out;
}
/** Greedy contiguous segments begin at an actual outgoing request. Every new
 * message and native event is retained; large native journals shard within a decision. */
export function contextDelta(before:CapturedContext,after:CapturedContext,offset:number,turn:number,requestSha256:string):ContextUpdate{
 let prefix=0,suffix=0;
 while(prefix<before.messages.length&&prefix<after.messages.length&&digest(before.messages[prefix])===digest(after.messages[prefix]))prefix++;
 while(suffix<before.messages.length-prefix&&suffix<after.messages.length-prefix&&digest(before.messages[before.messages.length-1-suffix])===digest(after.messages[after.messages.length-1-suffix]))suffix++;
 return {offset,turn,prefix,remove:before.messages.length-prefix-suffix,insert:after.messages.slice(prefix,after.messages.length-suffix),...(digest(before.tools)===digest(after.tools)?{}:{tools:after.tools}),requestSha256};
}
export function applyContextDelta(context:CapturedContext,update:ContextUpdate):CapturedContext{
 if(update.prefix<0||update.remove<0||update.prefix+update.remove>context.messages.length)throw new Error("invalid captured context delta");
 return {messages:[...context.messages.slice(0,update.prefix),...update.insert,...context.messages.slice(update.prefix+update.remove)],tools:update.tools??context.tools};
}
export function buildGradeWindows(input:{receipts:readonly unknown[];read:(index:number)=>Buffer;messages:readonly Message[];events:readonly RunEvent[];historyMessages:number;reminder:ReminderReceipt|null},limit=MAX_GRADING_BYTES-40_000):GradeWindow[]{
 const {receipts,messages,events,historyMessages,reminder}=input;
 if(receipts.length===0||!receipts.every(r=>Value.Check(Receipt,r)))throw new Error("missing captured request receipts");
 const rs=receipts.filter(r=>Value.Check(Receipt,r));
 const first=rs[0],endTurn=Math.max(...events.map(e=>e.turn))+1;
 if(first===undefined||first.offset!==historyMessages+(reminder===null?0:1)||rs.some((r,i)=>r.index!==i+1||r.offset>messages.length||r.turn>=endTurn||i>0&&(r.offset<(rs[i-1]?.offset??0)||r.turn<(rs[i-1]?.turn??0))))throw new Error("captured request coverage mismatch");
 const out:GradeWindow[]=[];let i=0;
 while(i<rs.length){
  const start=rs[i];if(start===undefined)throw new Error("missing request start");
  const context=parseCapturedContext(input.read(start.index),start.sha256);let chosen:GradeWindow|undefined,next=i,prior=context;const updates:ContextUpdate[]=[];
  for(let j=i+1;j<=rs.length;j++){
   const boundary=rs[j];
   if(j>i+1){const current=rs[j-1];if(current===undefined)throw new Error("missing context update");const after=parseCapturedContext(input.read(current.index),current.sha256);updates.push(contextDelta(prior,after,current.offset,current.turn,current.sha256));prior=after;}
   // Retries may share a message offset or turn; never split that decision.
   if(boundary!==undefined&&(boundary.offset===start.offset||boundary.turn===start.turn))continue;
   const window={fromMessage:start.offset,toMessage:boundary?.offset??messages.length,fromTurn:i===0?0:start.turn,toTurn:boundary?.turn??endTurn,context,updates:[...updates],requestSha256:start.sha256};
   const bytes=Buffer.byteLength(gradingJson({window,messages:messages.slice(window.fromMessage,window.toMessage),events:packNativeEvents(events.filter(e=>e.turn>=window.fromTurn&&e.turn<window.toTurn&&e.type!=="run_start"))}));
   if(bytes>limit){if(chosen===undefined){out.push(...shardDecision(window,messages,events,limit));next=j;}break;}chosen=window;next=j;
  }
  if(chosen!==undefined)out.push(chosen);i=next;
 }
 return out;
}
/** Strip only the separately receipted treatment user message, never assistant quotations. */
export function blindGradeWindows(windows:readonly GradeWindow[],history:number,reminder:ReminderReceipt|null):GradeWindow[]{
 const offset=history+(reminder===null?0:1);
 const mask=(context:CapturedContext,required:boolean):CapturedContext=>{
  const match=(m:Record<string,unknown>)=>m["role"]==="user"&&(typeof m["content"]==="string"?digest(m["content"])===reminder?.sha256:Array.isArray(m["content"])&&m["content"].some((p:unknown)=>typeof p==="object"&&p!==null&&"type"in p&&p.type==="text"&&"text"in p&&typeof p.text==="string"&&digest(p.text)===reminder?.sha256));
  const matches=reminder===null?[]:context.messages.filter(match);
  if(matches.length>1||required&&reminder!==null&&matches.length!==1)throw new Error("treatment context receipt mismatch");
  return {...context,messages:reminder===null?context.messages:context.messages.filter(m=>!match(m))};
 };
 return windows.map((w,i)=>{
  const context=mask(w.context,i===0);let before=w.context,blindBefore=context;
  const updates=w.updates?.map(u=>{const after=applyContextDelta(before,u),blindAfter=mask(after,false),delta=contextDelta(blindBefore,blindAfter,u.offset-offset,u.turn,"withheld");before=after;blindBefore=blindAfter;return delta;});
  return {...w,fromMessage:w.fromMessage-offset,toMessage:w.toMessage-offset,requestSha256:"withheld",context,...(updates===undefined?{}:{updates})};
 });
}
export function aggregateJudgments(id:string,rows:readonly BlindJudgment[]):BlindJudgment{
 if(rows.length===0||rows.some(r=>r.id!==id))throw new Error("incomplete segment judgments");
 const order=["unsupported_fact","invalid_action","abandonment","none"] as const;
 return {id,diagnosis:order.find(d=>rows.some(r=>r.diagnosis===d))??"none",factualError:rows.some(r=>r.factualError),verified:rows.every(r=>r.verified),tokens:0,evidence:rows.flatMap((r,i)=>r.evidence.map(e=>`segment ${String(i+1)}: ${e}`))};
}
