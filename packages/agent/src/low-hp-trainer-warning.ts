// low-hp-trainer-warning-v1: one SUPERVISOR paragraph on a game-tool result when the player's lead Pokémon is
// below half HP and the Route 103 rival, not yet beaten, is loaded on the map. Talking to the rival there runs
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
export interface WarningRecorder {lowHpTrainerWarning(tool:string,facts:LowHpTrainerWarningFacts,text:string):void}

// MAP_ROUTE103 (group 0, number 18).
const ROUTE103:readonly [number,number]=[0,18];
// Items a field menu use restores HP with (pokeemerald src/data/items.h, ItemUseOutOfBattle_Medicine / berries).
const HEALING_ITEMS=new Set(["POTION","SUPER POTION","HYPER POTION","MAX POTION","FULL RESTORE","FRESH WATER","SODA POP","LEMONADE","MOOMOO MILK","ENERGYPOWDER","ENERGY ROOT","BERRY JUICE","ORAN BERRY","SITRUS BERRY"]);

const belowHalf=(hp:number,max:number):boolean=>hp>0&&2*hp<max;

export function lowHpTrainerWarning(state:GameStateSnapshot):LowHpTrainerWarningFacts|null {
 if(!state.started||state.screen!=="overworld"||state.in_battle)return null;
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

function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return undefined;
 try{return parseGameState(details.state);}catch{return undefined;}
}

export function withLowHpTrainerWarning(tools:readonly AgentTool[],features:FeatureSet,recorder:WarningRecorder):readonly AgentTool[] {
 if(!features["low-hp-trainer-warning-v1"])return tools;
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
