import type {AgentMessage,AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {ImageContent,TextContent} from "@mariozechner/pi-ai";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot,StateSource} from "./game-state.js";
import type {FixedPointBreaker} from "./fixed-point-breaker.js";
import {mapObjects} from "./people-ledger.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {StoryCharacterGate} from "./stall-gate.js";

// Every call auto-talk makes through the play tools carries this id prefix (story-battle-heal-gate-v1 leaves them ungated).
export const AUTO_TALK_ID_PREFIX="auto-talk-";

// fixed-point-breaker-v1 stage 3: once per loop, after stage 2 has not broken it, the harness walks to the nearest
// person not talked to since the latest story milestone (story characters first, then other people, then signs) and
// presses A. It gathers what that person says; it never picks a destination, exit or map.
export const AUTO_TALK_TURNS=8;
export const AUTO_TALK_REPLIES=3;
// navigate_to calls per candidate (each walks a bounded stride), and candidates per loop.
export const AUTO_TALK_WALKS=6;
export const AUTO_TALK_CANDIDATES=3;
// auto-talk-v3: the model's turns on the free field of one map, with no story milestone, before the harness talks.
export const AUTO_TALK_QUIET_TURNS=10;

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type Body=Omit<BodyOf<"auto_talk">,"type"|"turn">;
type Target=NonNullable<Body["target"]>;
export interface AutoTalkRecorder {recordAutoTalk(body:Body):void;subscribe(fn:(event:RunEvent)=>void):void}
interface Candidate {readonly target:Target;readonly rank:number;readonly distance:number}
const STEPS:readonly (readonly [number,number,string])[]=[[0,1,"UP"],[0,-1,"DOWN"],[1,0,"LEFT"],[-1,0,"RIGHT"]];
const GAME_TOOLS=new Set(["observe","press","navigate_to","battle_action"]);
const ITEM=/ITEM_BALL/;

const why=(trigger:Body["trigger"]):string=>trigger==="quiet_map"?"turns on this map brought no story milestone":trigger==="fixed_point"?"turns made the same call and the game state stayed the same":"replies called no tool";
const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
// field-ownership-feedback-v1: the game, not the field, owns input: another screen, or an open interface.
const ownedInterface=(s:GameStateSnapshot):string|null=>s.started&&(s.screen!=="overworld"||s.active_ui!=null)?`${s.screen}|${s.active_ui?.phase??""}`:null;
// auto-talk-field-only-v1: a battle owns the game: its screen, or the battle flag with no other interface ready
// (a post-battle evolution decision keeps gMain.inBattle set and is not the battle).
const battleOwns=(s:GameStateSnapshot):boolean=>s.started&&(s.screen==="battle"||(s.in_battle&&s.active_ui?.ready!==true));
const free=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.active_ui==null&&(s.world_context?.dialogue??"")===""&&s.map_id!==null&&s.position!==null;

export class AutoTalk {
 private readonly gate=new StoryCharacterGate({recordStallGate:()=>undefined});
 private readonly tried=new Set<string>();
 private acted="";
 private sequence=0;
 private retained:{readonly message:AgentMessage;readonly anchor:string|null}|null=null;
 // field-ownership-feedback-v1: the interface episode already named; a free field ends the episode.
 private named:string|null=null;
 // auto-talk-v3: the map the quiet stretch is on and its free-field turns so far.
 private quiet={map:"",turns:0};
 constructor(private readonly features:FeatureSet,private readonly state:StateSource,private readonly tools:readonly AgentTool[],private readonly breaker:Pick<FixedPointBreaker,"fixedPoint"|"noTool">|null,private readonly recorder:AutoTalkRecorder){
  recorder.subscribe(event=>{
   this.gate.observe(event);
   if(event.type==="state"&&"started" in event&&event.started&&event.screen==="overworld"&&event.active_ui==null)this.named=null;
   if(event.type==="milestone"&&event.kind==="story"&&event.origin!=="present_at_start"&&!MEASUREMENT_ONLY_MILESTONES.has(event.name)){this.tried.clear();this.quiet={...this.quiet,turns:0};}
  });
 }

 transform(base:Transform,signal?:AbortSignal):Transform {
  return async messages=>{
   const out=await base(messages);
   const anchor=this.anchor(messages);
   if(this.retained!==null&&this.retained.anchor!==anchor)this.retained=null;
   const due=this.features["auto-talk-v3"]?await this.quietDue(signal):this.due();
   if(due!==null){
    const {message,settled}=await this.talk(due,signal);
    // A field that was not free (a battle, a menu) leaves the loop's one attempt for a later request.
    if(settled){this.acted=due.loop;if(due.trigger==="quiet_map")this.quiet={...this.quiet,turns:0};}
    if(message!==null)this.retained={message,anchor};
   }
   return this.retained===null?out:[...out,this.retained.message];
  };
 }

 // The latest game result the model has seen; a newer one retires the harness's talk.
 private anchor(messages:readonly AgentMessage[]):string|null {
  const latest=messages.findLast(m=>"role"in m&&m.role==="toolResult"&&GAME_TOOLS.has(m.toolName));
  return latest!==undefined&&"role"in latest&&latest.role==="toolResult"?latest.toolCallId:null;
 }

 private due():{readonly trigger:Body["trigger"];readonly repeats:number;readonly loop:string}|null {
  if(this.breaker===null)return null;
  const silent=this.breaker.noTool(),fixed=this.breaker.fixedPoint();
  if(silent.replies>=AUTO_TALK_REPLIES&&silent.loop!==this.acted)return {trigger:"no_tool_call",repeats:silent.replies,loop:silent.loop};
  if(silent.replies===0&&fixed.turns>=AUTO_TALK_TURNS&&fixed.loop!==this.acted)return {trigger:"fixed_point",repeats:fixed.turns,loop:fixed.loop};
  return null;
 }

 // auto-talk-v3: counts the model's turns on the free field of one map; a new map, a story milestone or a talk starts over.
 private async quietDue(signal?:AbortSignal):Promise<{readonly trigger:Body["trigger"];readonly repeats:number;readonly loop:string}|null> {
  const s=await this.state.read(signal);
  if(!free(s)||s.map_id===null)return null;
  const map=s.map_id.join("/");
  this.quiet=map===this.quiet.map?{map,turns:this.quiet.turns+1}:{map,turns:1};
  return this.quiet.turns>=AUTO_TALK_QUIET_TURNS?{trigger:"quiet_map",repeats:this.quiet.turns,loop:`quiet:${map}`}:null;
 }

 private candidates(s:GameStateSnapshot):Candidate[] {
  const map=s.map_id,p=s.position;
  if(map===null||p===null)return [];
  const id:[number,number]=[map[0],map[1]];
  // Loaded trainers only: heal-before-trainers-v2 also lists ones the game has not loaded, which auto-talk never sees.
  const unbeaten=new Set((s.heal_before_trainers?.trainers??[]).filter(t=>!t.defeated&&t.loaded!==false).map(t=>t.local_id));
  // auto-talk-v2: a trainer the readout shows as defeated has nothing new to say either.
  const beaten=new Set(this.features["auto-talk-v2"]?(s.heal_before_trainers?.trainers??[]).filter(t=>t.defeated).map(t=>t.local_id):[]);
  const characters=this.gate.untalkedCharacters();
  const v3=this.features["auto-talk-v3"];
  const out:Candidate[]=[];
  const add=(target:Target,rank:number):void=>{
   const key=target.key??`${target.map_id.join("/")}@${String(target.x)},${String(target.y)}`;
   if(this.tried.has(key))return;
   out.push({target,rank,distance:Math.abs(target.x-p.x)+Math.abs(target.y-p.y)});
  };
  const named=new Set<string>();
  for(const c of characters){
   if(c.tile===null)continue;
   const object=(mapObjects(s)??[]).find(o=>o.key===c.key);
   const at=object??c.tile;
   if(c.key!==null)named.add(c.key);
   add({kind:"story_character",name:c.name,character:c.name,key:c.key,x:at.x,y:at.y,map_id:id},0);
  }
  for(const o of mapObjects(s)??[]){
   if(named.has(o.key)||ITEM.test(o.sprite??"")||unbeaten.has(o.local_id)||beaten.has(o.local_id)||this.gate.talkedTo(o.key))continue;
   // auto-talk-v3: someone talked to before the latest story milestone comes ahead of a stranger.
   add({kind:"person",name:o.sprite??`object ${String(o.local_id)}`,character:null,key:o.key,x:o.x,y:o.y,map_id:id},v3&&!this.gate.talkedEver(o.key)?2:1);
  }
  for(const t of s.interaction_targets??[])if(t.kind==="background"&&t.name?.startsWith("Sign text")===true)add({kind:"sign",name:t.name,character:null,key:null,x:t.x,y:t.y,map_id:id},3);
  return out.sort((a,b)=>a.rank-b.rank||a.distance-b.distance).slice(0,AUTO_TALK_CANDIDATES);
 }

 private async talk(due:{readonly trigger:Body["trigger"];readonly repeats:number},signal?:AbortSignal):Promise<{readonly message:AgentMessage|null;readonly settled:boolean}> {
  const record=(outcome:Body["outcome"],target:Target|null,walks:number,tried:number,text:string|null):void=>{this.recorder.recordAutoTalk({trigger:due.trigger,repeats:due.repeats,outcome,target,walks,tried,text});};
  const navigate=this.tools.find(t=>t.name==="navigate_to"),press=this.tools.find(t=>t.name==="press");
  let s=await this.state.read(signal);
  if(navigate===undefined||press===undefined||!free(s)){
   const tools=navigate!==undefined&&press!==undefined;
   // auto-talk-field-only-v1: nothing at all in a battle, and no not_free no-op anywhere else.
   const fieldOnly=this.features["auto-talk-field-only-v1"]&&tools;
   if(fieldOnly&&battleOwns(s))return {message:null,settled:false};
   const owned=this.features["field-ownership-feedback-v1"]&&tools?ownedInterface(s):null;
   if(owned===null||owned===this.named){if(fieldOnly)return {message:null,settled:false};record("not_free",null,0,0,null);return {message:null,settled:!tools};}
   this.named=owned;
   // Names what the game shows and the controls the readout lists; it never picks an answer.
   const ui=s.active_ui,name=ui==null?s.screen.replaceAll("_"," "):ui.phase.replaceAll("_"," ");
   const text=`SUPERVISOR: Your last ${String(due.repeats)} ${why(due.trigger)}. The harness did not walk or press anything: the game is showing the ${name} (screen ${s.screen}), not the field.${ui?.controls==null||ui.controls===""?"":` Controls the readout lists for it: ${ui.controls}`}`;
   record("not_free",null,0,0,text);
   return {message:{role:"user",content:[{type:"text",text}],timestamp:Date.now()},settled:false};
  }
  const candidates=this.candidates(s);
  if(candidates.length===0){record("none",null,0,0,null);return {message:null,settled:true};}
  let walks=0,tried=0;
  for(const {target} of candidates){
   tried++;
   this.tried.add(target.key??`${target.map_id.join("/")}@${String(target.x)},${String(target.y)}`);
   const reached=await this.approach(target,navigate,s,signal,()=>{walks++;});
   s=reached.state;
   // A wild battle or a script took the field mid-walk: stop here, the game has something new to show.
   if(!free(s)){record("not_free",target,walks,tried,null);return {message:null,settled:true};}
   if(reached.facing===null)continue;
   const turn=s.facing?.toUpperCase()===reached.facing?[]:[reached.facing];
   if(turn.length>0)await press.execute(this.id("turn"),{buttons:turn},signal);
   const result=await press.execute(this.id("talk"),{buttons:["A"]},signal);
   const text=`SUPERVISOR: Your last ${String(due.repeats)} ${why(due.trigger)}, so the harness walked you to ${target.kind==="sign"?"the sign":target.name} at (${String(target.x)},${String(target.y)}) and pressed A. ${target.kind==="sign"?"It has not chosen where to go next; this is what the sign said.":"It has not chosen where to go next; this is what they said."}\n\n${textOf(result)}`;
   record("talked",target,walks,tried,text);
   const images=result.content.filter((p):p is ImageContent=>p.type==="image");
   const content:(TextContent|ImageContent)[]=[...images,{type:"text",text}];
   return {message:{role:"user",content,timestamp:Date.now()},settled:true};
  }
  record("unreachable",candidates[0]?.target??null,walks,tried,null);
  return {message:null,settled:true};
 }

 // Walks to a free tile next to the target, nearest first; the facing that then looks at it, or null when none is reached.
 private async approach(target:Target,navigate:AgentTool,start:GameStateSnapshot,signal:AbortSignal|undefined,walked:()=>void):Promise<{readonly state:GameStateSnapshot;readonly facing:string|null}> {
  let s=start;
  const grid=s.navigation_grid?.tiles??[];
  const objects=new Set((mapObjects(s)??[]).map(o=>`${String(o.x)},${String(o.y)}`));
  const p0=s.position;
  if(p0===null)return {state:s,facing:null};
  const sides=(target.kind==="sign"?STEPS.slice(0,1):STEPS).map(([dx,dy,facing])=>({x:target.x+dx,y:target.y+dy,facing}))
   .filter(t=>!objects.has(`${String(t.x)},${String(t.y)}`)&&grid.find(g=>g.x===t.x&&g.y===t.y)?.collision!==1)
   .sort((a,b)=>(Math.abs(a.x-p0.x)+Math.abs(a.y-p0.y))-(Math.abs(b.x-p0.x)+Math.abs(b.y-p0.y)));
  for(const side of sides){
   for(let i=0;i<AUTO_TALK_WALKS;i++){
    const p=s.position;
    if(p===null||!free(s))return {state:s,facing:null};
    if(p.x===side.x&&p.y===side.y)return {state:s,facing:side.facing};
    walked();
    const because=this.features["citation-evidence-v1"]?{quote:"the fixed-point breaker's auto-talk"}:"the fixed-point breaker's auto-talk";
    const args:Record<string,unknown>={x:side.x,y:side.y,map_id:target.map_id,...(this.features["cited-destination-v1"]?{because}:{})};
    await navigate.execute(this.id("walk"),args,signal);
    const next=await this.state.read(signal);
    const moved=next.position!==null&&(next.position.x!==p.x||next.position.y!==p.y);
    s=next;
    if(!moved||JSON.stringify(next.map_id)!==JSON.stringify(start.map_id))break;
   }
   if(s.position!==null&&s.position.x===side.x&&s.position.y===side.y&&free(s))return {state:s,facing:side.facing};
   if(!free(s)||JSON.stringify(s.map_id)!==JSON.stringify(start.map_id))return {state:s,facing:null};
  }
  return {state:s,facing:null};
 }

 private id(kind:string):string {return `${AUTO_TALK_ID_PREFIX}${String(++this.sequence)}-${kind}`;}
}

export function autoTalkContext(features:FeatureSet,state:StateSource,tools:readonly AgentTool[],base:Transform,breaker:FixedPointBreaker|null,recorder:AutoTalkRecorder,signal?:AbortSignal):Transform {
 if(!features["auto-talk-v1"])return base;
 // auto-talk-v3 has its own trigger and needs no loop records.
 if(!features["auto-talk-v3"]&&(!(features["fixed-point-breaker-v1"]||features["duplicate-turn-collapse-v1"])||breaker===null))return base;
 return new AutoTalk(features,state,tools,breaker,recorder).transform(base,signal);
}
