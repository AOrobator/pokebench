// story-battle-heal-gate-v1: while a party Pokémon (not an egg) is below its max HP, an action that would start a trainer
// battle the player cannot run from is not started. Covered: the Route 103 rival (Route103_EventScript_Rival runs
// trainerbattle_no_intro after lockall; FLAG_DEFEATED_RIVAL_ROUTE103 clear), and on a map whose game name contains GYM
// every trainer the game server lists in heal_before_trainers (a trainerbattle script, its trainer flag clear), the Gym
// Leader among them (RustboroCity_Gym_EventScript_Roxanne, trainerbattle_single TRAINER_ROXANNE_1). Reached by
// navigate_to_target on the opponent, a press of A facing it, navigate_to ending next to it facing it, or (GYM maps) a
// navigate_to route an unbeaten trainer can see (trainer_see.c CheckTrainer, the game server's /pokebench/trainer-sight).
// A battle the game already started, a script holding the field controls (a trainer who has spotted the player locks
// them as it walks over) or anything but the free field is never gated. confirm: true proceeds normally. The game's
// words: sText_NoRunningFromTrainers (src/battle_message.c). Each checked call is one story_battle_heal_gate event.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type TObject} from "typebox";
import {AUTO_TALK_ID_PREFIX} from "./auto-talk.js";
import type {GameStateSnapshot} from "./game-state.js";
import {bagItems,blackout,healPlaceDescription,hurt,onGymMap,onMap,storyName,type HealPlace,type StoryBattleWarningFacts} from "./low-hp-trainer-warning.js";
import type {Place} from "./story-destinations.js";
import {storyPronoun} from "./heal-first.js";
import {NO_RUNNING,seenTrainers,trainerLine,type SightSeen,type TrainerSightReply} from "./trainer-sight.js";

type Point={readonly x:number;readonly y:number};
type Map2=readonly [number,number];
export const GATE_CONFIRM="confirm";
export const GATE_CONFIRM_DESCRIPTION="Only after this tool said it did not start because it would start a trainer battle you cannot run from while your party is not at full HP: true starts it anyway.";
export const GATE_TOOL_SENTENCE="If it would start a trainer battle you cannot run from while a party Pokémon is below its max HP, it does not start and says so; call it again with confirm: true to start it anyway.";
export const GATE_STATUS="not started: it would start a trainer battle you cannot run from while your party is not at full HP";

// A call the harness makes for itself through the play tools (auto-talk), not the model: never gated.
export const harnessCall=(id:string):boolean=>id.startsWith(AUTO_TALK_ID_PREFIX);

export type GateTool="navigate_to"|"navigate_to_target"|"press";
export type GateOutcome="refused"|"confirmed"|"clear"|"unavailable";
export interface GateOpponent {
 readonly kind:"rival"|"gym_leader"|"gym_trainer";readonly name:string|null;readonly local_id:number;
 readonly sprite_kind:string|null;readonly x:number;readonly y:number;readonly loaded:boolean;
}
// A covered opponent this call would reach: by talking to it (navigate_to_target, A) or by ending next to it facing it.
export interface GateReach extends GateOpponent {readonly via:"talk"|"approach";readonly tile:Point}
export interface GateDecision {
 readonly tool_call_id:string;readonly tool:GateTool;readonly map_id:Map2;readonly confirmed:boolean;
 readonly outcome:GateOutcome;readonly reason:string|null;
 readonly reached:readonly GateReach[];readonly sightings:readonly SightSeen[];
 readonly hurt:StoryBattleWarningFacts["party"];
 readonly heal:readonly {readonly kind:HealPlace["kind"];readonly town:string;readonly map_id:Map2;readonly hops:number;readonly shown:boolean}[];
 readonly text:string|null;
}
export interface Engaged {readonly map_id:Map2;readonly gym:boolean;readonly opponents:readonly GateOpponent[];readonly hurt:StoryBattleWarningFacts["party"]}
export interface GatePorts {
 readonly places:()=>Promise<readonly Place[]|null>;
 readonly heal:(state:GameStateSnapshot)=>Promise<readonly HealPlace[]>;
 readonly check:(mapId:Map2,tiles:readonly Point[],signal?:AbortSignal)=>Promise<TrainerSightReply>;
 readonly record:(decision:GateDecision)=>void;
}
// What the game server answered for a route's sight: the trainers that can see it, or why it could not say.
export type SightAnswer={readonly seen:readonly SightSeen[]}|{readonly reason:string};
export interface RouteVerdict {readonly outcome:GateOutcome;readonly text:string|null}

// MAP_ROUTE103 (group 0, number 18); the rival's sprites OBJ_EVENT_GFX_RIVAL_MAY_* and RIVAL_BRENDAN_*.
const ROUTE103:Map2=[0,18];
const rivalName=(sprite:string|null):"MAY"|"BRENDAN"|null=>sprite?.startsWith("RIVAL_MAY_")===true?"MAY":sprite?.startsWith("RIVAL_BRENDAN_")===true?"BRENDAN":null;
const at=(p:Point):string=>`(${String(p.x)},${String(p.y)})`;
const same=(a:Point,b:Point):boolean=>a.x===b.x&&a.y===b.y;
const STEP:Readonly<Record<string,readonly [number,number,string]>>={UP:[0,-1,"up"],DOWN:[0,1,"down"],LEFT:[-1,0,"left"],RIGHT:[1,0,"right"]};
const FACING:Readonly<Record<string,readonly [number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};

const pronoun=(o:GateOpponent):string=>storyPronoun(o.name)?.object??"it";
function who(o:GateOpponent):string {
 const tile=`at ${at(o)}${o.loaded?"":", not loaded now: the tile the map places it on"}`;
 if(o.kind==="rival")return `your rival ${o.name??"unknown"} (object ${String(o.local_id)}, ${tile})`;
 const sprite=`object ${String(o.local_id)}, sprite ${o.sprite_kind??"unknown"}, ${tile}`;
 return o.kind==="gym_leader"?`the Gym Leader ${o.name??"unknown"} (${sprite})`:`a trainer you have not beaten (${sprite})`;
}

export function engagedAt(state:GameStateSnapshot,places:readonly Place[]|null):Engaged|null {
 if(!state.started||state.screen!=="overworld"||state.in_battle)return null;
 // The free field only: a trainer who has spotted the player, or any script, holds the controls; never gate those.
 if(state.field_controls_locked!==false||state.party_owner!=="player"||state.map_id===null)return null;
 if(state.party.some(m=>m.is_egg!==true&&(m.species===null||m.hp==null||m.max_hp==null)))return null;
 const below=hurt(state);
 if(below.length===0)return null;
 const map:Map2=[state.map_id[0],state.map_id[1]];
 const opponents:GateOpponent[]=[];
 if(onMap(map,ROUTE103)&&state.story?.rival_battle_won===false){
  for(const o of state.world_context?.objects??[]){
   const name=onMap(o.map_id,ROUTE103)?rivalName(o.sprite_kind):null;
   if(name!==null)opponents.push({kind:"rival",name,local_id:o.local_id,sprite_kind:o.sprite_kind,x:o.x,y:o.y,loaded:true});
  }
 }
 const gym=onGymMap(state,places);
 if(gym){
  for(const t of state.heal_before_trainers?.trainers??[]){
   if(t.defeated)continue;
   const name=storyName(state,t.sprite_kind);
   opponents.push({kind:name===null?"gym_trainer":"gym_leader",name,local_id:t.local_id,sprite_kind:t.sprite_kind,x:t.x,y:t.y,loaded:t.loaded!==false});
  }
 }
 return opponents.length===0?null:{map_id:map,gym,opponents,hurt:below};
}

// The press's first A, after leading direction buttons that each only turn the player toward an adjacent opponent the
// game has loaded (a person blocks the step, so the press turns the player without moving), faces that opponent.
export function pressReaches(state:GameStateSnapshot,buttons:readonly string[],opponents:readonly GateOpponent[]):GateReach|null {
 const p=state.position;
 if(p===null)return null;
 const loadedAt=(t:Point):GateOpponent|undefined=>opponents.find(o=>o.loaded&&same(o,t));
 let facing=state.facing;
 for(const b of buttons){
  if(b==="A"){
   const d=facing===null?undefined:FACING[facing];
   const o=d===undefined?undefined:loadedAt({x:p.x+d[0],y:p.y+d[1]});
   return o===undefined?null:{...o,via:"talk",tile:{x:p.x,y:p.y}};
  }
  const step=STEP[b];
  if(step===undefined||loadedAt({x:p.x+step[0],y:p.y+step[1]})===undefined)return null;
  facing=step[2];
 }
 return null;
}

// A planned route reaches an opponent when it runs into the opponent's tile (a template the game has not loaded; the
// walk stops on the tile before it, facing it) or its last step ends next to one, facing it.
export function routeReaches(origin:Point,path:readonly string[],tiles:readonly Point[],opponents:readonly GateOpponent[]):GateReach|null {
 for(let i=0;i<tiles.length;i++){
  const tile=tiles[i] as Point;
  const o=opponents.find(x=>same(x,tile));
  if(o!==undefined){const before=i===0?origin:tiles[i-1] as Point;return {...o,via:"approach",tile:{x:before.x,y:before.y}};}
 }
 const last=tiles.at(-1),step=STEP[path.at(-1)??""];
 if(last===undefined||step===undefined)return null;
 const o=opponents.find(x=>x.x===last.x+step[0]&&x.y===last.y+step[1]);
 return o===undefined?null:{...o,via:"approach",tile:{x:last.x,y:last.y}};
}

export interface GateFacts {
 readonly tool:GateTool;readonly reached:GateReach|null;readonly sightings:readonly SightSeen[];readonly steps:number;
 readonly opponents:readonly GateOpponent[];readonly map_id:Map2;readonly hurt:StoryBattleWarningFacts["party"];
 readonly money:number|null;readonly items:StoryBattleWarningFacts["items"];readonly heal:readonly HealPlace[];readonly mom_heals:boolean;
}
export function gateText(f:GateFacts):string {
 const party=f.hurt.map(p=>`${p.species} ${String(p.hp)}/${String(p.max_hp)}`).join(", ");
 const r=f.reached;
 const lead=f.tool==="navigate_to"||r===null?"this walk would start a trainer battle":f.tool==="press"?`this press of A talks to ${who(r)} and starts a trainer battle`:`talking to ${who(r)} starts a trainer battle`;
 const lines:string[]=[`Battle not started: ${lead}, and your party is not at full HP: ${party}.`];
 if(f.tool==="navigate_to"&&r!==null){const it=pronoun(r);lines.push(`- ${who(r)}: the walk would end at ${at(r.tile)}, next to ${it} and facing ${it}; talking to ${it} there starts the battle.`);}
 for(const s of f.sightings){
  const o=f.opponents.find(x=>x.local_id===s.local_id&&x.kind==="gym_leader");
  const line=trainerLine(s,f.steps);
  lines.push(o===undefined?line:`- the Gym Leader ${o.name??"unknown"}, ${line.slice(2)}`);
 }
 const bag=f.items.length===0?"":` Your BAG has ${f.items.map(i=>`${i.name} ×${String(i.quantity)}`).join(" and ")}; using one restores HP.`;
 lines.push(`${f.sightings.length===0?"":"A trainer who sees you walks up to you and starts a battle. "}${NO_RUNNING} ${blackout(f.money)}${bag}`);
 if(f.heal.length===0)lines.push(`Heal before you battle: the nurse at a POKéMON CENTER heals your whole party${f.mom_heals?", and so does MOM at home":""}.`);
 else lines.push("Places you know of that heal your party, nearest first:",...f.heal.map(h=>`- ${healPlaceDescription(h,f.map_id)}`));
 lines.push(f.tool==="press"?`To press anyway, call press again with the same buttons and ${GATE_CONFIRM}: true.`:f.tool==="navigate_to_target"?`To talk anyway, call navigate_to_target again with the same map_id and target and ${GATE_CONFIRM}: true.`:`To walk anyway, call navigate_to again with the same x, y and map_id and ${GATE_CONFIRM}: true.`);
 return lines.join("\n");
}

export class StoryBattleHealGate {
 constructor(private readonly ports:GatePorts){}
 async engaged(state:GameStateSnapshot):Promise<Engaged|null> {return engagedAt(state,await this.ports.places());}
 get check():GatePorts["check"] {return this.ports.check;}
 // One decision: the text when refused, recorded with what it found.
 private async decide(id:string,tool:GateTool,state:GameStateSnapshot,engaged:Engaged,confirmed:boolean,reached:GateReach|null,sightings:readonly SightSeen[],steps:number,triggered:boolean,reason:string|null):Promise<RouteVerdict> {
  const outcome:GateOutcome=triggered?confirmed?"confirmed":"refused":reason===null?"clear":"unavailable";
  const heal=triggered?await this.ports.heal(state):[];
  const text=outcome==="refused"?gateText({tool,reached,sightings,steps,opponents:engaged.opponents,map_id:engaged.map_id,hurt:engaged.hurt,money:state.money,items:bagItems(state,engaged.hurt),heal,mom_heals:state.heal_before_trainers?.mom_heals===true}):null;
  this.ports.record({tool_call_id:id,tool,map_id:engaged.map_id,confirmed,outcome,reason,reached:reached===null?[]:[reached],sightings,hurt:engaged.hurt,heal:heal.map(h=>({kind:h.kind,town:h.town,map_id:[h.map_id[0],h.map_id[1]],hops:h.hops,shown:h.shown!==undefined})),text});
  return {outcome,text};
 }
 // navigate_to_target on an object of the current map.
 async target(id:string,mapId:Map2,localId:number,confirmed:boolean,state:GameStateSnapshot):Promise<string|null> {
  if(!onMap(state.map_id,mapId))return null;
  const engaged=await this.engaged(state);
  if(engaged===null)return null;
  const o=engaged.opponents.find(x=>x.local_id===localId);
  const reached:GateReach|null=o===undefined||state.position===null?null:{...o,via:"talk",tile:{x:state.position.x,y:state.position.y}};
  return (await this.decide(id,"navigate_to_target",state,engaged,confirmed,reached,[],0,reached!==null,null)).text;
 }
 // A press with A.
 async press(id:string,buttons:readonly string[],confirmed:boolean,state:GameStateSnapshot):Promise<string|null> {
  const engaged=await this.engaged(state);
  if(engaged===null)return null;
  const reached=pressReaches(state,buttons,engaged.opponents);
  return (await this.decide(id,"press",state,engaged,confirmed,reached,[],0,reached!==null,null)).text;
 }
 // navigate_to's first planned route. listAll: trainer-sight-check-v1 is on, so every sighting is listed (and confirmed by
 // confirm: true); otherwise only a GYM map's sightings count.
 async route(id:string,state:GameStateSnapshot,engaged:Engaged,confirmed:boolean,origin:Point,path:readonly string[],tiles:readonly Point[],sight:SightAnswer|null,listAll:boolean):Promise<RouteVerdict> {
  const reached=routeReaches(origin,path,tiles,engaged.opponents);
  const seen="seen" in (sight??{})?(sight as {seen:readonly SightSeen[]}).seen:[];
  const reason=sight!==null&&"reason" in sight?sight.reason:null;
  const triggered=reached!==null||engaged.gym&&seen.length>0;
  const listed=triggered&&(listAll||engaged.gym)?seen:[];
  return this.decide(id,"navigate_to",state,engaged,confirmed,reached,listed,tiles.length,triggered,triggered?null:reason);
 }
}

// The sight the game server reports for a route, as trainer-sight-check-v1 reads it.
export async function askSight(check:GatePorts["check"],state:GameStateSnapshot,map:Map2,tiles:readonly Point[],signal?:AbortSignal):Promise<SightAnswer> {
 try {
  const reply=await check(map,tiles,signal);
  if(!reply.available)return {reason:reply.reason};
  if(reply.map_id[0]!==map[0]||reply.map_id[1]!==map[1])return {reason:`the check read map ${String(reply.map_id[0])}/${String(reply.map_id[1])}`};
  return {seen:seenTrainers(reply,state)};
 } catch(error){
  signal?.throwIfAborted();
  const said=error instanceof Error?error.message:String(error);
  return {reason:said===""?"the trainer sight request failed with no message":said};
 }
}

const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
function withConfirm(parameters:AgentTool["parameters"]):AgentTool["parameters"] {
 const base=parameters as TObject;
 // The base schema's own strictness is kept: only the confirm property is added.
 return Type.Object({...base.properties,[GATE_CONFIRM]:Type.Optional(Type.Boolean({description:GATE_CONFIRM_DESCRIPTION}))},(base as {additionalProperties?:unknown}).additionalProperties===false?{additionalProperties:false}:{});
}
function refusal(first:string,text:string,observed:AgentToolResult<unknown>,details?:Record<string,unknown>):AgentToolResult<unknown> {
 const base=isRecord(observed.details)?observed.details:{};
 return {content:[{type:"text",text:first},{type:"text",text},...observed.content],details:{...base,...details}};
}

// press and navigate_to_target as the model calls them: confirm is taken off, the state read and the gate asked first.
// A refused call sends no input and returns the gate's text with a fresh observation.
export function withStoryBattleHealGate(tools:readonly AgentTool[],gate:StoryBattleHealGate|undefined,source:{read(signal?:AbortSignal):Promise<GameStateSnapshot>}):AgentTool[] {
 if(gate===undefined)return [...tools];
 const observe=tools.find(t=>t.name==="observe");
 if(observe===undefined)throw new Error("story-battle-heal-gate-v1 needs the observe tool");
 return tools.map(tool=>{
  if(tool.name!=="press"&&tool.name!=="navigate_to_target")return tool;
  const execute=async(id:string,params:unknown,signal?:AbortSignal,update?:Parameters<AgentTool["execute"]>[3]):Promise<AgentToolResult<unknown>>=>{
   if(!isRecord(params))return tool.execute(id,params,signal,update);
   const {[GATE_CONFIRM]:confirm,...rest}=params;
   if(harnessCall(id))return tool.execute(id,rest,signal,update);
   const confirmed=confirm===true;
   let text:string|null=null;
   if(tool.name==="press"){
    const buttons=Array.isArray(rest.buttons)?rest.buttons.filter((b):b is string=>typeof b==="string"):[];
    if(buttons.includes("A"))text=await gate.press(id,buttons,confirmed,await source.read(signal));
    if(text!==null)return refusal(`Press: not sent: ${GATE_STATUS.slice("not started: ".length)}; no buttons were pressed.`,text,await observe.execute(id,{},signal));
   }else{
    const target=rest.target,map=rest.map_id;
    if(isRecord(target)&&target.kind==="object"&&typeof target.local_id==="number"&&Array.isArray(map)&&typeof map[0]==="number"&&typeof map[1]==="number"){
     text=await gate.target(id,[map[0],map[1]],target.local_id,confirmed,await source.read(signal));
     if(text!==null){
      const selected=`map object ${String(target.local_id)}`;
      return refusal(`Semantic navigation: ${GATE_STATUS}. Selected ${selected}.`,text,await observe.execute(id,{},signal),{semantic_navigation:{status:GATE_STATUS,selected,activation_attempted:false,target:{kind:"object",local_id:target.local_id}}});
     }
    }
   }
   return tool.execute(id,rest,signal,update);
  };
  return {...tool,description:`${tool.description} ${GATE_TOOL_SENTENCE}`,parameters:withConfirm(tool.parameters),execute} as AgentTool;
 });
}
