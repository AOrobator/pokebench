import type {RunEvent} from "./events.js";
import {qualifiedNativeMilestone,postClockHomeWitness} from "./milestones.js";
export interface TargetProof{readonly name:string;readonly milestone_seq:number;readonly state_evidence:readonly number[];}
type StateEvent=Extract<Extract<RunEvent,{type:"state"}>,{started:boolean}>;
export class NativeTargetStop{
 private home:StateEvent|null=null;private priorStable:StateEvent|null=null;private lastStable:StateEvent|null=null;
 private latest:StateEvent|null=null;private truck:StateEvent|null=null;proof:TargetProof|null=null;
 constructor(private readonly run:string,private readonly target:string,private readonly reached:(proof:TargetProof)=>void){}
 observe(event:RunEvent):void{
  if(event.run!==this.run||this.proof!==null)return;
  if(event.type==="state"&&"started" in event){this.latest=event;if(this.target==="PLAYER_HOUSE_EXITED_AFTER_CLOCK"||this.target==="RIVAL_HOUSE_ENTERED"){if(postClockHomeWitness(event)!==null)this.home??=event;if(event.started&&event.screen!=="field_transition"&&event.location!==null){this.priorStable=this.lastStable;this.lastStable=event;}}if(this.target==="FIRST_TRUCK_EXIT"&&event.started&&event.location==="INSIDE OF TRUCK")this.truck??=event;return;}
  if(event.type!=="milestone"||event.name!==this.target||event.origin!=="observed")return;
  const refs=event.evidence??[];
  if(this.latest===null)return;
  const states=this.target==="PLAYER_HOUSE_EXITED_AFTER_CLOCK"?[this.home??undefined,this.priorStable??undefined,this.latest]:this.target==="RIVAL_HOUSE_ENTERED"?[this.home??undefined,this.latest]:this.target==="FIRST_TRUCK_EXIT"?[this.truck??undefined,this.latest]:[this.latest];
  if(refs.length!==states.length||!refs.every((seq,index)=>seq===states[index]?.seq)||(this.target==="FIRST_TRUCK_EXIT"&&(this.truck===null||this.truck.seq>=this.latest.seq))||!qualifiedNativeMilestone(event,states))return;
  this.proof={name:event.name,milestone_seq:event.seq,state_evidence:[...refs]};this.reached(this.proof);
 }
}
