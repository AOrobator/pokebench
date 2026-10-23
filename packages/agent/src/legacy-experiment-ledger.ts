// Read-only compatibility for historical queue recordings. No scheduling or approval.
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
const closed={additionalProperties:false} as const;
const LaunchSchema=Type.Object({type:Type.Literal("launch"),trial:Type.Integer({minimum:0}),arm:Type.Enum(["incumbent","candidate"] as const),run:Type.String({minLength:1}),at:Type.String(),model:Type.Optional(Type.String({minLength:1})),environment:Type.Optional(Type.String({pattern:"^[0-9a-f]{64}$"})),commit:Type.Optional(Type.String({pattern:"^[0-9a-f]{40}$"})),
 // The winner-gate promotion this trial's incumbent included; later trials keep the first trial's.
 promotion:Type.Optional(Type.Union([Type.String({minLength:1}),Type.Null()]))},closed);
const OutcomeSchema=Type.Object({type:Type.Literal("outcome"),trial:Type.Integer({minimum:0}),arm:Type.Enum(["incumbent","candidate"] as const),run:Type.String({minLength:1}),at:Type.String(),reason:Type.String()},closed);
const ErrorSchema=Type.Object({type:Type.Literal("launcher_error"),trial:Type.Integer({minimum:0}),arm:Type.Enum(["incumbent","candidate"] as const),run:Type.String({minLength:1}),at:Type.String(),message:Type.String()},closed);
export const LedgerEntrySchema=Type.Union([LaunchSchema,OutcomeSchema,ErrorSchema]);
export type LedgerEntry=Static<typeof LedgerEntrySchema>;
export function parseLedger(text:string):{entries:LedgerEntry[];problems:string[]} {
 const entries:LedgerEntry[]=[],problems:string[]=[];
 text.split("\n").forEach((line,i)=>{
  if(line.trim()==="")return;
  let value:unknown;try{value=JSON.parse(line);}catch{problems.push(`line ${String(i+1)}: not JSON`);return;}
  if(Value.Check(LedgerEntrySchema,value))entries.push(value);else problems.push(`line ${String(i+1)}: not a ledger entry`);
 });
 return {entries,problems};
}

const arm=Type.String({minLength:1});
export const FinalsEntrySchema=Type.Union([
 Type.Object({type:Type.Literal("launch"),trial:Type.Integer({minimum:0}),arm,run:Type.String({minLength:1}),at:Type.String(),model:Type.String({minLength:1}),commit:Type.String({pattern:"^[0-9a-f]{40}$"})},{additionalProperties:false}),
 Type.Object({type:Type.Literal("outcome"),trial:Type.Integer({minimum:0}),arm,run:Type.String({minLength:1}),at:Type.String(),reason:Type.String()},{additionalProperties:false}),
 Type.Object({type:Type.Literal("launcher_error"),trial:Type.Integer({minimum:0}),arm,run:Type.String({minLength:1}),at:Type.String(),message:Type.String()},{additionalProperties:false}),
]);
export type FinalsEntry=Static<typeof FinalsEntrySchema>;
function lines<T>(text:string,check:(v:unknown)=>v is T,what:string):{items:T[];problems:string[]} {
 const items:T[]=[],problems:string[]=[];
 text.split("\n").forEach((line,i)=>{
  if(line.trim()==="")return;
  let value:unknown;try{value=JSON.parse(line);}catch{problems.push(`line ${String(i+1)}: not JSON`);return;}
  if(check(value))items.push(value);else problems.push(`line ${String(i+1)}: not a ${what}`);
 });
 return {items,problems};
}
export function parseFinalsLedger(text:string):{entries:FinalsEntry[];problems:string[]} {
 const {items,problems}=lines(text,(v):v is FinalsEntry=>Value.Check(FinalsEntrySchema,v),"finals entry");
 return {entries:items,problems};
}
