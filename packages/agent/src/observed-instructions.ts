// Retain evidence, not an extracted objective. In particular, preserve every page of
// PetalburgCity_Gym_Text_DadGoCollectBadges: arrival and challenging ROXANNE are distinct.
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";
import {MilestoneMemory,type InstructionEpisode,type MemoryRetention} from "./milestone-memory.js";
import {canonicalStoryCharacterName} from "./script-line-presence.js";
import {CAP_LOCATION_CHARS,INSTRUCTION_MEMORY_CAP_CHARS,InstructionMemoryCap,codePoints,omittedLine,type CapEpisode} from "./instruction-memory-cap.js";

type Dialogue=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
// instruction-memory-cap-v1, only when it leaves episodes out: the headers stop claiming every episode stays.
export const CAPPED_SELECTION="Finished episodes, and less relevant ones over the size cap, are left out.";
const CAPPED_LEGACY="finished episodes, and less relevant ones over the size cap, are left out";
type Result=Extract<RunEvent,{type:"tool_result"}>;
type Episode=InstructionEpisode;
interface Progress {result_event:number;state_event:number|null;location:string|null;story:string|null}
interface Locations {observed_locations:Pick<Progress,"result_event"|"state_event"|"location">[];earlier_locations_left_out?:number}
interface Fixed {readonly current:Progress|null;readonly current_left_out?:true;readonly locations:Locations}
const without=(fx:Fixed):Fixed=>({current:null,current_left_out:true,locations:fx.locations});
const quote=(value:unknown):string=>JSON.stringify(value);
const field=(page:Dialogue["pages"][number])=>page.battle_turn===undefined&&page.battle_message_id===undefined;
const identified=(page:Dialogue["pages"][number])=>page.speaker_source==="name_prefix"&&page.speaker!==null&&canonicalStoryCharacterName(page.speaker)!==null;

export class ObservedInstructions {
 private readonly policy:MilestoneMemory|null;
 private readonly cap:InstructionMemoryCap|null;
 // current-map-display-name-v1: a page's map named as the readout's Location line named it (map_display), when recorded.
 // instruction-memory-cap-v1 (cap): rule A′ over the episodes either form keeps, after instruction-memory-dedup-v1's
 // merge; see instruction-memory-cap.ts.
 constructor(private readonly allField=false,trim=false,private readonly displayNames=false,cap=false,wholeGame=false){this.policy=trim?new MilestoneMemory():null;this.cap=cap?new InstructionMemoryCap(wholeGame):null;}
 private mapName(page:Dialogue["pages"][number]):string|null {return this.displayNames?page.map_display??page.map:page.map;}
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
  this.cap?.observe(event);
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
 placeEpisodes():readonly InstructionEpisode[] {
  const retention=this.retention();
  const kept=new Set(retention?.kept.map(e=>e.result_event)??this.archive().map(e=>e.result_event));
  return this.archive().filter(e=>kept.has(e.result_event)&&e.pages.some(p=>/\b(?:upstairs|downstairs|next door|lives|went|house|lab|town|city|route|woods|gym)\b/i.test(p.text)));
 }
 placeEvidence():string|null {
  const episodes=this.placeEpisodes();
  if(episodes.length===0)return null;
  return "DELIVERED PERSON AND PLACE EVIDENCE — historical quotes, not current presence or an active objective. Unknown speakers stay unknown; relative words refer to the quoted source location. Current observations override old statements. No route or person identity is inferred. Exact whole episodes; audited native completion may retire them, unknown variants stay.\n"+quote({columns:["speaker","speaker_source","text","source_map_display","source_map_name","map_id","state_event"],episodes:episodes.map(e=>({result:e.result_event,dialogue:e.dialogue_events,turn:e.turn,pages:e.pages.map(p=>[p.speaker,p.speaker_source,p.text,p.map_display??null,p.map,p.map_id,p.state_seq])}))});
 }
 text(places?:readonly InstructionEpisode[]):string|null {
  const hasBase=this.episodes.size>0;
  if(!hasBase&&(places?.length??0)===0)return null;
  const retention=this.retention();
  if(retention!==null||places!==undefined){
   const selected=new Set(retention?.kept.map(e=>e.result_event)??this.archive().map(e=>e.result_event));
   const episodes=new Map(this.archive().filter(e=>selected.has(e.result_event)).map(e=>[e.result_event,e]));
   for(const episode of places??[])episodes.set(episode.result_event,episode);
   const spatial=new Set(places?.map(e=>e.result_event));
   const rows=[...episodes.values()].map(e=>this.row(e,places===undefined?undefined:spatial.has(e.result_event)));
   let fx=this.fixed();
   const render=(kept:readonly CapEpisode[],omitted:number)=>`OBSERVED INSTRUCTION MEMORY — selected historical dialogue, not an active-goal list. Exact whole episodes; pages follow the columns below. Current observations override old text. ${omitted===0?"Unknown, mixed, future and reusable dialogue stays.":CAPPED_SELECTION} Full archive remains in the run recording.\n${omitted===0?"":`${omittedLine(omitted)}\n`}`+quote({columns:["speaker","speaker_source","text","map","map_id","state_event",...(places===undefined?[]:["source_map_name","source_map_display"])],episodes:kept,...(hasBase?{current:fx.current,...(fx.current_left_out===true?{current_left_out:true}:{})}:{}),...(hasBase&&places!==undefined&&retention===null?fx.locations:{})});
   if(this.cap===null)return render(rows,0);
   if(this.over(render([],rows.length)))fx=without(fx);
   const capped=this.cap.select(rows,render);
   return render(capped.kept,capped.omitted);
  }
  const all=this.archive().map(e=>this.row(e));
  let fx=this.fixed();
  if(this.cap===null)return this.legacy(all,0,fx);
  if(this.over(this.legacy([],all.length,fx)))fx=without(fx);
  const capped=this.cap.select(all,(kept,omitted)=>this.legacy(kept,omitted,fx));
  return this.legacy(capped.kept,capped.omitted,fx);
 }
 // The part of the block that is not episodes, computed once per request so selection never re-serializes it.
 private fixed():Fixed {return {current:this.current,locations:this.locations()};}
 // instruction-memory-cap-v1: current is left out whole (current_left_out) only when, with no episodes at all, the
 // block would still pass the cap; it is never cut.
 private over(empty:string):boolean {return this.current!==null&&codePoints(empty)>INSTRUCTION_MEMORY_CAP_CHARS;}
 // instruction-memory-cap-v1: the newest whole entries whose JSON fits CAP_LOCATION_CHARS, and a count of the rest.
 private locations():Locations {
  const all=[...this.visits.values()];
  if(this.cap===null||codePoints(quote(all))<=CAP_LOCATION_CHARS)return {observed_locations:all};
  let kept=0,size=2;
  while(kept<all.length){const next=all[all.length-1-kept];const add=codePoints(quote(next))+(kept===0?0:1);if(next===undefined||size+add>CAP_LOCATION_CHARS)break;size+=add;kept++;}
  return {observed_locations:kept===0?[]:all.slice(-kept),earlier_locations_left_out:all.length-kept};
 }
 // instruction-memory-dedup-v1 adds two source-map columns: the place episode's own map and display name, or nulls.
 private row(e:Episode,spatial?:boolean):CapEpisode {return {result:e.result_event,dialogue:e.dialogue_events,turn:e.turn,pages:e.pages.map(p=>[p.speaker,p.speaker_source,p.text,this.mapName(p),p.map_id,p.state_seq,...(spatial===undefined?[]:spatial?[p.map,p.map_display??null]:[null,null])] as const)};}
 private legacy(episodes:readonly CapEpisode[],omitted:number,fx:Fixed):string {
  const out=[
   "OBSERVED INSTRUCTION MEMORY — historical game dialogue, not an active-goal list.",
   ...(omitted===0?[]:[omittedLine(omitted)]),
   (this.allField?"Whole delivered field-dialogue episodes are retained, including unnamed speakers and unknown attribution. A tool call may contain only part of a conversation; all selected calls remain separately. The player/addressee and outstanding subgoals are for you to interpret from the exact words. Arrival, challenge and victory are different; none retires a quote. Current observations override old text. Missing progress is unknown, not false. No route or objective is supplied.":"Whole delivered field-dialogue episodes containing a story character's printed name are retained. Other dialogue and unattributed-only calls are not selected. A tool call may contain only part of a conversation; all selected calls remain separately. The player/addressee and outstanding subgoals are for you to interpret from the exact words. Arrival, challenge and victory are different; none retires a quote. Current observations override old text. Missing progress is unknown, not false. No route or objective is supplied.").replace("none retires a quote",omitted===0?"none retires a quote":CAPPED_LEGACY),
   "observed_instruction_episodes:",
  ];
  for(const e of episodes){
   out.push(`  - dialogue_events: ${quote(e.dialogue)}`,`    delivered_result: ${String(e.result)}`,`    turn: ${String(e.turn)}`,"    pages:");
   for(const [speaker,source,text,map,mapId,stateEvent] of e.pages)out.push(`      - speaker: ${quote(speaker)}`,`        speaker_source: ${quote(source)}`,`        text: ${quote(text)}`,`        map: ${quote(map)}`,`        map_id: ${quote(mapId)}`,`        state_event: ${quote(stateEvent)}`);
  }
  out.push("observed_progress:",`  current: ${quote(fx.current)}`,...(fx.current_left_out===true?["  current_left_out: true"]:[]),`  observed_locations: ${quote(fx.locations.observed_locations)}`,...(fx.locations.earlier_locations_left_out===undefined?[]:[`  earlier_locations_left_out: ${String(fx.locations.earlier_locations_left_out)}`]));
  return out.join("\n");
 }
}

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
export function observedInstructions(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,transform:Transform):Transform {
 if(!features["observed-instructions-v1"])return transform;
 const memory=new ObservedInstructions(features["observed-field-dialogue-v1"],features["milestone-instruction-memory-v1"],features["current-map-display-name-v1"],features["instruction-memory-cap-v1"],features["story-checkpoints-whole-game-v1"]);
 const places=features["delivered-place-evidence-v1"]?new ObservedInstructions(true,true):null;
 recorder.subscribe(event=>{memory.observe(event);places?.observe(event);});
 return messages=>{
  const unique=features["instruction-memory-dedup-v1"]&&places!==null?places.placeEpisodes():undefined;
  const base=memory.text(unique),placeText=unique===undefined?places?.placeEvidence()??null:null;
  const text=base===null?placeText:placeText===null?base:`${base}\n\n${placeText}`;
  if(text===null)return transform(messages);
  const retention=(unique===undefined?placeText===null:unique.length===0)?memory.retention():null;
  recorder.recordLedgerContext({text,evidence:[...new Set([...memory.evidence(),...(places?.evidence()??[])])].slice(-64),...(retention===null?{}:{retention})});
  return transform([...messages,{role:"user",content:text,timestamp:Date.now()}]);
 };
}
