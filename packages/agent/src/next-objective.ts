import {PROGRESS_CATALOG} from "./story-progress.js";
import {REQUIRED_FRONTIER_MILESTONES} from "./milestones.js";
import {blockingPrerequisites,enabledObjectives} from "./objective-graph.js";
import type {RunEvent} from "./events.js";

const LABELS=new Map(PROGRESS_CATALOG.map(definition=>[definition.name,definition.label]));
const labelOf=(id:string):string=>LABELS.get(id)??id.replaceAll("_"," ").toLowerCase();

export interface ObjectiveTarget{readonly id:string;readonly label:string;readonly blockedBy:readonly string[]}

// The order is the plan; the graph decides which of its steps is legal now.
// A step whose hard prerequisites are unmet is skipped rather than named, because naming it anyway is the
// Rustboro-from-Mauville nag: the run was right, the frontier was linear. Only when nothing ahead is legal
// is a blocked step named, and then with what blocks it.
export function targetIn(order:readonly string[],reached:ReadonlySet<string>):ObjectiveTarget|null {
  const enabled=new Set(enabledObjectives(reached));
  // Scan forward from the furthest step the run has already passed, never backward: a run that left the
  // Dewford gym alone on purpose must not be told to go back to it because the list remembers a gap.
  // Only steps the run actually earned move the mark: an out-of-order milestone (a map visit past a gate
  // it never opened) must not drag the plan forward and hide the steps between.
  const furthest=order.reduce((best,id,index)=>reached.has(id)&&blockingPrerequisites(id,reached).length===0&&index>best?index:best,-1);
  const ahead=order.slice(furthest+1);
  for(const id of ahead){
    if(reached.has(id)||!enabled.has(id))continue;
    return {id,label:labelOf(id),blockedBy:[]};
  }
  for(const id of ahead){
    if(reached.has(id))continue;
    return {id,label:labelOf(id),blockedBy:blockingPrerequisites(id,reached)};
  }
  return null;
}

// One line for the stall briefing: the objective by name and id, and why it is out of reach when it is.
export function objectiveLine(target:ObjectiveTarget|null):string|null {
  if(target===null)return null;
  const blocked=target.blockedBy.length===0?"":`; needs ${target.blockedBy.map(labelOf).join(" and ")} first`;
  return `- Next milestone: ${target.label} (${target.id})${blocked}`;
}

export class NextObjective {
  private readonly reached=new Set<string>();
  observe(event:RunEvent):void {if(event.type==="milestone")this.reached.add(event.name);}
  target():ObjectiveTarget|null {return targetIn(REQUIRED_FRONTIER_MILESTONES,this.reached);}
  describe():string|null {return objectiveLine(this.target());}
}
