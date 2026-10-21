import {StallBriefing} from "../src/stall-briefing.js";
import type {FeatureSet} from "../src/features.js";
import type {RunEvent} from "../src/events.js";
import type {Stall} from "../src/loop-supervisor.js";

export interface Fired {readonly kind:Stall["kind"];readonly seq:number;readonly minutes:number|null}
// The stall briefings a recorded run would get, on a clock read from each event's own time (the recorded runs
// had no operator pause). The detector accepts every note, as the loop guard does when no other note is waiting.
export function replayStalls(events:readonly RunEvent[],features:FeatureSet):Fired[] {
 const start=events[0]===undefined?0:Date.parse(events[0].t);
 let now=start,seq=0;
 const fired:Fired[]=[];
 const stall=new StallBriefing(features,()=>now-start,{stall:(kind,text,evidence)=>{
  const drought=/(\d+) minutes/.exec(text(0));
  fired.push({kind:kind as Stall["kind"],seq:evidence[1]??seq,minutes:drought===null?null:Number(drought[1])});
  return true;
 }},(s)=>s.kind==="milestone_drought"?`${String(s.minutes)} minutes`:s.kind);
 for(const e of events){now=Date.parse(e.t);seq=e.seq;stall.observe(e);}
 return fired;
}
