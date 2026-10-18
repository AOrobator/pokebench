import {createHash} from "node:crypto";
import type {GuidanceReceipt} from "./jit-v2-context.js";
import type {Context} from "@mariozechner/pi-ai";
import type {FeatureSet} from "./features.js";
import {jitTools,playSystemPrompt,promptScene,type PromptScene} from "./play-config.js";

export interface PromptReceipt {
 readonly mode:"full"|"jit"|"jit-v2";
 readonly guidance?:GuidanceReceipt & {readonly reason:"first"|"scene_change"|"evicted"|"none"};
 readonly projected_guidance?:GuidanceReceipt[];
 readonly component_chars?:{readonly core_text:number;readonly guidance_text:number;readonly canonical_history_json:number};
 readonly scene:PromptScene;
 readonly state_seq:number|null;
 readonly system_prompt:string;
 readonly prompt_sha256:string;
 readonly tools:string[];
 readonly tools_sha256:string;
}
type ScreenState={readonly type:string;readonly seq:number;readonly screen?:string;readonly in_battle?:boolean;readonly active_ui?:{phase?:string|null}|null};
const hash=(text:string):string=>createHash("sha256").update(text).digest("hex");
// Observes existing recorder state events; never issues an extra emulator request.
export class JitContext {
 private state:ScreenState|null=null;
 private last:PromptReceipt|null=null;
 constructor(private readonly features:FeatureSet,private readonly target:string|null){}
 observe(event:ScreenState):void {if(event.type==="state")this.state=event;}
 context(context:Context):Context {
  const enabled=this.features["just-in-time-prompt-v1"];
  const scene=this.state?.screen===undefined||this.state.in_battle===undefined?"unknown":promptScene({screen:this.state.screen,in_battle:this.state.in_battle,...(this.state.active_ui===undefined?{}:{active_ui:this.state.active_ui})});
  const tools=enabled?jitTools(context.tools??[],scene):(context.tools??[]),systemPrompt=enabled?playSystemPrompt(this.features,this.target,scene):(context.systemPrompt??"");
  this.last={mode:enabled?"jit":"full",scene,state_seq:this.state?.seq??null,system_prompt:systemPrompt,prompt_sha256:hash(systemPrompt),tools:tools.map(t=>t.name),tools_sha256:hash(JSON.stringify(tools.map(({name,description,parameters})=>({name,description,parameters}))))};
  return enabled?{...context,systemPrompt,tools}:context;
 }
 allowed(name:string):boolean {return !this.features["just-in-time-prompt-v1"]||this.last===null||this.last.tools.includes(name);}
 receipt():PromptReceipt|null {return this.last;}
}
