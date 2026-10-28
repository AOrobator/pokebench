// gym-readiness-readout-v1: on a gym map, the party's levels next to what this run has already seen of
// the gym: the GYM LEADER's POKéMON and levels from battles, type words said on this map, and the map's
// trainers. Seen-only: nothing comes from the ROM's trainer parties, and nothing advises a choice.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";
import type {RunEvent} from "./events.js";
import {semanticWalk} from "./semantic-targets.js";

// pokeemerald include/constants/trainers.h TRAINER_CLASS_LEADER.
export const LEADER_CLASS=0x20;

export type MapKey=string;
interface Foe {readonly species:string;readonly level:number}
// The parts of recorded events the line reads; a full RunEvent has them.
export type GymEvent=
 |{readonly type:"state";readonly map_id:readonly [number,number]|null;readonly trainer_opponent?:{readonly trainer_id:number;readonly trainer_class:number;readonly name:string|null;readonly battle_active:boolean}|null;readonly battlers:readonly {readonly position:number;readonly party_slot:number|null;readonly species:string|null;readonly level:number|null}[]}
 |{readonly type:"dialogue_auto_advance";readonly pages:readonly {readonly map_id:readonly [number,number]|null;readonly text:string;readonly battle_message_id?:number}[]};

export const key=(map:readonly [number,number]):MapKey=>map.join("/");
const oneLine=(text:string)=>text.replace(/\s*\n\s*/g," ").trim();

export class GymReadiness {
 private readonly leaders=new Map<MapKey,string>();
 // Per map and leader: each party slot the leader sent out, with the species and highest level seen.
 private readonly seen=new Map<MapKey,Map<number,Foe>>();
 private readonly said=new Map<MapKey,string[]>();
 private readonly names=new Map<number,string>();
 observe(event:GymEvent):void {
  if(event.type==="dialogue_auto_advance"){
   for(const page of event.pages){
    if(page.battle_message_id!==undefined||page.map_id===null)continue;
    const text=oneLine(page.text);
    // A page that names a type, in the game's words (the gym guide's advice, a gym trainer's line).
    if(!/\b[A-Z]+-type\b/.test(text))continue;
    const list=this.said.get(key(page.map_id))??[];
    if(!list.includes(text))list.push(text);
    this.said.set(key(page.map_id),list);
   }
   return;
  }
  const opponent=event.trainer_opponent;
  if(opponent==null||!opponent.battle_active||opponent.name===null)return;
  this.names.set(opponent.trainer_id,opponent.name);
  if(opponent.trainer_class!==LEADER_CLASS||event.map_id===null)return;
  const map=key(event.map_id);
  this.leaders.set(map,opponent.name);
  const slots=this.seen.get(map)??new Map<number,Foe>();
  for(const b of event.battlers){
   if(b.position%2!==1||b.party_slot===null||b.species===null||b.level===null)continue;
   const was=slots.get(b.party_slot);
   slots.set(b.party_slot,{species:b.species,level:Math.max(b.level,was?.species===b.species?was.level:0)});
  }
  this.seen.set(map,slots);
 }
 // The block for this observation: on a gym map's field, out of battle, with a started game.
 block(state:GameStateSnapshot):string|null {
  if(!state.started||state.in_battle||state.screen!=="overworld"||state.map_id===null||state.location?.endsWith(" GYM")!==true)return null;
  const map=key(state.map_id);
  const leader=this.leaders.get(map);
  const lines=[`Gym: ${state.location}${leader===undefined?"":` · GYM LEADER ${leader}`}`];
  const party=state.party.filter(p=>p.species!==null&&p.is_egg!==true);
  lines.push(`Your party: ${party.length===0?"none":party.map(p=>`${p.species??""} Lv${String(p.level)} HP ${String(p.hp)}/${String(p.max_hp)}`).join(", ")}`);
  lines.push(this.seenLine(map));
  const said=this.saidOn(map);
  if(said.length>0)lines.push(`Said on this map: ${said.map(text=>`"${text}"`).join(" ")}`);
  const trainers=state.heal_before_trainers?.trainers;
  if(trainers!=null&&trainers.length>0){
   // The trainer flag is set only by a win; a battle this run that left it clear was a loss.
   const status=(t:{trainer_id:number;defeated:boolean})=>t.defeated?"beaten":this.names.has(t.trainer_id)?"battled, not beaten":"not beaten";
   lines.push(`${state.map_visibility==null?"Trainers on this map":"Trainers currently visible"}: ${trainers.map(t=>`${this.names.get(t.trainer_id)??t.sprite_kind??"a trainer"} at (${String(t.x)},${String(t.y)}) (${status(t)})`).join(", ")}`);
  }
  return lines.join("\n");
 }
 // The GYM LEADER's POKéMON seen on this map, with the highest level seen of each party slot.
 seenLine(map:MapKey):string {
  const leader=this.leaders.get(map);
  const slots=[...(this.seen.get(map)?.values()??[])];
  const counts=new Map<string,number>();
  for(const foe of slots){const label=`${foe.species} Lv${String(foe.level)}`;counts.set(label,(counts.get(label)??0)+1);}
  const seen=[...counts].map(([label,n])=>n===1?label:`${label} ×${String(n)}`).join(", ");
  return `${leader===undefined?"The GYM LEADER":leader}'s POKéMON seen in battle this run: ${seen===""?"none yet":`${seen}; any others not seen yet`}`;
 }
 // Field pages printed on this map that name a type, in the game's words, once each.
 saidOn(map:MapKey):readonly string[] {return this.said.get(map)??[];}
 isLeaderMap(map:MapKey):boolean {return this.leaders.has(map);}
 // The readout with the block after its Location/Position lines.
 annotate(text:string,state:GameStateSnapshot):string {
  const anchor=/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return text;
  const block=this.block(state);
  if(block===null)return text;
  const end=anchor.index+anchor[0].length;
  return `${text.slice(0,end)}\n${block}${text.slice(end)}`;
 }
}

// A recorded event as the line reads it.
export function gymEvent(event:RunEvent):GymEvent|null {
 if(event.type==="dialogue_auto_advance")return {type:"dialogue_auto_advance",pages:event.pages.map(p=>({map_id:p.map_id,text:p.text,...(p.battle_message_id===undefined?{}:{battle_message_id:p.battle_message_id})}))};
 if(event.type==="state"&&"started" in event)return {type:"state",map_id:event.map_id,trainer_opponent:event.trainer_opponent??null,battlers:(event.battle?.battlers??[]).map(b=>({position:b.position,party_slot:b.party_slot,species:b.species,level:b.level}))};
 return null;
}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export function withGymReadiness(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool[] {
 if(!features["gym-readiness-readout-v1"])return [...tools];
 const gym=new GymReadiness();recorder.subscribe(event=>{const e=gymEvent(event);if(e!==null)gym.observe(e);});
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const content=[...result.content];content[index]={...part,text:gym.annotate(part.text,state)};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update)),executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}

// RustboroCity_Gym_EventScript_RoxanneDefeated sets completion separately from the gym trainers.
export class GymProgress {
 private gymKnown=false;
 private leaderKnown=false;
 observe(event:RunEvent):void {
  if(event.type!=="tool_result"||event.is_error)return;
  if(/^(?:Location: RUSTBORO CITY GYM\b|Story: [^\n]*Rustboro Gym\b|Sign text "RUSTBORO CITY POKéMON GYM\b)/m.test(event.text))this.gymKnown=true;
  const present=event.text.split("\n").filter(line=>line.startsWith("Story characters")).map(line=>line.split(". Not on this map:")[0]??"").join("\n");
  if(/\bROXANNE\b/.test(present)||/^(?:Sign text "RUSTBORO CITY POKéMON GYM \| LEADER: ROXANNE\b|- map 11\/3 object \d+: sprite ROXANNE\b)/m.test(event.text))this.leaderKnown=true;
 }
 block(state:GameStateSnapshot):string|null {
  if(!state.started||!this.gymKnown)return null;
  const complete=state.story?.rustboro_gym_complete;
  const defeated=state.story?.roxanne_defeated;
  const gym=complete===true?"complete":complete===false?"incomplete":"completion unknown";
  const leader=defeated===true?"defeated":defeated===false?"not defeated":"defeat state unknown";
  return `Gym progress (game memory): RUSTBORO CITY GYM ${gym}${this.leaderKnown?`; ROXANNE ${leader}`:""}.`;
 }
}

export function withGymProgress(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool[] {
 if(!features["gym-evidence-v1"])return [...tools];
 const progress=new GymProgress();recorder.subscribe(event=>{progress.observe(event);});
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  const line=progress.block(state);
  if(line===null)return result;
  const content=[...result.content];
  const index=content.findIndex(p=>p.type==="text");
  const part=content[index];
  if(part?.type==="text")content[index]={...part,text:`${line}\n${part.text}`};else content.unshift({type:"text",text:line});
  return {...result,content};
 };
 return tools.map(tool=>{
  if(!["observe","press","navigate_to","battle_action"].includes(tool.name)&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  return {...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))} satisfies CheckedPressTool;
 });
}
