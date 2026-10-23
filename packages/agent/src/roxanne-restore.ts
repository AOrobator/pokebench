import {isDeepStrictEqual} from "node:util";
import type {Message} from "@mariozechner/pi-ai";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {createHash} from "node:crypto";
import {digest} from "./roxanne-campaign.js";
const sha=Type.String({pattern:"^[0-9a-f]{64}$"});
const ReceiptSchema=Type.Object({passed:Type.Boolean(),frame:Type.Integer({minimum:0}),ewram:sha,iwram:sha,registers:Type.Boolean(),restored:Type.Boolean(),inputReady:Type.Boolean(),insideGym:Type.Boolean()},{additionalProperties:false});
export type NativeRestoreReceipt=Static<typeof ReceiptSchema>;
const BundleSchema=Type.Object({version:Type.Literal(1),sourceRun:Type.String({pattern:"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"}),sourceCommit:Type.String({pattern:"^[0-9a-f]{40}$"}),turn:Type.Integer({minimum:1}),stateSeq:Type.Integer({minimum:0}),stateHash:sha,historyHash:sha,conversationHash:Type.Optional(sha),budgetHash:Type.Optional(sha),eventsHash:sha,systemPrompt:Type.String(),toolsHash:sha,rtcUnixMs:Type.Number({minimum:1}),nativeReceipt:ReceiptSchema},{additionalProperties:false});
export type RestoreBundle=Static<typeof BundleSchema>;
export interface RestoreInput{readonly sourceRun:string;readonly sourceCommit:string;readonly turn:number;readonly stateSeq:number;readonly stateBytes:Buffer;readonly nativeReceipt:NativeRestoreReceipt;readonly history:readonly Message[];readonly eventsPrefix:string;readonly systemPrompt:string;readonly toolsHash:string;readonly rtcUnixMs:number;readonly conversationHash?:string;readonly budgetHash?:string}
const bytesHash=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
export function buildRestoreBundle(input:RestoreInput):RestoreBundle{
 const b={version:1 as const,sourceRun:input.sourceRun,sourceCommit:input.sourceCommit,turn:input.turn,stateSeq:input.stateSeq,stateHash:bytesHash(input.stateBytes),historyHash:digest(input.history),...(input.conversationHash===undefined?{}:{conversationHash:input.conversationHash}),...(input.budgetHash===undefined?{}:{budgetHash:input.budgetHash}),eventsHash:bytesHash(input.eventsPrefix),systemPrompt:input.systemPrompt,toolsHash:input.toolsHash,rtcUnixMs:input.rtcUnixMs,nativeReceipt:input.nativeReceipt};
 if(!Value.Check(BundleSchema,b)||!b.nativeReceipt.passed||!b.nativeReceipt.registers||!b.nativeReceipt.restored||!b.nativeReceipt.inputReady||!b.nativeReceipt.insideGym||input.stateBytes.length===0||input.stateBytes.length>8*1024*1024)throw new Error("native checkpoint is not qualified");
 if(input.history.length===0||input.history[0]?.role!=="user")throw new Error("restore history must include its original task");
 return structuredClone(b);
}
export function verifyRestoreBundle(value:unknown,state:Buffer,history:readonly Message[],eventsPrefix:string):true{
 if(!Value.Check(BundleSchema,value))throw new Error("invalid restore bundle");
 const rebuilt=buildRestoreBundle({...value,stateBytes:state,history,eventsPrefix});
 if(!isDeepStrictEqual(value,rebuilt))throw new Error("restore bundle digest mismatch");return true;
}
export interface ReminderReceipt{readonly index:number;readonly sha256:string}
/** OFF preserves object identity and bytes. Call once at episode construction, never per turn. */
export function insertReminder(messages:readonly Message[],enabled:boolean,prompt:string):{messages:readonly Message[];receipt:ReminderReceipt|null}{
 if(!enabled)return {messages,receipt:null};
 if(!prompt.trim()||prompt.length>2500)throw new Error("candidate reminder must be bounded and nonempty");
 return {messages:[...messages,{role:"user",content:prompt,timestamp:0}],receipt:{index:messages.length,sha256:digest(prompt)}};
}
export function maskIntervention(messages:readonly Message[],receipt:ReminderReceipt|null):readonly Message[]{
 if(receipt===null)return messages;
 const message=messages[receipt.index];if(message?.role!=="user"||typeof message.content!=="string"||digest(message.content)!==receipt.sha256)throw new Error("reminder mask does not match exact delivered intervention");
 return messages.filter((_,i)=>i!==receipt.index);
}

const TextPart=Type.Object({type:Type.Literal("text"),text:Type.String()});
const ImagePart=Type.Object({type:Type.Literal("image"),data:Type.String(),mimeType:Type.String()});
const ThinkingPart=Type.Object({type:Type.Literal("thinking"),thinking:Type.String()});
const CallPart=Type.Object({type:Type.Literal("toolCall"),id:Type.String(),name:Type.String(),arguments:Type.Record(Type.String(),Type.Unknown())});
const Usage=Type.Object({input:Type.Number(),output:Type.Number(),cacheRead:Type.Number(),cacheWrite:Type.Number(),totalTokens:Type.Number(),cost:Type.Object({input:Type.Number(),output:Type.Number(),cacheRead:Type.Number(),cacheWrite:Type.Number(),total:Type.Number()})});
const HistorySchema=Type.Array(Type.Union([
 Type.Object({role:Type.Literal("user"),content:Type.Union([Type.String(),Type.Array(Type.Union([TextPart,ImagePart]))]),timestamp:Type.Number()}),
 Type.Object({role:Type.Literal("assistant"),content:Type.Array(Type.Union([TextPart,ThinkingPart,CallPart])),api:Type.String(),provider:Type.String(),model:Type.String(),usage:Usage,stopReason:Type.Enum(["stop","length","toolUse","error","aborted"] as const),timestamp:Type.Number()}),
 Type.Object({role:Type.Literal("toolResult"),toolCallId:Type.String(),toolName:Type.String(),content:Type.Array(Type.Union([TextPart,ImagePart])),isError:Type.Boolean(),timestamp:Type.Number()}),
]),{minItems:1});
/** Validate at the disk boundary, preserving all provider signatures and image bytes. */
export function parseRestoredMessages(value:unknown):Message[]{
 if(!Value.Check(HistorySchema,value))throw new Error("invalid restored model messages");
 const messages=value as Message[];
 const unresolved=new Map<string,string>(),seen=new Set<string>();
 for(const message of messages){
  if(message.role==="assistant")for(const part of message.content)if(part.type==="toolCall"){if(seen.has(part.id))throw new Error("duplicate restored tool call");seen.add(part.id);unresolved.set(part.id,part.name);}
  if(message.role==="toolResult"){if(unresolved.get(message.toolCallId)!==message.toolName)throw new Error("orphan or mismatched restored tool result");unresolved.delete(message.toolCallId);}
 }
 if(unresolved.size>0)throw new Error("restore ends with unresolved tool calls");
 return structuredClone(messages);
}
