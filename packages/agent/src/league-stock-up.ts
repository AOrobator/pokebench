// league-stock-up-v1 (the operator 2026-11-11): run 67d7 walked into the ELITE FOUR with ₽130,696 and no healing items, lost
// to GLACIA, and the whiteout halved its money. On the first field result after each arrival in the POKéMON LEAGUE
// lobby, one paragraph of game knowledge for the custom lanes: no POKéMON CENTER between the rooms, the FULL RESTOREs
// the opponents carry, what a loss costs, that the CHAMPION is the end goal, the lobby mart's healing prices and the
// player's own money and healing items. It names no amount to buy.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import {semanticWalk} from "./semantic-targets.js";
import {HEALING_AND_STATUS} from "./supplies.js";

export const LEAGUE_LOBBY="EVER GRANDE CITY POKEMON LEAGUE 1F";
// pret data/maps/EverGrandeCity_PokemonLeague_1F/scripts.inc (the lobby mart; its OnTransition sets the respawn to
// HEAL_LOCATION_EVER_GRANDE_CITY_POKEMON_LEAGUE) and src/data/items.h prices.
const PRICES="HYPER POTION ₽1,200, MAX POTION ₽2,500, FULL RESTORE ₽3,000, FULL HEAL ₽600 and REVIVE ₽1,500";
const GAME=new Set(["observe","press","navigate_to","battle_action","choose_evolution"]);

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"location"|"money"|"resources">;

export function leagueStockUpText(s:Snapshot):string {
 const money=s.money===null?"an unknown amount of money":`₽${s.money.toLocaleString("en-US")}`;
 const held=(s.resources?.bag??[]).filter(i=>i.name!=null&&i.quantity>0&&HEALING_AND_STATUS.has(i.name));
 const healing=held.length===0?"none":held.map(i=>`${i.name??""} ×${String(i.quantity)}`).join(", ");
 return [
  "POKéMON LEAGUE: past the north door the ELITE FOUR and then the CHAMPION are fought one after another, with no POKéMON CENTER in between, so until you win or lose the only healing is what is in your BAG.",
  "Each ELITE FOUR member carries 2 FULL RESTOREs and the CHAMPION carries 4.",
  "A loss sends you back to this lobby, takes half your money, and you start again from the first ELITE FOUR room.",
  "Becoming CHAMPION is the end goal of this game, so money kept back now has no later use.",
  `This lobby's POKéMON MART sells ${PRICES}.`,
  `You have ${money}; BAG healing and status items: ${healing}. How much to buy is your call.`,
 ].join(" ");
}

export class LeagueStockUp {
 private here=false;
 private told=false;
 // Once per arrival: the first field result in the lobby after a result somewhere else.
 block(s:Snapshot):string|null {
  if(!s.started)return null;
  const here=s.location===LEAGUE_LOBBY;
  if(here!==this.here){this.here=here;this.told=false;}
  if(!here||this.told||s.in_battle||s.screen!=="overworld")return null;
  this.told=true;
  return leagueStockUpText(s);
 }
}

function stateOf(result:AgentToolResult<unknown>):Snapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return undefined;
 const state:unknown=details.state;
 return typeof state==="object"&&state!==null&&"started" in state?state as Snapshot:undefined;
}

export function withLeagueStockUp(tools:readonly AgentTool[],features:FeatureSet):AgentTool[] {
 if(!features["league-stock-up-v1"])return [...tools];
 const lobby=new LeagueStockUp();
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result);
  const text=state===undefined?null:lobby.block(state);
  return text===null?result:{...result,content:[...result.content,{type:"text",text}]};
 };
 return tools.map(tool=>{
  if(!GAME.has(tool.name)&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(...args)=>annotate(await tool.execute(...args));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
