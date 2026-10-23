import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {Type} from "typebox";
import {Value} from "typebox/value";
import type {Message} from "@mariozechner/pi-ai";
import type {RunEvent} from "./events.js";
import {digest} from "./roxanne-campaign.js";
import type {ReminderReceipt} from "./roxanne-restore.js";
import type {BlindJudgment} from "./roxanne-campaign-runner.js";
export interface CapturedContext{readonly messages:readonly Record<string,unknown>[];readonly tools:readonly unknown[]}
export interface ContextUpdate{readonly offset:number;readonly turn:number;readonly prefix:number;readonly remove:number;readonly insert:readonly Record<string,unknown>[];readonly tools?:readonly unknown[];readonly requestSha256:string}
export interface GradeWindow{readonly updates?:readonly ContextUpdate[];readonly fromMessage:number;readonly toMessage:number;readonly fromTurn:number;readonly toTurn:number;readonly context:CapturedContext;readonly requestSha256:string}
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
/** Greedy contiguous segments begin at an actual outgoing request. Every new
 * message and every native event is covered; an oversized single decision fails closed. */
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
export function buildGradeWindows(input:{receipts:readonly unknown[];read:(index:number)=>Buffer;messages:readonly Message[];events:readonly RunEvent[];historyMessages:number;reminder:ReminderReceipt|null},limit=MAX_GRADING_BYTES):GradeWindow[]{
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
   const bytes=Buffer.byteLength(gradingJson({window,messages:messages.slice(window.fromMessage,window.toMessage),events:events.filter(e=>e.turn>=window.fromTurn&&e.turn<window.toTurn&&e.type!=="run_start")}));
   if(bytes>limit)break;chosen=window;next=j;
  }
  if(chosen===undefined)throw new Error("one grading decision exceeds bounded context");out.push(chosen);i=next;
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
