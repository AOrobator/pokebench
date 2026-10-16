// low-hp-trainer-warning-v1: one SUPERVISOR paragraph on a game-tool result when the player's lead Pokémon is
// below half HP, the field is free, and the Route 103 rival, not yet beaten, is loaded on the map. Talking to the rival there runs
// trainerbattle_no_intro (pret/pokeemerald data/maps/Route103/scripts.inc), which cannot be fled; a blackout
// halves money and warps to the last heal location (src/overworld.c DoWhiteOut), which a POKéMON CENTER's
// setrespawn sets and which is home before that. Fires from the result's own state, once per arm; re-arms when
// the condition's lasting facts change (lead back to half HP or more, another map, rival beaten).
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

export interface LowHpTrainerWarningFacts {
 readonly species:string;readonly hp:number;readonly max_hp:number;
 readonly rival:"MAY"|"BRENDAN";readonly x:number;readonly y:number;
 readonly map_id:readonly [number,number];readonly money:number|null;
 readonly items:readonly {readonly name:string;readonly quantity:number}[];
}
// low-hp-trainer-warning-v2: the story battles the game state can see, and the party members below max HP.
export interface StoryBattleWarningFacts {
 readonly kind:"rival"|"aqua_grunt"|"gym_leader";readonly opponent:string;
 readonly x:number|null;readonly y:number|null;readonly map_id:readonly [number,number];
 readonly party:readonly {readonly species:string;readonly hp:number;readonly max_hp:number}[];
 readonly money:number|null;readonly items:readonly {readonly name:string;readonly quantity:number}[];
}
export interface WarningRecorder {
 lowHpTrainerWarning(tool:string,facts:LowHpTrainerWarningFacts,text:string):void;
 storyBattleWarning?(tool:string,facts:StoryBattleWarningFacts,text:string):void;
}

// MAP_ROUTE103 (group 0, number 18).
const ROUTE103:readonly [number,number]=[0,18];
// Items a field menu use restores HP with (pokeemerald src/data/items.h, ItemUseOutOfBattle_Medicine / berries).
const HEALING_ITEMS=new Set(["POTION","SUPER POTION","HYPER POTION","MAX POTION","FULL RESTORE","FRESH WATER","SODA POP","LEMONADE","MOOMOO MILK","ENERGYPOWDER","ENERGY ROOT","BERRY JUICE","ORAN BERRY","SITRUS BERRY"]);

const belowHalf=(hp:number,max:number):boolean=>hp>0&&2*hp<max;

export function lowHpTrainerWarning(state:GameStateSnapshot):LowHpTrainerWarningFacts|null {
 if(!state.started||state.screen!=="overworld"||state.in_battle)return null;
 // Free field only: after a won battle the rival's dialogue and exit run with controls locked before
 // Route103_EventScript_Rival sets FLAG_DEFEATED_RIVAL_ROUTE103, so a locked state cannot prove a battle is ahead.
 if(state.field_controls_locked!==false)return null;
 if(state.party_owner!=="player")return null;
 if(state.map_id?.[0]!==ROUTE103[0]||state.map_id[1]!==ROUTE103[1])return null;
 if(state.story?.rival_battle_won!==false)return null;
 const lead=state.party.find(m=>m.is_egg!==true&&m.hp!==0);
 if(lead?.hp==null||lead.max_hp==null||lead.species===null||!belowHalf(lead.hp,lead.max_hp))return null;
 const rival=(state.world_context?.objects??[]).find(o=>o.map_id[0]===ROUTE103[0]&&o.map_id[1]===ROUTE103[1]&&(o.sprite_kind?.startsWith("RIVAL_MAY_")===true||o.sprite_kind?.startsWith("RIVAL_BRENDAN_")===true));
 if(rival===undefined)return null;
 const items=(state.resources?.bag??[]).flatMap(i=>i.name!=null&&HEALING_ITEMS.has(i.name)&&i.quantity>0?[{name:i.name,quantity:i.quantity}]:[]);
 return {species:lead.species,hp:lead.hp,max_hp:lead.max_hp,rival:rival.sprite_kind?.startsWith("RIVAL_MAY_")===true?"MAY":"BRENDAN",x:rival.x,y:rival.y,map_id:ROUTE103,money:state.money,items};
}

export function warningText(f:LowHpTrainerWarningFacts):string {
 const them=f.rival==="MAY"?"her":"him";
 // DoWhiteOut keeps floor(money/2), so the amount lost is the rest.
 const money=f.money===null?"":` (₽${String(f.money-Math.floor(f.money/2))} of ₽${String(f.money)})`;
 const bag=f.items.length===0?"":` Your BAG has ${f.items.map(i=>`${i.name} ×${String(i.quantity)}`).join(" and ")}; using one on ${f.species} restores HP.`;
 return `SUPERVISOR: Your ${f.species} has ${String(f.hp)}/${String(f.max_hp)} HP (below half), and your rival ${f.rival} is on this map at (${String(f.x)},${String(f.y)}). Talking to ${them} starts a trainer battle you cannot run from. If your party faints, you black out: you lose half your money${money} and wake up back at the last POKéMON CENTER you entered, or at home. Heal before you talk to ${them}: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.${bag}`;
}

// The arm: fires on the first state that meets the condition, then stays quiet until a state shows the lead
// at half HP or more, another map, or the rival battle won. Battles and unreadable states change nothing.
export class LowHpTrainerWarning {
 private armed=true;
 observe(state:GameStateSnapshot|undefined):LowHpTrainerWarningFacts|null {
  if(state===undefined)return null;
  const facts=lowHpTrainerWarning(state);
  if(facts!==null){
   if(!this.armed)return null;
   this.armed=false;
   return facts;
  }
  if(this.rearms(state))this.armed=true;
  return null;
 }
 private rearms(state:GameStateSnapshot):boolean {
  if(!state.started||state.in_battle||state.screen==="battle")return false;
  if(state.map_id!==null&&(state.map_id[0]!==ROUTE103[0]||state.map_id[1]!==ROUTE103[1]))return true;
  if(state.story?.rival_battle_won===true)return true;
  const lead=state.party.find(m=>m.is_egg!==true&&m.hp!==0);
  return lead?.hp!=null&&lead.max_hp!=null&&!belowHalf(lead.hp,lead.max_hp);
 }
}

// pret/pokeemerald 731ad5bf. Route 103: Route103_EventScript_Rival, trainerbattle_no_intro, FLAG_DEFEATED_RIVAL_ROUTE103
// (story.rival_battle_won); rival object OBJ_EVENT_GFX_RIVAL_MAY_NORMAL 105 / RIVAL_BRENDAN_NORMAL 100.
// Rustboro Gym: RustboroCity_Gym_EventScript_Roxanne, trainerbattle_single TRAINER_ROXANNE_1 (flag 0x609,
// story.roxanne_defeated); object OBJ_EVENT_GFX_ROXANNE 125. Petalburg Woods: the Devon researcher coord events
// run trainerbattle_no_intro TRAINER_GRUNT_PETALBURG_WOODS (flag 0x50A, story.petalburg_woods_aqua_grunt_defeated);
// the grunt's object (OBJ_EVENT_GFX_AQUA_MEMBER_M at 26,17) is loaded from the start but has no talk script; only the coord
// events at (26,23)/(27,23) start his battle, so the map and flag stand alone (removeobject runs after the battle).
interface StoryBattle {readonly kind:StoryBattleWarningFacts["kind"];readonly map:readonly [number,number];readonly won:(s:GameStateSnapshot)=>boolean|null|undefined;readonly object:((sprite:string)=>string|null)|null}
const STORY_BATTLES:readonly StoryBattle[]=[
 {kind:"rival",map:ROUTE103,won:s=>s.story?.rival_battle_won,object:k=>k.startsWith("RIVAL_MAY_")?"MAY":k.startsWith("RIVAL_BRENDAN_")?"BRENDAN":null},
 {kind:"aqua_grunt",map:[24,11],won:s=>s.story?.petalburg_woods_aqua_grunt_defeated,object:null},
 {kind:"gym_leader",map:[11,3],won:s=>s.story?.roxanne_defeated,object:k=>k==="ROXANNE"?"ROXANNE":null},
];
const onMap=(id:readonly number[]|null|undefined,map:readonly [number,number]):boolean=>id?.[0]===map[0]&&id[1]===map[1];
const hurt=(s:GameStateSnapshot):StoryBattleWarningFacts["party"]=>s.party.flatMap(m=>m.is_egg!==true&&m.species!==null&&m.hp!=null&&m.max_hp!=null&&m.hp<m.max_hp?[{species:m.species,hp:m.hp,max_hp:m.max_hp}]:[]);
// Positive evidence only: every Pokémon (not an egg) reads its HP and max HP, and each is at max.
const fullParty=(s:GameStateSnapshot):boolean=>{const mons=s.party.filter(m=>m.is_egg!==true);return mons.length>0&&mons.every(m=>m.species!==null&&m.hp!=null&&m.max_hp!=null&&m.hp===m.max_hp);};
// v2 also lists fainted Pokémon, so it names the field revival medicine too (pokeemerald src/data/items.h:
// REVIVE, MAX REVIVE, REVIVAL HERB use ItemUseOutOfBattle_Medicine). Each kind is named only when it has a target:
// src/pokemon.c refuses ordinary HP medicine on a fainted Pokémon and revival medicine on a conscious one. v1's list
// is unchanged.
const REVIVAL_ITEMS=new Set(["REVIVE","MAX REVIVE","REVIVAL HERB"]);
const bagItems=(s:GameStateSnapshot,party:StoryBattleWarningFacts["party"]):StoryBattleWarningFacts["items"]=>{
 const conscious=party.some(p=>p.hp>0),fainted=party.some(p=>p.hp===0);
 return (s.resources?.bag??[]).flatMap(i=>i.name!=null&&i.quantity>0&&(conscious&&HEALING_ITEMS.has(i.name)||fainted&&REVIVAL_ITEMS.has(i.name))?[{name:i.name,quantity:i.quantity}]:[]);
};

// The unbeaten story battle on this map, if the state shows one (its won flag explicitly false and, where the game
// shows the opponent before the battle, the opponent's object loaded on this map).
function storyBattleHere(state:GameStateSnapshot):{readonly battle:StoryBattle;readonly opponent:string;readonly x:number|null;readonly y:number|null}|null {
 const battle=STORY_BATTLES.find(b=>onMap(state.map_id,b.map));
 if(battle===undefined||battle.won(state)!==false)return null;
 if(battle.object===null)return {battle,opponent:"TEAM AQUA grunt",x:null,y:null};
 const pick=battle.object;
 for(const o of state.world_context?.objects??[]){
  const name=o.sprite_kind===null||!onMap(o.map_id,battle.map)?null:pick(o.sprite_kind);
  if(name!==null)return {battle,opponent:name,x:o.x,y:o.y};
 }
 return null;
}

export function storyBattleWarning(state:GameStateSnapshot):StoryBattleWarningFacts|null {
 if(!state.started||state.screen!=="overworld"||state.in_battle)return null;
 // Free field only, as in v1: a story script that has already run its battle holds the controls until its flag is set.
 if(state.field_controls_locked!==false)return null;
 if(state.party_owner!=="player")return null;
 const here=storyBattleHere(state);
 if(here===null)return null;
 // The paragraph lists every hurt Pokémon, so every Pokémon (not an egg) must be readable.
 if(state.party.some(m=>m.is_egg!==true&&(m.species===null||m.hp==null||m.max_hp==null)))return null;
 const party=hurt(state);
 if(party.length===0)return null;
 return {kind:here.battle.kind,opponent:here.opponent,x:here.x,y:here.y,map_id:here.battle.map,party,money:state.money,items:bagItems(state,party)};
}

export function storyBattleText(f:StoryBattleWarningFacts):string {
 const tile=f.x===null||f.y===null?"":`, at (${String(f.x)},${String(f.y)})`;
 const who=f.kind==="rival"?`your rival ${f.opponent}${tile}. Talking to ${f.opponent==="MAY"?"her":"him"} starts a trainer battle you cannot run from.`
  :f.kind==="gym_leader"?`the Gym Leader ${f.opponent}${tile}. Talking to her starts a trainer battle you cannot run from.`
  :"a TEAM AQUA grunt. He stops you on the forest path when you reach the DEVON researcher, and that trainer battle cannot be run from.";
 const money=f.money===null?"":` (₽${String(f.money-Math.floor(f.money/2))} of ₽${String(f.money)})`;
 const bag=f.items.length===0?"":` Your BAG has ${f.items.map(i=>`${i.name} ×${String(i.quantity)}`).join(" and ")}; using one restores HP.`;
 return `SUPERVISOR: A story battle is on this map: ${who} Your party is not at full HP: ${f.party.map(p=>`${p.species} ${String(p.hp)}/${String(p.max_hp)}`).join(", ")}. If your party faints, you black out: you lose half your money${money} and wake up back at the last POKéMON CENTER you entered, or at home. Heal to full before this battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.${bag}`;
}

// v2's arm: fires once for a battle, then stays quiet until a state shows the whole party at full HP (every HP read
// and at max), another map or that battle won. A different story battle (another map) fires on its own.
export class StoryBattleWarning {
 private fired:string|null=null;
 observe(state:GameStateSnapshot|undefined):StoryBattleWarningFacts|null {
  if(state===undefined)return null;
  const facts=storyBattleWarning(state);
  if(facts!==null){
   const key=`${facts.kind}:${facts.map_id.join("/")}`;
   if(this.fired===key)return null;
   this.fired=key;
   return facts;
  }
  if(this.fired!==null&&this.rearms(state))this.fired=null;
  return null;
 }
 private rearms(state:GameStateSnapshot):boolean {
  if(!state.started||state.in_battle||state.screen==="battle")return false;
  const battle=STORY_BATTLES.find(b=>`${b.kind}:${b.map.join("/")}`===this.fired);
  if(battle===undefined||state.map_id!==null&&!onMap(state.map_id,battle.map))return true;
  if(battle.won(state)===true)return true;
  return fullParty(state);
 }
}

function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return undefined;
 try{return parseGameState(details.state);}catch{return undefined;}
}

export function withLowHpTrainerWarning(tools:readonly AgentTool[],features:FeatureSet,recorder:WarningRecorder):readonly AgentTool[] {
 if(!features["low-hp-trainer-warning-v1"])return tools;
 if(features["low-hp-trainer-warning-v2"]){
  const record=recorder.storyBattleWarning?.bind(recorder);
  if(record===undefined)throw new Error("low-hp-trainer-warning-v2 needs a recorder for story_battle_warning events");
  const story=new StoryBattleWarning();
  return tools.map(tool=>({...tool,execute:async(...args:Parameters<AgentTool["execute"]>)=>{
   const result=await tool.execute(...args);
   const facts=story.observe(stateOf(result));
   if(facts===null)return result;
   const text=storyBattleText(facts);
   record(tool.name,facts,text);
   return {...result,content:[...result.content,{type:"text" as const,text}]};
  }}));
 }
 const watch=new LowHpTrainerWarning();
 return tools.map(tool=>({...tool,execute:async(...args:Parameters<AgentTool["execute"]>)=>{
  const result=await tool.execute(...args);
  const facts=watch.observe(stateOf(result));
  if(facts===null)return result;
  const text=warningText(facts);
  recorder.lowHpTrainerWarning(tool.name,facts,text);
  return {...result,content:[...result.content,{type:"text" as const,text}]};
 }}));
}
