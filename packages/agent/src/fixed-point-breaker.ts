import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {AssistantMessage} from "@mariozechner/pi-ai";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {NUDGE,TEXT_ONLY_REMINDER} from "./harness.js";
import {planState} from "./same-plan.js";

// fixed-point-breaker-v1: same calls leaving the same game state this many turns in a row collapse to one copy (stage 1);
// one more such turn adds the positive note (stage 2). A reply with no tool call gets the note at once.
export const FIXED_POINT_TURNS=3;
export const FIXED_POINT_NOTE_TURNS=FIXED_POINT_TURNS+1;
export const BREAKER_NOTE="SUPERVISOR: Make one tool call based on the game state and what you observed.";
// short-cycle-fixed-point-v1: a cycle of 2 to 4 (calls, state) turns counts once it has come round as many times as
// identical turns must repeat (3 copies); stage 1 then keeps its newest copy, and one more turn adds the note.
export const CYCLE_PERIODS=[2,3,4] as const;
export const CYCLE_COPIES=FIXED_POINT_TURNS;

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Body=Omit<BodyOf<"loop_breaker">,"type"|"turn">;
export interface BreakerRecorder {recordLoopBreaker(body:Body):void}
interface Turn {readonly calls:string;readonly ids:Set<string>;readonly states:Map<string,string|null>;readonly cycle:Map<string,string|null>;done:boolean}
interface Group {readonly id:string;readonly key:string|null;readonly item:string|null;readonly silent:boolean;readonly members:number[]}
export interface CycleRun {readonly start:number;readonly end:number;readonly period:number}

const plural=(n:number,one:string,many:string):string=>`${String(n)} ${n===1?one:many}`;

export function noToolNote(replies:number):string {
 return `${BREAKER_NOTE} Your last ${plural(replies,"reply","replies")} called no tool.`;
}
export function fixedPointNote(turns:number,names:readonly string[]):string {
 return `${BREAKER_NOTE} Your last ${String(turns)} turns made the same ${names.join(", ")} call${names.length===1?"":"s"} and the game state stayed the same after each one.`;
}
export function cycleNote(turns:number,period:number,names:readonly string[]):string {
 return `${BREAKER_NOTE} Your last ${String(turns)} turns repeated the same ${String(period)} turns of ${names.join(", ")} calls, and the game state came back to the same ${String(period)} states each time round.`;
}

// short-cycle-fixed-point-v1: planState's fields without the open interface's value (ef9f's clock moved two minutes
// each cycle), on any screen whose readout shows a ready interface it can qualify (ef9f's clock screen), and on the
// field and in battle under planState's own rules. Null where the readout cannot qualify the state.
export function cycleState(state:State):string|null {
 if(!state.started)return null;
 const ui=state.active_ui??null;
 if(ui!==null&&(ui.diagnostic!==null||ui.ready!==true))return null;
 const party=state.party.map(p=>[p.species_id??p.species,p.level,p.hp,p.status??null]);
 const common={screen:state.screen,map:state.map_id,position:state.position,facing:state.facing,locked:state.field_controls_locked??null,story:state.story??null,party,dialogue:state.world_context?.dialogue??null,ui:ui===null?null:[ui.phase,ui.selected]};
 if(state.in_battle){
  if(ui===null)return null;
  const battle=state.battle??null;
  const fight=battle===null?null:[battle.phase,battle.turn,battle.outcome,(battle.battlers??[]).map(b=>[b.battler,b.species_id,b.hp,b.status1])];
  return JSON.stringify({...common,battle:fight});
 }
 if(state.screen==="overworld")return state.map_id===null||state.position===null||state.facing===null?null:JSON.stringify(common);
 return ui===null?null:JSON.stringify(common);
}

// A block is primitive when no shorter period repeats it (A,B,A,B is period 2, not 4; A,A is a fixed point, not a cycle).
const primitive=(block:readonly (string|null)[]):boolean=>{
 const p=block.length;
 for(let d=1;d<p;d++)if(p%d===0&&block.every((x,k)=>x===block[k%d]))return false;
 return true;
};
// Maximal runs where every turn equals the one `period` turns before it, with a primitive first block of 2 to 4 turns
// and at least CYCLE_COPIES copies of it. A null item (a reply with no tool call, a state the readout cannot qualify)
// is never part of a cycle.
export function cycleRuns(items:readonly (string|null)[]):CycleRun[] {
 const out:CycleRun[]=[];
 for(const period of CYCLE_PERIODS){
  for(let i=0;i+period<=items.length;){
   const block=items.slice(i,i+period);
   if(block.some(x=>x===null)||!primitive(block)){i++;continue;}
   let j=i+period-1;
   while(j+1<items.length&&items[j+1]!==null&&items[j+1]===items[j+1-period])j++;
   if(j-i+1>=CYCLE_COPIES*period){out.push({start:i,end:j,period});i=j-period+2;}
   else i++;
  }
 }
 return out;
}

export class FixedPointBreaker {
 private readonly states=new Map<number,State>();
 // The state each recorded tool result left, by tool call id; null when the readout cannot qualify it.
 private readonly results=new Map<string,string|null>();
 // short-cycle-fixed-point-v1 only: the same by cycleState, and the latest turns as (calls, states) items.
 private readonly cycle:boolean;
 private readonly cycleResults=new Map<string,string|null>();
 // The latest 4 turns, how many turns in a row were not null, and for each period the longest run ending at the
 // newest turn in which every turn equals the one `period` turns before it.
 private readonly history:{readonly item:string|null;readonly names:readonly string[]}[]=[];
 private present=0;
 private readonly runs=new Map<number,number>(CYCLE_PERIODS.map(p=>[p,0]));
 private turn:Turn|null=null;
 private previous:Turn|null=null;
 private streak=0;
 private names:readonly string[]=[];
 private silent=0;
 // stage 3: which loop the counts belong to, so it acts once per loop.
 private streakFrom="";
 private calls=0;
 // Replies already reported as collapsed, by tool call id (or timestamp for a reply with no tool call).
 private readonly reported=new Set<string>();
 constructor(private readonly features:FeatureSet,private readonly recorder:BreakerRecorder){this.cycle=features["short-cycle-fixed-point-v1"];}

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event){
   this.states.set(event.seq,event);
   if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);
   return;
  }
  if(event.type==="assistant"){
   if(event.stop_reason==="error"||event.stop_reason==="aborted")return;
   if(event.tool_calls.length===0){this.silent++;if(this.cycle)this.remember(null,[]);return;}
   this.silent=0;this.calls++;
   this.turn={calls:JSON.stringify(event.tool_calls.map(c=>[c.name,c.args])),ids:new Set(event.tool_calls.map(c=>c.id)),states:new Map(),cycle:new Map(),done:false};
   this.names=[...new Set(event.tool_calls.map(c=>c.name))];
   return;
  }
  if(event.type!=="tool_result")return;
  const state=event.state_seq===undefined?undefined:this.states.get(event.state_seq);
  const key=state===undefined||event.is_error?null:planState(state,this.features)?.key??null;
  this.results.set(event.id,key);
  if(this.results.size>512)this.results.delete(this.results.keys().next().value??"");
  const loose=this.cycle&&state!==undefined&&!event.is_error?cycleState(state):null;
  if(this.cycle){
   this.cycleResults.set(event.id,loose);
   if(this.cycleResults.size>512)this.cycleResults.delete(this.cycleResults.keys().next().value??"");
  }
  const turn=this.turn;
  if(turn===null||turn.done||!turn.ids.has(event.id))return;
  turn.states.set(event.id,key);
  turn.cycle.set(event.id,loose);
  if(turn.states.size<turn.ids.size)return;
  turn.done=true;
  const left=[...turn.states.values()];
  const same=this.previous!==null&&this.previous.calls===turn.calls&&left.every(k=>k!==null)&&JSON.stringify(left)===JSON.stringify([...this.previous.states.values()]);
  this.streak=same?this.streak+1:1;
  if(!same)this.streakFrom=[...turn.ids].join(",");
  if(this.cycle){const states=[...turn.cycle.values()];this.remember(states.some(k=>k===null)?null:JSON.stringify([turn.calls,states]),this.names);}
  this.previous=turn;
 }

 private remember(item:string|null,names:readonly string[]):void {
  this.present=item===null?0:this.present+1;
  for(const p of CYCLE_PERIODS){
   const back=this.history.at(-p)?.item;
   this.runs.set(p,item!==null&&back===item?(this.runs.get(p)??0)+1:Math.min(this.present,p));
  }
  this.history.push({item,names});
  if(this.history.length>Math.max(...CYCLE_PERIODS))this.history.shift();
 }

 // The cycle the newest turns are in (as cycleRuns counts it), if it has come round more than CYCLE_COPIES times;
 // the longest one, the shortest period on a tie.
 private currentCycle():{readonly turns:number;readonly period:number;readonly names:readonly string[]}|null {
  let best:{turns:number;period:number}|null=null;
  for(const period of CYCLE_PERIODS){
   const turns=this.runs.get(period)??0;
   if(turns>CYCLE_COPIES*period&&primitive(this.history.slice(-period).map(h=>h.item))&&(best===null||turns>best.turns))best={turns,period};
  }
  return best===null?null:{...best,names:[...new Set(this.history.slice(-best.period).flatMap(h=>h.names))]};
 }

 fixedPoint():{readonly turns:number;readonly loop:string;readonly names:readonly string[]} {return {turns:this.streak,loop:this.streakFrom,names:this.names};}
 noTool():{readonly replies:number;readonly loop:string} {return {replies:this.silent,loop:`silent:${String(this.calls)}`};}

 // Stage 1, then stage 2, over the request the window and the budget already shaped.
 collapse(messages:AgentMessage[]):AgentMessage[] {
  const groups=this.groups(messages);
  const drop=new Set<number>();
  let repeats=0;
  for(let i=0;i<groups.length;){
   let j=i;
   const key=groups[i]?.silent===true?null:groups[i]?.key??null;
   while(key!==null&&groups[j+1]?.key===key)j++;
   const run=j-i+1;
   if(key!==null&&run>=FIXED_POINT_TURNS){
    for(const g of groups.slice(i,j))for(const index of g.members)drop.add(index);
    repeats=Math.max(repeats,run);
   }
   i=j+1;
  }
  const collapsed=groups.filter(g=>!g.silent&&g.members.some(m=>drop.has(m)));
  const cycled=this.cycle?this.cycleCollapse(groups,drop):null;
  // A reply that called no tool is left out, so the next sample starts fresh; its nudge or note stays.
  const silent=groups.filter(g=>g.silent);
  for(const g of silent)drop.add(g.members[0]??-1);
  const report=(list:readonly {readonly id:string}[]):boolean=>{const fresh=list.filter(g=>!this.reported.has(g.id));for(const g of fresh)this.reported.add(g.id);return fresh.length>0;};
  if(report(collapsed))this.recorder.recordLoopBreaker({stage:1,trigger:"fixed_point",repeats,collapsed:collapsed.length,text:null});
  if(cycled!==null&&report(cycled.groups))this.recorder.recordLoopBreaker({stage:1,trigger:"short_cycle",repeats:cycled.repeats,collapsed:cycled.groups.length,text:null,period:cycled.period});
  if(report(silent))this.recorder.recordLoopBreaker({stage:1,trigger:"no_tool_call",repeats:silent.length,collapsed:silent.length,text:null});
  return messages.filter((_m,index)=>!drop.has(index));
 }

 note(messages:AgentMessage[]):AgentMessage[] {
  if(messages.length===0)return messages;
  if(this.silent>0){
   // Stage 1 left the reply out (as fresh-retry-v1 does); its nudge is still the newest one.
   const last=messages.findLastIndex(m=>"role"in m&&m.role==="assistant");
   const text=noToolNote(this.silent);
   this.recorder.recordLoopBreaker({stage:2,trigger:"no_tool_call",repeats:this.silent,collapsed:0,text});
   const nudge=messages.findLastIndex((m,index)=>index>last&&"role"in m&&m.role==="user"&&(m.content===NUDGE||m.content===TEXT_ONLY_REMINDER));
   const note:AgentMessage={role:"user",content:text,timestamp:Date.now()};
   return nudge<0?[...messages,note]:messages.map((m,index)=>index===nudge?note:m);
  }
  const cycle=this.cycle?this.currentCycle():null;
  if(cycle!==null){
   const text=cycleNote(cycle.turns,cycle.period,cycle.names);
   this.recorder.recordLoopBreaker({stage:2,trigger:"short_cycle",repeats:cycle.turns,collapsed:0,text,period:cycle.period});
   return [...messages,{role:"user",content:text,timestamp:Date.now()}];
  }
  if(this.streak<FIXED_POINT_NOTE_TURNS)return messages;
  const text=fixedPointNote(this.streak,this.names);
  this.recorder.recordLoopBreaker({stage:2,trigger:"fixed_point",repeats:this.streak,collapsed:0,text});
  return [...messages,{role:"user",content:text,timestamp:Date.now()}];
 }

 // short-cycle-fixed-point-v1 stage 1: each cycle run keeps its newest copy (its last `period` turns); the turns before
 // it join `drop`. Returns the groups only this pass left out, the longest run and its period.
 private cycleCollapse(groups:readonly Group[],drop:Set<number>):{readonly groups:readonly Group[];readonly repeats:number;readonly period:number} {
  const left:Group[]=[];
  let repeats=0,period=0;
  for(const run of cycleRuns(groups.map(g=>g.item))){
   for(const g of groups.slice(run.start,run.end-run.period+1)){
    if(!g.members.some(m=>drop.has(m)))left.push(g);
    for(const index of g.members)drop.add(index);
   }
   const turns=run.end-run.start+1;
   if(turns>repeats){repeats=turns;period=run.period;}
  }
  return {groups:left,repeats,period};
 }

 // Each assistant reply with the tool results and nudges after it; the key is null when the turn cannot be compared.
 private groups(messages:readonly AgentMessage[]):Group[] {
  const out:Group[]=[];
  messages.forEach((m,index)=>{
   if(!("role"in m))return;
   if(m.role==="assistant"){
    const calls=m.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]);
    out.push({id:calls.length===0?`reply:${String(m.timestamp)}`:calls.join(","),key:this.key(m),item:this.cycle?this.item(m):null,silent:calls.length===0,members:[index]});
    return;
   }
   const group=out.at(-1);
   if(group===undefined)return;
   // Only a nudge belongs to the reply it answers; a supervisor note is kept wherever its reply goes.
   if(m.role==="toolResult"||m.content===NUDGE||m.content===TEXT_ONLY_REMINDER)group.members.push(index);
  });
  return out;
 }

 private key(message:AssistantMessage):string|null {
  const parts=message.content.map(p=>p.type==="thinking"?["thinking",p.thinking]:p.type==="text"?["text",p.text]:["call",p.name,p.arguments]);
  const calls=message.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]);
  const left=calls.map(id=>this.results.get(id)??null);
  if(left.some(k=>k===null))return null;
  return JSON.stringify([parts,left]);
 }

 // short-cycle-fixed-point-v1: the turn's tool calls (names and arguments, thinking and text aside) and the cycleState
 // each left, in the same form observe() remembers; null for a reply with no tool call or a state it cannot qualify.
 private item(message:AssistantMessage):string|null {
  const calls=message.content.flatMap(p=>p.type==="toolCall"?[p]:[]);
  if(calls.length===0)return null;
  const states=calls.map(c=>this.cycleResults.get(c.id)??null);
  if(states.some(k=>k===null))return null;
  return JSON.stringify([JSON.stringify(calls.map(c=>[c.name,c.arguments])),states]);
 }
}

export function fixedPointBreaker(features:FeatureSet,recorder:BreakerRecorder&{subscribe(fn:(event:RunEvent)=>void):void}):FixedPointBreaker|null {
 // duplicate-turn-collapse-v1 needs the same turn records the breaker keeps; it applies only stage 1.
 if(!features["fixed-point-breaker-v1"]&&!features["duplicate-turn-collapse-v1"])return null;
 const breaker=new FixedPointBreaker(features,recorder);recorder.subscribe(event=>{breaker.observe(event);});
 return breaker;
}
