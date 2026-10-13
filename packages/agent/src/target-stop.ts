import type {RunEvent} from "./events.js";
import {qualifiedNativeMilestone} from "./milestones.js";
export interface TargetProof{readonly name:string;readonly milestone_seq:number;readonly state_evidence:readonly number[];}
type StateEvent=Extract<Extract<RunEvent,{type:"state"}>,{started:boolean}>;
export class NativeTargetStop{
 private latest:StateEvent|null=null;private truck:StateEvent|null=null;proof:TargetProof|null=null;
 constructor(private readonly run:string,private readonly target:string,private readonly reached:(proof:TargetProof)=>void){}
 observe(event:RunEvent):void{
  if(event.run!==this.run||this.proof!==null)return;
  if(event.type==="state"&&"started" in event){this.latest=event;if(this.target==="FIRST_TRUCK_EXIT"&&event.started&&event.location==="INSIDE OF TRUCK")this.truck??=event;return;}
  if(event.type!=="milestone"||event.name!==this.target||event.origin!=="observed")return;
  const refs=event.evidence??[];
  if(this.latest===null)return;
  const states=this.target==="FIRST_TRUCK_EXIT"?[this.truck??undefined,this.latest]:[this.latest];
  if(refs.length!==states.length||!refs.every((seq,index)=>seq===states[index]?.seq)||(this.target==="FIRST_TRUCK_EXIT"&&(this.truck===null||this.truck.seq>=this.latest.seq))||!qualifiedNativeMilestone(event,states))return;
  this.proof={name:event.name,milestone_seq:event.seq,state_evidence:[...refs]};this.reached(this.proof);
 }
}
