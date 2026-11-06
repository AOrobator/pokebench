// story-line-campaign-flags-v1: the server's Story line stops at its early flags. This appends the campaign steps the game
// confirmed later, the same ones the supervisor briefing lists, whole and in the order the game confirmed them.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {EXTENDED_PROGRESS_NAMES,OPTIONAL_PROGRESS_NAMES} from "./story-progress.js";

// story-line-start-steps-v1: fromStart also takes the steps the save's flags already held when the run started.
export function campaignStep(event:RunEvent,fromStart=false):string|null {
 if(event.type!=="milestone"||!EXTENDED_PROGRESS_NAMES.has(event.name)||OPTIONAL_PROGRESS_NAMES.has(event.name))return null;
 return (event.origin==="observed"||fromStart&&event.origin==="present_at_start")&&event.kind==="story"?event.name.replaceAll("_"," ").toLowerCase():null;
}

const UNREADABLE="unavailable (story state not readable right now)";
const NONE="no completion confirmed";
export class CampaignSteps {
 private readonly steps:string[]=[];
 constructor(private readonly fromStart=false){}
 observe(event:RunEvent):void {
  const step=campaignStep(event,this.fromStart);
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

const carriesState=(details:unknown):boolean=>typeof details==="object"&&details!==null&&"state" in details;

export function withStoryLineCampaign(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(fn:(event:RunEvent)=>void,replayMilestones?:boolean):void}):AgentTool[] {
 if(!features["story-line-campaign-flags-v1"])return [...tools];
 const steps=new CampaignSteps(features["story-line-start-steps-v1"]);
 // story-line-start-steps-v1: milestones present at the start are recorded before the tools exist, so they are replayed here.
 recorder.subscribe(event=>{steps.observe(event);},features["story-line-start-steps-v1"]);
 return tools.map(tool=>({...tool,execute:async(id,args,signal,update)=>{
  const result=await tool.execute(id,args,signal,update);
  // Only a game readout's Story line: a model-authored echo in another tool's result is not one.
  if(!carriesState(result.details))return result;
  return {...result,content:result.content.map(part=>part.type==="text"?{...part,text:steps.line(part.text)}:part)};
 }}));
}
