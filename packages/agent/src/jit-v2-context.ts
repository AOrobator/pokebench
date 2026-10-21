import {createHash} from "node:crypto";
import type {Context,Message,UserMessage} from "@mariozechner/pi-ai";
import type {FeatureSet} from "./features.js";
import type {PromptReceipt} from "./jit-context.js";
import {promptScene,stableJitPrompts,type PromptScene} from "./play-config.js";

type ScreenState={readonly type:string;readonly seq:number;readonly screen?:string;readonly in_battle?:boolean;readonly active_ui?:{phase?:string|null}|null};
type Reason="first"|"scene_change"|"evicted"|"none"|"reused";
export interface GuidanceReceipt {
 readonly anchor:string;
 readonly ordinal:number;
 readonly scene:PromptScene;
 readonly source_state_seq:number|null;
 readonly text:string;
 readonly sha256:string;
}
interface Episode {readonly receipt:GuidanceReceipt;readonly message:UserMessage}
const hash=(text:string):string=>createHash("sha256").update(text).digest("hex");
// Tool-call ids survive slideWindow's result cloning and text/image collapse.
function anchors(messages:Message[]):Map<string,number> {
 const found=new Map<string,number>();
 if(messages[0]?.role==="user")found.set("task",0);
 messages.forEach((message,index)=>{
  if(message.role==="toolResult")found.set(`tool:${message.toolCallId}`,index);
  if(message.role==="assistant")found.set(`assistant:${String(message.timestamp)}:${hash(JSON.stringify(message))}`,index);
 });
 return found;
}

// Projection belongs to the actual request seam, never canonical agent history.
export class StableJitContext {
 private state:ScreenState|null=null;
 private episodes:Episode[]=[];
 private active:Episode|null=null;
 private lastScene:PromptScene|null=null;
 private ordinal=0;
 private last:PromptReceipt|null=null;
 constructor(private readonly features:FeatureSet,private readonly target:string|null){}
 observe(event:ScreenState):void {if(event.type==="state")this.state=event;}
 context(context:Context):Context {
  if(!this.features["just-in-time-prompt-v2"])return context;
  const scene=this.state?.screen===undefined||this.state.in_battle===undefined?"unknown":promptScene({screen:this.state.screen,in_battle:this.state.in_battle,...(this.state.active_ui===undefined?{}:{active_ui:this.state.active_ui})});
  const {core,guidance}=stableJitPrompts(this.features,this.target,scene);
  const retained=anchors(context.messages);
  // Empty history occurs in diagnostic callers; it still needs a stable insertion anchor.
  if(context.messages.length===0)retained.set("empty",-1);
  this.episodes=this.episodes.filter(episode=>retained.has(episode.receipt.anchor));
  let reason:Reason=this.lastScene===null?"first":this.lastScene!==scene?"scene_change":this.active===null||!this.episodes.includes(this.active)?"evicted":"none";
  // Unknown interfaces keep the core and observations; never pin a full fallback to the task.
  if(scene==="unknown")this.active=null;
  else if(reason!=="none"){
   const anchor=[...retained.entries()].at(-1)?.[0];
   if(anchor===undefined)throw new Error("JIT v2 requires the task or a tool-result observation anchor");
   const text=`HARNESS INTERFACE GUIDANCE — ${scene}. This applies only to this interface; use the latest matching guide, and the current screenshot/readout to determine input ownership.\n\n${guidance}`;
   const existing=this.features["jit-guide-reuse-v1"]?this.episodes.findLast(episode=>episode.receipt.scene===scene&&episode.receipt.text===text):undefined;
   if(existing!==undefined){this.active=existing;reason="reused";}
   else{
   const receipt:GuidanceReceipt={anchor,ordinal:++this.ordinal,scene,source_state_seq:this.state?.seq??null,text,sha256:hash(text)};
   const episode:Episode={receipt,message:{role:"user",content:text,timestamp:context.messages.at(retained.get(anchor)??-1)?.timestamp??0}};
   this.active=episode;this.episodes.push(episode);
   }
  }
  this.lastScene=scene;
  const messages:Message[]=[];
  const append=(index:number):void=>{for(const episode of this.episodes)if(retained.get(episode.receipt.anchor)===index)messages.push(episode.message);};
  append(-1);context.messages.forEach((message,index)=>{messages.push(message);append(index);});
  const tools=context.tools??[];
  this.last={mode:"jit-v2",scene,state_seq:this.state?.seq??null,system_prompt:core,prompt_sha256:hash(core),tools:tools.map(t=>t.name),tools_sha256:hash(JSON.stringify(tools.map(({name,description,parameters})=>({name,description,parameters})))),...(this.active===null?{}:{guidance:{...this.active.receipt,reason}}),projected_guidance:this.episodes.map(episode=>episode.receipt),component_chars:{core_text:core.length,guidance_text:this.episodes.reduce((sum,episode)=>sum+episode.receipt.text.length,0),canonical_history_json:JSON.stringify(context.messages).length}};
  return {...context,systemPrompt:core,messages};
 }
 receipt():PromptReceipt|null {return this.last;}
}
