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
import {MESSAGE_WAITING} from "./navigation.js";
import {OPENED_LOCK_NOTE,STILL_LOCKED_NOTE,STILL_OPEN_NOTE,pressResult} from "./press-result.js";

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
function faced(s:GameStateSnapshot):Speaker|null {
 const step=s.facing===null?undefined:STEP[s.facing.toLowerCase()];
 if(s.position===null||step===undefined)return null;
 const x=s.position.x+step[0],y=s.position.y+step[1];
 const target=(s.interaction_targets??[]).find(t=>t.x===x&&t.y===y&&t.name!=null);
 if(target?.name!=null)return {name:target.name,source:target.kind==="object"?"faced_sprite":"faced_target"};
 const sprite=s.world_context?.objects.find(o=>o.x===x&&o.y===y)?.sprite_kind;
 return sprite==null?null:{name:sprite,source:"faced_sprite"};
}
function speakerOf(text:string,s:GameStateSnapshot):Speaker|null {
 const named=NAME_PREFIX.exec(text)?.[1];
 return named===undefined?faced(s):{name:named,source:"name_prefix"};
}

// Pages are cut from the game's own message buffer at the printer's cursor when
// each page reaches a wait phase; a closed message contributes its remainder.
// Where a call left a message still on screen, so the next call neither repeats nor drops its pages.
interface OpenMessage {readonly text:string;readonly offset:number;readonly cursor:number}
class Pages {
 readonly pages:DialoguePage[]=[];
 private opened=false;private id:string|null=null;private text="";private offset=0;private cursor=0;private speaker:Speaker|null=null;private last:GameStateSnapshot|null=null;
 constructor(private readonly record:(s:GameStateSnapshot)=>Recorded,private readonly open:OpenMessage|null=null){}
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
   this.opened=true;this.text=text;this.offset=resume?this.open.offset:0;this.cursor=resume?this.open.cursor:0;this.speaker=speakerOf(text,s)??this.speaker;this.id=null;
  }
  if(id!==null)this.id=id;
  this.last=s;
 }
 openAt(s:GameStateSnapshot):OpenMessage|null {
  return this.opened&&s.world_context?.dialogue===this.text?{text:this.text,offset:this.offset,cursor:this.cursor}:null;
 }
 capture(s:GameStateSnapshot,m:Message):void {
  this.see(s);
  // The same message shown again from its start (an endless or repeated script line).
  if(m.cursor<this.cursor){this.offset=0;}
  this.cursor=m.cursor;
  const end=this.end(m.phase,m.cursor);
  if(end>this.offset){this.add(this.text.slice(this.offset,end),s);this.offset=end;}
 }
 flush(s:GameStateSnapshot):void {
  if(this.opened&&this.offset<this.text.length){this.add(this.text.slice(this.offset),s);this.offset=this.text.length;}
 }
 private end(phase:string,cursor:number):number {
  if(phase==="dismiss_wait"||cursor>=this.text.length)return this.text.length;
  const newline=this.text.lastIndexOf("\n",cursor-1);
  return newline>=this.offset?newline+1:cursor;
 }
 private add(raw:string,s:GameStateSnapshot):void {
  const text=raw.trim();
  if(text==="")return;
  this.pages.push({state_seq:this.record(s).seq,map:s.location,map_id:s.map_id,position:s.position,speaker:this.speaker?.name??null,speaker_source:this.speaker?.source??null,text});
 }
}

interface Outcome {readonly state:GameStateSnapshot;readonly stop:Stop;readonly detail:string;readonly presses:number;readonly extras:readonly TextContent[]}
async function advance(start:GameStateSnapshot,pages:Pages,press:(signal?:AbortSignal)=>Promise<Result>,ports:Required<AutoAdvancePorts>,signal?:AbortSignal):Promise<Outcome> {
 const {clock}=ports;const began=clock.now();
 let s=start,presses=0,waiting:Wait|null=null,waitSince=began,free:number|null=null;
 const extras:TextContent[]=[];
 const done=(stop:Stop,detail:string):Outcome=>{if(!UNSHOWN.has(stop))pages.flush(s);return {state:s,stop,detail,presses,extras};};
 const failed=(error:unknown):Outcome=>{if(signal?.aborted===true)throw error;return done("error",`auto-advance stopped: ${error instanceof Error?error.message:String(error)}`);};
 for(;;){
  pages.see(s);
  let decision=classify(s);
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
   if(presses>=AUTO_ADVANCE_LIMITS.presses)return done("press_cap",`AUTO-ADVANCE CAP: stopped after ${String(AUTO_ADVANCE_LIMITS.presses)} automatic presses; the message is still open`);
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

const frameOf=(s:GameStateSnapshot):number|null=>s.raw_ram?.frame??null;
// The message's text can be in the game's buffer a frame before its phase reads (3f21 T95 seq 1634):
// new or changed text is a message that has appeared, so no further queued input is sent.
function textAppeared(previous:GameStateSnapshot|undefined,now:GameStateSnapshot):boolean {
 const text=now.world_context?.dialogue;
 return text!=null&&text!==""&&text!==(previous?.world_context?.dialogue??null);
}
// Notes on the box that were true right after the press but not after auto-advance moved on.
const STALE_NOTES=[OPENED_LOCK_NOTE,STILL_OPEN_NOTE,STILL_LOCKED_NOTE];
function afterAdvance(line:string,detail:string):string {
 const kept=STALE_NOTES.reduce((text,note)=>text.replaceAll(note,""),line);
 return kept===line?line:`${kept}; after auto-advance: ${detail}`;
}
// navigate_to's status was read before auto-advance ran; restate why it stopped and what is true now.
function navigationAfter(raw:unknown,outcome:Outcome):string|null {
 if(typeof raw!=="object"||raw===null||!("navigation" in raw))return null;
 const nav=raw.navigation;
 if(typeof nav!=="object"||nav===null||!("unready" in nav)||nav.unready!==true||!("status" in nav)||typeof nav.status!=="string"||!("commands" in nav)||typeof nav.commands!=="number")return null;
 const interrupted=nav.status.startsWith("walk interrupted: ");
 const message=nav.status===MESSAGE_WAITING||nav.status===`walk interrupted: ${MESSAGE_WAITING}`;
 const why=interrupted?`walk interrupted: ${message?"a message opened":"field controls were locked"}`:`${message?"a message was open":"field controls were not free"}, so navigate_to did not walk`;
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
 return `${page.map??"unknown location"}${page.map_id===null?"":` (map ${page.map_id.join("/")})`}${page.position===null?"":` · at ${String(page.position.x)},${String(page.position.y)}`}`;
}
function who(page:DialoguePage):string {
 const label=speakerLabel(page);
 return label===null?"":` · ${label}`;
}
function summary(outcome:Outcome,pages:readonly DialoguePage[],dropped:readonly Button[],turn:number):string {
 const lines=[`Dialogue auto-advance: the harness pressed B ${plural(outcome.presses,"time")} to advance the dialogue; stopped: ${outcome.detail}.`];
 if(dropped.length>0)lines.push(`${outcome.stop==="field_free"||outcome.stop==="locked_no_message"?"dialogue closed":"dialogue reached a decision point"}; ${plural(dropped.length,"remaining input")} not sent: ${dropped.join(", ")}.`);
 if(pages.length>0){
  lines.push(`Dialogue shown during this call (${plural(pages.length,"page")}, in order, whole):`);
  pages.forEach((page,i)=>{lines.push(`${String(i+1)}. turn ${String(turn)} · ${place(page)}${who(page)}: "${page.text}"`);});
 }else lines.push("No complete dialogue page was shown during this call.");
 return lines.join("\n");
}
// An observe result: its screenshot and its one text part.
function observation(result:Result):{images:ImageContent[];text:string} {
 return {images:result.content.filter((part):part is ImageContent=>part.type==="image"),text:result.content.filter((part):part is TextContent=>part.type==="text").map(part=>part.text).join("\n")};
}

type PressParams=Parameters<CheckedPressTool["execute"]>[1];

export function withDialogueAutoAdvance(tools:readonly AgentTool[],features:FeatureSet,ports:AutoAdvancePorts):AgentTool[] {
 if(!features["dialogue-auto-advance-v1"])return [...tools];
 const press=tools.find(t=>t.name==="press"),observe=tools.find(t=>t.name==="observe");
 if(press===undefined||observe===undefined||!isCheckedPress(press))throw new Error("Dialogue auto-advance requires ordinary game tools");
 const full:Required<AutoAdvancePorts>={...ports,clock:ports.clock??realClock};
 const switches=toolSwitches(features);
 const record=(s:GameStateSnapshot):Recorded=>full.recorder.recordState(s);
 const autoPress=(id:string)=>(signal?:AbortSignal)=>press.execute(id,{buttons:["B"]},signal);
 const finish=async(id:string,tool:"press"|"navigate_to",outcome:Outcome,pages:Pages,requested:readonly Button[],sent:readonly Button[],dropped:readonly Button[],began:number,signal?:AbortSignal)=>{
  const event=full.recorder.recordDialogueAutoAdvance({tool_call_id:id,tool,requested:[...requested],sent:[...sent],dropped:[...dropped],auto_presses:outcome.presses,pages:pages.pages,stop:outcome.stop,detail:outcome.detail,duration_ms:Math.max(0,Math.round(full.clock.now()-began))});
  const seen=await observe.execute(id,{},signal);
  return {seen,state:stateOf(seen),block:summary(outcome,pages.pages,dropped,event.turn)};
 };
 let open:OpenMessage|null=null;
 const execute=async(id:string,params:PressParams,signal?:AbortSignal,update?:Parameters<CheckedPressTool["execute"]>[3],check?:BeforePressCheck):Promise<AgentToolResult<{state:GameStateSnapshot|undefined}>>=>{
  signal?.throwIfAborted();
  const began=full.clock.now();
  let before:GameStateSnapshot|undefined;
  try{before=await full.state.read(signal);}catch{signal?.throwIfAborted();}
  const plan=submittedButtons(params.buttons,before,switches);
  const walking=params.walking===undefined?{}:{walking:params.walking};
  const run=(buttons:Button[],first:boolean)=>first&&check!==undefined?press.executeChecked(id,{buttons,...walking},check,signal,update):press.execute(id,{buttons,...walking},signal,update);
  const pages=new Pages(record,open);if(before!==undefined)pages.prime(before);
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
   for(const button of plan){result=await run([button],sent.length===0);sent.push(button);results.push({buttons:[button],line:pressLineOf(result)});extras.push(...extraText(result));const now=stateOf(result);appeared=textAppeared(previous,now);previous=now;if(inDialogue||appeared||dialogueEngaged(now))break;}
   if(result===undefined)throw new Error("press requires at least one button");
   last=result;
  }
  // The carried position is spent once the model's press went through; this call's pages now own it.
  if(before!==undefined)open=null;
  const after=stateOf(last);
  const engaged=dialogueEngaged(after)||inDialogue||appeared;
  if(!engaged&&before!==undefined)open=pages.openAt(after);
  if(!engaged&&(walk||plan.length===1)&&plan.length===params.buttons.length)return last as AgentToolResult<{state:GameStateSnapshot|undefined}>;
  // Every requested input that was not sent: cut by engaged dialogue or withheld by the safe-batch rule.
  const dropped=params.buttons.slice(sent.length);
  let block:string|null=null,final:Result,detail:string|null=null;
  if(engaged){
   const outcome=await advance(after,pages,autoPress(id),full,signal);detail=outcome.detail;
   open=pages.openAt(outcome.state);
   extras.push(...outcome.extras);
   const done=await finish(id,"press",outcome,pages,params.buttons,sent,dropped,began,signal);
   final=done.seen;block=done.block;
  }else final=await observe.execute(id,{},signal);
  const finalState=stateOf(final);
  const seen=observation(final);
  const head=[`pressed ${sent.join(", ")}`,
   ...(plan.length<params.buttons.length||(walk&&sent.length<plan.length)?[`Interface safety: submitted ${String(walk?sent.length:plan.length)} of ${String(params.buttons.length)} requested inputs; remaining inputs were not sent. Inspect the new state before another input.`]:[]),
   ...(switches.pressResult?[`Press result: ${results.every(r=>r.line!==null)?(line=>detail===null?line:afterAdvance(line,detail))(results.length===1?results[0]?.line??"":results.map((r,i)=>`${i===0?"":"then "}${r.buttons.join(", ")}: ${r.line??""}`).join(" | ")):pressResult(before,finalState,sent,switches)}`]:[]),
   ...(block===null?[]:[block])];
  return {content:[...seen.images,{type:"text",text:`${head.join("\n")}\n\n${seen.text}`},...extras],details:{state:finalState}};
 };
 const wrappedPress:CheckedPressTool={...press,description:`${press.description} Field dialogue advances automatically: once a conversation opens, the harness presses B through every page until the next decision point and lists the pages; inputs left in your batch are not sent.`,execute:(id,params,signal,update)=>execute(id,params,signal,update),executeChecked:(id,params,check,signal,update)=>execute(id,params,signal,update,check)};
 const out=tools.map(tool=>{
  if(tool===press)return wrappedPress;
  if(tool.name!=="navigate_to")return tool;
  return {...tool,description:`${tool.description} If it ends in dialogue, the dialogue advances automatically to the next decision point and its pages are listed.`,execute:async(id:string,params:unknown,signal?:AbortSignal,update?:Parameters<AgentTool["execute"]>[3])=>{
   const began=full.clock.now();
   const result=await tool.execute(id,params,signal,update);
   const state=stateOf(result);
   if(!dialogueEngaged(state))return result;
   const pages=new Pages(record,open);
   const outcome=await advance(state,pages,autoPress(id),full,signal);
   open=pages.openAt(outcome.state);
   const done=await finish(id,"navigate_to",outcome,pages,[],[],[],began,signal);
   const seen=observation(done.seen);
   // navigate_to's own status line comes first; its last frame is replaced by the fresh observation.
   const raw:unknown=result.details;
   const restated=navigationAfter(raw,outcome);
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
  const matches=this.entries.filter(e=>has(e.page.speaker,args.speaker)&&has(e.page.text,args.contains)&&(has(e.page.map,args.map)||has(e.page.map_id?.join("/")??null,args.map)));
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
