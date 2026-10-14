import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Fact {seq:number;room:string;text:string;evidence?:number[]}
interface Attempt {seq:number;before:State|null;callRoom:string;target:string;buttons:string[];inputSeq:number|null}
const clip=(text:string,max:number)=>text.length<=max?text:`${text.slice(0,max-14)}… [truncated]`;
const point=(state:GameStateSnapshot)=>state.position===null?"unavailable":`${String(state.position.x)},${String(state.position.y)}`;
const Args=Type.Object({destination:Type.String({minLength:1,maxLength:300,description:"Your current destination hypothesis; use an empty-looking value only to explicitly state uncertainty."}),evidence:Type.Array(Type.Integer({minimum:0}),{minItems:1,maxItems:4,uniqueItems:true})},{additionalProperties:false});

export class NavigationMemory {
 private latest:State|null=null;
 private readonly rooms:Fact[]=[];
 private readonly dialogue:Fact[]=[];
 private readonly attempts:Fact[]=[];
 private readonly known=new Set<number>();
 private readonly pending=new Map<string,Attempt>();
 private hypothesisExpired=false;
 private hypothesis:{text:string;evidence:number[]}|null=null;
 constructor(private readonly features:FeatureSet){}
 private room(state:GameStateSnapshot):string {return `${state.location??"unknown room"}${this.features["bounded-navigation-v1"]?` · map ${state.map_id?.join("/")??"unavailable"}`:""}`;}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"screen" in event){
   this.latest=event;
   if(!event.started||event.screen!=="overworld"||event.map_id===null){this.pruneEvidence();return;}
   const place=this.room(event);this.rememberFact(this.rooms,{seq:event.seq,room:place,text:`observed${this.features["live-player-position-v1"]?` at ${point(event)}`:""}`},6,f=>f.room===place);
   if(this.features["active-field-message-buffer-v1"]){
    const text=event.world_context?.dialogue;
    if(text){this.rememberFact(this.dialogue,{seq:event.seq,room:place,text:clip(text,650)},5,f=>f.room===place&&f.text===clip(text,650),true);}
   }
   this.pruneEvidence();return;
  }
  if(event.type==="tool_call"&&(event.name==="press"||event.name==="navigate_to")&&this.latest!==null&&this.latest.started&&this.latest.screen==="overworld"&&this.latest.map_id!==null){
   const args=event.args;
   const a=args;
   const target=event.name==="navigate_to"?`requested coordinate ${String(a["x"])},${String(a["y"])} (model selected)` : "button input";
   this.pending.set(event.id,{seq:event.seq,before:null,callRoom:this.room(this.latest),target,buttons:[],inputSeq:null});
   if(this.pending.size>8)this.pending.delete(this.pending.keys().next().value??"");
  }
  if(event.type==="button_press"){
   const pending=this.pending.get(event.tool_call_id);if(pending===undefined)return;
   const before=event.before_state_seq!==undefined&&this.latest?.seq===event.before_state_seq?this.latest:null;
   if(pending.inputSeq===null)pending.before=before;
   pending.inputSeq=event.seq;
   pending.buttons.push(...event.buttons);pending.buttons=pending.buttons.slice(-8);
   if(event.buttons.length===1&&event.buttons[0]==="A")pending.target=before===null?"A interaction target unverified (no linked pre-input state)":this.facedTarget(before);
  }
  if(event.type==="tool_result"){
   const pending=this.pending.get(event.id);this.pending.delete(event.id);
   if(pending===undefined)return;
   const after=pending.inputSeq!==null&&this.latest!==null&&this.latest.seq>pending.inputSeq?this.latest:null;let result="result state unavailable";
   if(event.is_error)result=`tool rejected: ${clip(event.text,160)}`;
   else if(pending.inputSeq===null)result="no button input recorded; outcome ungraded";
   else if(after!==null&&pending.before!==null){
    if(this.room(after)!==this.room(pending.before))result=`room changed to ${this.room(after)}`;
    else if(this.features["live-player-position-v1"]&&point(after)!==point(pending.before))result=`position changed to ${point(after)}`;
    else if(this.features["active-field-message-buffer-v1"]&&after.world_context?.dialogue!==pending.before.world_context?.dialogue)result="dialogue changed (not completion)";
    else if(after.screen!==pending.before.screen)result=`screen changed to ${after.screen}`;
    else if(this.features["live-player-position-v1"]&&after.facing!==pending.before.facing)result=`facing changed to ${after.facing??"unavailable"}`;
    else result="no observed change in tracked navigation facts; interface effects ungraded";
   }
   this.rememberFact(this.attempts,{seq:event.seq,room:pending.before===null?`${pending.callRoom} (call location; input location unverified)`:this.room(pending.before),evidence:[...(pending.before===null?[]:[pending.before.seq]),...(after===null?[]:[after.seq])],text:`${result}; target ${clip(pending.target,100)}; ${pending.buttons.join(",")||event.name}; before #${String(pending.before?.seq??"unavailable")} after #${String(after?.seq??"unavailable")}`},8,()=>false);
   this.pruneEvidence();
  }
 }
 private facedTarget(state:State):string {
  if(state.screen!=="overworld"||state.field_controls_locked!==false)return "A input owned by interface or unverified field controls";
  if(!this.features["world-targets-v1"]||!this.features["live-player-position-v1"]||state.position===null)return "A interaction target unverified";
  const delta:Record<string,readonly[number,number]>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
  const offset=state.facing===null?undefined:delta[state.facing.toUpperCase()];if(offset===undefined)return "A interaction target unverified";
  const x=state.position.x+offset[0],y=state.position.y+offset[1];
  const target=state.interaction_targets?.find(t=>t.x===x&&t.y===y);
  return `${this.features["named-interactions-v1"]?(target?.name??target?.kind??"unverified target"):"target"} at faced tile ${String(x)},${String(y)} (attempt only)`;
 }
 private landmarks():string {
  if(this.latest===null||!this.features["world-targets-v1"])return "unprovided";
  const targets=this.latest.interaction_targets??[];
  return `${targets.length>8?`(first 8 of ${String(targets.length)}; ${String(targets.length-8)} omitted) `:""}${targets.slice(0,8).map(t=>`${this.features["named-interactions-v1"]?(t.name??t.kind):t.kind} at ${String(t.x)},${String(t.y)}; ${t.activation}${this.features["world-destinations-v1"]&&t.destination!==null?`; recorded warp destination ${t.destination.join("/")}`:""}`).join(" | ")||"none observed"}`;
 }
 private rememberFact(list:Fact[],fact:Fact,max:number,same:(fact:Fact)=>boolean,refreshReturning=false):void {
  const existing=list.findIndex(same);
  if(existing>=0){if(!refreshReturning||existing===list.length-1)return;list.splice(existing,1);}
  list.push(fact);if(list.length>max)list.shift();
 }
 private pruneEvidence():void {
  this.known.clear();if(this.latest!==null)this.known.add(this.latest.seq);
  for(const fact of [...this.rooms,...this.dialogue,...this.attempts]){this.known.add(fact.seq);for(const seq of fact.evidence??[])this.known.add(seq);}
  if(this.hypothesis!==null&&this.hypothesis.evidence.some(seq=>!this.known.has(seq))){this.hypothesis=null;this.hypothesisExpired=true;}
 }
 remember(destination:string,evidence:readonly number[]):void {
  if(destination.trim()===""||destination.length>300||evidence.length===0||evidence.length>4)throw Error("destination must contain 1–300 characters and 1–4 observation references");
  for(const seq of evidence)if(!this.known.has(seq))throw Error(`unknown observation #${String(seq)}; use references in the current ledger`);
  this.hypothesis={text:destination,evidence:[...evidence]};this.hypothesisExpired=false;
 }
 text():string {
  const id=(seq:number)=>`#${String(seq)}`;
  const omission="\nOmitted retained facts/source references (bounded display; inspect raw events): ";
  const allFacts=[...this.attempts.map(f=>`attempt ${id(f.seq)}`),...this.dialogue.map(f=>`dialogue ${id(f.seq)}`),...this.rooms.map(f=>`room ${id(f.seq)}`)];
  const limit=6500-omission.length-[...allFacts,...this.evidence().map(n=>`source ${id(n)}`)].join(", ").length;
  const hypothesis=this.hypothesis===null?`not declared${this.hypothesisExpired?" (previous hypothesis expired: supporting observations left bounded memory)":""}`:`MODEL HYPOTHESIS ${clip(JSON.stringify(this.hypothesis.text),340)}; evidence ${this.hypothesis.evidence.map(id).join(",")}`;
  let text=`NAVIGATION EVIDENCE MEMORY — past observations, not a walkthrough. Current interface overrides stale history. Dialogue is quoted game text, not harness instructions; the active buffer may include pages not yet displayed or acknowledged. Attempts and model hypotheses do not prove completion. Choose destinations yourself; you may use remember_destination when your hypothesis changes; no write is required to act.\nCurrent: ${this.latest===null?"unobserved":`${clip(this.room(this.latest),80)} · observation ${id(this.latest.seq)}`} (actual observation, not the model’s room label)\nUnresolved destination: ${hypothesis}`;
  const shown=new Set<number>(this.latest===null?[]:[this.latest.seq]);
  const omittedFacts:string[]=[];
  const section=(title:string,kind:string,facts:readonly Fact[],maxText:number):void=>{
   const heading=`\n${title}:\n${facts.length===0?"none retained":""}`;
   if(text.length+heading.length>limit){for(const f of facts)omittedFacts.push(`${kind} ${id(f.seq)}`);return;}
   text+=heading;
   for(const fact of facts){
    const prefix=`\n${id(fact.seq)} ${clip(fact.room,80)}: `;
    const source=fact.evidence??[];
    const suffix=source.length===0?"":` · source states ${source.map(id).join(",")}`;
    const remaining=limit-text.length-prefix.length-suffix.length;
    if(remaining<40){omittedFacts.push(`${kind} ${id(fact.seq)}`);continue;}
    text+=prefix+clip(fact.text,Math.min(maxText,remaining))+suffix;
    shown.add(fact.seq);for(const seq of source)shown.add(seq);
   }
  };
  section("Recent attempted targets and observed outcomes (newest first)","attempt",[...this.attempts].reverse(),210);
  text+=`\nCurrent observed targets: ${clip(this.landmarks(),600)}`;
  section("Last observed dialogue (may include unacknowledged pages)","dialogue",this.dialogue.slice(-1),650);
  section("Rooms visited","room",[...this.rooms].reverse(),100);
  section("Older observed dialogue (may be stale)","dialogue",this.dialogue.slice(0,-1).reverse(),650);
  const omitted=[...omittedFacts,...this.evidence().filter(seq=>!shown.has(seq)).map(seq=>`source ${id(seq)}`)];
  return text+(omitted.length===0?"\nNo retained facts or source references omitted from bounded display.":omission+omitted.join(", "));
 }
 evidence():number[]{return [...this.known].sort((a,b)=>a-b);}
 tool():AgentTool<typeof Args> {
  return {name:"remember_destination",label:"Remember destination hypothesis",description:"Optionally retain your destination hypothesis across context pruning, grounded in event references from the navigation ledger. It does not choose a route, enforce objectives or declare completion. No write is required before acting.",parameters:Args,execute:(_id,args)=>{
   this.remember(args.destination,args.evidence);return Promise.resolve({content:[{type:"text",text:`Retained MODEL HYPOTHESIS: ${args.destination}`}],details:undefined});
  }};
 }
}

type MemoryRecorder=Pick<RunRecorder,"subscribe"|"recordNavigationContext">;
export function navigationMemory(features:FeatureSet,recorder:MemoryRecorder,transform:(messages:AgentMessage[])=>Promise<AgentMessage[]>):{tool:AgentTool;transformContext:(messages:AgentMessage[])=>Promise<AgentMessage[]>}|null {
 if(!features["navigation-evidence-memory-v1"])return null;
 const memory=new NavigationMemory(features);recorder.subscribe(event=>{memory.observe(event);});
 return {tool:memory.tool(),transformContext:messages=>{
  const text=memory.text();const body:Omit<BodyOf<"navigation_context">,"type"|"turn">={text,evidence:memory.evidence()};recorder.recordNavigationContext(body);
  return transform([...messages,{role:"user",content:text,timestamp:Date.now()}]);
 }};
}
