// dialogue-auto-advance-v1: once a press or navigate_to engages a field message,
// the harness advances it with B until the next decision point, drops the rest
// of the model's batch, and hands the model every page shown, whole.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {ImageContent,TextContent} from "@mariozechner/pi-ai";
import {Type} from "typebox";
import type {BodyOf,Button,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {isCheckedPress,submittedButtons,type BeforePressCheck,type CheckedPressTool,type Clock} from "./game-tools.js";
import {toolSwitches} from "./play-config.js";
import {speakerLabel} from "./dialogue-log.js";
import {onScreen,type OnScreenObject} from "./script-line-presence.js";
import {MESSAGE_WAITING,elevationsMatch} from "./navigation.js";
import {OPENED_LOCK_NOTE,STILL_LOCKED_NOTE,STILL_OPEN_NOTE,ignoredSteps,pressResult,pushbackPressResult,scriptMove} from "./press-result.js";
import {BattleJournal,advanceBattle,battleEngaged,battlePage,levelUpListedPage,type BattleTextEntry,type BattleTextSource} from "./battle-text-auto-advance.js";

export const AUTO_ADVANCE_LIMITS={presses:50,callMs:90_000,waitMs:10_000,pollMs:100} as const;

type Advance=Omit<BodyOf<"dialogue_auto_advance">,"type"|"turn">;
export type DialoguePage=Advance["pages"][number];
type Stop=Advance["stop"];
interface Recorded {readonly seq:number;readonly turn:number}
export interface AutoAdvanceRecorder {
 recordState(state:GameStateSnapshot):Recorded;
 recordDialogueAutoAdvance(body:Advance):Recorded;
 subscribe(observer:(event:RunEvent)=>void):void;
}
export interface AutoAdvancePorts {readonly state:StateSource;readonly recorder:AutoAdvanceRecorder;readonly clock?:Clock}
type Result=AgentToolResult<unknown>;

const realClock:Clock={sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),now:()=>Date.now()};
const DIRECTIONS:ReadonlySet<Button>=new Set(["UP","DOWN","LEFT","RIGHT"]);
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const NAME_PREFIX=/^([A-Z][A-Z0-9.'&-]*(?: [A-Z0-9.'&-]+){0,2}):\s/;
const UNSHOWN:ReadonlySet<Stop>=new Set(["press_cap","time_cap","message_not_ready","error"]);

function stateOf(result:Result):GameStateSnapshot {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Game tool did not return coherent state details");
 return parseGameState(details.state);
}
function freeField(s:GameStateSnapshot):boolean {
 return s.screen==="overworld"&&s.started&&!s.in_battle&&s.field_controls_locked===false&&s.active_ui==null&&s.world_context?.dialogue==null&&s.world_context?.message==null;
}
// A field message the harness owns: an ordinary overworld message box, not a menu, editor or battle.
export function dialogueEngaged(s:GameStateSnapshot):boolean {
 return s.screen==="overworld"&&!s.in_battle&&s.active_ui==null&&s.naming==null&&(s.world_context?.message!=null||s.world_context?.field_activity?.phase==="message_initializing");
}
type Wait="printing"|"locked"|"interface"|"settling";
type Message=NonNullable<NonNullable<GameStateSnapshot["world_context"]>["message"]>;
type Decision={kind:"press";message:Message}|{kind:"wait";why:Wait}|{kind:"stop";stop:Stop;detail:string};
function menuDetail(ui:NonNullable<GameStateSnapshot["active_ui"]>):string {
 const options=ui.details?.["options"];
 const listed=Array.isArray(options)?`: options ${options.map(String).join(", ")}; highlighted ${ui.selected??"unknown"}`:ui.selected===null?"":`; highlighted ${ui.selected}`;
 return `menu ${ui.phase} is open${listed}`;
}
function classify(s:GameStateSnapshot):Decision {
 if(s.in_battle)return {kind:"stop",stop:"battle",detail:"a battle started"};
 if(s.naming!=null)return {kind:"stop",stop:"naming",detail:"the naming screen is open"};
 const ui=s.active_ui;
 if(ui!=null)return ui.ready===false?{kind:"wait",why:"interface"}:{kind:"stop",stop:"menu",detail:menuDetail(ui)};
 if(s.screen!=="overworld")return {kind:"stop",stop:"screen_change",detail:`the screen changed to ${s.screen}`};
 const message=s.world_context?.message;
 if(message!=null)return message.ready?{kind:"press",message}:{kind:"wait",why:"printing"};
 if(s.world_context?.field_activity?.phase==="message_initializing")return {kind:"wait",why:"printing"};
 if(s.field_controls_locked===true)return {kind:"wait",why:"locked"};
 return {kind:"stop",stop:"field_free",detail:FIELD_FREE};
}
const FIELD_FREE="the conversation closed and field controls are free";
const WAIT_STOP:Readonly<Record<Wait,{stop:Stop;detail:string}>>={
 settling:{stop:"field_free",detail:"field controls read free, but the game did not reach a later frame to confirm it; inspect the screen before acting"},
 printing:{stop:"message_not_ready",detail:`the message stayed printing or waiting without accepting input for ${String(AUTO_ADVANCE_LIMITS.waitMs/1000)} s; inspect it before pressing`},
 locked:{stop:"locked_no_message",detail:`field controls stayed locked with no message for ${String(AUTO_ADVANCE_LIMITS.waitMs/1000)} s (a cutscene or script may still be running); inspect before acting`},
 interface:{stop:"interface_not_ready",detail:`an interface stayed not ready for ${String(AUTO_ADVANCE_LIMITS.waitMs/1000)} s; inspect before acting`},
};

interface Speaker {readonly name:string;readonly source:"name_prefix"|"faced_sprite"|"faced_target"}
// navigation-truth-v1: map-local ids of listed objects on (x,y) at an elevation the player's does not match
// (GetObjectEventIdByPosition skips them, so pressing A there does not face them).
function elsewhere(s:GameStateSnapshot,x:number,y:number):ReadonlySet<number> {
 const elevation=s.navigation_grid?.elevation??s.map_grid?.elevation;
 if(elevation==null)return new Set();
 return new Set((s.interaction_targets??[]).filter(t=>t.kind==="object"&&t.x===x&&t.y===y&&t.local_id!=null&&!elevationsMatch(t.elevation,elevation)).flatMap(t=>t.local_id==null?[]:[t.local_id]));
}
function faced(s:GameStateSnapshot,truth=false):Speaker|null {
 const step=s.facing===null?undefined:STEP[s.facing.toLowerCase()];
 if(s.position===null||step===undefined)return null;
 const x=s.position.x+step[0],y=s.position.y+step[1];
 const skip=truth?elsewhere(s,x,y):new Set<number>();
 const target=(s.interaction_targets??[]).find(t=>t.x===x&&t.y===y&&t.name!=null&&!(t.kind==="object"&&t.local_id!=null&&skip.has(t.local_id)));
 if(target?.name!=null)return {name:target.name,source:target.kind==="object"?"faced_sprite":"faced_target"};
 const sprite=s.world_context?.objects.find(o=>o.x===x&&o.y===y&&!skip.has(o.local_id))?.sprite_kind;
 return sprite==null?null:{name:sprite,source:"faced_sprite"};
}
function speakerOf(text:string,s:GameStateSnapshot):Speaker|null {
 const named=NAME_PREFIX.exec(text)?.[1];
 return named===undefined?faced(s):{name:named,source:"name_prefix"};
}
// navigation-truth-v1: the object the player faces, so a speaker the game named stays named while it talks on.
// An object is keyed by its map-local id and map, so the same object keeps its key when it moves.
function facedKey(s:GameStateSnapshot):string|null {
 const step=s.facing===null?undefined:STEP[s.facing.toLowerCase()];
 if(s.position===null||step===undefined)return null;
 const x=s.position.x+step[0],y=s.position.y+step[1];
 const skip=elsewhere(s,x,y);
 const live=s.world_context?.objects.find(o=>o.x===x&&o.y===y&&!skip.has(o.local_id));
 if(live!==undefined)return `object ${String(live.local_id)} on ${live.map_id.join("/")}`;
 const target=(s.interaction_targets??[]).find(t=>t.x===x&&t.y===y&&!(t.kind==="object"&&t.local_id!=null&&skip.has(t.local_id)));
 if(target===undefined)return null;
 return target.kind==="object"&&target.local_id!==null&&s.map_id!==null?`object ${String(target.local_id)} on ${s.map_id.join("/")}`:`${target.kind} at ${String(x)},${String(y)}`;
}
// Lines that narrate the player's own action ({PLAYER} received/obtained/put ... in pokeemerald's text) have no speaker.
const NARRATION=new Set(["received","obtained","found","got","put","handed","used","wrote","booted","flashed","turned","took","registered","inserted","chose","picked","placed","planted","watered","switched","stepped","saved","returned","removed","memorized","flipped","exchanged","closed","checked","left"]);
function narrates(text:string,player:string|null):boolean {
 if(player===null||player===""||!text.startsWith(`${player} `))return false;
 // A page in a character's own voice is not narration ("{PLAYER} turned me down…", apprentice.inc). None of the
 // 104 pokeemerald pages that start with {PLAYER} and one of these verbs uses first or second person.
 const body=text.slice(player.length+1);
 // Only the page after the name: a player may be named "I" or "ME".
 if(PERSONAL.test(body))return false;
 return NARRATION.has(body.split(/[\s!.,]/,1)[0]??"");
}
const PERSONAL=/\b(?:I|I'm|I've|I'll|I'd|me|my|mine|myself|we|we're|us|our|you|you're|your|yours)\b/i;

// Pages are cut from the game's own message buffer at the printer's cursor when
// each page reaches a wait phase; a closed message contributes its remainder.
// Where a call left a message still on screen, so the next call neither repeats nor drops its pages.
interface OpenMessage {readonly text:string;readonly offset:number;readonly cursor:number}
class Pages {
 readonly pages:DialoguePage[]=[];
 private opened=false;private id:string|null=null;private text="";private offset=0;private cursor=0;private speaker:Speaker|null=null;private last:GameStateSnapshot|null=null;private namedFace:string|null=null;
 // script-line-presence-v1: who is on screen, recorded on a page with no speaker; null when the switch is off.
 // navigation-truth-v1: whole pages (a scroll prompt is not a page end) and speakers kept across a conversation.
 constructor(private readonly record:(s:GameStateSnapshot)=>Recorded,private readonly open:OpenMessage|null=null,private readonly present:((s:GameStateSnapshot)=>OnScreenObject[]|null)|null=null,private readonly truth=false){}
 // A page already waiting when the call begins is recorded now unless an earlier call recorded it.
 prime(s:GameStateSnapshot):void {
  this.see(s);
  const m=s.world_context?.message;
  if(m?.ready===true)this.capture(s,m);
 }
 see(s:GameStateSnapshot):void {
  const text=s.world_context?.dialogue;
  if(text==null)return;
  // The buffer is readable a few frames before its message identity; the same text is the same message.
  const id=s.world_context?.message?.identity??null;
  const same=this.opened&&text===this.text&&(id===null||this.id===null||id===this.id);
  if(!same){
   if(this.last!==null)this.flush(this.last);
   const resume=!this.opened&&this.open?.text===text;
   this.opened=true;this.text=text;this.offset=resume?this.open.offset:0;this.cursor=resume?this.open.cursor:0;this.speaker=this.truth?this.speakerFor(text,s):speakerOf(text,s)??this.speaker;this.id=null;
  }
  if(id!==null)this.id=id;
  this.last=s;
 }
 private speakerFor(text:string,s:GameStateSnapshot):Speaker|null {
  const named=NAME_PREFIX.exec(text)?.[1],face=facedKey(s);
  if(named!==undefined){this.namedFace=face;return {name:named,source:"name_prefix"};}
  if(this.speaker?.source==="name_prefix")return face!==null&&face===this.namedFace?this.speaker:faced(s,true);
  return faced(s,true)??this.speaker;
 }
 openAt(s:GameStateSnapshot):OpenMessage|null {
  return this.opened&&s.world_context?.dialogue===this.text?{text:this.text,offset:this.offset,cursor:this.cursor}:null;
 }
 capture(s:GameStateSnapshot,m:Message):void {
  this.see(s);
  // The same message shown again from its start (an endless or repeated script line).
  if(m.cursor<this.cursor){this.offset=0;}
  this.cursor=m.cursor;
  // pokeemerald RENDER_STATE_SCROLL_START (\l): the box scrolls one line and the page goes on.
  if(this.truth&&m.phase==="scroll_wait")return;
  const end=this.end(m.phase,m.cursor);
  if(end>this.offset){this.add(this.text.slice(this.offset,end),s);this.offset=end;}
 }
 flush(s:GameStateSnapshot):void {
  if(this.opened&&this.offset<this.text.length){this.add(this.text.slice(this.offset),s);this.offset=this.text.length;}
 }
 // battle-text-auto-advance-v1: battle pages from the server's journal, in the order they were shown.
 // levelup-box-v1: a level-up stats box page, in the order shown.
 addLevelUp(text:string,s:GameStateSnapshot):void {this.pages.push(levelUpListedPage(text,s,this.record(s).seq));}
 addBattle(entries:readonly BattleTextEntry[],s:GameStateSnapshot):void {
  if(entries.length===0)return;
  const seq=this.record(s).seq;
  for(const entry of entries)this.pages.push(battlePage(entry,s,seq));
 }
 private end(phase:string,cursor:number):number {
  if(phase==="dismiss_wait"||cursor>=this.text.length)return this.text.length;
  const newline=this.text.lastIndexOf("\n",cursor-1);
  return newline>=this.offset?newline+1:cursor;
 }
 private add(raw:string,s:GameStateSnapshot):void {
  const text=raw.trim();
  if(text==="")return;
  const speaker=this.truth&&narrates(text,s.name)?null:this.speaker;
  const presence=speaker===null&&this.present!==null?{on_screen:this.present(s)}:{};
  this.pages.push({state_seq:this.record(s).seq,map:s.location,...(s.location_display===undefined?{}:{map_display:s.location_display}),map_id:s.map_id,position:s.position,speaker:speaker?.name??null,speaker_source:speaker?.source??null,text,...presence});
 }
}

interface Outcome {readonly state:GameStateSnapshot;readonly stop:Stop;readonly detail:string;readonly presses:number;readonly extras:readonly TextContent[];readonly battlePresses?:number;readonly note?:string|null}
// A field advance inside a call that also advances battle text: the call's start, presses already used,
// and when to hand back to the battle advance.
interface Shared {readonly began:number;readonly used:number;readonly stopAt:(s:GameStateSnapshot)=>boolean}
async function advance(start:GameStateSnapshot,pages:Pages,press:(signal?:AbortSignal)=>Promise<Result>,ports:Required<AutoAdvancePorts>,signal?:AbortSignal,shared?:Shared):Promise<Outcome> {
 const {clock}=ports;const began=shared?.began??clock.now();const used=shared?.used??0;
 let s=start,presses=0,waiting:Wait|null=null,waitSince=began,free:number|null=null;
 const extras:TextContent[]=[];
 const done=(stop:Stop,detail:string):Outcome=>{if(!UNSHOWN.has(stop))pages.flush(s);return {state:s,stop,detail,presses,extras};};
 const failed=(error:unknown):Outcome=>{if(signal?.aborted===true)throw error;return done("error",`auto-advance stopped: ${error instanceof Error?error.message:String(error)}`);};
 for(;;){
  pages.see(s);
  let decision=shared?.stopAt(s)===true?{kind:"stop" as const,stop:"battle" as const,detail:"a battle started"}:classify(s);
  // Free field is final only when a later frame still shows it: on the first field frame after a
  // release or warp fade, ProcessPlayerFieldInput runs trainer sight and ON_FRAME map scripts before input.
  if(decision.kind==="stop"&&decision.stop==="field_free"){
   const frame=frameOf(s);
   if(free!==null&&(frame===null||frame>free))return done(decision.stop,decision.detail);
   free??=frame??-1;decision={kind:"wait",why:"settling"};
  }else free=null;
  if(decision.kind==="stop")return done(decision.stop,decision.detail);
  if(clock.now()-began>=AUTO_ADVANCE_LIMITS.callMs)return done("time_cap",`AUTO-ADVANCE CAP: stopped after ${String(AUTO_ADVANCE_LIMITS.callMs/1000)} s of automatic advancing; the message is still open`);
  if(decision.kind==="press"){
   pages.capture(s,decision.message);
   if(used+presses>=AUTO_ADVANCE_LIMITS.presses)return done("press_cap",`AUTO-ADVANCE CAP: stopped after ${String(AUTO_ADVANCE_LIMITS.presses)} automatic presses; the message is still open`);
   signal?.throwIfAborted();
   try{const result=await press(signal);presses++;s=stateOf(result);extras.push(...extraText(result));}
   catch(error){return failed(error);}
   waiting=null;continue;
  }
  if(decision.why!==waiting){waiting=decision.why;waitSince=clock.now();}
  if(clock.now()-waitSince>=AUTO_ADVANCE_LIMITS.waitMs){const stop=WAIT_STOP[decision.why];return done(stop.stop,stop.detail);}
  await clock.sleep(AUTO_ADVANCE_LIMITS.pollMs);
  signal?.throwIfAborted();
  try{s=await ports.state.read(signal);}catch(error){return failed(error);}
 }
}

// battle-text-auto-advance-v1: one call may cross field dialogue, a battle and the field again (Birch's
// rescue, a trainer's challenge, a blackout). The shared caps cover the whole call.
interface BattleCall {readonly journal:BattleJournal;readonly source:BattleTextSource;readonly known:{last:number};readonly levelupBox:boolean}
async function drive(start:GameStateSnapshot,pages:Pages,press:(signal?:AbortSignal)=>Promise<Result>,ports:Required<AutoAdvancePorts>,battle:BattleCall|null,signal?:AbortSignal):Promise<Outcome> {
 if(battle===null)return advance(start,pages,press,ports,signal);
 const began=ports.clock.now();
 let s=start,presses=0,battlePresses:number|undefined;
 const extras:TextContent[]=[];
 for(;;){
  if(battleEngaged(s)||s.in_battle){
   const b=await advanceBattle(s,{source:battle.source,journal:battle.journal,known:battle.known,clock:ports.clock,limits:AUTO_ADVANCE_LIMITS,began,used:presses,press,stateOf,extraText,addPages:(entries,at)=>{pages.addBattle(entries,at);},levelupBox:battle.levelupBox,addLevelUp:(text,at)=>{pages.addLevelUp(text,at);}},signal);
   presses+=b.presses;battlePresses=(battlePresses??0)+b.presses;extras.push(...b.extras);s=b.state;
   if(!b.over)return {state:s,stop:b.stop,detail:b.detail,presses,extras,battlePresses,note:battle.journal.note()};
  }
  const f=await advance(s,pages,press,ports,signal,{began,used:presses,stopAt:battleEngaged});
  presses+=f.presses;extras.push(...f.extras);s=f.state;
  if(f.stop==="battle")continue;
  // Straight from the battle to a free field: no conversation closed.
  const detail=battlePresses!==undefined&&f.presses===0&&f.detail===FIELD_FREE?"the battle ended and field controls are free":f.detail;
  return {...f,detail,presses,extras,...(battlePresses===undefined?{}:{battlePresses}),note:battle.journal.note()};
 }
}

const frameOf=(s:GameStateSnapshot):number|null=>s.raw_ram?.frame??null;
// The message's text can be in the game's buffer a frame before its phase reads (3f21 T95 seq 1634):
// new or changed text is a message that has appeared, so no further queued input is sent.
function textAppeared(previous:GameStateSnapshot|undefined,now:GameStateSnapshot):boolean {
 const text=now.world_context?.dialogue;
 return text!=null&&text!==""&&text!==(previous?.world_context?.dialogue??null);
}
// Notes on the box that were true right after the press but not after auto-advance moved on.
const STALE_NOTES=[OPENED_LOCK_NOTE,STILL_OPEN_NOTE,STILL_LOCKED_NOTE];
export function afterAdvance(line:string,detail:string):string {
 const kept=STALE_NOTES.reduce((text,note)=>text.replaceAll(note,""),line);
 return kept===line?line:`${kept}; after auto-advance: ${detail}`;
}
// navigate_to's status was read before auto-advance ran; restate why it stopped and what is true now.
export function navigationAfter(raw:unknown,outcome:Pick<Outcome,"stop"|"detail">,moved:string|null=null):string|null {
 if(typeof raw!=="object"||raw===null||!("navigation" in raw))return null;
 const nav=raw.navigation;
 if(typeof nav!=="object"||nav===null||!("unready" in nav)||nav.unready!==true||!("status" in nav)||typeof nav.status!=="string"||!("commands" in nav)||typeof nav.commands!=="number")return null;
 const interrupted=nav.status.startsWith("walk interrupted: ");
 const message=nav.status===MESSAGE_WAITING||nav.status===`walk interrupted: ${MESSAGE_WAITING}`;
 const why=interrupted?`walk interrupted: ${message?"a message opened":"field controls were locked"}`:`${message?"a message was open":"field controls were not free"}, so navigate_to did not walk`;
 // pushback-press-result-v1: a script moved the player while the dialogue advanced, so the old advice to call again
 // (from the state before the advance) no longer describes what happened.
 if(moved!==null)return `Navigation: ${why}; after auto-advance: ${outcome.detail}; ${moved}; ${String(nav.commands)} ordinary button attempts.`;
 return `Navigation: ${why}; after auto-advance: ${outcome.detail}${outcome.stop==="field_free"?"; call navigate_to again":""}; ${String(nav.commands)} ordinary button attempts.`;
}
// The inner press's own Press result: computed on the shared observe/press tracker, so it keeps
// carried-over warps and restarted conversations that a before/after rebuild cannot see.
function pressLineOf(result:Result):string|null {
 for(const part of result.content)if(part.type==="text"){const line=/^Press result: (.*)$/m.exec(part.text)?.[1];if(line!==undefined)return line;}
 return null;
}
// What the inner press really submitted: it re-reads state and may apply the safe-batch rule itself.
function pressedOf(result:Result,asked:readonly Button[]):Button[] {
 for(const part of result.content)if(part.type==="text"){
  const line=/^pressed (.*)$/m.exec(part.text)?.[1];
  if(line===undefined)continue;
  const names=line.split(", ");
  if(names.length<=asked.length&&names.every((name,i)=>name===asked[i]))return asked.slice(0,names.length);
 }
 return [...asked];
}
// Text the ordinary tools append after their observation (objective warnings).
function extraText(result:Result):TextContent[] {
 return result.content.slice(2).filter((part):part is TextContent=>part.type==="text");
}
const plural=(n:number,word:string)=>`${String(n)} ${word}${n===1?"":"s"}`;
function place(page:DialoguePage):string {
 return `${page.map_display??page.map??"unknown location"}${page.map_id===null?"":` (map ${page.map_id.join("/")})`}${page.position===null?"":` · at ${String(page.position.x)},${String(page.position.y)}`}`;
}
function who(page:DialoguePage):string {
 const label=speakerLabel(page);
 return `${page.battle_turn===undefined?"":` · battle turn ${String(page.battle_turn)}`}${label===null?"":` · ${label}`}`;
}
// The numbered page lines of a "Dialogue shown during this call" block.
export function pageLines(pages:readonly DialoguePage[],turn:number):string[] {
 return pages.map((page,i)=>`${String(i+1)}. turn ${String(turn)} · ${place(page)}${who(page)}: "${page.text}"`);
}
function summary(outcome:Outcome,pages:readonly DialoguePage[],dropped:readonly Button[],turn:number,ignored:readonly Button[]=[]):string {
 const battle=outcome.battlePresses;
 const field=outcome.presses-(battle??0);
 const lines=[battle===undefined
  ?`Dialogue auto-advance: the harness pressed B ${plural(outcome.presses,"time")} to advance the dialogue; stopped: ${outcome.detail}.`
  :`Battle text auto-advance: the harness pressed B ${plural(battle,"time")} to advance battle messages${field>0?` and ${plural(field,"time")} to advance field dialogue`:""}; stopped: ${outcome.detail}.`];
 if(dropped.length>0)lines.push(`${battle!==undefined?"the harness took over the battle text":outcome.stop==="field_free"||outcome.stop==="locked_no_message"?"dialogue closed":"dialogue reached a decision point"}; ${plural(dropped.length,"remaining input")} not sent: ${dropped.join(", ")}.`);
 if(ignored.length>0)lines.push(`${plural(ignored.length,"input")} of your batch had no effect (counted as dropped): the message opened during the batch and held field controls while ${ignored.length===1?"it was":"they were"} pressed: ${ignored.join(", ")}.`);
 if(outcome.note!=null)lines.push(outcome.note);
 if(pages.length>0){
  lines.push(`Dialogue shown during this call (${plural(pages.length,"page")}, in order, whole):`,...pageLines(pages,turn));
 }else lines.push("No complete dialogue page was shown during this call.");
 return lines.join("\n");
}
// An observe result: its screenshot and its one text part.
function observation(result:Result):{images:ImageContent[];text:string} {
 return {images:result.content.filter((part):part is ImageContent=>part.type==="image"),text:result.content.filter((part):part is TextContent=>part.type==="text").map(part=>part.text).join("\n")};
}

type PressParams=Parameters<CheckedPressTool["execute"]>[1];

function battleTextSource(state:StateSource):BattleTextSource {
 if(state.battleWait===undefined||state.battleMessages===undefined)throw new Error("Battle text auto-advance requires the game server's battle wait and battle message journal");
 return {battleWait:signal=>state.battleWait?.(signal)??Promise.reject(new Error("battle wait unavailable")),battleMessages:(after,signal)=>state.battleMessages?.(after,signal)??Promise.reject(new Error("battle message journal unavailable"))};
}

export function withDialogueAutoAdvance(tools:readonly AgentTool[],features:FeatureSet,ports:AutoAdvancePorts):AgentTool[] {
 if(!features["dialogue-auto-advance-v1"])return [...tools];
 const press=tools.find(t=>t.name==="press"),observe=tools.find(t=>t.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("Dialogue auto-advance requires ordinary game tools");
 const full:Required<AutoAdvancePorts>={...ports,clock:ports.clock??realClock};
 const switches=toolSwitches(features);
 const record=(s:GameStateSnapshot):Recorded=>full.recorder.recordState(s);
 const truth=features["navigation-truth-v1"];
 const present=features["script-line-presence-v1"]?(s:GameStateSnapshot)=>onScreen(s,features["character-presence-v1"]):null;
 const autoPress=(id:string)=>(signal?:AbortSignal)=>press.execute(id,{buttons:["B"]},signal);
 // battle-text-auto-advance-v1: the server's battle wait and page journal; the journal cursor carries across calls.
 const battleSource=features["battle-text-auto-advance-v1"]?battleTextSource(full.state):null;
 const known={last:0};
 const openBattle=async(signal?:AbortSignal):Promise<BattleCall|null>=>battleSource===null?null:{journal:await BattleJournal.open(battleSource,known,signal),source:battleSource,known,levelupBox:features["levelup-box-v1"]};
 const finish=async(id:string,tool:"press"|"navigate_to",outcome:Outcome,pages:Pages,requested:readonly Button[],sent:readonly Button[],dropped:readonly Button[],began:number,signal?:AbortSignal,ignored:readonly Button[]=[])=>{
  // pushback-press-result-v1: inputs the game ignored under the message's lock count as dropped, not sent.
  const event=full.recorder.recordDialogueAutoAdvance({tool_call_id:id,tool,requested:[...requested],sent:sent.slice(0,sent.length-ignored.length),dropped:[...ignored,...dropped],auto_presses:outcome.presses,...(outcome.battlePresses===undefined?{}:{battle_auto_presses:outcome.battlePresses}),pages:pages.pages,stop:outcome.stop,detail:outcome.detail,duration_ms:Math.max(0,Math.round(full.clock.now()-began))});
  const seen=await observe.execute(id,{},signal);
  return {seen,state:stateOf(seen),block:summary(outcome,pages.pages,dropped,event.turn,ignored)};
 };
 let open:OpenMessage|null=null;
 const execute=async(id:string,params:PressParams,signal?:AbortSignal,update?:Parameters<CheckedPressTool["execute"]>[3],check?:BeforePressCheck):Promise<AgentToolResult<{state:GameStateSnapshot|undefined}>>=>{
  signal?.throwIfAborted();
  const began=full.clock.now();
  let before:GameStateSnapshot|undefined;
  try{before=await full.state.read(signal);}catch{signal?.throwIfAborted();}
  const battle=await openBattle(signal);
  const plan=submittedButtons(params.buttons,before,switches);
  const walking=params.walking===undefined?{}:{walking:params.walking};
  const run=(buttons:Button[],first:boolean)=>first&&check!==undefined?press.executeChecked(id,{buttons,...walking},check,signal,update):press.execute(id,{buttons,...walking},signal,update);
  const pages=new Pages(record,open,present,truth);if(before!==undefined)pages.prime(before);
  const shownBefore=pages.pages.length>0;
  // A batch that starts inside a conversation stops after its first input: the next inputs could land on a
  // YES/NO (B answers NO) or a locked script. Without a read, a message the last call left open counts.
  const inDialogue=shownBefore||(before===undefined?open!==null:dialogueEngaged(before));
  const extras:TextContent[]=[];const sent:Button[]=[];const results:{buttons:readonly Button[];line:string|null}[]=[];
  const walk=before!==undefined&&freeField(before)&&plan.every(b=>DIRECTIONS.has(b));
  let last:Result,appeared=false;
  if(walk){last=await run([...plan],true);const went=pressedOf(last,plan);sent.push(...went);results.push({buttons:went,line:pressLineOf(last)});}
  else{
   let result:Result|undefined;
   let previous=before;
   for(const button of plan){result=await run([button],sent.length===0);sent.push(button);results.push({buttons:[button],line:pressLineOf(result)});extras.push(...extraText(result));const now=stateOf(result);appeared=textAppeared(previous,now);previous=now;if(inDialogue||appeared||dialogueEngaged(now)||(battle!==null&&battleEngaged(now)))break;}
   if(result===undefined)throw new Error("press requires at least one button");
   last=result;
  }
  // The carried position is spent once the model's press went through; this call's pages now own it.
  if(before!==undefined)open=null;
  const after=stateOf(last);
  // Battle text the harness owns: the battle runs its own text or animation, or is about to start.
  const engaged=dialogueEngaged(after)||inDialogue||appeared||(battle!==null&&battleEngaged(after));
  if(!engaged&&before!==undefined)open=pages.openAt(after);
  if(!engaged&&(walk||plan.length===1)&&plan.length===params.buttons.length)return last as AgentToolResult<{state:GameStateSnapshot|undefined}>;
  // Every requested input that was not sent: cut by engaged dialogue or withheld by the safe-batch rule.
  const dropped=params.buttons.slice(sent.length);
  let block:string|null=null,final:Result,detail:string|null=null;
  if(engaged){
   const outcome=await drive(after,pages,autoPress(id),full,battle,signal);detail=outcome.detail;
   open=pages.openAt(outcome.state);
   extras.push(...outcome.extras);
   // pushback-press-result-v1: a walk batch is one submission; once its first step opened a message, the steps
   // the player did not take were pressed under the message's lock.
   const ignored=switches.pushback===true&&walk?ignoredSteps(before,after,sent):[];
   const done=await finish(id,"press",outcome,pages,params.buttons,sent,dropped,began,signal,ignored);
   final=done.seen;block=done.block;
  }else final=await observe.execute(id,{},signal);
  const finalState=stateOf(final);
  const seen=observation(final);
  const head=[`pressed ${sent.join(", ")}`,
   ...(plan.length<params.buttons.length||(walk&&sent.length<plan.length)?[`Interface safety: submitted ${String(walk?sent.length:plan.length)} of ${String(params.buttons.length)} requested inputs; remaining inputs were not sent. Inspect the new state before another input.`]:[]),
   ...(switches.pressResult?[`Press result: ${(line=>switches.pushback===true&&engaged?pushbackPressResult(line,before,after,finalState,switches):line)(results.every(r=>r.line!==null)?(line=>detail===null?line:afterAdvance(line,detail))(results.length===1?results[0]?.line??"":results.map((r,i)=>`${i===0?"":"then "}${r.buttons.join(", ")}: ${r.line??""}`).join(" | ")):pressResult(before,finalState,sent,switches))}`]:[]),
   ...(block===null?[]:[block])];
  return {content:[...seen.images,{type:"text",text:`${head.join("\n")}\n\n${seen.text}`},...extras],details:{state:finalState}};
 };
 const wrappedPress:CheckedPressTool={...press,description:`${press.description} Field dialogue advances automatically: once a conversation opens, the harness presses B through every page until the next decision point and lists the pages; inputs left in your batch are not sent.${battleSource===null?"":" Battle text advances the same way: while a battle runs its own messages, the harness presses B through each waiting message until a battle menu, a YES/NO question, another screen or the battle's end, and lists every battle message shown."}`,execute:(id,params,signal,update)=>execute(id,params,signal,update),executeChecked:(id,params,check,signal,update)=>execute(id,params,signal,update,check)};
 const out=tools.map(tool=>{
  if(tool===press)return wrappedPress;
  if(tool.name!=="navigate_to")return tool;
  return {...tool,description:`${tool.description} If it ends in dialogue${battleSource===null?"":" or a battle"}, the ${battleSource===null?"dialogue advances":"text advances"} automatically to the next decision point and its pages are listed.`,execute:async(id:string,params:unknown,signal?:AbortSignal,update?:Parameters<AgentTool["execute"]>[3])=>{
   const began=full.clock.now();
   const battle=await openBattle(signal);
   const result=await tool.execute(id,params,signal,update);
   const state=stateOf(result);
   if(!dialogueEngaged(state)&&!(battle!==null&&battleEngaged(state)))return result;
   const pages=new Pages(record,open,present,truth);
   const outcome=await drive(state,pages,autoPress(id),full,battle,signal);
   open=pages.openAt(outcome.state);
   const done=await finish(id,"navigate_to",outcome,pages,[],[],[],began,signal);
   const seen=observation(done.seen);
   // navigate_to's own status line comes first; its last frame is replaced by the fresh observation.
   const raw:unknown=result.details;
   const restated=navigationAfter(raw,outcome,switches.pushback===true?scriptMove(state,done.state,switches):null);
   const status=result.content.slice(0,1).filter((part):part is TextContent=>part.type==="text").map(part=>restated===null?part:{...part,text:restated});
   return {content:[...status,...seen.images,{type:"text",text:`${done.block}\n\n${seen.text}`},...outcome.extras],details:{...Object(raw) as object,state:done.state}};
  }} satisfies AgentTool;
 });
 const dialogues=new DialogueRecord();full.recorder.subscribe(event=>{dialogues.observe(event);});
 out.push(dialogues.tool());
 return out;
}

interface Entry {readonly seq:number;readonly turn:number;readonly page:DialoguePage}
const DEFAULT_LAST=10;
const RecallArgs=Type.Object({
 speaker:Type.Optional(Type.String({description:"Only pages whose speaker contains this text (case-insensitive), such as MOM or SCIENTIST_1."})),
 contains:Type.Optional(Type.String({description:"Only pages containing these words (case-insensitive)."})),
 map:Type.Optional(Type.String({description:"Only pages shown on a map whose name or map id (for example 1/4) contains this text."})),
 last:Type.Optional(Type.Integer({minimum:1,description:`How many matching pages to return, newest first (default ${String(DEFAULT_LAST)}).`})),
});

// Every page auto-advance recorded this run, with provenance, from the recorded events.
export class DialogueRecord {
 private readonly entries:Entry[]=[];
 observe(event:RunEvent):void {
  if(event.type!=="dialogue_auto_advance")return;
  for(const page of event.pages)this.entries.push({seq:event.seq,turn:event.turn,page});
 }
 recall(args:{speaker?:string;contains?:string;map?:string;last?:number}):string {
  const last=args.last??DEFAULT_LAST;
  if(!Number.isInteger(last)||last<1)throw Error("last must be a positive integer");
  const has=(value:string|null,wanted:string|undefined)=>{const w=wanted?.trim().toLowerCase()??"";return w===""||(value??"").toLowerCase().includes(w);};
  const matches=this.entries.filter(e=>has(e.page.speaker,args.speaker)&&has(e.page.text,args.contains)&&(has(e.page.map_display??e.page.map,args.map)||has(e.page.map_id?.join("/")??null,args.map)));
  if(matches.length===0)return `No recorded dialogue matches (${plural(this.entries.length,"page")} recorded this run).`;
  const chosen=matches.slice(-last).reverse();
  const lines=[`DIALOGUE RECORD: pages the harness advanced through this run, newest first, whole. Past text; the current screen overrides it. ${String(matches.length)} of ${plural(this.entries.length,"page")} match.`];
  for(const e of chosen)lines.push(`#${String(e.seq)} turn ${String(e.turn)} · ${place(e.page)}${who(e.page)}: "${e.page.text}"`);
  lines.push(`${String(chosen.length)} shown.`);
  return lines.join("\n");
 }
 tool():AgentTool<typeof RecallArgs> {
  return {name:"get_dialogue",label:"Get dialogue",description:`Search every dialogue page the harness advanced through this run, newest first, each whole with its speaker, map, position, turn and event number. Filters: speaker, contains (words), map (name or map id), last (default ${String(DEFAULT_LAST)}). It reads the record only; it does not press buttons.`,parameters:RecallArgs,execute:(_id,args)=>Promise.resolve({content:[{type:"text",text:this.recall(args)}],details:undefined})};
 }
}
