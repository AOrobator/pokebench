import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
export interface DialogueEntry {readonly seq:number;readonly turn:number;readonly key:string;readonly room:string;readonly position:string|null;readonly facing:string|null;readonly text:string}

const DEFAULT_LAST=8;
type Place={location:string|null;map_id:readonly number[]|null};
// Location labels can repeat or be missing across maps, so identity always includes the map id.
export function roomKey(state:Place):string {return `${state.location??"unknown room"}|${state.map_id?.join("/")??"none"}`;}
// What the model is shown: the map id only when its readout already shows one (bounded navigation).
export function roomOf(state:Place,features:FeatureSet):string {
 return `${state.location??"unknown room"}${features["bounded-navigation-v1"]&&state.map_id!==null?` (map ${state.map_id.join("/")})`:""}`;
}
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const Args=Type.Object({
 contains:Type.Optional(Type.String({maxLength:80,description:"Only pages containing these words (case-insensitive)."})),
 room:Type.Optional(Type.String({maxLength:80,description:"Only pages shown in a location whose name contains this text (case-insensitive)."})),
 last:Type.Optional(Type.Integer({minimum:1,maximum:20,description:`How many matching pages to return, newest first (default ${String(DEFAULT_LAST)}).`})),
});

// Every dialogue page the model actually received, in order. Deterministic from recorded events.
export class DialogueLog {
 private measured:State|null=null;
 private readonly log:DialogueEntry[]=[];
 constructor(private readonly features:FeatureSet){}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event){this.measured=event;return;}
  if(event.type!=="tool_result"||event.state_seq===undefined||this.measured?.seq!==event.state_seq)return;
  const state=this.measured;this.measured=null;
  const text=state.world_context?.dialogue;
  if(!state.started||state.screen!=="overworld"||!text)return;
  const key=roomKey(state),room=roomOf(state,this.features);
  const previous=this.log.at(-1);
  if(previous!==undefined&&previous.text===text&&previous.key===key)return;
  this.log.push({seq:state.seq,turn:state.turn,key,room,position:this.position(state),facing:this.faced(state),text});
 }
 entries():readonly DialogueEntry[]{return this.log;}
 private position(state:State):string|null {
  return this.features["live-player-position-v1"]&&state.position!==null?`${String(state.position.x)},${String(state.position.y)}`:null;
 }
 private faced(state:State):string|null {
  if(!this.features["named-interactions-v1"]||!this.features["live-player-position-v1"]||state.position===null||state.facing===null)return null;
  const step=STEP[state.facing.toLowerCase()];if(step===undefined)return null;
  const x=state.position.x+step[0],y=state.position.y+step[1];
  const target=(state.interaction_targets??[]).find(t=>t.x===x&&t.y===y&&t.name!==null);
  return target===undefined?null:`${target.name??""} at ${String(x)},${String(y)}`;
 }
 recall(args:{contains?:string;room?:string;last?:number}):string {
  const last=args.last??DEFAULT_LAST;
  if(!Number.isInteger(last)||last<1||last>20)throw Error("last must be an integer from 1 to 20");
  for(const value of [args.contains,args.room])if(value!==undefined&&value.length>80)throw Error("contains and room accept at most 80 characters");
  const words=args.contains?.trim().toLowerCase()??"",room=args.room?.trim().toLowerCase()??"";
  const matches=this.log.filter(e=>(words===""||e.text.toLowerCase().includes(words))&&(room===""||e.room.toLowerCase().includes(room)));
  if(matches.length===0)return `No recorded dialogue matches (${String(this.log.length)} pages recorded this run).`;
  const chosen=matches.slice(-last).reverse();
  let text=`DIALOGUE LOG: quoted game text you were shown, newest first. Past text; the current screen overrides it. ${String(matches.length)} of ${String(this.log.length)} entries match.`;
  for(const e of chosen)text+=`\n#${String(e.seq)} turn ${String(e.turn)} · ${e.room}${e.position===null?"":` · at ${e.position}`}${e.facing===null?"":` · facing ${e.facing}`}: "${e.text}"`;
  return `${text}\n${String(chosen.length)} shown.`;
 }
 tool():AgentTool<typeof Args> {
  return {name:"recall_dialogue",label:"Recall dialogue",description:"Search every dialogue page you have been shown this run: quoted game text with its turn, location, your position and the character you were facing when known. Filters: contains (words), room (location name), last (1–20, default 8). It reads past observations only; it does not press buttons.",parameters:Args,execute:(_id,args)=>Promise.resolve({content:[{type:"text",text:this.recall(args)}],details:undefined})};
 }
}

export function dialogueLog(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool|null {
 if(!features["dialogue-log-v1"])return null;
 const log=new DialogueLog(features);recorder.subscribe(event=>{log.observe(event);});
 return log.tool();
}
