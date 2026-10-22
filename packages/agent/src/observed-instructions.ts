// Retain evidence, not an extracted objective. In particular, preserve every page of
// PetalburgCity_Gym_Text_DadGoCollectBadges: arrival and challenging ROXANNE are distinct.
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";
import {MilestoneMemory,type InstructionEpisode,type MemoryRetention} from "./milestone-memory.js";
import {canonicalStoryCharacterName} from "./script-line-presence.js";

type Dialogue=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Result=Extract<RunEvent,{type:"tool_result"}>;
type Episode=InstructionEpisode;
interface Progress {result_event:number;state_event:number|null;location:string|null;story:string|null}
const quote=(value:unknown):string=>JSON.stringify(value);
const field=(page:Dialogue["pages"][number])=>page.battle_turn===undefined&&page.battle_message_id===undefined;
const identified=(page:Dialogue["pages"][number])=>page.speaker_source==="name_prefix"&&page.speaker!==null&&canonicalStoryCharacterName(page.speaker)!==null;

export class ObservedInstructions {
 private readonly policy:MilestoneMemory|null;
 constructor(private readonly allField=false,trim=false){this.policy=trim?new MilestoneMemory():null;}
 archive():readonly InstructionEpisode[]{return [...this.episodes.values()];}
 retention():MemoryRetention|null{return this.policy?.select(this.archive())??null;}
 private run:string|null=null;
 private readonly pending=new Map<string,Dialogue[]>();
 private readonly episodes=new Map<string,Episode>();
 private readonly visits=new Map<string,Pick<Progress,"result_event"|"state_event"|"location">>();
 private current:Progress|null=null;
 observe(event:RunEvent):void {
  this.run??=event.run;
  if(event.run!==this.run)return;
  this.policy?.observe(event);
  if(event.type==="dialogue_auto_advance"){
   const pending=this.pending.get(event.tool_call_id)??[];
   pending.push(event);this.pending.set(event.tool_call_id,pending);return;
  }
  if(event.type!=="tool_result")return;
  const pending=this.pending.get(event.id);this.pending.delete(event.id);
  if(event.is_error)return;
  if(pending!==undefined){
   const pages=pending.flatMap(e=>e.pages.filter(field));
   if(pages.length>0&&(this.allField||pages.some(identified))){
    // Exact repeats share their first source; no unique episode is silently evicted.
    // State seqs vary on repetition, so deduplicate content/attribution/place only.
    const key=quote(pages.map(p=>({text:p.text,speaker:p.speaker,speaker_source:p.speaker_source,map:p.map,map_id:p.map_id,map_display:p.map_display})));
    if(!this.episodes.has(key))this.episodes.set(key,{dialogue_events:pending.map(e=>e.seq),result_event:event.seq,turn:event.turn,pages});
    const episode=this.episodes.get(key);if(episode!==undefined)this.policy?.touch(episode.result_event,event.seq);
   }
  }
  this.progress(event);
 }
 private progress(event:Result):void {
  // Only copy model-delivered lines. Do not expose additional RAM fields or infer
  // progress from model narration, a dialogue buffer, a tool name or a plan.
  if(!["observe","press","navigate_to","navigate_to_target","explore_map","battle_action"].includes(event.name))return;
  const location=/^Location: (.*)$/m.exec(event.text)?.[1]??null;
  if(location===null)return;
  this.current={result_event:event.seq,state_event:event.state_seq??null,location,story:/^Story: (.*)$/m.exec(event.text)?.[1]??null};
  if(!this.visits.has(location))this.visits.set(location,{result_event:event.seq,state_event:event.state_seq??null,location});
 }
 evidence():number[]{
  const refs=new Set<number>();
  const retention=this.retention(),active=retention===null?this.archive():this.archive().filter(e=>retention.kept.some(k=>k.result_event===e.result_event));
  for(const p of retention?.proofs??[]){refs.add(p.state_event);refs.add(p.result_event);}
  for(const e of active){for(const seq of e.dialogue_events)refs.add(seq);refs.add(e.result_event);}
  for(const p of [...(retention===null?this.visits.values():[]),...(this.current===null?[]:[this.current])]){refs.add(p.result_event);if(p.state_event!==null)refs.add(p.state_event);}
  // Existing ledger_context metadata has a 64-ref limit. Every source remains in
  // the exact recorded YAML even when this convenience index fills.
  return [...refs].sort((a,b)=>a-b).slice(-64);
 }
 text():string|null {
  if(this.episodes.size===0)return null;
  const retention=this.retention();
  if(retention!==null){
   const selected=new Set(retention.kept.map(e=>e.result_event));
   const payload={columns:["speaker","speaker_source","text","map","map_id","state_event"],episodes:this.archive().filter(e=>selected.has(e.result_event)).map(e=>({result:e.result_event,dialogue:e.dialogue_events,turn:e.turn,pages:e.pages.map(p=>[p.speaker,p.speaker_source,p.text,p.map,p.map_id,p.state_seq])})),current:this.current};
   return "OBSERVED INSTRUCTION MEMORY — selected historical dialogue, not an active-goal list. Exact whole episodes; pages follow the columns below. Current observations override old text. Unknown, mixed, future and reusable dialogue stays. Full archive remains in the run recording.\n"+quote(payload);
  }
  const out=[
   "OBSERVED INSTRUCTION MEMORY — historical game dialogue, not an active-goal list.",
   this.allField?"Whole delivered field-dialogue episodes are retained, including unnamed speakers and unknown attribution. A tool call may contain only part of a conversation; all selected calls remain separately. The player/addressee and outstanding subgoals are for you to interpret from the exact words. Arrival, challenge and victory are different; none retires a quote. Current observations override old text. Missing progress is unknown, not false. No route or objective is supplied.":"Whole delivered field-dialogue episodes containing a story character's printed name are retained. Other dialogue and unattributed-only calls are not selected. A tool call may contain only part of a conversation; all selected calls remain separately. The player/addressee and outstanding subgoals are for you to interpret from the exact words. Arrival, challenge and victory are different; none retires a quote. Current observations override old text. Missing progress is unknown, not false. No route or objective is supplied.",
   "observed_instruction_episodes:",
  ];
  for(const e of this.episodes.values()){
   out.push(`  - dialogue_events: ${quote(e.dialogue_events)}`,`    delivered_result: ${String(e.result_event)}`,`    turn: ${String(e.turn)}`,"    pages:");
   for(const p of e.pages)out.push(`      - speaker: ${quote(p.speaker)}`,`        speaker_source: ${quote(p.speaker_source)}`,`        text: ${quote(p.text)}`,`        map: ${quote(p.map)}`,`        map_id: ${quote(p.map_id)}`,`        state_event: ${quote(p.state_seq)}`);
  }
  out.push("observed_progress:",`  current: ${quote(this.current)}`,`  observed_locations: ${quote([...this.visits.values()])}`);
  return out.join("\n");
 }
}

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
export function observedInstructions(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,transform:Transform):Transform {
 if(!features["observed-instructions-v1"])return transform;
 const memory=new ObservedInstructions(features["observed-field-dialogue-v1"],features["milestone-instruction-memory-v1"]);recorder.subscribe(event=>{memory.observe(event);});
 return messages=>{
  const text=memory.text();if(text===null)return transform(messages);
  const retention=memory.retention();
  recorder.recordLedgerContext({text,evidence:memory.evidence(),...(retention===null?{}:{retention})});
  return transform([...messages,{role:"user",content:text,timestamp:Date.now()}]);
 };
}
