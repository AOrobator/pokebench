import {DialogueLog,roomKey,roomOf,type DialogueEntry,speakerLabel} from "./dialogue-log.js";
import {ExitHistory,mapKey,readoutNames} from "./exit-history.js";
import {NextMilestoneHint} from "./milestone-hint.js";
import {edgeBearings} from "./connection-edges.js";
import {exitReach} from "./surf-gate.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {BattleOutcomes} from "./battle-outcomes.js";
import {StoryCharacterGate} from "./stall-gate.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {LoopKind} from "./loop-detection.js";

export type Stall=
 | {readonly kind:"map_cycle";readonly from:string;readonly to:string;readonly roundTrips:number;readonly consecutive:boolean}
 | {readonly kind:"milestone_drought";readonly minutes:number}
 | {readonly kind:"interface_dwell";readonly name:string;readonly calls:number};

// An interface the game owns input for: a naming editor (any phase), or a ready menu or prompt outside battle.
export interface OwnedInterface {readonly key:string;readonly name:string;readonly owner:string|null;readonly phase:string;readonly naming:boolean;readonly text:string|null;readonly selected:string|null;readonly controls:string|null}
// pokeemerald naming_screen.c templates' maxChars (PLAYER_NAME_LENGTH, BOX_NAME_LENGTH, POKEMON_NAME_LENGTH, WALDA_PHRASE_LENGTH).
const NAME_LIMIT:Readonly<Record<string,number>>={player:7,box:8,caught_mon:10,nickname:10,walda:15};
type Screen=Pick<Extract<RunEvent,{type:"state";started:boolean}>,"started"|"screen"|"in_battle"|"active_ui"|"naming">;
export function interfaceOf(s:Screen):OwnedInterface|null {
 if(!s.started||s.in_battle||s.screen==="battle")return null;
 const ui=s.active_ui??null;
 const owner=ui?.details?.["naming_owner"];
 const who=typeof owner==="string"?owner:null;
 if(s.screen==="naming"||s.naming!=null){
  const name=who===null?"naming editor":`${who.replaceAll("_"," ")} naming editor`;
  // In-game naming fields when the state has them; else the interface's own value and selection.
  return {key:`naming:${who??""}`,name,owner:who,phase:ui?.phase??"naming",naming:true,text:s.naming?.text??ui?.value??null,selected:s.naming?.key??ui?.selected??null,controls:ui?.controls??null};
 }
 if(ui===null||ui.ready!==true||ui.diagnostic!==null)return null;
 return {key:`ui:${ui.phase}`,name:`${ui.phase.replaceAll("_"," ")} interface`,owner:who,phase:ui.phase,naming:false,text:ui.value??null,selected:ui.selected,controls:ui.controls};
}

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Call {readonly name:string;readonly args:Record<string,unknown>;before:State|null;pressed:boolean;readonly uiBefore:string|null;conditions?:ReadonlyMap<string,boolean>}
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Page=Advance["pages"][number];
interface Tried {readonly key:string;readonly room:string;readonly label:string;count:number;outcome:string}
interface Instruction {readonly name:string;readonly turn:number;readonly pages:readonly {readonly speaker:string|null;readonly text:string}[]}

const MAX_TRIED=8;
// Only these tools return the game readout; any other text could only quote it.
const GAME_TOOLS=new Set(["observe","press","navigate_to"]);
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const PATTERN:Readonly<Record<LoopKind,string>>={cycle:"the same short cycle of actions",ineffective:"the same input with no effect",planning:"planning without acting",observation:"observing without acting",rejection:"the same rejected tool call",trigger_script:"the same condition-matching coordinate-trigger dialogue"};
const at=(x:number,y:number)=>`${String(x)},${String(y)}`;
const quote=(e:DialogueEntry)=>`turn ${String(e.turn)}, ${e.room}${e.facing===null?"":`, facing ${e.facing}`}${e.presence===undefined?"":`, ${e.presence}`}: "${e.text.replace(/\s+/g," ")}"`;
type Target=NonNullable<State["interaction_targets"]>[number];
const EDGES=new Set(["NORTH","SOUTH","EAST","WEST"]);
const objectKey=(id:number):string=>`object:${String(id)}`;
type Ui=NonNullable<State["active_ui"]>;
const uiName=(ui:Ui):string=>`the ${ui.phase.replaceAll("_"," ")}`;
// briefing-exits-v1: what a press did to an open menu or prompt, from the state's own active_ui.
function interfaceChange(before:State,after:State):string|null {
 const a=before.active_ui??null,b=after.active_ui??null;
 if(a===null&&b===null)return null;
 if(a===null&&b!==null)return `opened ${uiName(b)}${b.selected===null?"":` (highlighted ${b.selected})`}`;
 if(a!==null&&b===null)return `closed ${uiName(a)}`;
 if(a===null||b===null)return null;
 if(a.phase!==b.phase)return `${uiName(a)} -> ${uiName(b)}`;
 if(a.selected!==b.selected)return `moved the highlight in ${uiName(b)}: ${a.selected??"none"} -> ${b.selected??"none"}`;
 return null;
}
function turned(before:State,after:State):string|null {
 return before.facing!==null&&after.facing!==null&&before.facing!==after.facing?`turned ${before.facing.toLowerCase()} -> ${after.facing.toLowerCase()}`:null;
}
const mapOf=(state:{map_id:readonly number[]|null}):string|null=>state.map_id===null?null:state.map_id.join("/");
const counted=(event:Extract<RunEvent,{type:"milestone"}>):boolean=>event.origin!=="present_at_start"&&event.name!=="GAME_RUNNING"&&!MEASUREMENT_ONLY_MILESTONES.has(event.name);

// A deterministic summary for a looping agent: facts it was shown, never a route or story goal.
export class SupervisorBriefing {
 private measured:State|null=null;
 private latest:State|null=null;
 private progress:{turn:number;name:string}|null=null;
 // dialogue-context-kept-v1: story milestones the game confirmed during this run, in order.
 private readonly stories:{seq:number;turn:number;name:string}[]=[];
 private turn=0;
 private readonly dialogue:DialogueLog;
 private readonly calls=new Map<string,Call>();
 private readonly tried:Tried[]=[];
 private readonly touched=new Map<string,Set<string>>();
 private readonly hint:NextMilestoneHint|null;
 private story:string|null=null;
 private goal:string|null=null;
 private readonly heard=new Set<string>();
 // dialogue-auto-advance-v1: the pages of each auto-advanced call, recorded before its result.
 private readonly advanced=new Map<string,Advance>();
 // stall-briefing-v1: the pages shown in the call that earned the latest story milestone, and the rooms
 // and maps the player has been on since the latest counted milestone.
 private pendingStory:{readonly name:string;readonly turn:number;readonly evidence:number}|null=null;
 private instruction:Instruction|null=null;
 private readonly path=new Map<string,State>();
 private readonly entered=new Set<string>();
 // stall-briefing-v1: the owned interface the latest result showed, and the presses made in it.
 private screenNow:{readonly state:State;readonly ui:OwnedInterface}|null=null;
 private readonly uiTried:Tried[]=[];
 // briefing-exits-v1: exits taken and step triggers stood on, applied at the next tool result after its Story line;
 // the map names the readout itself showed.
 private readonly exits:ExitHistory|null;
 private readonly pendingTouches:{readonly room:string;readonly tile:string}[]=[];
 private shown:State|null=null;
 private readonly conditions=new Map<string,Map<string,boolean>>();
 // briefing-exits-v1: recent recorded states by seq, so a dialogue page's own state shows whom the player faced.
 private readonly recent=new Map<number,State>();
 private stepFrom:{readonly room:string;readonly x:number;readonly y:number}|null=null;
 private readonly names=new Map<string,string>();
 // briefing-battle-outcomes-v1: the latest battle against a story character and the latest whiteout.
 private readonly battles:BattleOutcomes|null;
 // story-character-stall-gate-v1: while it holds, no way off the map is listed, and a walk that moved nowhere tries nothing.
 private readonly gate:StoryCharacterGate|null;
 constructor(private readonly features:FeatureSet){this.dialogue=new DialogueLog(features);this.hint=features["next-milestone-hint-v1"]?new NextMilestoneHint():null;this.exits=features["briefing-exits-v1"]?new ExitHistory():null;this.battles=features["briefing-battle-outcomes-v1"]?new BattleOutcomes(features):null;this.gate=features["story-character-stall-gate-v1"]?new StoryCharacterGate({recordStallGate:()=>undefined}):null;}
 observe(event:RunEvent):void {
  this.gate?.observe(event);
  this.dialogue.observe(event);
  this.hint?.observe(event);
  this.battles?.observe(event);
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="milestone"){
   if(!counted(event))return;
   this.progress={turn:event.turn,name:event.name};this.path.clear();this.entered.clear();
   if(event.kind==="story"){
    this.pendingStory={name:event.name,turn:event.turn,evidence:Math.max(...(event.evidence??[event.seq]))};
    this.stories.push({seq:event.seq,turn:event.turn,name:event.name});
   }
   return;
  }
  if(event.type==="state"&&"started"in event){this.measured=event;this.exitFacts(event);return;}
  if(event.type==="dialogue_auto_advance"){
   // battle-text-auto-advance-v1's battle messages are not field dialogue for the briefings.
   this.advanced.set(event.tool_call_id,{...event,pages:event.pages.filter(page=>page.battle_turn===undefined)});
   if(this.advanced.size>16)this.advanced.delete(this.advanced.keys().next().value??"");
   return;
  }
  if(event.type==="tool_call"&&(event.name==="press"||event.name==="navigate_to")){
   this.calls.set(event.id,{name:event.name,args:event.args,before:this.latest,pressed:false,uiBefore:this.screenNow?.ui.key??null});
   if(this.calls.size>16)this.calls.delete(this.calls.keys().next().value??"");
   return;
  }
  // The snapshot taken just before the first button is what the press acted on; the earlier shown state may be stale.
  if(event.type==="button_press"){
   const call=this.calls.get(event.tool_call_id);
   const pre=this.measured;
   if(call!==undefined&&!call.pressed&&pre!==null&&pre.seq===event.before_state_seq&&pre.started&&pre.screen==="overworld"){call.before=pre;call.pressed=true;if(this.exits!==null)call.conditions=new Map(this.conditions.get(this.room(pre))??[]);}
   return;
  }
  if(event.type==="tool_result"&&this.pendingStory!==null)this.storyPages(event.id,event.is_error);
  if(event.type!=="tool_result")return;
  if(event.state_seq===undefined||this.measured?.seq!==event.state_seq){this.flushTouches();return;}
  const after=this.measured;this.measured=null;
  const auto=this.advanced.get(event.id);this.advanced.delete(event.id);
  if(!event.is_error&&GAME_TOOLS.has(event.name)){this.readStory(event.text);if(this.exits!==null)readoutNames(event.text,after.map_id,this.names);}
  this.seeInterface(after,this.calls.get(event.id));
  this.flushTouches();
  // briefing-exits-v1: the latest result state, so a battle (which keeps the overworld snapshot stale) is placed now.
  if(this.exits!==null&&after.started&&after.map_id!==null)this.shown=after;
  if(!after.started||after.screen!=="overworld")return;
  this.latest=after;
  const key=this.room(after);this.path.delete(key);this.path.set(key,after);
  const map=mapOf(after);if(map!==null)this.entered.add(map);
  const call=this.calls.get(event.id);this.calls.delete(event.id);
  const label=call===undefined?null:this.label(call);
  if(call!==undefined&&label!==null){
   const where=call.before??after;
   this.remember(this.room(where),roomOf(where,this.features),label,this.outcome(call.before,after,auto?.pages??[]));
   if(call.before!==null&&this.room(call.before)===this.room(after)&&this.moved(call.before,after))this.touchSteppedTrigger(after);
   if(this.gate!==null)this.reached(call,after);
   if(this.exits!==null||this.features["faced-interaction-history-v1"])this.scriptedTrigger(call,after,auto);
  }
  for(const page of auto?.pages??[])this.heard.add(this.pageOpening(page));
  const dialogue=after.world_context?.dialogue;
  if(dialogue)this.heard.add(this.opening(after,dialogue));
 }
 private seeInterface(after:State,call:Call|undefined):void {
  const ui=interfaceOf(after);
  if(ui===null){this.screenNow=null;this.uiTried.length=0;return;}
  if(this.screenNow?.ui.key!==ui.key)this.uiTried.length=0;
  this.screenNow={state:after,ui};
  // Only presses made inside this interface: the press that opened it belongs to what was open before.
  const buttons=call?.name==="press"&&call.uiBefore===ui.key?call.args["buttons"]:undefined;
  if(!Array.isArray(buttons)||buttons.length===0)return;
  const label=`press ${buttons.map(String).join(",")}`;
  const outcome=[...(ui.naming&&ui.text!==null?[`text "${ui.text}"`]:[]),...(ui.selected===null?[]:[`highlighted ${ui.selected}`])].join(", ")||`phase ${ui.phase}`;
  // The same input repeated is one entry with its latest result: the text churns, the input does not.
  const index=this.uiTried.findIndex(t=>t.label===label);
  const existing=index>=0?this.uiTried.splice(index,1)[0]:undefined;
  this.uiTried.push({key:ui.key,room:`the ${ui.name}`,label,count:(existing?.count??0)+1,outcome:`latest: ${outcome}`});
  if(this.uiTried.length>MAX_TRIED)this.uiTried.shift();
 }
 // The pages delivered in the call that earned a story milestone, up to the state that proved it.
 private storyPages(id:string,error:boolean):void {
  const story=this.pendingStory;this.pendingStory=null;
  if(story===null||error)return;
  const auto=this.advanced.get(id);
  const pages=auto!==undefined
   ?auto.pages.filter(p=>(p.state_seq??auto.seq)<=story.evidence).map(p=>({speaker:speakerLabel(p),text:p.text}))
   :this.dialogue.entries().filter(e=>e.turn===story.turn&&e.seq<=story.evidence).map(e=>({speaker:null,text:e.text}));
  if(pages.length>0)this.instruction={name:story.name,turn:story.turn,pages};
 }
 // The readout's own Story line, so the briefing never disagrees with it. A reload gap keeps the last known line.
 private readStory(text:string):void {
  const goal=/^Story goal: (.*)$/m.exec(text)?.[1];if(goal!==undefined)this.goal=goal.split(" -> ")[0]??goal;
  const line=/^Story: (.*)$/m.exec(text)?.[1];
  if(line===undefined||line.startsWith("unavailable"))return;
  // briefing-exits-v1: things tried stay tried across a story step; only people, who may say something new, are listed again.
  if(this.story!==null&&line!==this.story){if(this.exits===null)this.touched.clear();else for(const keys of this.touched.values())for(const key of keys)if(key.startsWith("object:"))keys.delete(key);}
  this.story=line;
 }
 private room(state:State):string {return roomKey(state);}
 // briefing-exits-v1: every recorded overworld state can take an exit (a map change) or step onto a step trigger
 // (any two consecutive recorded states, not only a result's). Arriving on a trigger through a warp, or standing on it, is still not trying it.
 private exitFacts(state:State):void {
  if(this.exits===null&&!this.features["faced-interaction-history-v1"])return;
  this.recent.set(state.seq,state);
  if(this.recent.size>64)this.recent.delete(this.recent.keys().next().value??-1);
  if(this.exits===null)return;
  for(const mark of this.exits.observe(state))this.pendingTouches.push(mark);
  const p=state.position;
  if(!state.started||state.screen!=="overworld"||p===null)return;
  const room=this.room(state),from=this.stepFrom;
  const seen=this.conditions.get(room)??new Map<string,boolean>();
  // The condition before this step decides whether stepping on the tile ran its script: a one-shot script may
  // flip its own variable by the time this state is read. Never seen before: this state's value.
  const prior=seen.get(at(p.x,p.y));
  for(const trigger of state.world_context?.triggers??[])if(trigger.condition_met!==null)seen.set(at(trigger.x,trigger.y),trigger.condition_met);
  this.conditions.set(room,seen);this.stepFrom={room,x:p.x,y:p.y};
  if(from===null||from.room!==room||(from.x===p.x&&from.y===p.y)||!this.features["world-targets-v1"])return;
  if((state.interaction_targets??[]).some(t=>t.activation==="step"&&t.x===p.x&&t.y===p.y)&&(prior??seen.get(at(p.x,p.y)))!==false)this.pendingTouches.push({room,tile:at(p.x,p.y)});
 }
 // briefing-exits-v1: a step trigger whose script ran is tried even when the script walked the player back to where
 // the press began (a push-back: OldaleTown_EventScript_BlockedPath, the Littleroot twin, Route 101 PreventExit*).
 // Evidence, all of it: the buttons the game was sent were directions only, the first faced the trigger from the
 // start tile, the trigger was not last shown with an unmet condition, the call showed the script (dialogue pages,
 // a dialogue, or field controls locked after it), and the player ended on the start tile.
 // A conversation counts for the person faced at its first page only when the press ended in A or the page record
 // attributes the first page to that faced sprite (the people ledger's rule).
 private scriptedTrigger(call:Call,after:State,auto:Advance|undefined):void {
  const before=call.before;
  if(!this.features["world-targets-v1"]||before===null||before.position===null)return;
  const pages=auto?.pages??[];
  const requested=call.name==="press"&&Array.isArray(call.args["buttons"])?call.args["buttons"].map(String):[];
  const sent=auto!==undefined?auto.sent.map(String):requested;
  const first=pages[0];
  const opened=first?.state_seq==null?undefined:this.recent.get(first.state_seq);
  const person=opened===undefined?null:this.faced(opened);
  const attributed=first?.speaker_source==="faced_target"||first?.speaker_source==="faced_sprite";
  const recordedFaced=this.features["faced-interaction-history-v1"]&&opened!==undefined&&person!==null&&attributed;
  if(recordedFaced){
   this.touch(this.room(opened),person.tile);
   if(person.object!==null)this.touch(this.room(opened),objectKey(person.object));
  }
  // Enabling faced interaction history must not also enable briefing-exits-v1's legacy object or push-back inference.
  if(this.exits===null)return;
  if(!recordedFaced&&opened!==undefined&&person?.object!=null&&(sent.at(-1)==="A"||first?.speaker_source==="faced_sprite"))this.touch(this.room(opened),objectKey(person.object));
  const step=sent[0]===undefined?undefined:STEP[sent[0].toLowerCase()];
  if(step===undefined||!sent.every(b=>STEP[b.toLowerCase()]!==undefined)||before.field_controls_locked===true)return;
  const x=before.position.x+step[0],y=before.position.y+step[1];
  // The condition as recorded when the press began, not after the script may have changed it.
  const unmet=(call.conditions?.get(at(x,y))??this.conditions.get(this.room(before))?.get(at(x,y)))===false;
  if(!(before.interaction_targets??[]).some(t=>t.activation==="step"&&t.x===x&&t.y===y)||unmet)return;
  const scripted=pages.length>0||Boolean(after.world_context?.dialogue)||after.field_controls_locked===true;
  const back=after.position?.x===before.position.x&&after.position.y===before.position.y&&this.room(after)===this.room(before);
  if(scripted&&back)this.touch(this.room(before),at(x,y));
 }
 // briefing-exits-v1: the readout's own coordinate-script condition for a trigger tile, the last time a recorded state
 // listed it (the readout lists only nearby triggers), says it could not run.
 private dead(s:State,x:number,y:number):boolean {
  return this.conditions.get(this.room(s))?.get(at(x,y))===false;
 }
 private flushTouches():void {
  for(const {room,tile} of this.pendingTouches.splice(0))this.touch(room,tile);
 }
 // The same text at another map or tile is a different conversation (another sign, another person).
 private opening(state:State,text:string):string {return JSON.stringify([this.room(state),state.position===null?null:at(state.position.x,state.position.y),text]);}
 private pageOpening(page:Page):string {return JSON.stringify([roomKey({location:page.map,map_id:page.map_id}),page.position===null?null:at(page.position.x,page.position.y),page.text]);}
 private touch(room:string,tile:string):void {
  const tiles=this.touched.get(room)??new Set<string>();tiles.add(tile);this.touched.set(room,tiles);
 }
 private label(call:Call):string|null {
  if(call.name==="navigate_to"){
   const x=call.args["x"],y=call.args["y"];
   if(typeof x!=="number"||typeof y!=="number")return "navigate_to (invalid target)";
   if(call.before!==null&&this.gate===null)this.touch(this.room(call.before),at(x,y));
   return `navigate_to ${at(x,y)}`;
  }
  const buttons=call.args["buttons"];
  if(!Array.isArray(buttons)||buttons.length===0)return null;
  const names=buttons.map(String);
  if(names.length===1&&names[0]==="A"&&call.before!==null){
   const faced=this.faced(call.before);
   if(faced!==null){
    this.touch(this.room(call.before),faced.tile);
    // briefing-exits-v1: a person is the same person on any tile; the map-local object id names them.
    if(this.exits!==null&&faced.object!==null)this.touch(this.room(call.before),objectKey(faced.object));
    return `A facing ${faced.name}`;
   }
  }
  return `press ${names.join(",")}`;
 }
 private faced(state:State):{tile:string;name:string;object:number|null}|null {
  if(!this.features["live-player-position-v1"]||state.position===null||state.facing===null)return null;
  const step=STEP[state.facing.toLowerCase()];if(step===undefined)return null;
  const x=state.position.x+step[0],y=state.position.y+step[1];
  const target=this.features["world-targets-v1"]?(state.interaction_targets??[]).find(t=>t.x===x&&t.y===y):undefined;
  const name=this.features["named-interactions-v1"]&&target?.name!=null?target.name:target?.kind??"tile";
  return {tile:at(x,y),name:`${name} at ${at(x,y)}`,object:target?.kind==="object"?target.local_id:null};
 }
 private outcome(before:State|null,after:State,pages:readonly Page[]):string {
  if(before===null)return "result unverified";
  if(this.room(before)!==this.room(after))return `entered ${roomOf(after,this.features)}`;
  const first=pages[0];
  if(this.features["active-field-message-buffer-v1"]&&first!==undefined){
   const shown=`${String(pages.length)} page${pages.length===1?"":"s"}, advanced automatically`;
   return this.heard.has(this.pageOpening(first))?`restarted a conversation already shown (${shown})`:`dialogue shown (${shown})`;
  }
  if(this.moved(before,after)&&after.position!==null)return `moved to ${at(after.position.x,after.position.y)}`;
  if(this.features["active-field-message-buffer-v1"]){
   const was=before.world_context?.dialogue??null,now=after.world_context?.dialogue??null;
   if(was!==null&&now===null)return "dialogue closed";
   if(was===null&&now!==null&&this.heard.has(this.opening(after,now)))return "restarted a conversation already shown";
   if(was!==now)return "dialogue changed";
   // Same text, same tile, and the print cursor went back: the press closed the conversation and opened it again.
   if(now!==null&&this.heard.has(this.opening(after,now))&&(after.world_context?.message?.cursor??Infinity)<(before.world_context?.message?.cursor??-Infinity))return "restarted a conversation already shown";
   const a=before.world_context?.message??null,b=after.world_context?.message??null;
   if(now!==null&&(a?.cursor!==b?.cursor||a?.phase!==b?.phase))return "dialogue advanced";
  }
  if(this.exits!==null)return interfaceChange(before,after)??turned(before,after)??"no change";
  return "no change";
 }
 private moved(before:State,after:State):boolean {
  return this.features["live-player-position-v1"]&&before.position!==null&&after.position!==null&&at(before.position.x,before.position.y)!==at(after.position.x,after.position.y);
 }
 // Walking onto a step-activated target is how it is tried; standing on a tile for other reasons is not.
 private touchSteppedTrigger(after:State):void {
  const p=after.position;if(p===null||!this.features["world-targets-v1"])return;
  // briefing-exits-v1: every recorded step, this one included, is judged in exitFacts against the condition before it.
  if(this.exits!==null)return;
  if((after.interaction_targets??[]).some(t=>t.activation==="step"&&t.x===p.x&&t.y===p.y))this.touch(this.room(after),at(p.x,p.y));
 }
 private remember(key:string,room:string,label:string,outcome:string):void {
  const index=this.tried.findIndex(t=>t.key===key&&t.label===label&&t.outcome===outcome);
  const existing=index>=0?this.tried.splice(index,1)[0]:undefined;
  this.tried.push({key,room,label,count:(existing?.count??0)+1,outcome});
  if(this.tried.length>MAX_TRIED)this.tried.shift();
 }
 private lastProgress():string {
  const progress=this.progress===null?"none earned in this run yet":`${this.progress.name.replaceAll("_"," ").toLowerCase()} at turn ${String(this.progress.turn)} (${String(this.turn-this.progress.turn)} turns ago)`;
  return this.battles===null?progress:`${progress}\n${this.battles.briefingLines().trimEnd()}`;
 }
 private characters():string {
  const s=this.latest;
  if(!this.features["world-targets-v1"]||!this.features["named-interactions-v1"])return "not available (named interactions are off)";
  if(s===null)return "no observation yet";
  const named=(s.interaction_targets??[]).filter(t=>t.kind==="object"&&t.name!=null).map(t=>`${t.name??""} at ${at(t.x,t.y)}`);
  return named.length===0?"none":named.join("; ");
 }
 private done():string {
  if(!this.features["story-state-v1"])return "not available (story flags are off)";
  return this.story??"not recorded";
 }
 private where():string {
  const now=this.shown;
  if(now!==null&&(now.in_battle||now.screen==="battle")){
   const tile=this.features["live-player-position-v1"]&&now.position!==null?` at ${at(now.position.x,now.position.y)}`:"";
   return `${roomOf(now,this.features)} in battle${tile}`;
  }
  const s=this.latest;if(s===null)return "no observation yet";
  const position=this.features["live-player-position-v1"]&&s.position!==null?` at ${at(s.position.x,s.position.y)}${s.facing===null?"":` facing ${s.facing.toLowerCase()}`}`:"";
  return `${roomOf(s,this.features)}${position}`;
 }
 private told():string {
  if(!this.features["active-field-message-buffer-v1"])return "not available (dialogue text is off)";
  const recent=this.dialogue.entries().slice(-3).reverse();
  return recent.length===0?"none recorded":recent.map(quote).join(" | ");
 }
 // dialogue-context-kept-v1: the pages recorded between the previous story milestone and the latest one that has any,
 // bounded by event order (seq), not turn: a turn can hold pages on both sides of a milestone.
 private storyContext():string {
  const head="- Dialogue you were shown leading up to the last story step the game confirmed";
  if(!this.features["active-field-message-buffer-v1"])return `${head}: not available (dialogue text is off)\n`;
  const entries=this.dialogue.entries();
  for(const [i,step] of [...this.stories.entries()].reverse()){
   const before=this.stories[i-1]?.seq??-Infinity;
   const pages=entries.filter(e=>e.seq>before&&e.seq<step.seq);
   if(pages.length>0)return `${head} (${step.name.replaceAll("_"," ").toLowerCase()} at turn ${String(step.turn)}), oldest first: ${pages.map(quote).join(" | ")}\n`;
  }
  return `${head}: none recorded\n`;
 }
 private kept():string {return this.features["dialogue-context-kept-v1"]?this.storyContext():"";}

 // surf-gated-exits-v1: the state's targets less the warps reachable only across water while Surf cannot be used;
 // exit-reachability-v1: and less those reachable neither on foot nor across water.
 private reachable(s:State):Target[] {
  const block=exitReach(this.features,s);
  return (s.interaction_targets??[]).filter(t=>t.kind!=="warp"||!block.warp(t.x,t.y));
 }
 private untried():string {
  const s=this.latest;
  if(!this.features["world-targets-v1"])return "not available (world targets are off)";
  if(s===null)return "no observation yet";
  const open=this.open(s);
  if(open.length===0)return "none: every listed target here has been tried";
  return open.join("; ");
 }
 private open(s:State):string[] {
  const done=this.touched.get(this.room(s))??new Set<string>();
  // Exits first: ordering only, so a briefing never buries the way out under room furniture.
  // surf-gated-exits-v1: a warp reachable only across water is not listed while Surf cannot be used.
  const targets=this.reachable(s);
  if(this.exits!==null){
   // briefing-exits-v1: people by object id, not tile; a trigger the readout shows cannot run now is labelled and last.
   const tried=(t:Target)=>t.kind==="object"&&t.local_id!==null?done.has(objectKey(t.local_id)):done.has(at(t.x,t.y));
   const dead=(t:Target)=>t.kind==="coordinate_trigger"&&this.dead(s,t.x,t.y);
   const rank=(t:Target)=>t.kind==="warp"?0:dead(t)?2:1;
   return targets.filter(t=>!tried(t)).sort((a,b)=>rank(a)-rank(b))
    .map(t=>`${this.target(t)} at ${at(t.x,t.y)} (${t.activation}${dead(t)?"; its condition did not match when the readout last showed it, so stepping on it then did nothing":""})`);
  }
  const open=targets.filter(t=>!done.has(at(t.x,t.y))).sort((a,b)=>Number(b.kind==="warp")-Number(a.kind==="warp"));
  return open.map(t=>`${this.target(t)} at ${at(t.x,t.y)} (${t.activation})`);
 }
 private target(t:{readonly kind:string;readonly name?:string|null;readonly destination?:readonly number[]|null}):string {
  if(!this.features["named-interactions-v1"]||t.name==null)return t.kind;
  // briefing-exits-v1: a warp's destination as the readout named it, else the bare id as before.
  const name=this.exits!==null&&t.kind==="warp"&&t.destination!=null?this.names.get(mapKey(t.destination)):undefined;
  return name===undefined||t.destination==null?t.name:`Warp to ${name} (map ${mapKey(t.destination)})`;
 }
 private instructionText():string {
  if(!this.features["active-field-message-buffer-v1"])return ": not available (dialogue text is off)";
  const story=this.instruction;
  if(story===null)return ": none recorded";
  return ` (${story.name.replaceAll("_"," ").toLowerCase()} at turn ${String(story.turn)}), whole, in order: ${story.pages.map(p=>`${p.speaker===null?"":`${p.speaker}: `}"${p.text.replace(/\s+/g," ")}"`).join(" | ")}`;
 }
 // Warps listed on the maps walked since the last progress whose destination map has not been entered since.
 private unentered():string {
  if(!this.features["world-targets-v1"])return "not available (world targets are off)";
  const rooms=[...this.path.values()].reverse().flatMap(s=>{
   const exits=this.reachable(s).filter(t=>t.kind==="warp"&&t.destination!==null&&!this.entered.has(`${String(t.destination[0])}/${String(t.destination[1])}`));
   // briefing-exits-v1: the map's connections to maps not entered either, where the readout shows them (world destinations).
   const block=exitReach(this.features,s);
   const edges=this.exits!==null&&this.features["world-destinations-v1"]?(s.topology?.connections??[]).filter(c=>!this.entered.has(mapKey(c.destination))&&!block.connection(c)):[];
   const items=[...exits.map(t=>`${this.target(t)} at ${at(t.x,t.y)}`),...edges.map(c=>{const name=this.names.get(mapKey(c.destination));return `${c.direction}${EDGES.has(c.direction)?" edge":""} -> ${name===undefined?`map ${mapKey(c.destination)}`:`${name} (map ${mapKey(c.destination)})`}`;})];
   return items.length===0?[]:[`${roomOf(s,this.features)}: ${items.join("; ")}`];
  });
  return rooms.length===0?"none":rooms.join(" | ");
 }
 // The same untried list as for the current map, for the other maps walked since the last progress.
 private untriedElsewhere():string {
  if(!this.features["world-targets-v1"])return "not available (world targets are off)";
  const here=this.latest===null?null:this.room(this.latest);
  const rooms=[...this.path.entries()].reverse().flatMap(([key,s])=>{
   if(key===here)return [];
   const open=this.open(s);
   return open.length===0?[]:[`${roomOf(s,this.features)}: ${open.join("; ")}`];
  });
  return rooms.length===0?"none":rooms.join(" | ");
 }
 // connection-edge-tiles-v1: the current map's walk-off edge tiles, as the server read them; off, nothing.
 // story-character-stall-gate-v1: a walk tries its target only when it ends on it or next to it.
 private reached(call:Call,after:State):void {
  const x=call.args["x"],y=call.args["y"],p=after.position;
  if(call.name!=="navigate_to"||call.before===null||typeof x!=="number"||typeof y!=="number"||p===null||this.room(call.before)!==this.room(after))return;
  if(Math.abs(p.x-x)+Math.abs(p.y-y)<=1)this.touch(this.room(after),at(x,y));
 }
 private staying():boolean {return this.gate?.holds()!=null;}
 private untalked():string {
  const names=this.gate?.untalked()??[];
  return names.length===0?"":`- Story characters on this map you have not talked to since your last story milestone: ${names.join("; ")}\n`;
 }
 private edges():string {
  if(this.staying())return "";
  const latest=this.latest,topology=latest?.topology;
  // surf-gated-exits-v1: an edge reachable only across water is not a way off while Surf cannot be used.
  const block=latest==null?null:exitReach(this.features,latest);
  const line=this.features["connection-edge-tiles-v1"]?edgeBearings(topology==null||block===null?topology:{...topology,connections:topology.connections.filter(c=>!block.connection(c))}):null;
  return line===null?"":`- Ways off this map across its edge (the game's map connections): ${line}\n`;
 }
 text(kind:LoopKind,calls:number):string {
  return this.bearings(`SUPERVISOR: You are currently looping. You keep repeating ${PATTERN[kind]}, and the game is not moving forward (loop guard, ${String(calls)} calls into the run).`);
 }

 // stall-briefing-v1: the same facts, headed by which stall it is, plus the dialogue of the last story step
 // and what lies on the maps walked since the last progress.
 stallText(stall:Stall,calls:number):string {
  const what=stall.kind==="map_cycle"?`You have walked between ${stall.from} and ${stall.to} ${String(stall.roundTrips)} times${stall.consecutive?", out and back,":" (with other maps in between),"} with no new story milestone`:stall.kind==="interface_dwell"?`You have made ${String(stall.calls)} calls in the ${stall.name} without leaving it, with no new story milestone`:`There has been no new story milestone for ${String(stall.minutes)} minutes of play`;
  return this.bearings(`SUPERVISOR: You are stalling. ${what}, and the game is not moving forward (stall briefing, ${String(calls)} calls into the run).`,true);
 }

 private focused(headline:string):string {
  const ui=this.screenNow?.ui;
  const recent=(ui===undefined?this.tried:this.uiTried).slice(-3).reverse().map(t=>`${t.label}${this.features["briefing-repeat-count-v1"]&&t.count>1?` ×${String(t.count)}`:""} → ${t.outcome}`).join("; ")||"none recorded";
  const alternatives=this.latest===null||!this.features["world-targets-v1"]?[]:this.open(this.latest).slice(0,3);
  const goal=this.goal??"none recorded";
  return `${headline}\n- Current position: ${this.where()}\n- Latest recorded place instruction: ${goal}\n${ui===undefined?`- Untried targets already shown here (up to 3; not a route recommendation): ${!this.features["world-targets-v1"]?"not available (world targets are off)":alternatives.join("; ")||"none listed"}\n${this.untalked()}${this.edges()}`:`- Open interface: ${ui.name}; phase ${ui.phase}; text ${ui.text??"unknown"}; selected ${ui.selected??"unknown"}; controls: ${ui.controls??"unknown"}\n`}- Recent attempts (up to 3): ${recent}\nUse the latest game readout to choose a different action. End the next reply with one listed tool call.`;
 }

 private bearings(headline:string,stall=false):string {
  if(this.features["supervisor-briefing-v2"])return this.focused(headline);
  if((stall||this.features["loop-guard-screen-v1"])&&this.screenNow!==null)return this.interfaceBearings(headline,this.screenNow.ui);
  const tried=this.tried.length===0?"nothing recorded":this.tried.slice().reverse().map(t=>`${t.label}${t.count>1?` ×${String(t.count)}`:""} in ${t.room} → ${t.outcome}`).join("; ");
  const recall=this.features["dialogue-log-v1"]?" (use recall_dialogue to check exactly what characters said)":"";
  const instruction=`- Dialogue shown with your latest story step that came with dialogue${this.instructionText()}\n`;
  const exits=this.staying()?"":`- Exits to maps you have not entered since your last story progress: ${this.unentered()}\n`;
  // briefing-exits-v1: the stall briefing leads with the unentered exits and the latest story step's dialogue.
  const first=stall&&this.exits!==null;
  return `${headline} What you have been trying is not working, so do not try it again.
Stop and get your bearings:
- Where you are: ${this.where()}
${first?`${exits}${instruction}`:""}- Last story progress: ${this.lastProgress()}
${this.hint===null?"":`- Next milestone (hint): ${this.hint.describe()}\n`}- Characters the readout names here${this.exits===null?"":", by sprite kind (a sprite kind is a graphic, not a personal name)"}: ${this.characters()}
- Story steps the game confirms are done: ${this.done()}
${this.kept()}- Recent dialogue you were shown, newest first: ${this.told()}
${stall&&!first?instruction:""}- What you tried recently, newest first: ${tried}
- Listed here that you have not tried yet: ${this.untried()}
${this.untalked()}${stall?`${this.staying()?"":`- Not tried yet on other maps you have been on since your last story progress: ${this.untriedElsewhere()}\n`}${first?"":exits}`:""}${this.edges()}Before your next action, look back at your goal and at what the game has told you${recall}. If anything you believe disagrees with the dialogue or the readout above, believe the game. Make a new plan that is different from what you have been trying, and say which untried option you will try first. The run continues.`;
 }

 // stall-briefing-v1 inside an owned interface: what the interface shows and how the game lets you finish it.
 private interfaceBearings(headline:string,ui:OwnedInterface):string {
  const tries=[...this.uiTried.slice().reverse(),...this.tried.slice().reverse()];
  const tried=tries.length===0?"nothing recorded":tries.map(t=>`${t.label}${t.count>1?` ×${String(t.count)}`:""} in ${t.room} → ${t.outcome}`).join("; ");
  const recall=this.features["dialogue-log-v1"]?" (use recall_dialogue to check exactly what characters said)":"";
  const limit=ui.owner===null?undefined:NAME_LIMIT[ui.owner];
  const shows=[`${ui.name} (phase ${ui.phase})`,
   ...(ui.naming&&ui.text!==null?[`text entered so far: "${ui.text}"${limit===undefined?"":` (at most ${String(limit)} characters)`}`]:[]),
   ...(ui.selected===null?[]:[`highlighted ${ui.naming?"key":"choice"}: ${ui.selected}`]),
   ...(ui.controls===null||ui.controls===""?[]:[`controls the game shows: ${ui.controls}`])].join("; ");
  // pokeemerald naming_screen.c: START moves the cursor to OK and A on OK saves; SaveInputText keeps the
  // destination unchanged when the text is empty, and ChangePokemonNickname preloads it with the current name.
  const finish=ui.naming?`- How to finish: press START to move the cursor to OK, then press A on OK${ui.owner==="nickname"?"; with no text entered the Pokémon keeps its current name":""}\n`:"";
  return `${headline} What you have been trying is not working, so do not try it again.
Stop and get your bearings:
- Where you are: in the ${ui.name} (screen ${this.screenNow?.state.screen??"unknown"}); your last field position was ${this.where()}
- Open interface: ${shows}
${finish}- Last story progress: ${this.lastProgress()}
${this.hint===null?"":`- Next milestone (hint): ${this.hint.describe()}\n`}- Story steps the game confirms are done: ${this.done()}
- Recent dialogue you were shown, newest first: ${this.told()}
- Dialogue shown with your last story step${this.instructionText()}
- What you tried recently, newest first: ${tried}
Before your next action, look back at your goal and at what the game has told you${recall}. If anything you believe disagrees with the dialogue or the readout above, believe the game. Make a new plan that is different from what you have been trying, and say how you will finish or leave this interface first. The run continues.`;
 }

 textOnly(replies:number,note:number,limit:number,replyFailuresEndRun=true):string {
  const policy=replyFailuresEndRun?`If replies keep calling no tool after note ${String(limit)} of ${String(limit)}, the run ends.`:"Reply-based stopping is disabled for this run; the configured turn and time budgets still apply.";
  if(this.features["supervisor-briefing-v2"]){
   const head=`SUPERVISOR: Your last ${String(replies)} replies called no tool, so nothing happened in the game (text-only supervisor, note ${String(note)} of ${String(limit)}).`;
   return `${this.focused(head)}${this.features["text-only-supervisor-v2"]?`\n${policy}`:`\nIf replies keep calling no tool after note ${String(limit)} of ${String(limit)}, the run ends.`}`;
  }
  const text=`SUPERVISOR: Your last ${String(replies)} replies called no tool, so nothing happened in the game (text-only supervisor, note ${String(note)} of ${String(limit)}). Writing out a plan or a list of coordinates does not move you; only a tool call does.
Get your bearings:
- Where you are: ${this.where()}
- Last story progress: ${this.lastProgress()}
- Story steps the game confirms are done: ${this.done()}
${this.kept()}- Recent dialogue you were shown, newest first: ${this.told()}
- Listed here that you have not tried yet: ${this.untried()}
Keep your thinking short and end this reply with one tool call: observe to look again, or press, navigate_to or another listed tool to act. If replies keep calling no tool after note ${String(limit)} of ${String(limit)}, the run ends.`;
  return this.features["text-only-supervisor-v2"]?text.replace(`If replies keep calling no tool after note ${String(limit)} of ${String(limit)}, the run ends.`,policy):text;
 }

}
