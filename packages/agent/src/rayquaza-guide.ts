import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {RAYQUAZA_GUIDE_STEPS} from "./rayquaza-guide-data.js";
import type {RunRecorder} from "./recorder.js";

export interface GuideStep {readonly after:string;readonly map:string|null;readonly note:string;readonly enter?:readonly [number,number]}

// The furthest step earned is the current one, so a late or repeated milestone never moves the guide back.
export class GuidePosition {
 private furthest=0;
 constructor(private readonly steps:readonly GuideStep[]) {}
 observe(event:RunEvent):void {
  const reached=event.type==="milestone"?this.steps.findIndex(step=>step.after===event.name):event.type==="state"?this.steps.findIndex(step=>step.enter?.[0]===event.map_id?.[0]&&step.enter?.[1]===event.map_id?.[1]):-1;
  if(reached>this.furthest)this.furthest=reached;
 }
 current():GuideStep {
  const step=this.steps[this.furthest];
  if(step===undefined)throw new Error("guide has no steps");
  return step;
 }
}

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type GuideRecorder=Pick<RunRecorder,"subscribe"|"recordMilestoneHint">;

// rq-milestone-guide-v1: the current step stays the request's final message until the next step, so it
// is present on map entry and during a stall without separate triggers.
export function rayquazaGuideContext(features:FeatureSet,recorder:GuideRecorder,transform:Transform,steps:readonly GuideStep[]=RAYQUAZA_GUIDE_STEPS):Transform {
 if(!features["rq-milestone-guide-v1"])return transform;
 const guide=new GuidePosition(steps);recorder.subscribe(event=>{guide.observe(event);},true);
 let recorded:string|null=null;
 return async messages=>{
  const step=guide.current(),text=`GUIDE: ${step.note}`;
  if(step.after!==recorded){recorder.recordMilestoneHint({text,milestone:step.after});recorded=step.after;}
  return [...await transform(messages),{role:"user",content:text,timestamp:Date.now()}];
 };
}
