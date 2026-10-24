import {Value} from "typebox/value";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunEvent} from "./events.js";
import {GoalReviewSchema,type InstructionGoal} from "./instruction-goal-schema.js";

type Dialogue=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Result=Extract<RunEvent,{type:"tool_result"}>;
interface Episode {id:number;turn:number;pages:Dialogue["pages"];latest_result:number;reviewed_result:number;interpretation:string|null}
interface GoalRecord extends InstructionGoal {updated_result:number;verification:"model_interpretation"|"model_reported"|"native_verified";native_reason?:string}
export interface NativeGoalTask {readonly requires:readonly string[]}
export interface InstructionNativeProof {
 observe:(state:Extract<RunEvent,{type:"state";started:boolean}>)=>void;
 tasks:(pages:readonly Dialogue["pages"][number][])=>ReadonlyMap<Dialogue["pages"][number],NativeGoalTask>;
 completed:(task:NativeGoalTask|undefined,state:GameStateSnapshot|undefined)=>string|null;
}
const terminal=(g:InstructionGoal):boolean=>["reported_complete","superseded","abandoned"].includes(g.status);
export const GOAL_LIMITS={headerGoals:12,headerEpisodes:4,maxUnfinished:128} as const;

export class InstructionGoals {
 constructor(private readonly native?:InstructionNativeProof,private readonly limits:Readonly<{headerGoals:number;headerEpisodes:number;maxUnfinished:number}>=GOAL_LIMITS){}
 private readonly states=new Map<number,Extract<RunEvent,{type:"state";started:boolean}>>();
 private readonly nativeSources=new Map<number,ReadonlyMap<Dialogue["pages"][number],NativeGoalTask>>();
 private readonly nativeGoals=new Map<string,readonly NativeGoalTask[]>();
 private deliveredState:Extract<RunEvent,{type:"state";started:boolean}>|undefined;
 private run:string|null=null;
 private readonly dialogue=new Map<string,Dialogue[]>();
 private readonly episodes=new Map<number,Episode>();
 private readonly episodeKeys=new Map<string,number>();
 private goals=new Map<string,GoalRecord>();
 private readonly results=new Set<number>();
 private readonly applied=new Set<string>();
 private latestResult=0;
 private current:Episode|null=null;
 observe(event:RunEvent):void {
  this.run??=event.run;if(event.run!==this.run)return;
  if(event.type==="state"&&"started"in event){this.native?.observe(event);this.states.set(event.seq,event);if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);return;}
  if(event.type==="dialogue_auto_advance"){
   const pages=event.pages.filter(p=>p.battle_turn===undefined&&p.battle_message_id===undefined);
   if(pages.length>0)this.dialogue.set(event.tool_call_id,[...(this.dialogue.get(event.tool_call_id)??[]),{...event,pages}]);
  }
  if(event.type==="ledger_context"&&event.instruction_goals!==undefined){this.apply(event.instruction_goals.review,event.instruction_goals.call_id);return;}
  if(event.type!=="tool_result")return;
  const ds=this.dialogue.get(event.id);this.dialogue.delete(event.id);
  if(event.is_error)return;
  if(event.state_seq!==undefined){this.results.add(event.seq);this.latestResult=event.seq;this.deliveredState=this.states.get(event.state_seq);this.completeNative(event.seq);}

  if(ds===undefined)return;
  const pages=ds.flatMap(d=>d.pages),key=JSON.stringify(pages.map(p=>[p.text,p.speaker,p.speaker_source,p.map_id]));
  const old=this.episodeKeys.get(key),id=old??event.seq;
  let episode=this.episodes.get(id);
  if(episode===undefined){episode={id,turn:event.turn,pages,latest_result:event.seq,reviewed_result:-1,interpretation:null};this.episodes.set(id,episode);this.episodeKeys.set(key,id);}
  else episode.latest_result=event.seq;
  if(old===undefined)this.nativeSources.set(id,this.native?.tasks(pages)??new Map());
  this.current=episode;
 }
 pending():number[]{return [...this.episodes.values()].filter(e=>e.reviewed_result<e.latest_result).map(e=>e.id);}
 apply(input:unknown,callId?:string):void {
  if(callId!==undefined&&this.applied.has(callId))return;
  if(!Value.Check(GoalReviewSchema,input))throw new Error("Invalid goal review; supply reviewed episodes and full goal updates");
  const nativeGoals=new Map(this.nativeGoals);
  const goals=new Map(this.goals),reviewed=new Set<number>(),updated=new Set<string>();
  for(const r of input.reviewed){if(!this.episodes.has(r.episode)||reviewed.has(r.episode))throw new Error("Review must cite unique delivered dialogue episodes");reviewed.add(r.episode);}
  for(const g of input.updates){
   if(updated.has(g.id))throw new Error("Only one update per goal per review");updated.add(g.id);
   for(const s of g.sources){const e=this.episodes.get(s.episode);if(e===undefined||e.pages[s.page]===undefined)throw new Error("Goal source must cite a delivered episode and zero-based page");}
   for(const ref of g.evidence??[])if(!this.results.has(ref))throw new Error("Goal evidence must cite delivered observations in this run");
   const previous=goals.get(g.id);
   if(g.status==="reported_complete"&&(previous===undefined||(g.evidence??[]).length===0||!(g.evidence??[]).some(ref=>ref>previous.updated_result)))throw new Error("Reported completion needs a prior goal and newer delivered observation evidence");
   if(g.status==="superseded"&&g.superseded_by===undefined)throw new Error("Superseded goals must name their replacement");
   const tasks=g.sources.map(source=>{const episode=this.episodes.get(source.episode)!;const page=episode.pages[source.page]!;return this.nativeSources.get(source.episode)?.get(page);});
   if(tasks.every((task):task is NativeGoalTask=>task!==undefined))nativeGoals.set(g.id,tasks);else nativeGoals.delete(g.id);
   goals.set(g.id,{...g,updated_result:this.latestResult,verification:g.status==="reported_complete"?"model_reported":"model_interpretation"});
  }
  for(const g of goals.values()){
   if(g.parent!==null&&!goals.has(g.parent))throw new Error("Unknown parent goal");
   if(g.superseded_by!==undefined&&(!goals.has(g.superseded_by)||g.superseded_by===g.id))throw new Error("Unknown or self replacement");
   const seen=new Set<string>([g.id]);let p=g.parent;
   while(p!==null){if(seen.has(p))throw new Error("Goal parents cannot form cycles");seen.add(p);p=goals.get(p)?.parent??null;}
  }
  if([...goals.values()].filter(g=>!terminal(g)).length>this.limits.maxUnfinished)throw new Error("Unfinished goal bound reached; explicitly account for existing goals first");
  this.goals=goals;this.nativeGoals.clear();for(const [id,tasks] of nativeGoals)this.nativeGoals.set(id,tasks);
  for(const r of input.reviewed){const e=this.episodes.get(r.episode)!;e.reviewed_result=e.latest_result;e.interpretation=r.interpretation;}
  if(callId!==undefined)this.applied.add(callId);
  this.completeNative(this.latestResult);
 }
 private completeNative(resultSeq:number):void {
  if(this.native===undefined||this.deliveredState===undefined)return;
  for(const [id,tasks] of this.nativeGoals){
   const goal=this.goals.get(id);if(goal===undefined||terminal(goal)||tasks.length===0)continue;
   const reasons=tasks.map(task=>this.native!.completed(task,this.deliveredState));
   if(reasons.every((reason):reason is string=>reason!==null))this.goals.set(id,{...goal,status:"reported_complete",verification:"native_verified",native_reason:[...new Set(reasons)].join("; "),evidence:[resultSeq],updated_result:resultSeq});
  }
 }
 archive(episode?:number,goal?:string):string {
  if(episode!==undefined){const e=this.episodes.get(episode);if(e===undefined)throw new Error("Unknown delivered dialogue episode");return JSON.stringify(e);}
  if(goal!==undefined){const g=this.goals.get(goal);if(g===undefined)throw new Error("Unknown goal");return JSON.stringify(g);}
  return JSON.stringify({episodes:[...this.episodes.values()].map(e=>({id:e.id,turn:e.turn,pending:e.reviewed_result<e.latest_result})),goals:[...this.goals.values()].map(g=>({id:g.id,status:g.status,title:g.title}))});
 }
 evidence():number[]{return [...new Set([...this.episodes.values()].map(e=>e.latest_result).concat([...this.goals.values()].flatMap(g=>g.evidence??[])))].slice(-64);}
 text():string {
  const pending=this.pending(),goals=[...this.goals.values()],unfinished=goals.filter(g=>!terminal(g));
  const ordered=[...unfinished.filter(g=>g.status==="active"),...unfinished.filter(g=>g.status!=="active")];
  const shown=pending.slice(-this.limits.headerEpisodes).map(id=>this.episodes.get(id)!);
  return ["INSTRUCTION GOALS — exact game dialogue and your own interpretations. No route or goal is assigned by the harness. Current observations override historical state.",
   `Current interaction: ${this.current===null?"none recorded":JSON.stringify(this.current)}`,
   `Dialogue awaiting your interpretation (${String(pending.length)}): ${JSON.stringify(pending)}. Account for each new episode with goal_review or review_goals before a game-changing action; you may explain that it is not a request.`,
   `Recent pending episodes (${String(shown.length)} shown; get_instruction_goals retrieves any episode): ${JSON.stringify(shown)}`,
   `Unfinished goals (${String(unfinished.length)} total, ${String(Math.min(ordered.length,this.limits.headerGoals))} shown): ${JSON.stringify(ordered.slice(0,this.limits.headerGoals))}`,
   `Recently closed goals (model claims unless native proof is explicitly labelled): ${JSON.stringify(goals.filter(terminal).slice(-4))}`,
   "Review a changed plan explicitly: defer, block, abandon or supersede existing goals with a reason. Age, arrival and a different active goal do not prove completion. Reported completion is your interpretation, not native game verification. get_instruction_goals lists every goal and retrieves whole quotes.",
  ].join("\n");
 }
}
