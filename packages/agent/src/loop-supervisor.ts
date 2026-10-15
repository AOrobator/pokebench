import {DialogueLog,roomKey,roomOf} from "./dialogue-log.js";
import {NextMilestoneHint} from "./milestone-hint.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {LoopKind} from "./loop-detection.js";

export type Stall=
 | {readonly kind:"map_cycle";readonly from:string;readonly to:string;readonly roundTrips:number;readonly consecutive:boolean}
 | {readonly kind:"milestone_drought";readonly minutes:number};

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Page=Advance["pages"][number];
interface Tried {readonly key:string;readonly room:string;readonly label:string;count:number;outcome:string}

const MAX_TRIED=8;
// Only these tools return the game readout; any other text could only quote it.
const GAME_TOOLS=new Set(["observe","press","navigate_to"]);
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const PATTERN:Readonly<Record<LoopKind,string>>={cycle:"the same short cycle of actions",ineffective:"the same input with no effect",planning:"planning without acting",observation:"observing without acting",rejection:"the same rejected tool call"};
const at=(x:number,y:number)=>`${String(x)},${String(y)}`;

// A deterministic summary for a looping agent: facts it was shown, never a route or story goal.
export class SupervisorBriefing {
 private measured:State|null=null;
 private latest:State|null=null;
 private progress:{turn:number;name:string}|null=null;
 private turn=0;
 private readonly dialogue:DialogueLog;
 private readonly calls=new Map<string,{name:string;args:Record<string,unknown>;before:State|null}>();
 private readonly tried:Tried[]=[];
 private readonly touched=new Map<string,Set<string>>();
 private readonly hint:NextMilestoneHint|null;
 private story:string|null=null;
 private readonly heard=new Set<string>();
 // dialogue-auto-advance-v1: the pages of each auto-advanced call, recorded before its result.
 private readonly advanced=new Map<string,Advance>();
 constructor(private readonly features:FeatureSet){this.dialogue=new DialogueLog(features);this.hint=features["next-milestone-hint-v1"]?new NextMilestoneHint():null;}
 observe(event:RunEvent):void {
  this.dialogue.observe(event);
  this.hint?.observe(event);
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="milestone"){if(event.origin!=="present_at_start"&&event.name!=="GAME_RUNNING"&&!MEASUREMENT_ONLY_MILESTONES.has(event.name))this.progress={turn:event.turn,name:event.name};return;}
  if(event.type==="state"&&"started"in event){this.measured=event;return;}
  if(event.type==="dialogue_auto_advance"){
   this.advanced.set(event.tool_call_id,event);
   if(this.advanced.size>16)this.advanced.delete(this.advanced.keys().next().value??"");
   return;
  }
  if(event.type==="tool_call"&&(event.name==="press"||event.name==="navigate_to")){
   this.calls.set(event.id,{name:event.name,args:event.args,before:this.latest});
   if(this.calls.size>16)this.calls.delete(this.calls.keys().next().value??"");
   return;
  }
  if(event.type!=="tool_result"||event.state_seq===undefined||this.measured?.seq!==event.state_seq)return;
  const after=this.measured;this.measured=null;
  const auto=this.advanced.get(event.id);this.advanced.delete(event.id);
  if(!event.is_error&&GAME_TOOLS.has(event.name))this.readStory(event.text);
  if(!after.started||after.screen!=="overworld")return;
  this.latest=after;
  const call=this.calls.get(event.id);this.calls.delete(event.id);
  const label=call===undefined?null:this.label(call);
  if(call!==undefined&&label!==null){
   const where=call.before??after;
   this.remember(this.room(where),roomOf(where,this.features),label,this.outcome(call.before,after,auto?.pages??[]));
  }
  for(const page of auto?.pages??[])this.heard.add(this.pageOpening(page));
  const dialogue=after.world_context?.dialogue;
  if(dialogue)this.heard.add(this.opening(after,dialogue));
 }
 // The readout's own Story line, so the briefing never disagrees with it. A reload gap keeps the last known line.
 private readStory(text:string):void {
  const line=/^Story: (.*)$/m.exec(text)?.[1];
  if(line===undefined||line.startsWith("unavailable"))return;
  if(this.story!==null&&line!==this.story)this.touched.clear();
  this.story=line;
 }
 private room(state:State):string {return roomKey(state);}
 // The same text at another map or tile is a different conversation (another sign, another person).
 private opening(state:State,text:string):string {return JSON.stringify([this.room(state),state.position===null?null:at(state.position.x,state.position.y),text]);}
 private pageOpening(page:Page):string {return JSON.stringify([roomKey({location:page.map,map_id:page.map_id}),page.position===null?null:at(page.position.x,page.position.y),page.text]);}
 private touch(room:string,tile:string):void {
  const tiles=this.touched.get(room)??new Set<string>();tiles.add(tile);this.touched.set(room,tiles);
 }
 private label(call:{name:string;args:Record<string,unknown>;before:State|null}):string|null {
  if(call.name==="navigate_to"){
   const x=call.args["x"],y=call.args["y"];
   if(typeof x!=="number"||typeof y!=="number")return "navigate_to (invalid target)";
   if(call.before!==null)this.touch(this.room(call.before),at(x,y));
   return `navigate_to ${at(x,y)}`;
  }
  const buttons=call.args["buttons"];
  if(!Array.isArray(buttons)||buttons.length===0)return null;
  const names=buttons.map(String);
  if(names.length===1&&names[0]==="A"&&call.before!==null){
   const faced=this.faced(call.before);
   if(faced!==null){this.touch(this.room(call.before),faced.tile);return `A facing ${faced.name}`;}
  }
  return `press ${names.join(",")}`;
 }
 private faced(state:State):{tile:string;name:string}|null {
  if(!this.features["live-player-position-v1"]||state.position===null||state.facing===null)return null;
  const step=STEP[state.facing.toLowerCase()];if(step===undefined)return null;
  const x=state.position.x+step[0],y=state.position.y+step[1];
  const target=this.features["world-targets-v1"]?(state.interaction_targets??[]).find(t=>t.x===x&&t.y===y):undefined;
  const name=this.features["named-interactions-v1"]&&target?.name!=null?target.name:target?.kind??"tile";
  return {tile:at(x,y),name:`${name} at ${at(x,y)}`};
 }
 private outcome(before:State|null,after:State,pages:readonly Page[]):string {
  if(before===null)return "result unverified";
  if(this.room(before)!==this.room(after))return `entered ${roomOf(after,this.features)}`;
  const first=pages[0];
  if(this.features["active-field-message-buffer-v1"]&&first!==undefined){
   const shown=`${String(pages.length)} page${pages.length===1?"":"s"}, advanced automatically`;
   return this.heard.has(this.pageOpening(first))?`restarted a conversation already shown (${shown})`:`dialogue shown (${shown})`;
  }
  if(this.features["live-player-position-v1"]&&before.position!==null&&after.position!==null&&at(before.position.x,before.position.y)!==at(after.position.x,after.position.y))return `moved to ${at(after.position.x,after.position.y)}`;
  if(this.features["active-field-message-buffer-v1"]){
   const was=before.world_context?.dialogue??null,now=after.world_context?.dialogue??null;
   if(was!==null&&now===null)return "dialogue closed";
   if(was===null&&now!==null&&this.heard.has(this.opening(after,now)))return "restarted a conversation already shown";
   if(was!==now)return "dialogue changed";
   const a=before.world_context?.message??null,b=after.world_context?.message??null;
   if(now!==null&&(a?.cursor!==b?.cursor||a?.phase!==b?.phase))return "dialogue advanced";
  }
  return "no change";
 }
 private remember(key:string,room:string,label:string,outcome:string):void {
  const index=this.tried.findIndex(t=>t.key===key&&t.label===label&&t.outcome===outcome);
  const existing=index>=0?this.tried.splice(index,1)[0]:undefined;
  this.tried.push({key,room,label,count:(existing?.count??0)+1,outcome});
  if(this.tried.length>MAX_TRIED)this.tried.shift();
 }
 private lastProgress():string {
  return this.progress===null?"none earned in this run yet":`${this.progress.name.replaceAll("_"," ").toLowerCase()} at turn ${String(this.progress.turn)} (${String(this.turn-this.progress.turn)} turns ago)`;
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
  const s=this.latest;if(s===null)return "no observation yet";
  const position=this.features["live-player-position-v1"]&&s.position!==null?` at ${at(s.position.x,s.position.y)}${s.facing===null?"":` facing ${s.facing.toLowerCase()}`}`:"";
  return `${roomOf(s,this.features)}${position}`;
 }
 private told():string {
  if(!this.features["active-field-message-buffer-v1"])return "not available (dialogue text is off)";
  const recent=this.dialogue.entries().slice(-3).reverse();
  return recent.length===0?"none recorded":recent.map(e=>`turn ${String(e.turn)}, ${e.room}${e.facing===null?"":`, facing ${e.facing}`}: "${e.text.replace(/\s+/g," ")}"`).join(" | ");
 }

 private untried():string {
  const s=this.latest;
  if(!this.features["world-targets-v1"])return "not available (world targets are off)";
  if(s===null)return "no observation yet";
  const done=this.touched.get(this.room(s))??new Set<string>();
  // Exits first: ordering only, so a briefing never buries the way out under room furniture.
  const open=(s.interaction_targets??[]).filter(t=>!done.has(at(t.x,t.y))).sort((a,b)=>Number(b.kind==="warp")-Number(a.kind==="warp"));
  if(open.length===0)return "none: every listed target here has been tried";
  return open.map(t=>`${this.features["named-interactions-v1"]&&t.name!=null?t.name:t.kind} at ${at(t.x,t.y)} (${t.activation})`).join("; ");
 }
 text(kind:LoopKind,calls:number):string {
  return this.bearings(`SUPERVISOR: You are currently looping. You keep repeating ${PATTERN[kind]}, and the game is not moving forward (loop guard, ${String(calls)} calls into the run).`);
 }

 // stall-briefing-v1: the same facts, headed by which stall it is.
 stallText(stall:Stall,calls:number):string {
  const what=stall.kind==="map_cycle"?`You have walked between ${stall.from} and ${stall.to} ${String(stall.roundTrips)} times${stall.consecutive?", out and back,":" (with other maps in between),"} with no new story milestone`:`There has been no new story milestone for ${String(stall.minutes)} minutes of play`;
  return this.bearings(`SUPERVISOR: You are stalling. ${what}, and the game is not moving forward (stall briefing, ${String(calls)} calls into the run).`);
 }

 private bearings(headline:string):string {
  const tried=this.tried.length===0?"nothing recorded":this.tried.slice().reverse().map(t=>`${t.label}${t.count>1?` ×${String(t.count)}`:""} in ${t.room} → ${t.outcome}`).join("; ");
  const recall=this.features["dialogue-log-v1"]?" (use recall_dialogue to check exactly what characters said)":"";
  return `${headline} What you have been trying is not working, so do not try it again.
Stop and get your bearings:
- Where you are: ${this.where()}
- Last story progress: ${this.lastProgress()}
${this.hint===null?"":`- Next milestone (hint): ${this.hint.describe()}\n`}- Characters the readout names here: ${this.characters()}
- Story steps the game confirms are done: ${this.done()}
- Recent dialogue you were shown, newest first: ${this.told()}
- What you tried recently, newest first: ${tried}
- Listed here that you have not tried yet: ${this.untried()}
Before your next action, look back at your goal and at what the game has told you${recall}. If anything you believe disagrees with the dialogue or the readout above, believe the game. Make a new plan that is different from what you have been trying, and say which untried option you will try first. The run continues.`;
 }

 textOnly(replies:number,note:number,limit:number):string {
  const text=`SUPERVISOR: Your last ${String(replies)} replies called no tool, so nothing happened in the game (text-only supervisor, note ${String(note)} of ${String(limit)}). Writing out a plan or a list of coordinates does not move you; only a tool call does.
Get your bearings:
- Where you are: ${this.where()}
- Last story progress: ${this.lastProgress()}
- Story steps the game confirms are done: ${this.done()}
- Recent dialogue you were shown, newest first: ${this.told()}
- Listed here that you have not tried yet: ${this.untried()}
Keep your thinking short and end this reply with one tool call: observe to look again, or press, navigate_to or another listed tool to act. If replies keep calling no tool after note ${String(limit)} of ${String(limit)}, the run ends.`;
  return text;
 }

}
