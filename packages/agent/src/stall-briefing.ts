import {roomKey,roomOf} from "./dialogue-log.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {LoopDetector} from "./loop-detection.js";
import type {Stall} from "./loop-supervisor.js";

// A pair of maps briefs on this many round trips between them, then again every as many more.
export const STALL_ROUND_TRIPS=2;
// Active play (operator pauses excluded) with no new milestone before each briefing.
export const STALL_DROUGHT_MS=5*60_000;

// lastSeq: the state event of this pair's own latest move (its note's evidence); consecutive: no other pair's move came between.
interface Pair {readonly from:string;readonly to:string;moves:number;briefed:number;lastSeq:number;consecutive:boolean}

// stall-briefing-v1: watches for stalls the loop guard cannot see and hands the loop guard a supervisor note.
// Map changes and milestones since the last new milestone; checked after each tool result, so the facts are current.
export class StallBriefing {
 private room:{key:string;name:string}|null=null;
 private readonly pairs=new Map<string,Pair>();
 private progressAt=0;
 private progressSeq:number|null=null;
 private droughts=0;
 constructor(
  private readonly features:FeatureSet,
  private readonly active:()=>number,
  private readonly detector:Pick<LoopDetector,"stall">,
  private readonly text:(stall:Stall,calls:number)=>string,
 ){}

 observe(event:RunEvent):void {
  if(event.type==="milestone"){
   if(event.origin==="present_at_start"||event.name==="GAME_RUNNING"||MEASUREMENT_ONLY_MILESTONES.has(event.name))return;
   this.progressAt=this.active();this.progressSeq=event.seq;this.droughts=0;this.pairs.clear();
   return;
  }
  if(event.type==="state"&&"started"in event){
   if(!event.started||event.location===null||event.map_id===null)return;
   const key=roomKey(event),name=roomOf(event,this.features);
   if(this.room!==null&&this.room.key!==key){
    const id=[this.room.key,key].sort().join("\n");
    const pair=this.pairs.get(id)??{from:this.room.name,to:name,moves:0,briefed:0,lastSeq:event.seq,consecutive:true};
    for(const [other,p] of this.pairs)if(other!==id)p.consecutive=false;
    pair.moves++;pair.lastSeq=event.seq;this.pairs.set(id,pair);
   }
   this.room={key,name};
   return;
  }
  if(event.type==="tool_result")this.check(event.seq);
 }

 private check(seq:number):void {
  for(const pair of this.pairs.values()){
   const level=Math.floor(pair.moves/(2*STALL_ROUND_TRIPS));
   if(level<=pair.briefed)continue;
   const stall:Stall={kind:"map_cycle",from:pair.from,to:pair.to,roundTrips:Math.floor(pair.moves/2),consecutive:pair.consecutive};
   if(this.detector.stall("map_cycle",calls=>this.text(stall,calls),[pair.lastSeq,seq]))pair.briefed=level;
   return;
  }
  const level=Math.floor((this.active()-this.progressAt)/STALL_DROUGHT_MS);
  if(level<=this.droughts)return;
  const stall:Stall={kind:"milestone_drought",minutes:level*STALL_DROUGHT_MS/60_000};
  if(this.detector.stall("milestone_drought",calls=>this.text(stall,calls),[this.progressSeq??seq,seq]))this.droughts=level;
 }
}
