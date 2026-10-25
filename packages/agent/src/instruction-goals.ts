import {Value} from "typebox/value";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunEvent} from "./events.js";
import {GoalReviewSchema,type InstructionGoal} from "./instruction-goal-schema.js";

type Dialogue=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
interface Episode {id:number;turn:number;pages:Dialogue["pages"];latest_result:number;reviewed_result:number;interpretation:string|null;repeated_of:number|null}
interface GoalRecord extends InstructionGoal {updated_result:number;verification:"model_interpretation"|"model_reported"|"native_verified";native_reason?:string}
export interface NativeGoalTask {readonly requires:readonly string[]}
export interface InstructionNativeProof {
 observe:(state:Extract<RunEvent,{type:"state";started:boolean}>)=>void;
 tasks:(pages:readonly Dialogue["pages"][number][])=>ReadonlyMap<Dialogue["pages"][number],NativeGoalTask>;
 completed:(task:NativeGoalTask|undefined,state:GameStateSnapshot|undefined)=>string|null;
}
const terminal=(g:InstructionGoal):boolean=>["reported_complete","superseded","abandoned"].includes(g.status);
export const GOAL_LIMITS={headerGoals:12,headerEpisodes:4,maxUnfinished:128} as const;

export class GoalReviewError extends Error {}

export class InstructionGoals {
 constructor(private readonly native?:InstructionNativeProof,private readonly limits:Readonly<{headerGoals:number;headerEpisodes:number;maxUnfinished:number}>=GOAL_LIMITS,private readonly options:Readonly<{advisory?:boolean;repairFeedback?:boolean}>={}){}
 private reject(original:string,detail:string):never {throw new GoalReviewError(this.options.repairFeedback?detail:original);}
 private recentEpisodes():string {return JSON.stringify([...this.episodes.keys()].slice(-16));}
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
  const id=event.seq;
  const episode:Episode={id,turn:event.turn,pages,latest_result:event.seq,reviewed_result:-1,interpretation:null,repeated_of:this.episodeKeys.get(key)??null};
  this.episodes.set(id,episode);this.episodeKeys.set(key,id);
  this.nativeSources.set(id,this.native?.tasks(pages)??new Map());
  this.current=episode;
 }
 pending():number[]{return [...this.episodes.values()].filter(e=>e.reviewed_result<e.latest_result).map(e=>e.id);}
 apply(input:unknown,callId?:string,beforeCommit?:()=>void):void {
  if(callId!==undefined&&this.applied.has(callId))return;
  if(!Value.Check(GoalReviewSchema,input))throw new GoalReviewError("Invalid goal review; supply reviewed episodes and full goal updates");
  const nativeGoals=new Map(this.nativeGoals);
  const goals=new Map(this.goals),reviewed=new Set<number>(),updated=new Set<string>();
  for(const [index,r] of input.reviewed.entries()){
   if(!this.episodes.has(r.episode))this.reject("Review must cite unique delivered dialogue episodes",`reviewed[${String(index)}].episode ${String(r.episode)} was not delivered; recent delivered episode IDs: ${this.recentEpisodes()}`);
   if(reviewed.has(r.episode))this.reject("Review must cite unique delivered dialogue episodes",`reviewed[${String(index)}].episode ${String(r.episode)} duplicates an earlier entry; cite each episode once`);
   reviewed.add(r.episode);
  }
  for(const g of input.updates){
   if(updated.has(g.id))throw new GoalReviewError("Only one update per goal per review");updated.add(g.id);
   for(const [index,s] of g.sources.entries()){
    const e=this.episodes.get(s.episode);
    if(e===undefined)this.reject("Goal source must cite a delivered episode and zero-based page",`Goal ${JSON.stringify(g.id)} sources[${String(index)}].episode ${String(s.episode)} was not delivered; recent delivered episode IDs: ${this.recentEpisodes()}`);
    if(e.pages[s.page]===undefined)this.reject("Goal source must cite a delivered episode and zero-based page",`Goal ${JSON.stringify(g.id)} sources[${String(index)}].page ${String(s.page)} is outside delivered episode ${String(s.episode)}; valid zero-based pages: 0–${String(e.pages.length-1)}`);
   }
   for(const [index,ref] of (g.evidence??[]).entries())if(!this.results.has(ref))this.reject("Goal evidence must cite delivered observations in this run",`Goal ${JSON.stringify(g.id)} evidence[${String(index)}] ${String(ref)} was not delivered; latest delivered observation result: ${String(this.latestResult)}`);
   const previous=goals.get(g.id);
   if(g.status==="reported_complete"&&(previous===undefined||(g.evidence??[]).length===0||!(g.evidence??[]).some(ref=>ref>previous.updated_result)))this.reject("Reported completion needs a prior goal and newer delivered observation evidence",previous===undefined?`Goal ${JSON.stringify(g.id)} has no prior record; register it before reporting completion, then cite a newer delivered observation result`:`Goal ${JSON.stringify(g.id)} evidence needs a delivered observation result newer than ${String(previous.updated_result)}; ${this.latestResult>previous.updated_result?`latest available: ${String(this.latestResult)} (a valid reference does not itself prove completion)`:"none has been delivered yet"}`);
   if(g.status==="superseded"&&g.superseded_by===undefined)throw new GoalReviewError("Superseded goals must name their replacement");
   const tasks=g.sources.map(source=>{const page=this.episodes.get(source.episode)?.pages[source.page];return page===undefined?undefined:this.nativeSources.get(source.episode)?.get(page);});
   if(g.native_source_completion===true&&tasks.every((task):task is NativeGoalTask=>task!==undefined))nativeGoals.set(g.id,tasks);else nativeGoals.delete(g.id);
   goals.set(g.id,{...g,updated_result:this.latestResult,verification:g.status==="reported_complete"?"model_reported":"model_interpretation"});
  }
  for(const g of goals.values()){
   if(g.parent!==null&&!goals.has(g.parent))this.reject("Unknown parent goal",`Goal ${JSON.stringify(g.id)} parent ${JSON.stringify(g.parent)} is unknown; existing or submitted goal IDs: ${JSON.stringify([...goals.keys()].slice(-16))}`);
   if(g.superseded_by!==undefined&&(!goals.has(g.superseded_by)||g.superseded_by===g.id))this.reject("Unknown or self replacement",`Goal ${JSON.stringify(g.id)} superseded_by ${JSON.stringify(g.superseded_by)} must name a different existing or submitted goal; available goal IDs: ${JSON.stringify([...goals.keys()].slice(-16))}`);
   const seen=new Set<string>([g.id]);let p=g.parent;
   while(p!==null){if(seen.has(p))throw new GoalReviewError("Goal parents cannot form cycles");seen.add(p);p=goals.get(p)?.parent??null;}
  }
  if([...goals.values()].filter(g=>!terminal(g)).length>this.limits.maxUnfinished)throw new GoalReviewError("Unfinished goal bound reached; explicitly account for existing goals first");
  // The recorder synchronously broadcasts its own transaction; reserve the ID until append succeeds.
  if(callId!==undefined)this.applied.add(callId);
  try{beforeCommit?.();}catch(error){if(callId!==undefined)this.applied.delete(callId);throw error;}
  this.goals=goals;this.nativeGoals.clear();for(const [id,tasks] of nativeGoals)this.nativeGoals.set(id,tasks);
  for(const r of input.reviewed){const e=this.episodes.get(r.episode);if(e!==undefined){e.reviewed_result=e.latest_result;e.interpretation=r.interpretation;}}
  this.completeNative(this.latestResult);
 }
 private completeNative(resultSeq:number):void {
  const native=this.native;
  if(native===undefined||this.deliveredState===undefined)return;
  for(const [id,tasks] of this.nativeGoals){
   const goal=this.goals.get(id);if(goal===undefined||goal.verification==="native_verified"||["superseded","abandoned"].includes(goal.status)||tasks.length===0)continue;
   const reasons=tasks.map(task=>native.completed(task,this.deliveredState));
   if(reasons.every((reason):reason is string=>reason!==null))this.goals.set(id,{...goal,status:"reported_complete",verification:"native_verified",native_reason:[...new Set(reasons)].join("; "),evidence:[resultSeq],updated_result:resultSeq});
  }
 }
 archive(episode?:number,goal?:string,offset=0,limit=50):string {
  if(episode!==undefined&&goal!==undefined)throw new Error("Choose either an episode or goal");
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new Error("Archive offset/limit out of range");
  if(episode!==undefined){const e=this.episodes.get(episode);if(e===undefined)throw new Error("Unknown delivered dialogue episode");return JSON.stringify(e);}
  if(goal!==undefined){const g=this.goals.get(goal);if(g===undefined)throw new Error("Unknown goal");return JSON.stringify(g);}
  return JSON.stringify({episode_count:this.episodes.size,goal_count:this.goals.size,offset,limit,episodes:[...this.episodes.values()].slice(offset,offset+limit).map(e=>({id:e.id,turn:e.turn,pending:e.reviewed_result<e.latest_result})),goals:[...this.goals.values()].slice(offset,offset+limit).map(g=>({id:g.id,status:g.status,title:g.title})),more_episodes:offset+limit<this.episodes.size,more_goals:offset+limit<this.goals.size});
 }
 evidence():number[]{return [...new Set([...this.episodes.values()].map(e=>e.latest_result).concat([...this.goals.values()].flatMap(g=>g.evidence??[])))].slice(-64);}
 text():string {
  const pending=this.pending(),goals=[...this.goals.values()],unfinished=goals.filter(g=>!terminal(g));
  const ordered=[...unfinished.filter(g=>g.status==="active"),...unfinished.filter(g=>g.status!=="active")];
  const shown=pending.slice(-this.limits.headerEpisodes).flatMap(id=>{const episode=this.episodes.get(id);return episode===undefined?[]:[episode];});
  return ["INSTRUCTION GOALS — exact game dialogue and your own interpretations. No route or goal is assigned by the harness. Current observations override historical state.",
   `Latest delivered observation result: ${this.results.size===0?"none":String(this.latestResult)}; native state: ${this.deliveredState===undefined?"unavailable":String(this.deliveredState.seq)}. Cite delivered result IDs for observation evidence.`,
   `Current observed interface: ${this.deliveredState===undefined?"unavailable":JSON.stringify({screen:this.deliveredState.screen,phase:this.deliveredState.active_ui?.phase??null,selected:this.deliveredState.active_ui?.selected??null,ready:this.deliveredState.active_ui?.ready??null})}`,
   `Last delivered field dialogue (historical; not proof the interaction is still active): ${this.current===null?"none recorded":JSON.stringify(this.current)}`,
   `Dialogue awaiting your interpretation (${String(pending.length)}): ${JSON.stringify(pending.slice(-16))} (up to 16 recent IDs shown; archive lists the rest). ${this.options.advisory?"Reviews are optional bookkeeping and never a prerequisite for gameplay; you may explain that an episode is not a request.":"Account for each new episode with goal_review or review_goals before a game-changing action; you may explain that it is not a request."}`,
   `Recent pending episodes (${String(shown.length)} shown; get_instruction_goals retrieves any episode): ${JSON.stringify(shown)}`,
   `Unfinished goals (${String(unfinished.length)} total, ${String(Math.min(ordered.length,this.limits.headerGoals))} shown): ${JSON.stringify(ordered.slice(0,this.limits.headerGoals))}`,
   `Recently closed goals (model claims unless native proof is explicitly labelled): ${JSON.stringify(goals.filter(terminal).slice(-4))}`,
   "Review a changed plan explicitly: defer, block, abandon or supersede existing goals with a reason. Age, arrival and a different active goal do not prove completion. Reported completion is your interpretation, not native game verification. get_instruction_goals lists every goal and retrieves whole quotes.",
  ].join("\n");
 }
}
