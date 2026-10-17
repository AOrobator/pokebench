// instruction-ledger-v2: a block inside every observe, press and navigate_to result on the free overworld,
// right under the readout's Story line: the latest conversation in which the game prints a speaker's NAME:
// prefix, whole, with its speakers and turn, and every room visited with the last field page heard there.
// Deterministic from recorded events; no tool, no model-written text, nothing clipped. Which conversation
// counts is decided by the game's own text (the NAME: prefix), never by a character list, milestone order
// or route knowledge (PB4). Faced sprites and faced objects are not names the game prints, so they never
// make a conversation the pinned one; they are labelled for what they are.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";
import {roomKey,roomOf} from "./dialogue-log.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
interface Heard {readonly turn:number;readonly page:Page}
interface Conversation {readonly turn:number;readonly pages:readonly Page[]}
interface Room {name:string;turn:number;heard:Heard|null;readout:boolean}

export const LEDGER_HEADER="Conversation ledger";
const HEAD=`${LEDGER_HEADER}: game text you were shown, quoted whole; past text, the current screen overrides it.`;
const LATEST="Latest conversation where the game names the speaker";
const ROOMS="Rooms visited, newest first, with the last line heard in each:";

const field=(pages:readonly Page[])=>pages.filter(p=>p.battle_turn===undefined&&p.battle_message_id===undefined);
const named=(pages:readonly Page[])=>pages.some(p=>p.speaker_source==="name_prefix");
// Who the page is attributed to: the game's NAME: prefix (carried to the pages it continues), else what was faced.
function label(page:Page):string|null {
 if(page.speaker===null)return null;
 return page.speaker_source==="name_prefix"?page.speaker:page.speaker_source==="faced_target"?`${page.speaker} (faced object)`:`${page.speaker} (sprite kind, not a name)`;
}
// The page as the game printed it, its NAME: prefix moved into the label and its line breaks as spaces.
function words(page:Page):string {
 const prefix=page.speaker===null?"":`${page.speaker}: `;
 const text=page.speaker_source==="name_prefix"&&prefix!==""&&page.text.startsWith(prefix)?page.text.slice(prefix.length):page.text;
 return text.replace(/\s+/g," ").trim();
}
const quote=(page:Page)=>{const who=label(page);return `${who===null?"":`${who}: `}"${words(page)}"`;};
function heard(h:Heard|null):string {
 if(h===null)return "nothing heard";
 const who=label(h.page);
 return `last heard turn ${String(h.turn)}${who===null?"":`, ${who}`}: "${words(h.page)}"`;
}
const placeOf=(page:Page)=>({location:page.map,...(page.map_display===undefined?{}:{location_display:page.map_display}),map_id:page.map_id});

export class ConversationLedger {
 private readonly rooms=new Map<string,Room>();
 private readonly pending=new Map<string,{readonly turn:number;readonly pages:readonly Page[]}>();
 private conversation:Conversation|null=null;
 private last:Heard|null=null;
 private measured:State|null=null;
 private turn=0;
 constructor(private readonly features:FeatureSet){}
 observe(event:RunEvent):void {
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="state"&&"started" in event){this.measured=event;return;}
  if(event.type==="dialogue_auto_advance"){
   this.pending.set(event.tool_call_id,{turn:event.turn,pages:field(event.pages)});
   if(this.pending.size>16)this.pending.delete(this.pending.keys().next().value??"");
   return;
  }
  if(event.type!=="tool_result")return;
  const call=this.pending.get(event.id);this.pending.delete(event.id);
  const state=this.measured;this.measured=null;
  if(event.is_error)return;
  if(call!==undefined)this.hear(this.rooms,call.turn,call.pages,true);
  // The room the result's own readout showed.
  if(state!==null&&event.state_seq===state.seq&&this.visible(state))this.visit(this.rooms,state,event.turn);
 }
 private visible(state:Pick<GameStateSnapshot,"started"|"screen"|"location"|"map_id">):boolean {return state.started&&state.screen==="overworld"&&(state.location!==null||state.map_id!==null);}
 private visit(rooms:Map<string,Room>,state:Pick<GameStateSnapshot,"location"|"location_display"|"map_id">,turn:number):void {
  const key=roomKey(state),room=rooms.get(key);
  rooms.delete(key);
  rooms.set(key,{name:roomOf(state,this.features),turn,heard:room?.heard??null,readout:true});
 }
 private hear(rooms:Map<string,Room>,turn:number,pages:readonly Page[],keep:boolean):Conversation|null {
  for(const page of pages){
   if(page.map===null&&page.map_id===null)continue;
   const place=placeOf(page),key=roomKey(place),room=rooms.get(key);
   rooms.delete(key);
   rooms.set(key,{name:room?.readout===true?room.name:roomOf(place,this.features),turn,heard:{turn,page},readout:room?.readout??false});
  }
  const latest=pages.at(-1);
  const conversation=named(pages)?{turn,pages}:null;
  if(keep){
   if(latest!==undefined)this.last={turn,page:latest};
   if(conversation!==null)this.conversation=conversation;
  }
  return conversation;
 }
 block(state:GameStateSnapshot,callId:string):string|null {
  if(!this.visible(state)||state.in_battle)return null;
  // This result's own pages are delivered with it; they count here before its tool_result is recorded.
  const rooms=new Map([...this.rooms].map(([k,r])=>[k,{...r}]));
  const call=this.pending.get(callId);
  const now=call===undefined?null:this.hear(rooms,call.turn,call.pages,false);
  const conversation=now??this.conversation;
  const last=call?.pages.at(-1);
  const latest=call!==undefined&&last!==undefined?{turn:call.turn,page:last}:this.last;
  this.visit(rooms,state,this.turn);
  const nameOf=(page:Page)=>rooms.get(roomKey(placeOf(page)))?.name??roomOf(placeOf(page),this.features);
  const out=[HEAD];
  if(conversation!==null){
   const speakers=[...new Set(conversation.pages.flatMap(p=>p.speaker_source==="name_prefix"&&p.speaker!==null?[p.speaker]:[]))];
   const places=[...new Set(conversation.pages.filter(p=>p.map!==null||p.map_id!==null).map(nameOf))];
   out.push(`${LATEST} (${speakers.join(", ")}, turn ${String(conversation.turn)}${places.length===0?"":`; ${places.join(", then ")}`}):`,...conversation.pages.map(p=>`- ${quote(p)}`));
  }else if(latest!==null)out.push(`${LATEST}: none yet; the latest field page, turn ${String(latest.turn)}${latest.page.map===null&&latest.page.map_id===null?"":` in ${nameOf(latest.page)}`}:`,`- ${quote(latest.page)}`);
  else out.push(`${LATEST}: none yet; no field dialogue shown yet.`);
  out.push(ROOMS);
  for(const room of [...rooms.values()].reverse())out.push(`- ${room.name}, here turn ${String(room.turn)}: ${heard(room.heard)}`);
  return out.join("\n");
 }
 // The readout with the block inserted after its Story line (after Location/Position without one).
 annotate(text:string,state:GameStateSnapshot,callId:string):string {
  const anchor=/^Story: .*$/m.exec(text)??/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return text;
  const block=this.block(state,callId);
  if(block===null)return text;
  const end=anchor.index+anchor[0].length;
  return `${text.slice(0,end)}\n${block}${text.slice(end)}`;
 }
}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export function withInstructionLedgerV2(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool[] {
 if(!features["instruction-ledger-v2"])return [...tools];
 const ledger=new ConversationLedger(features);recorder.subscribe(event=>{ledger.observe(event);});
 const annotate=<T>(id:string,result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const content=[...result.content];content[index]={...part,text:ledger.annotate(part.text,state,id)};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to")return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update)=>annotate(id,await tool.executeChecked(id,params,check,signal,update))};
  return checked;
 });
}
