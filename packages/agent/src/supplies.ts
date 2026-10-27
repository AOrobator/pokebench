// supplies-v1 (the operator 2026-10-27): at the first field result after entering a POKé MART map (once per visit) and when
// the shop's buy list opens, one line: money, the POKé BALLS pocket, the BAG's healing and status items and the party
// size. Only the game's own numbers and item names; no advice. mart-stock-readout-v1 still shows the stock.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {withAppendedBlock} from "./effectiveness-heard.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";

// The BAG items whose use restores HP, PP or a status condition, by the game's item names: pret src/data/items.h's
// ItemUseOutOfBattle_Medicine, _PPRecovery and _SacredAsh items without the vitamins (HP UP … ZINC) and BLUE FLUTE,
// plus PERSIM BERRY, which cures confusion in battle.
export const HEALING_AND_STATUS=new Set([
 "POTION","SUPER POTION","HYPER POTION","MAX POTION","FULL RESTORE","REVIVE","MAX REVIVE","FRESH WATER","SODA POP",
 "LEMONADE","MOOMOO MILK","ENERGYPOWDER","ENERGY ROOT","HEAL POWDER","REVIVAL HERB","ANTIDOTE","BURN HEAL","ICE HEAL",
 "AWAKENING","PARALYZ HEAL","FULL HEAL","ETHER","MAX ETHER","ELIXIR","MAX ELIXIR","LAVA COOKIE","BERRY JUICE",
 "SACRED ASH","CHERI BERRY","CHESTO BERRY","PECHA BERRY","RAWST BERRY","ASPEAR BERRY","LEPPA BERRY","ORAN BERRY",
 "PERSIM BERRY","LUM BERRY","SITRUS BERRY",
]);
// The map table's POKé MART maps (MAP_OLDALE_TOWN_MART, …).
const MART_MAP=/ MART$/;
const BUY_LIST="shop_menu";

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"location"|"money"|"party"|"resources"|"active_ui">;

const items=(s:Snapshot,keep:(pocket:string|null|undefined,name:string)=>boolean):string=>{
 const list=(s.resources?.bag??[]).filter(i=>i.name!=null&&i.quantity>0&&keep(i.pocket,i.name));
 return list.length===0?"none":list.map(i=>`${i.name??""} ×${String(i.quantity)}`).join(", ");
};

export function suppliesLine(s:Snapshot):string {
 const money=s.money===null?"unknown":`₽${s.money.toLocaleString("en-US")}`;
 const balls=items(s,pocket=>pocket==="poke_balls");
 const healing=items(s,(_,name)=>HEALING_AND_STATUS.has(name));
 return `Supplies: ${money} · balls: ${balls} · healing and status items: ${healing} · party ${String(s.party.length)} of 6`;
}

export class Supplies {
 private location:string|null=null;
 private visit=false;
 private buying=false;
 observe(event:RunEvent):void {
  if(event.type!=="state"||!("started" in event)||event.location===null)return;
  if(event.location!==this.location&&MART_MAP.test(event.location))this.visit=true;
  if(!MART_MAP.test(event.location))this.visit=false;
  this.location=event.location;
 }
 block(s:Snapshot):string|null {
  if(!s.started)return null;
  const buying=s.active_ui?.phase===BUY_LIST;
  const opened=buying&&!this.buying;
  this.buying=buying;
  const arrived=this.visit&&!s.in_battle&&s.screen==="overworld"&&s.location!==null&&MART_MAP.test(s.location);
  if(arrived)this.visit=false;
  return arrived||opened?suppliesLine(s):null;
 }
}

export function withSupplies(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["supplies-v1"])return [...tools];
 const supplies=new Supplies();
 recorder.subscribe(event=>{supplies.observe(event);});
 return withAppendedBlock(tools,features,state=>supplies.block(state as unknown as Snapshot));
}
