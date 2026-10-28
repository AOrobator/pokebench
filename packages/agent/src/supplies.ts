// supplies-v1 (the operator 2026-10-27): on the first field result after arriving on a map where something can be bought, or
// with a door into one, and when a shop's buy list opens, one line: money, the POKé BALLS pocket, the BAG's healing and
// status items, the party size and the places on this map that sell things. Run 429f (Astra) decided to shop on the
// town map, 0 to 5 turns before each of its six mart visits, so the line comes on arrival in town, not inside the mart.
// Only the game's own numbers, item names, map names and warps; no advice. mart-stock-readout-v1 still shows the stock.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import type {GameStateSnapshot,StateSource} from "./game-state.js";
import {semanticWalk} from "./semantic-targets.js";
import {PlacesBodySchema,type Place} from "./story-destinations.js";

// The BAG items whose use restores HP, PP or a status condition, by the game's item names: pret src/data/items.h's
// ItemUseOutOfBattle_Medicine, _PPRecovery and _SacredAsh items without the vitamins (HP UP … ZINC), plus PERSIM BERRY,
// which cures confusion in battle. BLUE FLUTE (Medicine; it wakes a sleeping POKéMON) is one of them.
export const HEALING_AND_STATUS=new Set([
 "POTION","SUPER POTION","HYPER POTION","MAX POTION","FULL RESTORE","REVIVE","MAX REVIVE","FRESH WATER","SODA POP",
 "LEMONADE","MOOMOO MILK","ENERGYPOWDER","ENERGY ROOT","HEAL POWDER","REVIVAL HERB","ANTIDOTE","BURN HEAL","ICE HEAL",
 "AWAKENING","PARLYZ HEAL","FULL HEAL","ETHER","MAX ETHER","ELIXIR","MAX ELIXIR","LAVA COOKIE","BERRY JUICE",
 "SACRED ASH","CHERI BERRY","CHESTO BERRY","PECHA BERRY","RAWST BERRY","ASPEAR BERRY","LEPPA BERRY","ORAN BERRY",
 "PERSIM BERRY","LUM BERRY","SITRUS BERRY","BLUE FLUTE",
]);
// Maps where the game sells something, by map-table name (pret 731ad5bf data/maps/<map>/scripts.inc):
// - a pokemart, pokemartdecoration or pokemartdecoration2 command (the buy menus);
// - the other scripts that take money, coins or BATTLE POINTS for something: the BATTLE FRONTIER EXCHANGE SERVICE
//   CORNER (items for BP), LOUNGE7 (moves for BP), MAUVILLE CITY GAME CORNER (coins and prizes), MT CHIMNEY (LAVA
//   COOKIE) and ROUTE109 SEASHORE HOUSE (SODA POP). Entry fees (SAFARI ZONE, OCEANIC MUSEUM) and the LOUNGE3 wager
//   buy nothing and are left out.
export const SELLING_MAPS:readonly string[]=[
 "OLDALE TOWN MART","PETALBURG CITY MART","RUSTBORO CITY MART","SLATEPORT CITY","SLATEPORT CITY MART","MAUVILLE CITY MART",
 "VERDANTURF TOWN MART","FALLARBOR TOWN MART","LAVARIDGE TOWN MART","LAVARIDGE TOWN HERB SHOP","FORTREE CITY MART",
 "FORTREE CITY DECORATION SHOP","LILYCOVE CITY DEPARTMENT STORE 2F","LILYCOVE CITY DEPARTMENT STORE 3F",
 "LILYCOVE CITY DEPARTMENT STORE 4F","LILYCOVE CITY DEPARTMENT STORE 5F","LILYCOVE CITY DEPARTMENT STORE ROOFTOP",
 "MOSSDEEP CITY MART","SOOTOPOLIS CITY MART","ROUTE104 PRETTY PETAL FLOWER SHOP","EVER GRANDE CITY POKEMON LEAGUE 1F",
 "TRAINER HILL ENTRANCE","BATTLE FRONTIER MART","BATTLE FRONTIER EXCHANGE SERVICE CORNER","BATTLE FRONTIER LOUNGE7",
 "MAUVILLE CITY GAME CORNER","MT CHIMNEY","ROUTE109 SEASHORE HOUSE",
];
const SELLING=new Set(SELLING_MAPS);
const BUY_LIST="shop_menu";
const GAME=new Set(["observe","press","navigate_to","battle_action","choose_evolution"]);

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"location"|"map_id"|"money"|"party"|"resources"|"active_ui">;

const items=(s:Snapshot,keep:(pocket:string|null|undefined,name:string)=>boolean):string=>{
 const list=(s.resources?.bag??[]).filter(i=>i.name!=null&&i.quantity>0&&keep(i.pocket,i.name));
 return list.length===0?"none":list.map(i=>`${i.name??""} ×${String(i.quantity)}`).join(", ");
};
const field=(s:Snapshot)=>s.started&&!s.in_battle&&s.screen==="overworld";
const same=(a:readonly number[],b:readonly number[]|null)=>b!==null&&a[0]===b[0]&&a[1]===b[1];

// The places on the current map that sell things: the map itself, then each map a warp here leads into, with its doors.
export function sellingHere(s:Pick<Snapshot,"location"|"map_id">,places:readonly Place[]|null):string[] {
 const here=places?.find(p=>same(p.map_id,s.map_id));
 const name=here?.name??s.location;
 const out:string[]=name!=null&&SELLING.has(name)?[`${here?.display??name} (this map)`]:[];
 const doors=new Map<string,string[]>();
 for(const w of here?.warps??[]){
  const to=places?.find(p=>same(p.map_id,w.to));
  if(to===undefined||!SELLING.has(to.name)||same(to.map_id,s.map_id))continue;
  const tiles=doors.get(to.display)??[];
  tiles.push(`(${String(w.x)},${String(w.y)})`);
  doors.set(to.display,tiles);
 }
 for(const [display,tiles] of doors)out.push(`${display}, door at ${tiles.join(", ")}`);
 return out;
}

export function suppliesLine(s:Snapshot,selling:readonly string[]=[]):string {
 const money=s.money===null?"unknown":`₽${s.money.toLocaleString("en-US")}`;
 const balls=items(s,pocket=>pocket==="poke_balls");
 const healing=items(s,(_,name)=>HEALING_AND_STATUS.has(name));
 const where=selling.length===0?"":` · places on this map that sell things: ${selling.join("; ")}`;
 return `Supplies: ${money} · balls: ${balls} · healing and status items: ${healing} · party ${String(s.party.length)} of 6${where}`;
}

export class Supplies {
 private map:string|null=null;
 private arrived=false;
 private buying=false;
 // Once per arrival: the first field result on a map the previous result was not on; and when the buy list opens.
 block(s:Snapshot,places:readonly Place[]|null):string|null {
  if(!s.started)return null;
  const map=s.map_id===null?s.location:s.map_id.join("/");
  if(map!==this.map){this.map=map;this.arrived=true;}
  const buying=s.active_ui?.phase===BUY_LIST;
  const opened=buying&&!this.buying;
  this.buying=buying;
  const selling=sellingHere(s,places);
  if(opened)return suppliesLine(s,selling);
  if(!this.arrived||!field(s))return null;
  this.arrived=false;
  return selling.length===0?null:suppliesLine(s,selling);
 }
}

function stateOf(result:AgentToolResult<unknown>):Snapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return undefined;
 const state:unknown=details.state;
 return typeof state==="object"&&state!==null&&"started" in state?state as Snapshot:undefined;
}

export function withSupplies(tools:readonly AgentTool[],features:FeatureSet,source:Pick<StateSource,"places">):AgentTool[] {
 if(!features["supplies-v1"])return [...tools];
 const supplies=new Supplies();
 // The game's map table, read once per run, a failed read included; without it only the current map's own name counts.
 let pending:Promise<readonly Place[]|null>|null=null;
 const places=():Promise<readonly Place[]|null>=>{
  pending??=source.places===undefined?Promise.resolve(null):source.places().then(body=>Value.Check(PlacesBodySchema,body)?body.places:null,()=>null);
  return pending;
 };
 const annotate=async<T>(result:AgentToolResult<T>):Promise<AgentToolResult<T>>=>{
  const state=stateOf(result);
  const text=state===undefined?null:supplies.block(state,await places());
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
