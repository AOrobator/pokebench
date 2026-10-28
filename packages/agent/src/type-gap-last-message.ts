// type-gap-team-last-message-v1 (the operator 2026-10-27): when the newest tool result carries the GYM TYPE GAP block, the
// identical block is also the last message of the request. This is the probes' "both places" condition
// (runs/probes/type-gap-team-20261027 sample.mjs production_and_last): block on the result, then the same text as a
// final user message. Transient, like scene-followup-prompt-v1: a later request with a newer reply no longer has it.
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";
import {TYPE_GAP_HEADER} from "./type-gap-team.js";

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;

// The block inside one text: a live result carries it as its own part; a replayed result (decision probes, a
// continuation restore) is the recorder's text parts joined by "\n", so there the block is the header line and the
// lines after it that start with "- " or "  ", the only shapes TypeGapTeam.block writes.
export function typeGapBlockIn(text:string):string|null {
 if(text.startsWith(TYPE_GAP_HEADER))return text;
 const at=text.lastIndexOf(`\n${TYPE_GAP_HEADER}`);
 if(at<0)return null;
 const lines=text.slice(at+1).split("\n");
 const end=lines.findIndex((line,i)=>i>0&&!line.startsWith("- ")&&!line.startsWith("  "));
 return (end<0?lines:lines.slice(0,end)).join("\n");
}

// The block on the newest tool results (after the last assistant reply), and that result's call id.
export function newestTypeGapBlock(messages:readonly AgentMessage[]):{id:string;text:string}|null {
 for(const m of [...messages].reverse()){
  if(m.role==="assistant")return null;
  if(m.role!=="toolResult")continue;
  for(const part of [...m.content].reverse()){
   const block=part.type==="text"?typeGapBlockIn(part.text):null;
   if(block!==null)return {id:m.toolCallId,text:block};
  }
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
