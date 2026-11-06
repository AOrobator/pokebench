// story-line-campaign-flags-v1: the server's Story line stops at its early flags. This appends the campaign steps the game
// confirmed later, the same ones the supervisor briefing lists, whole and in the order the game confirmed them.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {EXTENDED_PROGRESS_NAMES,OPTIONAL_PROGRESS_NAMES} from "./story-progress.js";

export function campaignStep(event:RunEvent):string|null {
 if(event.type!=="milestone"||!EXTENDED_PROGRESS_NAMES.has(event.name)||OPTIONAL_PROGRESS_NAMES.has(event.name))return null;
 return event.origin==="observed"&&event.kind==="story"?event.name.replaceAll("_"," ").toLowerCase():null;
}

const UNREADABLE="unavailable (story state not readable right now)";
const NONE="no completion confirmed";
export class CampaignSteps {
 private readonly steps:string[]=[];
 observe(event:RunEvent):void {
  const step=campaignStep(event);
  if(step!==null&&!this.steps.includes(step))this.steps.push(step);
 }
 line(text:string):string {
  return text.replace(/^Story: (.*)$/m,(whole,listed:string)=>{
   if(listed===UNREADABLE)return whole;
   const own=listed===NONE?[]:listed.split("; ");
   const added=this.steps.filter(s=>!own.includes(s));
   return added.length===0?whole:`Story: ${[...own,...added].join("; ")}`;
  });
 }
}

export function withStoryLineCampaign(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(fn:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["story-line-campaign-flags-v1"])return [...tools];
 const steps=new CampaignSteps();
 recorder.subscribe(event=>{steps.observe(event);});
 return tools.map(tool=>({...tool,execute:async(id,args,signal,update)=>{
  const result=await tool.execute(id,args,signal,update);
  return {...result,content:result.content.map(part=>part.type==="text"?{...part,text:steps.line(part.text)}:part)};
 }}));
}
