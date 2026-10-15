import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {DialogueLog,roomKey,roomOf,type DialogueEntry} from "./dialogue-log.js";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Room {readonly name:string;readonly firstTurn:number;readonly seq:number;heard:DialogueEntry|null}
interface Contradiction {readonly expected:string;readonly observed:string;readonly evidence:readonly number[]}

const INSTRUCTIONS=3,ROOMS=8,CONTRADICTIONS=8;
const Args=Type.Object({
 expected:Type.String({maxLength:200,description:"What you expected, in one sentence."}),
 observed:Type.String({maxLength:300,description:"What the game actually showed instead."}),
 evidence:Type.Array(Type.Integer({minimum:0}),{maxItems:4,description:"1–4 event numbers (#seq) of dialogue or observations you were shown that support the observation."}),
});

// Facts the model was shown plus contradictions it recorded; never a goal or route.
export class InstructionLedger {
 private measured:State|null=null;
 private readonly log:DialogueLog;
 private readonly rooms=new Map<string,Room>();
 private readonly known=new Set<number>();
 // dialogue-auto-advance-v1 page seqs per tool call, citable once that call's result reached the model.
 private readonly pages=new Map<string,number[]>();
 private readonly contradictions:Contradiction[]=[];
 constructor(private readonly features:FeatureSet){this.log=new DialogueLog(features);}
 observe(event:RunEvent):void {
  this.log.observe(event);
  if(event.type==="dialogue_auto_advance"){this.pages.set(event.tool_call_id,event.pages.map(page=>page.state_seq??event.seq));if(this.pages.size>16)this.pages.delete(this.pages.keys().next().value??"");return;}
  if(event.type==="tool_result"){const seqs=this.pages.get(event.id);this.pages.delete(event.id);if(!event.is_error)for(const seq of seqs??[])this.known.add(seq);}
  if(event.type==="state"&&"started"in event){this.measured=event;return;}
  if(event.type!=="tool_result"||event.state_seq===undefined||this.measured?.seq!==event.state_seq)return;
  const state=this.measured;this.measured=null;
  if(!state.started||state.screen!=="overworld")return;
  this.known.add(state.seq);
  const key=roomKey(state),name=roomOf(state,this.features);
  let room=this.rooms.get(key);
  if(room===undefined){room={name,firstTurn:state.turn,seq:state.seq,heard:null};this.rooms.set(key,room);}
  const last=this.log.entries().at(-1);
  if(last?.seq===state.seq)room.heard=last;
 }
 note(expected:string,observed:string,evidence:readonly number[]):void {
  if(expected.trim()===""||observed.trim()===""||expected.length>200||observed.length>300)throw Error("expected needs 1–200 characters and observed 1–300");
  if(evidence.length===0||evidence.length>4)throw Error("evidence needs 1–4 event numbers");
  for(const seq of evidence)if(!this.known.has(seq))throw Error(`unknown event #${String(seq)}; cite an observation or dialogue you were shown`);
  this.contradictions.push({expected,observed,evidence:[...evidence]});
  if(this.contradictions.length>CONTRADICTIONS)this.contradictions.shift();
 }
 evidence():number[]{
  const seqs=new Set<number>();
  for(const e of this.instructions())seqs.add(e.seq);
  for(const r of [...this.rooms.values()].slice(-ROOMS)){seqs.add(r.seq);if(r.heard!==null)seqs.add(r.heard.seq);}
  for(const c of this.contradictions)for(const s of c.evidence)seqs.add(s);
  return [...seqs].sort((a,b)=>a-b);
 }
 private instructions():DialogueEntry[]{return this.log.entries().slice(-INSTRUCTIONS).reverse();}
 text():string {
  const entry=(e:DialogueEntry)=>`#${String(e.seq)} turn ${String(e.turn)} · ${e.room}${e.facing===null?"":` · facing ${e.facing}`}: "${e.text}"`;
  const told=this.instructions();
  const rooms=[...this.rooms.values()].slice(-ROOMS).reverse();
  const notes=[...this.contradictions].reverse();
  const text=`INSTRUCTION LEDGER: quoted dialogue you were shown, rooms you visited and contradictions you recorded. It is not a walkthrough; the harness does not know your next goal. The current screen overrides it.
Received instructions${told.length===0?": none recorded":`, newest first:\n${told.map(entry).join("\n")}`}
Rooms visited${rooms.length===0?": none recorded":`, newest first:\n${rooms.map(r=>`${r.name} (first turn ${String(r.firstTurn)}): ${r.heard===null?"nothing heard":`last heard "${r.heard.text}"`}`).join("\n")}`}
Contradictions you recorded: ${notes.length===0?"none (use note_contradiction when the game differs from what you expected)":`\n${notes.map(c=>`expected: ${c.expected}; observed: ${c.observed}; evidence ${c.evidence.map(s=>`#${String(s)}`).join(",")}`).join("\n")}`}`;
  return text;
 }
 tool():AgentTool<typeof Args> {
  return {name:"note_contradiction",label:"Note contradiction",description:"Record that the game differed from what you expected, citing 1–4 event numbers you were shown. It is pinned in the instruction ledger so you do not repeat the same wrong assumption. It changes nothing in the game.",parameters:Args,execute:async(_id,args)=>{
   await Promise.resolve();this.note(args.expected,args.observed,args.evidence);
   return {content:[{type:"text",text:`Recorded contradiction: expected ${args.expected}; observed ${args.observed}`}],details:undefined};
  }};
 }
}

type LedgerRecorder=Pick<RunRecorder,"subscribe"|"recordLedgerContext">;
export function instructionLedger(features:FeatureSet,recorder:LedgerRecorder,transform:(messages:AgentMessage[])=>Promise<AgentMessage[]>):{tool:AgentTool;transformContext:(messages:AgentMessage[])=>Promise<AgentMessage[]>}|null {
 if(!features["instruction-ledger-v1"])return null;
 const ledger=new InstructionLedger(features);recorder.subscribe(event=>{ledger.observe(event);});
 return {tool:ledger.tool(),transformContext:messages=>{
  const text=ledger.text();const body:Omit<BodyOf<"ledger_context">,"type"|"turn">={text,evidence:ledger.evidence()};recorder.recordLedgerContext(body);
  return transform([...messages,{role:"user",content:text,timestamp:Date.now()}]);
 }};
}
