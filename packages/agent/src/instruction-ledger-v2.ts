// instruction-ledger-v2: a block inside every observe, press and navigate_to result on the free overworld,
// right under the readout's Story line: the latest conversation with a person, whole, every line with who said
// it, and every room visited with the last line heard there. Deterministic from recorded events; no tool, no
// model-written text, nothing clipped. No character list, milestone order or route knowledge (PB4).
// Who said a line (operator decision, the operator 2026-10-17 4:49 PM): the game's NAME: prefix; else the person the
// player faced, described the way they look on screen ("the woman you talked to"), or by the name the game
// printed for that same sprite on that map earlier in the run; signs and objects are named as such and never
// become the pinned conversation. Raw sprite ids (WOMAN_4, RIVAL_MAY_NORMAL) are never printed.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";
import {roomKey,roomOf} from "./dialogue-log.js";
import {semanticWalk} from "./semantic-targets.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
// One quoted line: who said it, whether that is a person, and the words.
export interface Line {readonly turn:number;readonly page:Page;readonly who:string;readonly person:boolean;readonly text:string}
interface Conversation {readonly turn:number;readonly lines:readonly Line[]}
interface Room {name:string;turn:number;heard:Line|null;readout:boolean}

export const LEDGER_HEADER="Conversation ledger";
const HEAD=`${LEDGER_HEADER}: game text you were shown, quoted whole; past text, the current screen overrides it.`;
const LATEST="Latest conversation with a person";
const ROOMS="Rooms visited, newest first, with the last line heard in each:";
export const NO_SPEAKER="no speaker shown";

// What each object sprite looks like on screen (pokeemerald OBJ_EVENT_GFX_*, env/pokebench_env/event-graphics.json).
// People are the person you talked to; anything else is the thing you faced.
const PEOPLE:Readonly<Record<string,string>>={
 ...Object.fromEntries(["WOMAN_1","WOMAN_2","WOMAN_3","WOMAN_4","WOMAN_5","BEAUTY","POKEFAN_F","EXPERT_F","ROOFTOP_SALE_WOMAN","REPORTER_F","AQUA_MEMBER_F","MAGMA_MEMBER_F","CYCLING_TRIATHLETE_F","RUNNING_TRIATHLETE_F","SWIMMER_F","HEX_MANIAC","MOM","TEALA","GRETA","LUCY","ANABEL","ROXANNE","FLANNERY","WINONA","PHOEBE","GLACIA"].map(k=>[k,"woman"])),
 ...Object.fromEntries(["MAN_1","MAN_2","MAN_3","MAN_4","MAN_5","FAT_MAN","GENTLEMAN","HIKER","FISHERMAN","SAILOR","COOK","CAMERAMAN","REPORTER_M","BLACK_BELT","POKEFAN_M","EXPERT_M","PSYCHIC_M","MANIAC","BARD","ARTIST","DEVON_EMPLOYEE","MYSTERY_GIFT_MAN","CONTEST_JUDGE","AQUA_MEMBER_M","MAGMA_MEMBER_M","CYCLING_TRIATHLETE_M","RUNNING_TRIATHLETE_M","SWIMMER_M","PROF_BIRCH","NORMAN","STEVEN","WALLACE","ARCHIE","MAXIE","BRAWLY","JUAN","SIDNEY","BRANDON","TUCKER","NOLAND","SCOTT","QUINTY_PLUMP"].map(k=>[k,"man"])),
 ...Object.fromEntries(["OLD_MAN","WATTSON","DRAKE","SPENSER"].map(k=>[k,"old man"])),
 ...Object.fromEntries(["OLD_WOMAN","HOT_SPRINGS_OLD_WOMAN"].map(k=>[k,"old woman"])),
 ...Object.fromEntries(["BOY_1","BOY_2","BOY_3","YOUNGSTER","BUG_CATCHER","NINJA_BOY","RICH_BOY","SCHOOL_KID_M","CAMPER","GAMEBOY_KID","TUBER_M","TUBER_M_SWIMMING","LITTLE_BOY","LITTLE_BOY_3","WALLY","TATE","RED","LINK_BRENDAN","LINK_RS_BRENDAN"].map(k=>[k,"boy"])),
 ...Object.fromEntries(["GIRL_1","GIRL_2","GIRL_3","LASS","TWIN","PICNICKER","LITTLE_GIRL","TUBER_F","LIZA","LEAF","LINK_MAY","LINK_RS_MAY"].map(k=>[k,"girl"])),
 SCIENTIST_1:"scientist",SCIENTIST_2:"scientist",NURSE:"nurse",UNION_ROOM_NURSE:"nurse",MART_EMPLOYEE:"clerk",LINK_RECEPTIONIST:"receptionist",
};
// The player-character and rival sprites in every outfit.
function personWord(kind:string):string|null {
 const known=PEOPLE[kind];
 if(known!==undefined)return known;
 if(/^(RIVAL_)?BRENDAN_/.test(kind))return "boy";
 if(/^(RIVAL_)?MAY_/.test(kind))return "girl";
 return null;
}
const OBJECTS:Readonly<Record<string,string>>={MOVING_BOX:"box",ITEM_BALL:"item ball",BERRY_TREE:"berry tree",BERRY_TREE_EARLY_STAGES:"berry tree",BERRY_TREE_LATE_STAGES:"berry tree",CUTTABLE_TREE:"tree",BREAKABLE_ROCK:"rock",PUSHABLE_BOULDER:"boulder",TRUCK:"truck",BIRCHS_BAG:"bag",FOSSIL:"fossil",CABLE_CAR:"cable car",SS_TIDAL:"ship",MR_BRINEYS_BOAT:"boat",TRICK_HOUSE_STATUE:"statue"};
function objectWord(kind:string):string {
 const known=OBJECTS[kind];
 if(known!==undefined)return known;
 if(kind.endsWith("_DOLL"))return "doll";
 if(kind.endsWith("_CUSHION"))return "cushion";
 if(kind.endsWith("_SHADOW"))return "shadow";
 return "POKéMON";
}
// A faced background object as the harness names it: a sign by its kind alone, others as named ("wall clock").
function thingWord(name:string):string {
 if(/^sign\b/i.test(name))return "sign";
 return /^[A-Z][a-z]/.test(name)?`${name.charAt(0).toLowerCase()}${name.slice(1)}`:name;
}
export const field=(pages:readonly Page[])=>pages.filter(p=>p.battle_turn===undefined&&p.battle_message_id===undefined);
// The page as the game printed it, its NAME: prefix moved into the label and its line breaks as spaces.
function words(page:Page):string {
 const prefix=page.speaker===null?"":`${page.speaker}: `;
 const text=page.speaker_source==="name_prefix"&&prefix!==""&&page.text.startsWith(prefix)?page.text.slice(prefix.length):page.text;
 return text.replace(/\s+/g," ").trim();
}
const spriteKey=(page:Page,kind:string)=>`${page.map_id?.join("/")??page.map??"none"}|${kind}`;
// Who said each page of one call. A sprite the game names in the same call (one NAME: prefix, one faced sprite
// kind) keeps that name on that map for the rest of the run.
export function linesOf(turn:number,pages:readonly Page[],names:Map<string,string>):Line[] {
 const prefixes=new Set(pages.flatMap(p=>p.speaker_source==="name_prefix"&&p.speaker!==null?[p.speaker]:[]));
 const sprites=new Set(pages.flatMap(p=>p.speaker_source==="faced_sprite"&&p.speaker!==null&&personWord(p.speaker)!==null?[spriteKey(p,p.speaker)]:[]));
 const [name]=prefixes,[sprite]=sprites;
 if(prefixes.size===1&&sprites.size===1&&name!==undefined&&sprite!==undefined)names.set(sprite,name);
 return pages.map(page=>{
  const text=words(page),kind=page.speaker;
  if(kind===null)return {turn,page,who:NO_SPEAKER,person:false,text};
  if(page.speaker_source==="name_prefix")return {turn,page,who:kind,person:true,text};
  if(page.speaker_source==="faced_target")return {turn,page,who:`the ${thingWord(kind)}`,person:false,text};
  const word=personWord(kind);
  if(word===null)return {turn,page,who:`the ${objectWord(kind)}`,person:false,text};
  return {turn,page,who:names.get(spriteKey(page,kind))??`the ${word} you talked to`,person:true,text};
 });
}
const quote=(line:Line)=>`${line.who}: "${line.text}"`;
function heard(h:Line|null,hideTurn:number|null):string {
 if(h===null)return "nothing heard";
 if(hideTurn!==null&&h.turn===hideTurn)return `last heard turn ${String(h.turn)} (this result's dialogue list)`;
 return `last heard turn ${String(h.turn)}, ${quote(h)}`;
}
const placeOf=(page:Page)=>({location:page.map,...(page.map_display===undefined?{}:{location_display:page.map_display}),map_id:page.map_id});

export class ConversationLedger {
 private readonly rooms=new Map<string,Room>();
 private readonly pending=new Map<string,{readonly turn:number;readonly pages:readonly Page[]}>();
 private conversation:Conversation|null=null;
 private last:Line|null=null;
 private measured:State|null=null;
 private turn=0;
 // Sprite (map and kind) -> the name the game printed for it in the same conversation.
 private readonly names=new Map<string,string>();
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
  if(call!==undefined){
   const lines=linesOf(call.turn,call.pages,this.names);
   this.hear(this.rooms,lines);
   const latest=lines.at(-1);
   if(latest!==undefined)this.last=latest;
   if(lines.some(l=>l.person))this.conversation={turn:call.turn,lines};
  }
  // The room the result's own readout showed.
  if(state!==null&&event.state_seq===state.seq&&this.visible(state))this.visit(this.rooms,state,event.turn);
 }
 private visible(state:Pick<GameStateSnapshot,"started"|"screen"|"location"|"map_id">):boolean {return state.started&&state.screen==="overworld"&&(state.location!==null||state.map_id!==null);}
 private visit(rooms:Map<string,Room>,state:Pick<GameStateSnapshot,"location"|"location_display"|"map_id">,turn:number):void {
  const key=roomKey(state),room=rooms.get(key);
  rooms.delete(key);
  rooms.set(key,{name:roomOf(state,this.features),turn,heard:room?.heard??null,readout:true});
 }
 private hear(rooms:Map<string,Room>,lines:readonly Line[]):void {
  for(const line of lines){
   const page=line.page;
   if(page.map===null&&page.map_id===null)continue;
   const place=placeOf(page),key=roomKey(place),room=rooms.get(key);
   rooms.delete(key);
   rooms.set(key,{name:room?.readout===true?room.name:roomOf(place,this.features),turn:line.turn,heard:line,readout:room?.readout??false});
  }
 }
 block(state:GameStateSnapshot,callId:string):string|null {
  if(!this.visible(state)||state.in_battle)return null;
  // This result's own pages are delivered with it; they count here before its tool_result is recorded.
  const rooms=new Map([...this.rooms].map(([k,r])=>[k,{...r}]));
  const call=this.pending.get(callId);
  const lines=call===undefined?[]:linesOf(call.turn,call.pages,new Map(this.names));
  this.hear(rooms,lines);
  const conversation=call!==undefined&&lines.some(l=>l.person)?{turn:call.turn,lines}:this.conversation;
  const latest=lines.at(-1)??this.last;
  this.visit(rooms,state,this.turn);
  const nameOf=(page:Page)=>rooms.get(roomKey(placeOf(page)))?.name??roomOf(placeOf(page),this.features);
  // This call's pages are already in the result's dialogue list. Quote only earlier turns.
  const hideTurn=this.features["input-cuts-v1"]&&call!==undefined?call.turn:null;
  const out=[HEAD];
  if(conversation!==null){
   const speakers=[...new Set(conversation.lines.flatMap(l=>l.person?[l.who]:[]))];
   const places=[...new Set(conversation.lines.filter(l=>l.page.map!==null||l.page.map_id!==null).map(l=>nameOf(l.page)))];
   const head=`${LATEST} (${speakers.join(", ")}, turn ${String(conversation.turn)}${places.length===0?"":`; ${places.join(", then ")}`}):`;
   if(hideTurn!==null&&conversation.turn===hideTurn)out.push(`${head} this result's dialogue list.`);
   else out.push(head,...conversation.lines.map(l=>`- ${quote(l)}`));
  }else if(latest!==null){
   const where=latest.page.map===null&&latest.page.map_id===null?"":` in ${nameOf(latest.page)}`;
   const head=`${LATEST}: none yet; the latest field page, turn ${String(latest.turn)}${where}:`;
   if(hideTurn!==null&&latest.turn===hideTurn)out.push(`${head} this result's dialogue list.`);
   else out.push(head,`- ${quote(latest)}`);
  }
  else out.push(`${LATEST}: none yet; no field dialogue shown yet.`);
  out.push(ROOMS);
  for(const room of [...rooms.values()].reverse())out.push(`- ${room.name}, here turn ${String(room.turn)}: ${heard(room.heard,hideTurn)}`);
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
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(id,await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
