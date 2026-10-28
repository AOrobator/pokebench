// type-gap-team-last-message-v1 (the operator 2026-10-27): when the newest tool result carries the GYM TYPE GAP block, the
// identical block is also the last message of the request. This is the probes' "both places" condition
// (runs/probes/type-gap-team-20261027 sample.mjs production_and_last): block on the result, then the same text as a
// final user message. Transient, like scene-followup-prompt-v1: a later request with a newer reply no longer has it.
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";
import {TYPE_GAP_HEADER} from "./type-gap-team.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;

// The block on the newest tool results (after the last assistant reply), and that result's call id.
export function newestTypeGapBlock(messages:readonly AgentMessage[]):{id:string;text:string}|null {
 for(const m of [...messages].reverse()){
  if(m.role==="assistant")return null;
  if(m.role!=="toolResult")continue;
  const part=m.content.findLast(p=>p.type==="text"&&p.text.startsWith(TYPE_GAP_HEADER));
  if(part?.type==="text")return {id:m.toolCallId,text:part.text};
 }
 return null;
}

export function typeGapLastMessage(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform):Transform {
 if(!features["type-gap-team-last-message-v1"]||!features["type-gap-team-v1"])return base;
 // Keyed on the result's seq, so a copy recorded before a continuation restore (replayed to this observer) is not
 // recorded again; a result with no recorded event falls back to its call id.
 const results=new Map<string,number>(),sent=new Set<string>();
 const key=(id:string)=>{const seq=results.get(id);return seq===undefined?`id ${id}`:`seq ${String(seq)}`;};
 recorder.subscribe(e=>{
  if(e.type==="tool_result")results.set(e.id,e.seq);
  if(e.type==="ledger_context"&&e.text.startsWith(TYPE_GAP_HEADER))for(const seq of e.evidence)sent.add(`seq ${String(seq)}`);
 },true);
 return async messages=>{
  const out=await base(messages);
  const block=newestTypeGapBlock(out);
  if(block===null)return out;
  if(!sent.has(key(block.id))){const seq=results.get(block.id);recorder.recordLedgerContext({text:block.text,evidence:seq===undefined?[]:[seq]});sent.add(key(block.id));}
  return [...out,{role:"user",content:block.text,timestamp:Date.now()}];
 };
}
