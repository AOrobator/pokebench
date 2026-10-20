// unfinished-activity-v1: the agent's own unfinished activity, kept across detours. A trainer battle the agent
// lost or drew stays open until the game shows that trainer defeated. Each game result then carries what the agent
// did on that map (arrivals, departures with the party's HP, heals elsewhere, its trainer battles there), the open
// battle with the words the game showed just before it, and the agent's own last walk to that map, as the exits it
// used, starting from an exit of the current map it can reach on foot now. Facts from recorded game state and
// delivered dialogue only: no route is chosen, no order is given, nothing is clipped.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {BattleOutcomes,type Battle} from "./battle-outcomes.js";
import {roomOf} from "./dialogue-log.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {PlacesBodySchema,type MapId,type Place,type PlaceSource} from "./story-destinations.js";

export const UNFINISHED_HEADER="Unfinished activity (what you did and what the game recorded; it is not an order or a route):";
export const UNFINISHED_BRIEFING="- Unfinished activity (what you did and what the game recorded): ";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"in_battle"|"location"|"location_display"|"map_id"|"position"|"party"|"trainer_opponent"|"exit_reach"|"blackout_active">;
type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
interface Pos {readonly x:number;readonly y:number}
interface Arrival {
 readonly seq:number;readonly turn:number;readonly map:MapId;readonly label:string;readonly pos:Pos|null;
 readonly from:{readonly map:MapId;readonly label:string;readonly pos:Pos|null;readonly party:string}|null;
 // The game moved the player (a whiteout), so this arrival is not a walk.
 readonly carried:boolean;
}
interface TrainerBattle {
 readonly seq:number;readonly trainer:{readonly id:number;readonly name:string};readonly map:MapId;readonly label:string;
 readonly start:number;readonly end:number;readonly outcome:string|null;readonly whiteout:string|null;readonly words:readonly string[];
}
interface Heal {readonly seq:number;readonly turn:number;readonly label:string}
type Exit={readonly kind:"door";readonly x:number;readonly y:number}|{readonly kind:"edge";readonly direction:string};
interface Step {readonly from:MapId;readonly fromLabel:string;readonly exit:Exit;readonly to:MapId;readonly turn:number;readonly arrival:Pos|null}
export interface ActivityChange {readonly change:"opened"|"updated"|"retired";readonly trainer_id:number;readonly trainer:string;readonly map_id:MapId;readonly text:string}

const same=(a:MapId,b:MapId)=>a[0]===b[0]&&a[1]===b[1];
const key=(id:MapId)=>`${String(id[0])}/${String(id[1])}`;
const EDGES=new Set(["NORTH","SOUTH","EAST","WEST"]);
const near=(a:Pos,b:Pos,d:number)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<=d;
const plain=(text:string)=>text.replace(/\s+/g," ").trim();
const who=(t:TrainerBattle["trainer"])=>`${t.name} (trainer ${String(t.id)})`;
const partyText=(s:Pick<Snapshot,"party">)=>(s.party??[]).map(p=>`${p.species} at ${String(p.hp)}/${String(p.max_hp)} HP`).join(", ");

export class UnfinishedActivity {
 private readonly outcomes:BattleOutcomes;
 private turn=0;
 private last:State|null=null;
 private blackout=false;
 private start:{readonly turn:number;readonly map:MapId;readonly label:string;readonly id:number;readonly name:string}|null=null;
 private readonly arrivals:Arrival[]=[];
 private readonly battles:TrainerBattle[]=[];
 private readonly heals:Heal[]=[];
 private readonly labels=new Map<number,string>();
 private readonly delivered:{readonly turn:number;readonly pages:readonly Page[]}[]=[];
 private readonly pending=new Map<string,{readonly turn:number;readonly pages:readonly Page[]}>();
 private readonly flags=new Map<number,{readonly turn:number;readonly defeated:boolean}>();
 private readonly open=new Map<number,TrainerBattle>();
 private readonly changed:ActivityChange[]=[];
 constructor(private readonly features:FeatureSet){this.outcomes=new BattleOutcomes(features);}

 observe(event:RunEvent):void {
  this.turn=Math.max(this.turn,event.turn);
  const done=this.outcomes.battles().length;
  this.outcomes.observe(event);
  if(event.type==="activity"){
   // The blackout activity follows the state that already shows the player back in town.
   if(event.kind==="blackout"){const a=this.arrivals.at(-1);if(a!==undefined&&event.evidence.includes(a.seq))this.carry(a);else this.blackout=true;}
   if(event.kind==="heal"){const at=event.evidence[0];const label=at===undefined?undefined:this.labels.get(at);if(label!==undefined)this.heals.push({seq:event.seq,turn:event.turn,label});}
   return;
  }
  if(event.type==="dialogue_auto_advance"){this.pending.set(event.tool_call_id,{turn:event.turn,pages:event.pages});return;}
  if(event.type==="tool_result"){const d=this.pending.get(event.id);this.pending.delete(event.id);if(d!==undefined&&!event.is_error)this.delivered.push(d);return;}
  if(event.type!=="state"||!("started" in event)||!event.started)return;
  this.state(event,done);
 }

 private state(s:State,done:number):void {
  if(s.map_id!==null){
   this.labels.set(s.seq,roomOf(s,this.features));
   if(this.labels.size>512)this.labels.delete(this.labels.keys().next().value ?? -1);
  }
  if(s.blackout_active===true)this.blackout=true;
  const o=s.trainer_opponent;
  if(o!=null){
   this.flags.set(o.trainer_id,{turn:s.turn,defeated:o.defeated});
   if(o.battle_active&&this.start===null&&this.last?.map_id!=null)this.start={turn:s.turn,map:this.last.map_id,label:roomOf(this.last,this.features),id:o.trainer_id,name:o.name ?? `trainer ${String(o.trainer_id)}`};
   if(o.defeated)this.retire(o.trainer_id,s.turn);
  }
  if(s.map_id!==null&&this.last?.map_id!=null&&!same(s.map_id,this.last.map_id))this.arrive(s,this.last);
  else if(s.map_id!==null&&this.arrivals.length===0)this.arrivals.push({seq:s.seq,turn:s.turn,map:s.map_id,label:roomOf(s,this.features),pos:s.position,from:null,carried:true});
  if(s.map_id!==null)this.last=s;
  const battles=this.outcomes.battles();
  if(battles.length>done){const b=battles.at(-1);if(b!==undefined)this.finish(b);if(b?.whiteout!=null){const a=this.arrivals.at(-1);if(a?.seq===s.seq)this.carry(a);}}
 }

 private carry(a:Arrival):void {
  const i=this.arrivals.lastIndexOf(a);
  if(i>=0)this.arrivals[i]={...a,carried:true};
 }

 private arrive(s:State,prev:State):void {
  if(s.map_id===null||prev.map_id===null)return;
  const carried=this.blackout;this.blackout=false;
  const a:Arrival={seq:s.seq,turn:s.turn,map:s.map_id,label:roomOf(s,this.features),pos:s.position,from:{map:prev.map_id,label:roomOf(prev,this.features),pos:prev.position,party:partyText(prev)},carried};
  this.arrivals.push(a);
 }

 private finish(b:Battle):void {
  const s=this.start;this.start=null;
  if(b.trainer===null||s===null||s.id!==b.trainer.id)return;
  const words=this.wordsBefore(s.turn,s.map);
  const t:TrainerBattle={seq:b.seq,trainer:{id:b.trainer.id,name:b.trainer.name ?? s.name},map:s.map,label:s.label,start:s.turn,end:b.turn,outcome:b.outcome,whiteout:b.whiteout?.place ?? null,words};
  this.battles.push(t);
  if(t.outcome==="lost"||t.outcome==="drew"||t.whiteout!==null){
   const was=this.open.has(t.trainer.id);
   this.open.set(t.trainer.id,t);
   this.changed.push({change:was?"updated":"opened",trainer_id:t.trainer.id,trainer:t.trainer.name,map_id:t.map,text:openText(t)});
  }else if(t.outcome==="won")this.retire(t.trainer.id,t.end);
 }

 private retire(id:number,turn:number):void {
  const t=this.open.get(id);
  if(t===undefined)return;
  this.open.delete(id);
  this.changed.push({change:"retired",trainer_id:id,trainer:t.trainer.name,map_id:t.map,text:`${who(t.trainer)}: the game shows ${who(t.trainer)} defeated (turn ${String(turn)}).`});
 }

 // The field pages the game showed on that map in the call that started the battle, before the battle's own text.
 private wordsBefore(turn:number,map:MapId):string[] {
  const call=this.delivered.findLast(d=>d.turn===turn);
  if(call===undefined)return [];
  const out:string[]=[];
  for(const page of call.pages){
   if(page.battle_turn!==undefined||page.battle_message_id!==undefined)break;
   if(page.map_id!==null&&same(page.map_id,map))out.push(plain(page.text));
  }
  return out;
 }

 changes():readonly ActivityChange[] {return this.changed;}

 block(now:Snapshot,places:readonly Place[]|null):string|null {
  if(!now.started||now.map_id===null)return null;
  const o=now.trainer_opponent;
  const items=[...this.open.values()].filter(t=>!(o!=null&&o.trainer_id===t.trainer.id&&o.defeated));
  if(items.length===0)return null;
  const lines=[UNFINISHED_HEADER];
  for(const map of [...new Map(items.map(t=>[key(t.map),t.map])).values()])lines.push(this.started(map));
  for(const t of items){
   const flag=o!=null&&o.trainer_id===t.trainer.id?{turn:this.turn,defeated:o.defeated}:this.flags.get(t.trainer.id);
   lines.push(`- Still open: ${openText(t)}${flag===undefined?"":` The game last showed ${who(t.trainer)} not defeated (turn ${String(flag.turn)}).`}`);
  }
  for(const map of [...new Map(items.map(t=>[key(t.map),t.map])).values()]){const trip=this.trip(map,now,places);if(trip!==null)lines.push(trip);}
  return lines.join("\n");
 }

 // What the agent did on a map since it came in before its first trainer battle there, with heals elsewhere.
 private started(map:MapId):string {
  const first=this.battles.find(b=>same(b.map,map));
  const label=first?.label ?? key(map);
  const startSeq=first===undefined?0:this.arrivals.findLast(a=>a.seq<=first.seq&&same(a.map,map))?.seq ?? 0;
  const facts:{seq:number;text:string}[]=[];
  let came=false;
  for(const a of this.arrivals){
   if(a.seq<startSeq)continue;
   if(same(a.map,map)){facts.push({seq:a.seq,text:`turn ${String(a.turn)} you ${came?"came back":"came in"}`});came=true;}
   else if(a.from!==null&&same(a.from.map,map)&&!a.carried)facts.push({seq:a.seq,text:`turn ${String(a.turn)} you left with ${a.from.party}`});
  }
  let away=false;
  const visits=this.arrivals.filter(a=>a.seq>=startSeq);
  for(const h of this.heals){
   if(h.seq<startSeq)continue;
   const at=visits.findLast(a=>a.seq<=h.seq);
   away=at!==undefined&&!same(at.map,map);
   if(away)facts.push({seq:h.seq,text:`turn ${String(h.turn)} your party was healed on ${h.label}`});
  }
  for(const b of this.battles){
   if(!same(b.map,map)||b.seq<startSeq)continue;
   const text=b.outcome==="won"?`you beat ${who(b.trainer)}`:b.outcome==="lost"||b.whiteout!==null&&b.outcome!=="drew"?`you lost to ${who(b.trainer)}`:b.outcome==="drew"?`you drew with ${who(b.trainer)}`:`you battled ${who(b.trainer)}`;
   facts.push({seq:b.seq,text:`turn ${String(b.end)} ${text}${b.whiteout===null?"":` and whited out; the game returned you to ${b.whiteout}`}`});
  }
  facts.sort((a,b)=>a.seq-b.seq);
  return `- On ${label}: ${facts.map(f=>f.text).join("; ")}.`;
 }

 private trip(map:MapId,now:Snapshot,places:readonly Place[]|null):string|null {
  const here=now.map_id;
  if(places===null||here===null||same(here,map))return null;
  const walk=lastWalk(this.arrivals,map,places);
  if(walk===undefined||walk.length===0)return null;
  const reach=now.exit_reach;
  const foot=(s:Step)=>reach!==undefined&&(s.exit.kind==="door"?reach.warps.some(w=>s.exit.kind==="door"&&w.x===s.exit.x&&w.y===s.exit.y&&w.reach==="foot"):reach.connections.some(c=>s.exit.kind==="edge"&&c.direction===s.exit.direction&&same(c.destination,s.to)&&c.reach==="foot"));
  const from=walk.findLastIndex(s=>same(s.from,here)&&foot(s));
  const steps=from<0?walk:walk.slice(from);
  const first=steps[0],last=steps.at(-1);
  if(first===undefined||last===undefined)return null;
  const exit=(e:Exit)=>e.kind==="door"?`door at (${String(e.x)},${String(e.y)})`:`${e.direction} edge`;
  const target=labelOf(places,map,key(map));
  return `- Your own last walk to ${target}${from<0?"":", from an exit of this map you can reach on foot now"} (turns ${String(first.turn)}-${String(last.turn)}): ${steps.map(s=>`${s.fromLabel} ${exit(s.exit)}`).join(" -> ")} -> ${target}.`;
 }
}

// The agent's own last walk into a map: the exits it walked through (a door of the map table within two tiles of
// where it last stood, or a map edge) since the game last moved it, with every loop back through the exit it had
// left by taken out. Built from the recorded arrivals each time, so it does not depend on when the table was read.
function lastWalk(arrivals:readonly Arrival[],map:MapId,places:readonly Place[]):readonly Step[]|undefined {
 let path:Step[]=[];let found:readonly Step[]|undefined;
 for(const a of arrivals){
  const exit=a.carried||a.from===null?null:exitOf(places,a.from.map,a.map,a.from.pos);
  if(exit===null||a.from===null){path=[];continue;}
  const left=path.findLastIndex(p=>same(p.from,a.map));
  const back=left<0?undefined:path[left];
  const loop=back!==undefined&&(back.exit.kind==="door"?a.pos!==null&&near(a.pos,back.exit,2):exit.kind==="edge"&&same(back.to,a.from.map));
  if(loop){path=path.slice(0,left);continue;}
  path.push({from:a.from.map,fromLabel:labelOf(places,a.from.map,a.from.label),exit,to:a.map,turn:a.turn,arrival:a.pos});
  if(same(a.map,map))found=[...path];
 }
 return found;
}

function openText(t:TrainerBattle):string {
 const words=t.words.length===0?"":` Before that battle, at turn ${String(t.start)}, the game showed: ${t.words.map(w=>`"${w}"`).join(" ")}`;
 return `${who(t.trainer)} on ${t.label}: you ${t.outcome==="drew"?"drew":"lost"} at turn ${String(t.end)}.${words}`;
}

function labelOf(places:readonly Place[]|null,id:MapId,fallback:string):string {
 const p=places?.find(q=>same(q.map_id,id));
 return p===undefined?fallback:`${p.display} (map ${key(id)})`;
}

function exitOf(places:readonly Place[],from:MapId,to:MapId,pos:Pos|null):Exit|null {
 const p=places.find(q=>same(q.map_id,from));
 if(p===undefined)return null;
 if(pos!==null){
  const doors=p.warps.filter(w=>same(w.to,to)&&near(w,pos,2)).sort((a,b)=>Math.abs(a.x-pos.x)+Math.abs(a.y-pos.y)-(Math.abs(b.x-pos.x)+Math.abs(b.y-pos.y)));
  const door=doors[0];
  if(door!==undefined)return {kind:"door",x:door.x,y:door.y};
 }
 const edge=p.connections.find(c=>EDGES.has(c.direction)&&same(c.to,to));
 return edge===undefined?null:{kind:"edge",direction:edge.direction};
}

export interface ActivityRecorder {
 subscribe(observer:(event:RunEvent)=>void):void;
 unfinishedActivity?(body:ActivityChange):void;
}

const GAME=new Set(["observe","press","navigate_to","battle_action"]);
function stateOf(result:AgentToolResult<unknown>):Snapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return undefined;
 const state:unknown=details.state;
 return typeof state==="object"&&state!==null&&"started" in state?state as Snapshot:undefined;
}

export function withUnfinishedActivity(tools:readonly AgentTool[],features:FeatureSet,recorder:ActivityRecorder,source:PlaceSource):readonly AgentTool[] {
 if(!features["unfinished-activity-v1"])return tools;
 const fold=new UnfinishedActivity(features);
 recorder.subscribe(event=>{fold.observe(event);});
 let table:Promise<readonly Place[]|null>|null=null;
 const places=async():Promise<readonly Place[]|null>=>{
  table??=source.places===undefined?Promise.resolve(null):source.places().then(body=>Value.Check(PlacesBodySchema,body)?body.places:null,()=>null);
  const got=await table;
  if(got===null)table=null;
  return got;
 };
 let sent=0;
 const record=()=>{const all=fold.changes();for(;sent<all.length;sent++){const c=all[sent];if(c!==undefined)recorder.unfinishedActivity?.(c);}};
 const annotate=async<T>(result:AgentToolResult<T>):Promise<AgentToolResult<T>>=>{
  const after=stateOf(result);
  record();
  if(after===undefined)return result;
  const block=fold.block(after,await places());
  return block===null?result:{...result,content:[...result.content,{type:"text",text:block}]};
 };
 return tools.map(tool=>{
  if(!GAME.has(tool.name))return tool;
  const execute:AgentTool["execute"]=async(...args)=>annotate(await tool.execute(...args));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
