// story-battle-heal-first-v1: the first line of a game-tool result, while an unbeaten story battle that cannot be run
// from is on the current map and a party Pokémon (not an egg) is below its max HP on the free field. Probe
// story-battle-heal-first-20261020 (97a0 turn 157, 16 per arm) put it right under the result's first line: walking to MAY
// fell from 13/16 to 4/16 and heading south rose from 0 to 11. The words, in order: each hurt Pokémon's HP; that the
// battle cannot be run from, so heal first; the latest field page the model was delivered that names a POKéMON CENTER
// (or MOM's heal line), quoted whole with who said it and where; and the exit of this map, in the game's map table,
// that leads to that place. Nothing heard: the first two only.
// Story battles (low-hp-trainer-warning-v2's set, read here on their own): the Route 103 rival (Route103_EventScript_Rival,
// trainerbattle_no_intro; FLAG_DEFEATED_RIVAL_ROUTE103 clear; the object FLAG_HIDE_ROUTE_103_RIVAL shows, loaded or
// placed here by the readout's own Story characters line), ROXANNE (RustboroCity_Gym_EventScript_Roxanne,
// trainerbattle_single TRAINER_ROXANNE_1; her flag clear; her map object has no hide flag) and the Petalburg Woods
// TEAM AQUA grunt (TRAINER_GRUNT_PETALBURG_WOODS, started by coord events; his flag clear).
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {TRUST_HEADER} from "./harness-trust.js";
import {NO_SPEAKER,field,linesOf,type Line} from "./instruction-ledger-v2.js";
import {hurt,onMap,placesOnce,type StoryBattleWarningFacts} from "./low-hp-trainer-warning.js";
import {storyCharacters} from "./people-ledger.js";
import type {Place,PlaceSource} from "./story-destinations.js";

type Map2=readonly [number,number];
type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];

// Each opponent's trainer gender, from pokeemerald src/data/trainers.h: TRAINER_MAY_ROUTE_103_* and TRAINER_ROXANNE_1
// carry F_TRAINER_FEMALE; TRAINER_BRENDAN_ROUTE_103_* and TRAINER_GRUNT_PETALBURG_WOODS do not. Which rival stands on
// Route 103 is the game's own choice by the player's gender (Common_EventScript_SetupRivalGfxId: checkplayergender sets
// VAR_OBJ_GFX_ID_0 to RIVAL_MAY_NORMAL for a male player, RIVAL_BRENDAN_NORMAL for a female one), read from the rival's
// sprite or the readout's Story characters line. story-battle-heal-gate-v1 takes its pronouns from here too.
export interface Pronoun {readonly object:"him"|"her";readonly subject:"he"|"she"}
const HER:Pronoun={object:"her",subject:"she"},HIM:Pronoun={object:"him",subject:"he"};
const TRAINER_GENDER:Readonly<Record<string,Pronoun>>={MAY:HER,BRENDAN:HIM,ROXANNE:HER,"TEAM AQUA grunt":HIM};
export function storyPronoun(name:string|null):Pronoun|null {return name===null?null:TRAINER_GENDER[name]??null;}

const ROUTE103:Map2=[0,18],WOODS:Map2=[24,11],RUSTBORO_GYM:Map2=[11,3];
const rivalOf=(sprite:string|null):"MAY"|"BRENDAN"|null=>sprite?.startsWith("RIVAL_MAY_")===true?"MAY":sprite?.startsWith("RIVAL_BRENDAN_")===true?"BRENDAN":null;
export type HealFirstKind="rival"|"gym_leader"|"aqua_grunt";
interface Battle {readonly kind:HealFirstKind;readonly opponent:string}

// The unbeaten story battle on the current map, from the state's flags and objects and the readout's own lines.
export function storyBattle(state:GameStateSnapshot,readout:string):Battle|null {
 if(onMap(state.map_id,ROUTE103)&&state.story?.rival_battle_won===false){
  const loaded=(state.world_context?.objects??[]).flatMap(o=>{const name=onMap(o.map_id,ROUTE103)?rivalOf(o.sprite_kind):null;return name===null?[]:[name];})[0];
  const placed=(storyCharacters(readout)??[]).map(c=>c.name).find(n=>n==="MAY"||n==="BRENDAN");
  const opponent=loaded??placed;
  return opponent===undefined?null:{kind:"rival",opponent};
 }
 if(onMap(state.map_id,RUSTBORO_GYM)&&state.story?.roxanne_defeated===false)return {kind:"gym_leader",opponent:"ROXANNE"};
 if(onMap(state.map_id,WOODS)&&state.story?.petalburg_woods_aqua_grunt_defeated===false)return {kind:"aqua_grunt",opponent:"TEAM AQUA grunt"};
 return null;
}

// A field page the model was delivered, with who said it and where.
export interface HeardLine {
 readonly turn:number;readonly speaker:string;readonly person:boolean;
 readonly place:string|null;readonly map_id:Map2|null;readonly text:string;
}
// The exit of the current map that leads to the place the heard line names.
export type Edge="NORTH"|"SOUTH"|"EAST"|"WEST";
export interface HealExit {readonly to:string;readonly map_id:Map2;readonly direction:Edge|null;readonly tiles:readonly {readonly x:number;readonly y:number}[]}
export interface HealFirstFacts {
 readonly kind:HealFirstKind;readonly opponent:string;readonly pronoun:Pronoun;readonly map_id:Map2;
 readonly party:StoryBattleWarningFacts["party"];readonly heard:HeardLine|null;readonly exit:HealExit|null;
}

// pokeemerald PlayersHouse_1F_Text_YouShouldRestABit, the page MOM says as she heals the party (MomHealsParty).
const MOM_HEALS="I think you should rest a bit.";
const keyOf=(id:readonly number[]):string=>`${String(id[0])}/${String(id[1])}`;
const CENTER=" POKEMON CENTER 1F";
const namesCenter=(text:string):boolean=>text.toUpperCase().replace(/É/g,"E").includes("POKEMON CENTER");
const healLine=(line:Line):boolean=>namesCenter(line.text)||line.person&&line.who==="MOM"&&line.text===MOM_HEALS;
const heardOf=(line:Line):HeardLine=>({turn:line.turn,speaker:line.who,person:line.person,place:line.page.map_display??line.page.map,map_id:line.page.map_id===null?null:[line.page.map_id[0],line.page.map_id[1]],text:line.text});

// Words as map names are compared: capitals, é as E, no periods or apostrophes, "ROUTE 101" as ROUTE101.
const tokens=(s:string):string[]=>s.toUpperCase().replace(/É/g,"E").replace(/[.'’]/g,"").replace(/\bROUTE (\d+)/g,"ROUTE$1").split(/[^A-Z0-9]+/).filter(w=>w!=="");
const contains=(hay:readonly string[],needle:readonly string[]):boolean=>needle.length>0&&hay.some((_,i)=>needle.every((w,j)=>hay[i+j]===w));
// The map the words name: the longest map-table name in them.
function namedPlace(text:string,places:readonly Place[]):Place|null {
 const words=tokens(text);
 let best:Place|null=null,size=0;
 for(const p of places){const name=tokens(p.name);if(name.length>size&&contains(words,name)){best=p;size=name.length;}}
 return best;
}
// The town a building stands in: the map its warps lead to whose name begins the building's name.
const townOf=(building:Place,byKey:ReadonlyMap<string,Place>):Place|null=>building.warps.map(w=>byKey.get(keyOf(w.to))).find(p=>p!==undefined&&building.name.startsWith(`${p.name} `))??null;

// The maps a heard line points at, most specific first: a town it names (its POKéMON CENTER, then the town), else the
// POKéMON CENTER or MOM's house it was heard in (that map, then its town).
function targetsOf(heard:HeardLine,places:readonly Place[]):Place[] {
 const byKey=new Map(places.map(p=>[keyOf(p.map_id),p]));
 const named=namedPlace(heard.text,places);
 if(named!==null)return [places.find(p=>p.name===`${named.name}${CENTER}`),named].filter((p):p is Place=>p!==undefined);
 const where=heard.map_id===null?undefined:byKey.get(keyOf(heard.map_id));
 if(where===undefined||!(where.name.endsWith(CENTER)||heard.speaker==="MOM"&&heard.text===MOM_HEALS))return [];
 const town=townOf(where,byKey);
 return town===null?[where]:[where,town];
}

const isEdge=(d:string):d is Edge=>d==="NORTH"||d==="SOUTH"||d==="EAST"||d==="WEST";
// The first of those maps an exit of the current map leads to: a walking connection (its edge) or warps (their tiles).
export function healExit(here:Map2,heard:HeardLine,places:readonly Place[]):HealExit|null {
 const map=places.find(p=>onMap(p.map_id,here));
 if(map===undefined)return null;
 for(const target of targetsOf(heard,places)){
  if(onMap(target.map_id,here))return null;
  const to:Map2=[target.map_id[0],target.map_id[1]];
  for(const c of map.connections)if(onMap(c.to,to)&&isEdge(c.direction))return {to:target.display,map_id:to,direction:c.direction,tiles:[]};
  const tiles=map.warps.filter(w=>onMap(w.to,to)).map(w=>({x:w.x,y:w.y}));
  if(tiles.length>0)return {to:target.display,map_id:to,direction:null,tiles};
 }
 return null;
}

const at=(p:{readonly x:number;readonly y:number}):string=>`(${String(p.x)},${String(p.y)})`;
const capital=(s:string):string=>`${s.charAt(0).toUpperCase()}${s.slice(1)}`;
function told(h:HeardLine):string {
 const where=h.place===null?"":` ${/^ROUTE/.test(h.place)?"on":"in"} ${h.place}`;
 const quote=`"${h.text}"`;
 if(h.speaker===NO_SPEAKER)return h.place===null?`With no speaker shown, you were told: ${quote}`:`${capital(where.trim())}, with no speaker shown, you were told: ${quote}`;
 if(!h.person)return `${capital(h.speaker)}${where} read: ${quote}`;
 const sprite=/^the (.+) you talked to$/.exec(h.speaker)?.[1];
 const who=sprite===undefined?h.speaker:`${/^[aeiou]/i.test(sprite)?"An":"A"} ${sprite}`;
 return `${who}${where} told you: ${quote}`;
}

// The one shared wording: this line, and the lead of story-battle-heal-gate-v1's refusal (it passes through the same wrapper).
export function healFirstText(f:HealFirstFacts):string {
 const parts=[f.party.map(p=>`${p.species} has ${String(p.hp)}/${String(p.max_hp)} HP.`).join(" ")];
 parts.push(f.kind==="aqua_grunt"?`The ${f.opponent}'s battle cannot be run from, so heal before ${f.pronoun.subject} stops you on the forest path.`:`${f.opponent}'s battle cannot be run from, so heal before talking to ${f.pronoun.object}.`);
 if(f.heard!==null)parts.push(told(f.heard));
 const e=f.exit;
 if(e!==null)parts.push(e.direction!==null?`${e.to} is the ${e.direction} edge of this map.`:`${e.to} is the warp at ${e.tiles.map(at).join(" or ")} of this map.`);
 return parts.join(" ");
}

// Remembers the latest delivered field page that names a POKéMON CENTER or is MOM's heal line. Delivered: its call's
// result came back without an error (dialogue-auto-advance-v1's pages, recorded before that result).
export class HealFirst {
 private readonly pending=new Map<string,{readonly turn:number;readonly pages:readonly Page[]}>();
 private readonly names=new Map<string,string>();
 private latest:HeardLine|null=null;
 constructor(private readonly places:()=>Promise<readonly Place[]|null>){}
 observe(event:RunEvent):void {
  if(event.type==="dialogue_auto_advance"){
   this.pending.set(event.tool_call_id,{turn:event.turn,pages:field(event.pages)});
   if(this.pending.size>16)this.pending.delete(this.pending.keys().next().value??"");
   return;
  }
  if(event.type!=="tool_result")return;
  const call=this.pending.get(event.id);this.pending.delete(event.id);
  if(call===undefined||event.is_error)return;
  const found=linesOf(call.turn,call.pages,this.names).findLast(healLine);
  if(found!==undefined)this.latest=heardOf(found);
 }
 // The facts for a result's own state and text; this call's own pages count as heard, being delivered with it.
 async facts(state:GameStateSnapshot,readout:string,callId:string):Promise<HealFirstFacts|null> {
  if(!state.started||state.screen!=="overworld"||state.in_battle)return null;
  if(state.field_controls_locked!==false||state.party_owner!=="player"||state.map_id===null)return null;
  if(state.party.some(m=>m.is_egg!==true&&(m.species===null||m.hp==null||m.max_hp==null)))return null;
  const party=hurt(state);
  if(party.length===0)return null;
  const battle=storyBattle(state,readout);
  const pronoun=storyPronoun(battle?.opponent??null);
  if(battle===null||pronoun===null)return null;
  const call=this.pending.get(callId);
  const own=call===undefined?undefined:linesOf(call.turn,call.pages,new Map(this.names)).findLast(healLine);
  const heard=own===undefined?this.latest:heardOf(own);
  const map:Map2=[state.map_id[0],state.map_id[1]];
  const places=heard===null?null:await this.places();
  return {kind:battle.kind,opponent:battle.opponent,pronoun,map_id:map,party,heard,exit:heard===null||places===null?null:healExit(map,heard,places)};
 }
}

// The line first: right under harness-trust-v1's header when the result starts with it, else the result's first line.
export function leadWith<T>(result:AgentToolResult<T>,line:string):AgentToolResult<T> {
 const index=result.content.findIndex(part=>part.type==="text");
 const part=result.content[index];
 if(part?.type!=="text")return {...result,content:[{type:"text",text:line},...result.content]};
 const head=`${TRUST_HEADER}\n`;
 const text=part.text.startsWith(head)?`${head}${line}\n${part.text.slice(head.length)}`:`${line}\n${part.text}`;
 const content=[...result.content];content[index]={...part,text};
 return {...result,content};
}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return null;
 try{return parseGameState(details.state);}catch{return null;}
}

export interface HealFirstRecorder {
 subscribe(observer:(event:RunEvent)=>void):void;
 healFirstLine?(tool:string,toolCallId:string,facts:HealFirstFacts,text:string):void;
}
// Outermost of the game tools, so the line leads every result, a story-battle-heal-gate-v1 refusal among them.
export function withHealFirst(tools:readonly AgentTool[],on:boolean,recorder:HealFirstRecorder,source:PlaceSource):AgentTool[] {
 if(!on)return [...tools];
 const record=recorder.healFirstLine?.bind(recorder);
 if(record===undefined)throw new Error("story-battle-heal-first-v1 needs a recorder for heal_first_line events");
 const heal=new HealFirst(placesOnce(source));
 recorder.subscribe(event=>{heal.observe(event);});
 const annotate=async<T>(tool:string,id:string,result:AgentToolResult<T>):Promise<AgentToolResult<T>>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  const facts=await heal.facts(state,result.content.flatMap(part=>part.type==="text"?[part.text]:[]).join("\n"),id);
  if(facts===null)return result;
  const text=healFirstText(facts);
  record(tool,id,facts,text);
  return leadWith(result,text);
 };
 return tools.map(tool=>{
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(tool.name,id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(tool.name,id,await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
