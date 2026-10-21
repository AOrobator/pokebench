import type {RunEvent} from "./events.js";
import {MILESTONES} from "./milestones.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
export interface InstructionEpisode {dialogue_events:number[];result_event:number;turn:number;pages:Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"]}
export interface CompletionProof {name:string;state_event:number;result_event:number}
export interface RetentionDecision {result_event:number;reason:"no_chapter"|"current_chapter"|"unknown"|"unresolved"|"completed";rule:string|null}
export interface MemoryRetention {chapter:CompletionProof|null;archive_count:number;kept:RetentionDecision[];retired:RetentionDecision[];proofs:CompletionProof[]}
// These are completed scenes, not an ordinal window over every measurement.
const CHAPTERS=["CLOCK_SET","RIVAL_MET","BIRCH_STARTER_HANDOFF_COMPLETE","RIVAL_BATTLE_WON","RECEIVED_POKEDEX","RUNNING_SHOES_RECEIVED","WALLY_TUTORIAL_COMPLETE","TEAM_AQUA_WOODS_EVENT_COMPLETE","RUSTBORO_GYM_COMPLETE","STONE_BADGE","ROCK_TOMB_RECEIVED"] as const;
const relevant=new Set<string>([...CHAPTERS,...RETIREMENT_RULES.flatMap(r=>r.requires)]);
const predicates=MILESTONES.filter(m=>relevant.has(m.name));
const observationTools=new Set(["observe","press","navigate_to","navigate_to_target","explore_map","battle_action"]);

export class MilestoneMemory {
 private measured:State|null=null;
 private player:string|null=null;
 private readonly completed=new Map<string,CompletionProof>();
 private readonly delivered=new Map<number,number>();
 private chapter:CompletionProof|null=null;
 private rank=-1;
 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){this.measured=event;return;}
  if(event.type!=="tool_result")return;
  const state=this.measured;this.measured=null;
  if(event.is_error||state===null||event.state_seq!==state.seq||!observationTools.has(event.name))return;
  if(state.story?.name_confirmed===true&&state.name!==null)this.player=state.name;
  for(const milestone of predicates){
   if(this.completed.has(milestone.name)||milestone.reached(state)!==true)continue;
   const proof={name:milestone.name,state_event:state.seq,result_event:event.seq};
   this.completed.set(milestone.name,proof);
   const rank=CHAPTERS.findIndex(name=>name===milestone.name);
   if(rank>this.rank){this.rank=rank;this.chapter=proof;}
  }
 }
 touch(firstResult:number,latestResult:number):void {this.delivered.set(firstResult,latestResult);}
 select(episodes:readonly InstructionEpisode[]):MemoryRetention {
  const kept:RetentionDecision[]=[],retired:RetentionDecision[]=[];
  for(const episode of episodes){
   let decision:RetentionDecision={result_event:episode.result_event,reason:"unknown",rule:null};
   if(this.chapter===null)decision={...decision,reason:"no_chapter"};
   else if((this.delivered.get(episode.result_event)??episode.result_event)>=this.chapter.result_event)decision={...decision,reason:"current_chapter"};
   else {
    const rule=RETIREMENT_RULES.find(r=>r.pages.length===episode.pages.length&&r.pages.every((p,i)=>{
     const actual=episode.pages[i];
     if(actual===undefined||p.text.includes("{PLAYER}")&&this.player===null)return false;
     return actual.text===p.text.replaceAll("{PLAYER}",this.player??"")&&JSON.stringify(actual.map_id)===JSON.stringify(p.map_id)&&actual.speaker===p.speaker&&actual.speaker_source===p.speaker_source;
    }));
    if(rule!==undefined)decision={...decision,rule:rule.id,reason:rule.requires.every(name=>this.completed.has(name))?"completed":"unresolved"};
   }
   (decision.reason==="completed"?retired:kept).push(decision);
  }
  return {chapter:this.chapter,archive_count:episodes.length,kept,retired,proofs:[...this.completed.values()]};
 }
}
