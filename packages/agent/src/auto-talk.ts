import type {AgentMessage,AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {ImageContent,TextContent} from "@mariozechner/pi-ai";
import type {BodyOf,RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot,StateSource} from "./game-state.js";
import type {FixedPointBreaker} from "./fixed-point-breaker.js";
import {mapObjects} from "./people-ledger.js";
import {MEASUREMENT_ONLY_MILESTONES} from "./milestones.js";
import {StoryCharacterGate} from "./stall-gate.js";

// fixed-point-breaker-v1 stage 3: once per loop, after stage 2 has not broken it, the harness walks to the nearest
// person not talked to since the latest story milestone (story characters first, then other people, then signs) and
// presses A. It gathers what that person says; it never picks a destination, exit or map.
export const AUTO_TALK_TURNS=8;
export const AUTO_TALK_REPLIES=3;
// navigate_to calls per candidate (each walks a bounded stride), and candidates per loop.
export const AUTO_TALK_WALKS=6;
export const AUTO_TALK_CANDIDATES=3;

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
type Body=Omit<BodyOf<"auto_talk">,"type"|"turn">;
type Target=NonNullable<Body["target"]>;
export interface AutoTalkRecorder {recordAutoTalk(body:Body):void;subscribe(fn:(event:RunEvent)=>void):void}
interface Candidate {readonly target:Target;readonly rank:number;readonly distance:number}
const STEPS:readonly (readonly [number,number,string])[]=[[0,1,"UP"],[0,-1,"DOWN"],[1,0,"LEFT"],[-1,0,"RIGHT"]];
const GAME_TOOLS=new Set(["observe","press","navigate_to","battle_action"]);
const ITEM=/ITEM_BALL/;

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
const free=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.field_controls_locked===false&&s.active_ui==null&&(s.world_context?.dialogue??"")===""&&s.map_id!==null&&s.position!==null;

export class AutoTalk {
 private readonly gate=new StoryCharacterGate({recordStallGate:()=>undefined});
 private readonly tried=new Set<string>();
 private acted="";
 private sequence=0;
 private retained:{readonly message:AgentMessage;readonly anchor:string|null}|null=null;
 constructor(private readonly features:FeatureSet,private readonly state:StateSource,private readonly tools:readonly AgentTool[],private readonly breaker:Pick<FixedPointBreaker,"fixedPoint"|"noTool">,private readonly recorder:AutoTalkRecorder){
  recorder.subscribe(event=>{
   this.gate.observe(event);
   if(event.type==="milestone"&&event.kind==="story"&&event.origin!=="present_at_start"&&!MEASUREMENT_ONLY_MILESTONES.has(event.name))this.tried.clear();
  });
 }

 transform(base:Transform,signal?:AbortSignal):Transform {
  return async messages=>{
   const out=await base(messages);
   const anchor=this.anchor(messages);
   if(this.retained!==null&&this.retained.anchor!==anchor)this.retained=null;
   const due=this.due();
   if(due!==null){
    this.acted=due.loop;
    const message=await this.talk(due,signal);
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
  const silent=this.breaker.noTool(),fixed=this.breaker.fixedPoint();
  if(silent.replies>=AUTO_TALK_REPLIES&&silent.loop!==this.acted)return {trigger:"no_tool_call",repeats:silent.replies,loop:silent.loop};
  if(silent.replies===0&&fixed.turns>=AUTO_TALK_TURNS&&fixed.loop!==this.acted)return {trigger:"fixed_point",repeats:fixed.turns,loop:fixed.loop};
  return null;
 }

 private candidates(s:GameStateSnapshot):Candidate[] {
  const map=s.map_id,p=s.position;
  if(map===null||p===null)return [];
  const id:[number,number]=[map[0],map[1]];
  const unbeaten=new Set((s.heal_before_trainers?.trainers??[]).filter(t=>!t.defeated).map(t=>t.local_id));
  const characters=this.gate.untalkedCharacters();
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
   if(named.has(o.key)||ITEM.test(o.sprite??"")||unbeaten.has(o.local_id)||this.gate.talkedTo(o.key))continue;
   add({kind:"person",name:o.sprite??`object ${String(o.local_id)}`,character:null,key:o.key,x:o.x,y:o.y,map_id:id},1);
  }
  for(const t of s.interaction_targets??[])if(t.kind==="background"&&t.name?.startsWith("Sign text")===true)add({kind:"sign",name:t.name,character:null,key:null,x:t.x,y:t.y,map_id:id},2);
  return out.sort((a,b)=>a.rank-b.rank||a.distance-b.distance).slice(0,AUTO_TALK_CANDIDATES);
 }

 private async talk(due:{readonly trigger:Body["trigger"];readonly repeats:number},signal?:AbortSignal):Promise<AgentMessage|null> {
  const record=(outcome:Body["outcome"],target:Target|null,walks:number,tried:number,text:string|null):void=>{this.recorder.recordAutoTalk({trigger:due.trigger,repeats:due.repeats,outcome,target,walks,tried,text});};
  const navigate=this.tools.find(t=>t.name==="navigate_to"),press=this.tools.find(t=>t.name==="press");
  let s=await this.state.read(signal);
  if(navigate===undefined||press===undefined||!free(s)){record("not_free",null,0,0,null);return null;}
  const candidates=this.candidates(s);
  if(candidates.length===0){record("none",null,0,0,null);return null;}
  let walks=0,tried=0;
  for(const {target} of candidates){
   tried++;
   this.tried.add(target.key??`${target.map_id.join("/")}@${String(target.x)},${String(target.y)}`);
   const reached=await this.approach(target,navigate,s,signal,()=>{walks++;});
   s=reached.state;
   // A wild battle or a script took the field mid-walk: stop here, the game has something new to show.
   if(!free(s)){record("not_free",target,walks,tried,null);return null;}
   if(reached.facing===null)continue;
   const turn=s.facing?.toUpperCase()===reached.facing?[]:[reached.facing];
   if(turn.length>0)await press.execute(this.id("turn"),{buttons:turn},signal);
   const result=await press.execute(this.id("talk"),{buttons:["A"]},signal);
   const text=`SUPERVISOR: Your last ${String(due.repeats)} ${due.trigger==="fixed_point"?"turns made the same call and the game state stayed the same":"replies called no tool"}, so the harness walked you to ${target.kind==="sign"?"the sign":target.name} at (${String(target.x)},${String(target.y)}) and pressed A. ${target.kind==="sign"?"It has not chosen where to go next; this is what the sign said.":"It has not chosen where to go next; this is what they said."}\n\n${textOf(result)}`;
   record("talked",target,walks,tried,text);
   const images=result.content.filter((p):p is ImageContent=>p.type==="image");
   const content:(TextContent|ImageContent)[]=[...images,{type:"text",text}];
   return {role:"user",content,timestamp:Date.now()};
  }
  record("unreachable",candidates[0]?.target??null,walks,tried,null);
  return null;
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
    const args:Record<string,unknown>={x:side.x,y:side.y,map_id:target.map_id,...(this.features["cited-destination-v1"]?{because:"the fixed-point breaker's auto-talk"}:{})};
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

 private id(kind:string):string {return `auto-talk-${String(++this.sequence)}-${kind}`;}
}

export function autoTalkContext(features:FeatureSet,state:StateSource,tools:readonly AgentTool[],base:Transform,breaker:FixedPointBreaker|null,recorder:AutoTalkRecorder,signal?:AbortSignal):Transform {
 if(!features["fixed-point-breaker-v1"]||breaker===null)return base;
 return new AutoTalk(features,state,tools,breaker,recorder).transform(base,signal);
}
