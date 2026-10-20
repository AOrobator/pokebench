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

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Body=Omit<BodyOf<"loop_breaker">,"type"|"turn">;
export interface BreakerRecorder {recordLoopBreaker(body:Body):void}
interface Turn {readonly calls:string;readonly ids:Set<string>;readonly states:Map<string,string|null>;done:boolean}

const plural=(n:number,one:string,many:string):string=>`${String(n)} ${n===1?one:many}`;

export function noToolNote(replies:number):string {
 return `${BREAKER_NOTE} Your last ${plural(replies,"reply","replies")} called no tool.`;
}
export function fixedPointNote(turns:number,names:readonly string[]):string {
 return `${BREAKER_NOTE} Your last ${String(turns)} turns made the same ${names.join(", ")} call${names.length===1?"":"s"} and the game state stayed the same after each one.`;
}

export class FixedPointBreaker {
 private readonly states=new Map<number,State>();
 // The state each recorded tool result left, by tool call id; null when the readout cannot qualify it.
 private readonly results=new Map<string,string|null>();
 private turn:Turn|null=null;
 private previous:Turn|null=null;
 private streak=0;
 private names:readonly string[]=[];
 private silent=0;
 // Replies already reported as collapsed, by tool call id (or timestamp for a reply with no tool call).
 private readonly reported=new Set<string>();
 constructor(private readonly features:FeatureSet,private readonly recorder:BreakerRecorder){}

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event){
   this.states.set(event.seq,event);
   if(this.states.size>64)this.states.delete(this.states.keys().next().value??-1);
   return;
  }
  if(event.type==="assistant"){
   if(event.stop_reason==="error"||event.stop_reason==="aborted")return;
   if(event.tool_calls.length===0){this.silent++;return;}
   this.silent=0;
   this.turn={calls:JSON.stringify(event.tool_calls.map(c=>[c.name,c.args])),ids:new Set(event.tool_calls.map(c=>c.id)),states:new Map(),done:false};
   this.names=[...new Set(event.tool_calls.map(c=>c.name))];
   return;
  }
  if(event.type!=="tool_result")return;
  const state=event.state_seq===undefined?undefined:this.states.get(event.state_seq);
  const key=state===undefined||event.is_error?null:planState(state,this.features)?.key??null;
  this.results.set(event.id,key);
  if(this.results.size>512)this.results.delete(this.results.keys().next().value??"");
  const turn=this.turn;
  if(turn===null||turn.done||!turn.ids.has(event.id))return;
  turn.states.set(event.id,key);
  if(turn.states.size<turn.ids.size)return;
  turn.done=true;
  const left=[...turn.states.values()];
  const same=this.previous!==null&&this.previous.calls===turn.calls&&left.every(k=>k!==null)&&JSON.stringify(left)===JSON.stringify([...this.previous.states.values()]);
  this.streak=same?this.streak+1:1;
  this.previous=turn;
 }

 // Stage 1, then stage 2, over the request the window and the budget already shaped.
 collapse(messages:AgentMessage[]):AgentMessage[] {
  const groups=this.groups(messages);
  const drop=new Set<number>();
  let repeats=0,silentRun=false;
  for(let i=0;i<groups.length;){
   let j=i;
   const key=groups[i]?.key??null;
   while(key!==null&&groups[j+1]?.key===key)j++;
   const run=j-i+1;
   if(key!==null&&run>=FIXED_POINT_TURNS){
    for(const g of groups.slice(i,j))for(const index of g.members)drop.add(index);
    repeats=Math.max(repeats,run);silentRun||=groups[i]?.silent===true;
   }
   i=j+1;
  }
  const collapsed=groups.filter(g=>g.members.some(m=>drop.has(m)));
  const fresh=collapsed.map(g=>g.id).filter(id=>!this.reported.has(id));
  for(const id of fresh)this.reported.add(id);
  if(fresh.length>0)this.recorder.recordLoopBreaker({stage:1,trigger:silentRun?"no_tool_call":"fixed_point",repeats,collapsed:collapsed.length,text:null});
  return messages.filter((_m,index)=>!drop.has(index));
 }

 note(messages:AgentMessage[]):AgentMessage[] {
  if(messages.length===0)return messages;
  if(this.silent>0){
   // fresh-retry-v1 may have left the reply out; its nudge is still the newest one.
   const last=messages.findLastIndex(m=>"role"in m&&m.role==="assistant");
   const text=noToolNote(this.silent);
   this.recorder.recordLoopBreaker({stage:2,trigger:"no_tool_call",repeats:this.silent,collapsed:0,text});
   const nudge=messages.findLastIndex((m,index)=>index>last&&"role"in m&&m.role==="user"&&(m.content===NUDGE||m.content===TEXT_ONLY_REMINDER));
   const note:AgentMessage={role:"user",content:text,timestamp:Date.now()};
   return nudge<0?[...messages,note]:messages.map((m,index)=>index===nudge?note:m);
  }
  if(this.streak<FIXED_POINT_NOTE_TURNS)return messages;
  const text=fixedPointNote(this.streak,this.names);
  this.recorder.recordLoopBreaker({stage:2,trigger:"fixed_point",repeats:this.streak,collapsed:0,text});
  return [...messages,{role:"user",content:text,timestamp:Date.now()}];
 }

 // Each assistant reply with the tool results and nudges after it; the key is null when the turn cannot be compared.
 private groups(messages:readonly AgentMessage[]):{readonly id:string;readonly key:string|null;readonly silent:boolean;readonly members:number[]}[] {
  const out:{id:string;key:string|null;silent:boolean;members:number[]}[]=[];
  messages.forEach((m,index)=>{
   if(!("role"in m))return;
   if(m.role==="assistant"){
    const calls=m.content.flatMap(p=>p.type==="toolCall"?[p.id]:[]);
    out.push({id:calls.length===0?`reply:${String(m.timestamp)}`:calls.join(","),key:this.key(m),silent:calls.length===0,members:[index]});
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
}

export function fixedPointBreaker(features:FeatureSet,recorder:BreakerRecorder&{subscribe(fn:(event:RunEvent)=>void):void}):FixedPointBreaker|null {
 if(!features["fixed-point-breaker-v1"])return null;
 const breaker=new FixedPointBreaker(features,recorder);recorder.subscribe(event=>{breaker.observe(event);});
 return breaker;
}
