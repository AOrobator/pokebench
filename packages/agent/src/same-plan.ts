import {roomOf} from "./dialogue-log.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {LoopDetector} from "./loop-detection.js";

// same-plan-breaker-v1: a factual note when the model's stated plan repeats while the game does not move on.
export const SAME_PLAN_DECISIONS=3;
export const SAME_PLAN_SIMILARITY=0.8;

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Snapshot {readonly key:string;readonly free:boolean;readonly label:string}
interface Decision {readonly turn:number;readonly seq:number;readonly plan:string;readonly tokens:readonly string[];readonly ids:Set<string>;resultSeq:number;state:Snapshot|null;done:boolean}

export function planTokens(plan:string):string[] {return plan.toLowerCase().match(/[a-z0-9]+|[^\sa-z0-9]/g)??[];}

// 2·LCS/(|a|+|b|) over tokens: 1 for identical plans, 0 for plans with no token in common.
export function planSimilarity(a:readonly string[],b:readonly string[]):number {
 if(a.length===0&&b.length===0)return 1;
 let previous=new Array<number>(b.length+1).fill(0);
 for(const x of a){
  const row=[0];
  for(let j=0;j<b.length;j++)row.push(x===b[j]?(previous[j]??0)+1:Math.max(previous[j+1]??0,row[j]??0));
  previous=row;
 }
 return 2*(previous[b.length]??0)/(a.length+b.length);
}

const at=(p:{x:number;y:number}):string=>`(${String(p.x)},${String(p.y)})`;

// The game state a decision left behind, or null where the readout cannot qualify it (intro, naming, transitions,
// a battle waiting on its own animation). Field-control lock is part of the state: a coordinate script that has
// stopped the player is a different state from standing there free.
export function planState(state:State,features:FeatureSet):Snapshot|null {
 if(!state.started)return null;
 const ui=state.active_ui??null;
 const party=state.party.map(p=>[p.species_id??p.species,p.level,p.hp,p.status??null]);
 const common={screen:state.screen,map:state.map_id,position:state.position,facing:state.facing,locked:state.field_controls_locked??null,story:state.story??null,party,dialogue:state.world_context?.dialogue??null,ui:ui===null?null:[ui.phase,ui.selected,ui.value??null]};
 if(state.in_battle){
  if(ui?.ready!==true||ui.diagnostic!==null)return null;
  const battle=state.battle??null;
  const fight=battle===null?null:[battle.phase,battle.turn,battle.outcome,(battle.battlers??[]).map(b=>[b.battler,b.species_id,b.hp,b.status1])];
  return {key:JSON.stringify({...common,battle:fight}),free:true,label:`in battle (${ui.phase}${ui.selected===null?"":`, ${ui.selected} selected`})`};
 }
 if(state.screen!=="overworld"||state.map_id===null||state.position===null||state.facing===null)return null;
 const free=state.field_controls_locked===false;
 return {key:JSON.stringify(common),free,label:`${roomOf(state,features)} at ${at(state.position)} facing ${state.facing.toLowerCase()}${free?"":", field controls locked"}`};
}

export class SamePlanBreaker {
 private readonly decisions:Decision[]=[];
 private readonly states=new Map<number,State>();
 // Index (in decisions ever completed) after which a new note may count decisions; re-armed after each note.
 private completed=0;
 private armedAfter=0;
 constructor(private readonly features:FeatureSet,private readonly detector:Pick<LoopDetector,"stall">){}

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event){
   this.states.set(event.seq,event);
   if(this.states.size>32)this.states.delete(this.states.keys().next().value??-1);
   return;
  }
  if(event.type==="assistant"&&event.tool_calls.length>0){
   const plan=[event.thinking,event.text].filter(part=>part!=="").join("\n").trim();
   this.decisions.push({turn:event.turn,seq:event.seq,plan,tokens:planTokens(plan),ids:new Set(event.tool_calls.map(c=>c.id)),resultSeq:event.seq,state:null,done:false});
   if(this.decisions.length>SAME_PLAN_DECISIONS+2)this.decisions.shift();
   return;
  }
  if(event.type!=="tool_result")return;
  const decision=this.decisions.at(-1);
  if(decision===undefined||decision.done||!decision.ids.delete(event.id))return;
  const state=event.state_seq===undefined?undefined:this.states.get(event.state_seq);
  decision.state=state===undefined||event.is_error?null:planState(state,this.features);
  decision.resultSeq=event.seq;
  if(decision.ids.size>0)return;
  decision.done=true;
  this.completed++;
  this.check();
 }

 private check():void {
  const all=this.decisions;
  if(all.length<SAME_PLAN_DECISIONS+2||this.completed-this.armedAfter<SAME_PLAN_DECISIONS)return;
  const window=all.slice(-SAME_PLAN_DECISIONS);
  if(!window.every(d=>d.done))return;
  if(!window.every((d,i)=>window.slice(i+1).every(e=>planSimilarity(d.tokens,e.tokens)>=SAME_PLAN_SIMILARITY)))return;
  const states=all.map(d=>d.state);
  if(states.some(s=>s===null))return;
  const snapshots=states as Snapshot[];
  const before=snapshots.slice(0,2);
  if(!snapshots.slice(2).every(s=>before.some(b=>b.key===s.key)))return;
  if(!snapshots.some(s=>s.free))return;
  const latest=window.at(-1);const first=window[0];
  if(latest===undefined||first===undefined)return;
  const turns=window.map(d=>String(d.turn)).join(", ");
  // What the player went through from just before the first of these decisions: the two states the note names.
  const distinct=[...new Map(snapshots.slice(1).map(s=>[s.key,s])).values()];
  const [a,b]=distinct;
  const change=distinct.length===1||a===undefined||b===undefined?"the game state did not change":`the game state did not change beyond going back and forth between ${a.label} and ${b.label}`;
  const text=`SUPERVISOR: Your last ${String(SAME_PLAN_DECISIONS)} plans (turns ${turns}) were the same and ${change}: ${latest.plan}`;
  if(this.detector.stall("same_plan",()=>text,[first.seq,latest.resultSeq]))this.armedAfter=this.completed;
 }
}
