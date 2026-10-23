import type {Message} from "@mariozechner/pi-ai";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {createHash} from "node:crypto";
import {digest} from "./roxanne-campaign.js";
const sha=Type.String({pattern:"^[0-9a-f]{64}$"});
const ReceiptSchema=Type.Object({passed:Type.Boolean(),frame:Type.Integer({minimum:0}),ewram:sha,iwram:sha,registers:Type.Boolean(),restored:Type.Boolean(),inputReady:Type.Boolean(),insideGym:Type.Boolean()},{additionalProperties:false});
export type NativeRestoreReceipt=Static<typeof ReceiptSchema>;
const BundleSchema=Type.Object({version:Type.Literal(1),sourceRun:Type.String({pattern:"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"}),sourceCommit:Type.String({pattern:"^[0-9a-f]{40}$"}),turn:Type.Integer({minimum:1}),stateSeq:Type.Integer({minimum:0}),stateHash:sha,historyHash:sha,eventsHash:sha,systemPrompt:Type.String(),toolsHash:sha,nativeReceipt:ReceiptSchema},{additionalProperties:false});
export type RestoreBundle=Static<typeof BundleSchema>;
export interface RestoreInput{readonly sourceRun:string;readonly sourceCommit:string;readonly turn:number;readonly stateSeq:number;readonly stateBytes:Buffer;readonly nativeReceipt:NativeRestoreReceipt;readonly history:readonly Message[];readonly eventsPrefix:string;readonly systemPrompt:string;readonly toolsHash:string}
const bytesHash=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
export function buildRestoreBundle(input:RestoreInput):RestoreBundle{
 const b={version:1 as const,sourceRun:input.sourceRun,sourceCommit:input.sourceCommit,turn:input.turn,stateSeq:input.stateSeq,stateHash:bytesHash(input.stateBytes),historyHash:digest(input.history),eventsHash:bytesHash(input.eventsPrefix),systemPrompt:input.systemPrompt,toolsHash:input.toolsHash,nativeReceipt:input.nativeReceipt};
 if(!Value.Check(BundleSchema,b)||!b.nativeReceipt.passed||!b.nativeReceipt.registers||!b.nativeReceipt.restored||!b.nativeReceipt.inputReady||!b.nativeReceipt.insideGym||input.stateBytes.length===0||input.stateBytes.length>8*1024*1024)throw new Error("native checkpoint is not qualified");
 if(input.history.length===0||input.history[0]?.role!=="user")throw new Error("restore history must include its original task");
 return structuredClone(b);
}
export function verifyRestoreBundle(value:unknown,state:Buffer,history:readonly Message[],eventsPrefix:string):true{
 if(!Value.Check(BundleSchema,value))throw new Error("invalid restore bundle");
 const rebuilt=buildRestoreBundle({...value,stateBytes:state,history,eventsPrefix});
 if(digest(value)!==digest(rebuilt))throw new Error("restore bundle digest mismatch");return true;
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
