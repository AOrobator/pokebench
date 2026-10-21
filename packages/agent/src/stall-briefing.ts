import {roomKey,roomOf} from "./dialogue-log.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {LoopDetector} from "./loop-detection.js";
import {interfaceOf,type Stall} from "./loop-supervisor.js";
import type {StoryCharacterGate} from "./stall-gate.js";

// A pair of maps briefs on this many round trips between them, then again every as many more.
export const STALL_ROUND_TRIPS=2;
// Active play (operator pauses excluded) with no new milestone before each briefing.
export const STALL_DROUGHT_MS=5*60_000;
// Calls in one owned interface (a naming editor, a menu) before a dwell briefing, then again every as many more.
// Evidence (runs 2026-10-13..16, 133 runs, 23 naming episodes): every naming episode that ended normally took at
// most 25 calls (player names: median 7; nicknames 3 and 19); stuck ones took 48, 79, 97 and 153 calls.
export const INTERFACE_DWELL_CALLS=30;

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Dwell {readonly key:string;readonly name:string;readonly firstSeq:number;calls:number;briefed:number}

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
 private last:State|null=null;
 private dwell:Dwell|null=null;
 constructor(
  private readonly features:FeatureSet,
  private readonly active:()=>number,
  private readonly detector:Pick<LoopDetector,"stall">,
  private readonly text:(stall:Stall,calls:number)=>string,
  // story-character-stall-gate-v1: holds a due map_cycle or milestone_drought briefing.
  private readonly gate:Pick<StoryCharacterGate,"holds"|"held">|null=null,
  // positive-supervisor-v1: a retired briefing is still recorded, as a diagnostic, with the text it would have sent.
  private readonly retiredNote:((kind:"map_cycle"|"milestone_drought",text:string,evidence:readonly number[])=>void)|null=null,
 ){}

 observe(event:RunEvent):void {
  if(event.type==="milestone"){
   if(event.origin==="present_at_start"||event.name==="GAME_RUNNING")return;
   // story-progress-clock-v1: a measurement-only story step (the rival battle starting, the send-off) is new progress here too.
   if(MEASUREMENT_ONLY_MILESTONES.has(event.name)&&!this.features["story-progress-clock-v1"])return;
   this.progressAt=this.active();this.progressSeq=event.seq;this.droughts=0;this.pairs.clear();this.dwell=null;
   return;
  }
  if(event.type==="state"&&"started"in event){
   this.last=event;
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
  if(event.type==="tool_result"){
   // Calls made inside an owned interface (it was open before and after them) count as dwelling there,
   // however its text churns; the call that opened it does not.
   if(event.state_seq!==undefined&&this.last?.seq===event.state_seq){
    const ui=interfaceOf(this.last);
    if(ui===null)this.dwell=null;
    else if(this.dwell?.key===ui.key)this.dwell.calls++;
    else this.dwell={key:ui.key,name:ui.name,firstSeq:this.last.seq,calls:0,briefed:0};
   }
   this.check(event.seq);
  }
 }

 private check(seq:number):void {
  // positive-supervisor-v1: map back-and-forth and milestone-drought briefings are retired; interface dwell stays.
  const retired=this.features["positive-supervisor-v1"];
  for(const pair of this.pairs.values()){
   const level=Math.floor(pair.moves/(2*STALL_ROUND_TRIPS));
   if(level<=pair.briefed)continue;
   if(retired){
    this.retiredNote?.("map_cycle",`You have walked between ${pair.from} and ${pair.to} ${String(Math.floor(pair.moves/2))} times with no new story milestone.`,[pair.lastSeq,seq]);
    pair.briefed=level;continue;
   }
   const hold=this.gate?.holds()??null;
   if(hold!==null){this.gate?.held("map_cycle",level,[pair.from,pair.to].join("\n"),hold);return;}
   const stall:Stall={kind:"map_cycle",from:pair.from,to:pair.to,roundTrips:Math.floor(pair.moves/2),consecutive:pair.consecutive};
   if(this.detector.stall("map_cycle",calls=>this.text(stall,calls),[pair.lastSeq,seq]))pair.briefed=level;
   return;
  }
  const dwell=this.dwell;
  if(dwell!==null&&Math.floor(dwell.calls/INTERFACE_DWELL_CALLS)>dwell.briefed){
   const stall:Stall={kind:"interface_dwell",name:dwell.name,calls:dwell.calls};
   if(this.detector.stall("interface_dwell",calls=>this.text(stall,calls),[dwell.firstSeq,seq]))dwell.briefed=Math.floor(dwell.calls/INTERFACE_DWELL_CALLS);
   return;
  }
  const level=Math.floor((this.active()-this.progressAt)/STALL_DROUGHT_MS);
  if(level<=this.droughts)return;
  if(retired){
   this.retiredNote?.("milestone_drought",`No new story milestone for ${String(level*STALL_DROUGHT_MS/60_000)} minutes of play.`,[this.progressSeq??seq,seq]);
   this.droughts=level;return;
  }
  const hold=this.gate?.holds()??null;
  if(hold!==null){this.gate?.held("milestone_drought",level,String(this.progressSeq??-1),hold);return;}
  const stall:Stall={kind:"milestone_drought",minutes:level*STALL_DROUGHT_MS/60_000};
  if(this.detector.stall("milestone_drought",calls=>this.text(stall,calls),[this.progressSeq??seq,seq]))this.droughts=level;
 }
}
