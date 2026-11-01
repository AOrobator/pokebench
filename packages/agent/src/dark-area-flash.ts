// dark-area-flash-reminder-v1: one SUPERVISOR paragraph on entering a map the game marks dark and has not lit: whether
// the KNUCKLE BADGE lets FLASH be used, which party Pokémon know FLASH, and whether HM05 is in the bag and who can learn
// it. Every fact comes from the state and from pret/pokeemerald 731ad5b tables; the wording is the game's.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";

export const SWITCH="dark-area-flash-reminder-v1";
// include/constants/moves.h MOVE_FLASH; include/constants/items.h ITEM_HM05 (ITEM_HM01 339 + 4).
export const MOVE_FLASH=148;
export const ITEM_HM05=343;
// The badge FLASH needs: party_menu.c CursorCb_FieldMove checks FLAG_BADGE01_GET + FIELD_MOVE_FLASH (1), the KNUCKLE
// BADGE, as game_state.BADGES names it.
export const FLASH_BADGE="KNUCKLE";
// data/maps/<name>/map.json "requires_flash": true, which becomes MapHeader.cave; SetUpFieldMove_Flash
// (src/fldeff_flash.c) lets FLASH work only where it is set. Keyed group/number in data/maps/map_groups.json order.
export const FLASH_MAPS:ReadonlySet<string>=new Set([
 "24/8", // GraniteCave_B1F
 "24/9", // GraniteCave_B2F
 "24/39", // CaveOfOrigin_UnusedRubySapphireMap1
 "24/40", // CaveOfOrigin_UnusedRubySapphireMap2
 "24/41", // CaveOfOrigin_UnusedRubySapphireMap3
 "24/44", // VictoryRoad_B1F
 "24/45", // VictoryRoad_B2F
]);
// src/data/pokemon/tmhm_learnsets.h entries with .FLASH = TRUE, as include/constants/species.h numbers (the state's
// species_id). party_menu.c DisplayPartyPokemonDataToTeachMove shows "ABLE!" for these and "NOT ABLE!" otherwise.
export const FLASH_LEARNERS:ReadonlySet<number>=new Set([
 1,2,3,12,25,26,35,36,39,40,43,44,45,46,47,48,49,52,53,54,55,63,64,65,69,70,71,79,80,81,82,96,97,100,101,102,103,109,110,
 113,114,120,121,122,124,125,135,137,145,150,151,152,153,154,163,164,165,166,167,168,170,171,172,173,174,175,176,177,178,
 179,180,181,182,187,188,189,191,192,193,194,195,196,197,199,200,203,213,233,234,238,239,242,243,244,250,251,277,278,279,
 292,294,295,296,297,298,299,300,301,302,303,306,307,308,311,312,315,316,317,318,319,322,337,338,344,345,346,347,348,349,
 351,352,353,354,356,357,361,362,363,369,376,377,378,385,386,387,392,393,394,399,400,407,408,409,410,411,
]);
// data/maps/DewfordTown_Gym/scripts.inc DewfordTown_Gym_Text_KnuckleBadgeInfoTakeThis, said when the badge is given.
const BADGE_SAYS="\"you'll be able to use the HM move FLASH outside of battle\"";
// src/strings.c gText_CantUseUntilNewBadge, printed when a field move is chosen without its badge.
const NO_BADGE_SAYS="\"This can't be used until a new BADGE is obtained.\"";

export interface DarkAreaFlashFacts {
 readonly map_id:readonly [number,number];
 readonly location:string|null;
 // SaveBlock1.flashLevel from the map observation, null when the state has none for this map.
 readonly flash_level:number|null;
 readonly badge:boolean;
 // use: a party Pokémon knows FLASH; teach: none does and HM05 is in the bag; none: neither.
 readonly kind:"use"|"teach"|"none";
 // Party Pokémon that know FLASH, by the name the party menu shows.
 readonly knows:readonly string[];
 // With HM05 and no FLASH user: what the game marks each party Pokémon when HM05 is used from the bag.
 readonly able:readonly string[];
 readonly not_able:readonly string[];
}

const keyOf=(map:readonly [number,number]):string=>`${String(map[0])}/${String(map[1])}`;
const nameOf=(mon:GameStateSnapshot["party"][number]):string|null=>mon.nickname??mon.species??null;

export function darkAreaFlash(state:GameStateSnapshot):DarkAreaFlashFacts|null {
 if(!state.started||state.screen!=="overworld"||state.in_battle||state.party_owner!=="player"||state.map_id===null)return null;
 const map:readonly [number,number]=[state.map_id[0],state.map_id[1]];
 if(!FLASH_MAPS.has(keyOf(map)))return null;
 const observed=state.map_observation;
 const level=observed!==undefined&&observed.map_id[0]===map[0]&&observed.map_id[1]===map[1]?observed.layout?.flash_level??null:null;
 // SetDefaultFlashLevel: 1 once FLAG_SYS_USE_FLASH is set (FLASH was used), 0 on a map with no darkness.
 if(level!==null&&level<=1)return null;
 const bag=state.resources?.bag;
 if(bag==null)return null;
 const party=state.party.filter(mon=>mon.is_egg!==true);
 const knows=party.flatMap(mon=>{const name=nameOf(mon);return name!==null&&mon.moves?.some(move=>move.move_id===MOVE_FLASH)===true?[name]:[];});
 const base={map_id:map,location:state.location,flash_level:level,badge:state.badges.includes(FLASH_BADGE)};
 if(knows.length>0)return {...base,kind:"use",knows,able:[],not_able:[]};
 if(!bag.some(item=>item.item_id===ITEM_HM05&&item.quantity>0))return {...base,kind:"none",knows:[],able:[],not_able:[]};
 const able:string[]=[],notAble:string[]=[];
 for(const mon of party){
  const name=nameOf(mon);
  if(name===null||mon.species_id==null)continue;
  (FLASH_LEARNERS.has(mon.species_id)?able:notAble).push(name);
 }
 return {...base,kind:"teach",knows:[],able,not_able:notAble};
}

const list=(names:readonly string[]):string=>names.length<=1?names.join(""):`${names.slice(0,-1).join(", ")} and ${names[names.length-1]??""}`;
const HM05_HERE="HM05 in the TMs & HMs pocket of your bag";

export function darkAreaFlashText(f:DarkAreaFlashFacts):string {
 const where=`SUPERVISOR: ${f.location===null?"This area":f.location} is dark.`;
 const knows=`${list(f.knows)} ${f.knows.length===1?"knows":"know"} FLASH`;
 const marks=[...(f.able.length===0?[]:[`${list(f.able)} "ABLE!"`]),...(f.not_able.length===0?[]:[`${list(f.not_able)} "NOT ABLE!"`])].join(" and ");
 const noneAble=f.able.length===0&&f.not_able.length>0?`no Pokémon in your party knows FLASH or can learn it: using HM05 from the bag, the game marks ${list(f.not_able)} "NOT ABLE!"`:null;
 if(!f.badge){
  const head=`${where} You do not have the KNUCKLE BADGE, so FLASH cannot be used outside of battle yet; choosing FLASH in the party menu, the game says ${NO_BADGE_SAYS}`;
  if(f.kind==="use")return `${head} ${knows}.`;
  if(f.kind==="none")return `${head} HM05 is not in your bag, and no Pokémon in your party knows FLASH.`;
  if(noneAble!==null)return `${head} You have ${HM05_HERE}, but ${noneAble}.`;
  return `${head} You have ${HM05_HERE}; using it from the bag teaches FLASH${marks===""?"":`, and the game marks ${marks} to learn it`}.`;
 }
 const head=`${where} You have the KNUCKLE BADGE (${BADGE_SAYS})`;
 if(f.kind==="use")return `${head}, and ${knows}. In the party menu, choose ${f.knows[0]??""} and then FLASH to light up the area.`;
 if(f.kind==="none")return `${head}, but HM05 is not in your bag and no Pokémon in your party knows FLASH.`;
 if(noneAble!==null)return `${head} and ${HM05_HERE}, but ${noneAble}.`;
 return `${head} and ${HM05_HERE}, but no Pokémon in your party knows FLASH. Using HM05 from the bag teaches FLASH${marks===""?"":`; the game marks ${marks} to learn it`}. A Pokémon that knows FLASH can use it from the party menu to light up the area.`;
}

// Once per map visit: the first qualifying state on a map fires; a state on another map re-arms it. States with no map
// (a warp in progress) change nothing.
export class DarkAreaFlashReminder {
 private visit:string|null=null;
 private fired=false;
 observe(state:GameStateSnapshot|null):DarkAreaFlashFacts|null {
  if(state===null||state.map_id===null)return null;
  const key=keyOf([state.map_id[0],state.map_id[1]]);
  if(key!==this.visit){this.visit=key;this.fired=false;}
  if(this.fired)return null;
  const facts=darkAreaFlash(state);
  if(facts!==null)this.fired=true;
  return facts;
 }
}

export interface DarkAreaFlashRecorder {darkAreaFlashReminder?(tool:string,facts:DarkAreaFlashFacts,text:string):void}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return null;
 try{return parseGameState(details.state);}catch{return null;}
}

// The paragraph goes after the result's own text, next to the decision the result asks for.
export function withDarkAreaFlashReminder(tools:readonly AgentTool[],features:FeatureSet,recorder:DarkAreaFlashRecorder):AgentTool[] {
 if(!features[SWITCH])return [...tools];
 const record=recorder.darkAreaFlashReminder?.bind(recorder);
 if(record===undefined)throw new Error(`${SWITCH} needs a recorder for dark_area_flash_reminder events`);
 const reminder=new DarkAreaFlashReminder();
 const annotate=<T>(tool:string,result:AgentToolResult<T>):AgentToolResult<T>=>{
  const facts=reminder.observe(stateOf(result.details));
  if(facts===null)return result;
  const text=darkAreaFlashText(facts);
  record(tool,facts,text);
  return {...result,content:[...result.content,{type:"text",text}]};
 };
 return tools.map(tool=>{
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(tool.name,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  return {...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(tool.name,await tool.executeChecked(id,params,check,signal,update,options))} satisfies CheckedPressTool;
 });
}
