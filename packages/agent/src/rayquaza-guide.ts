import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {RAYQUAZA_GUIDE_STEPS} from "./rayquaza-guide-data.js";
import type {RunRecorder} from "./recorder.js";

// rq-battle-explainer-v1: from 1,679 recorded fights, where models lost on preparation rather than move choice.
export const BATTLE_EXPLAINER="BATTLE: After a loss, change something before retrying: teach a TM from the Bag, catch a second type, buy Potions, or gain levels. TMs do nothing until taught. Use X items you own. Below 1/3 HP, heal unless this turn's attack wins. Before a leader or rival, heal and check your Bag. Decline optional battles if unready: whiting out halves your money and is not a free heal.";

export interface GuideStep {readonly after:string;readonly map:string|null;readonly note:string;readonly enter?:readonly [number,number]}

// The furthest step earned is the current one, so a late or repeated milestone never moves the guide back.
export class GuidePosition {
 private furthest=0;
 inBattle=false;
 constructor(private readonly steps:readonly GuideStep[]) {}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"in_battle" in event)this.inBattle=event.in_battle;
  const reached=event.type==="milestone"?this.steps.findIndex(step=>step.after===event.name):event.type==="state"&&"map_id" in event&&event.map_id!=null?this.onMap(event.map_id):-1;
  if(reached>this.furthest)this.furthest=reached;
 }
 private onMap(id:readonly [number,number]):number {return this.steps.findIndex(step=>step.enter?.[0]===id[0]&&step.enter[1]===id[1]);}
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
  const notes=[text,...(features["rq-battle-explainer-v1"]&&guide.inBattle?[BATTLE_EXPLAINER]:[])];
  return [...await transform(messages),...notes.map(content=>({role:"user" as const,content,timestamp:Date.now()}))];
 };
}
