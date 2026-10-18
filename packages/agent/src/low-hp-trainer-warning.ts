// low-hp-trainer-warning-v1: one SUPERVISOR paragraph on a game-tool result when the player's lead Pokémon is
// below half HP, the field is free, and the Route 103 rival, not yet beaten, is loaded on the map. Talking to the rival there runs
// trainerbattle_no_intro (pret/pokeemerald data/maps/Route103/scripts.inc), which cannot be fled; a blackout
// halves money and warps to the last heal location (src/overworld.c DoWhiteOut), which a POKéMON CENTER's
// setrespawn sets and which is home before that. Fires from the result's own state, once per arm; re-arms when
// the condition's lasting facts change (lead back to half HP or more, another map, rival beaten).
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {PlacesBodySchema,type Place,type PlaceSource} from "./story-destinations.js";

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
 healBeforeTrainersWarning?(tool:string,facts:HealBeforeTrainersFacts,text:string):void;
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

// What a blackout costs, as every warning here says it. DoWhiteOut keeps floor(money/2), so the amount lost is the rest.
const blackout=(money:number|null):string=>`If your party faints, you black out: you lose half your money${money===null?"":` (₽${String(money-Math.floor(money/2))} of ₽${String(money)})`} and wake up back at the last POKéMON CENTER you entered, or at home.`;

export function warningText(f:LowHpTrainerWarningFacts):string {
 const them=f.rival==="MAY"?"her":"him";
 const bag=f.items.length===0?"":` Your BAG has ${f.items.map(i=>`${i.name} ×${String(i.quantity)}`).join(" and ")}; using one on ${f.species} restores HP.`;
 return `SUPERVISOR: Your ${f.species} has ${String(f.hp)}/${String(f.max_hp)} HP (below half), and your rival ${f.rival} is on this map at (${String(f.x)},${String(f.y)}). Talking to ${them} starts a trainer battle you cannot run from. ${blackout(f.money)} Heal before you talk to ${them}: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.${bag}`;
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
const fullParty=(s:GameStateSnapshot):boolean=>{const mons=s.party.filter(m=>m.is_egg!==true);return mons.length>0&&mons.every(m=>m.hp!=null&&m.max_hp!=null&&m.hp===m.max_hp);};
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
 const bag=f.items.length===0?"":` Your BAG has ${f.items.map(i=>`${i.name} ×${String(i.quantity)}`).join(" and ")}; using one restores HP.`;
 return `SUPERVISOR: A story battle is on this map: ${who} Your party is not at full HP: ${f.party.map(p=>`${p.species} ${String(p.hp)}/${String(p.max_hp)}`).join(", ")}. ${blackout(f.money)} Heal to full before this battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.${bag}`;
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

// heal-before-trainers-v1: on the free field, a trainer the player has not beaten loaded on this map (its object's
// script starts with trainerbattle and its trainer flag is clear: the game server's heal_before_trainers.trainers)
// and a weak party. Weak: a party Pokémon (not an egg) has fainted, the lead (the first one that can battle) is below
// half HP, or every damaging move of the lead (power above 0 in gBattleMoves) is out of PP. Status conditions and
// items are left out. The paragraph names the nearest place the player has been to that heals the party: the
// POKéMON CENTER of a town whose center the player entered this run or whose center set the save's last heal
// location, or MOM at home while talking to her heals; nearest is fewest map changes in the game's map table.
// The game's own words: sText_NoRunningFromTrainers and sText_NoPPLeft (src/battle_message.c), the nurse's
// gText_WouldYouLikeToRestYourPkmn (data/text/pkmn_center_nurse.inc) and MOM's PlayersHouse_1F_Text_YouShouldRestABit.
export type WeakReason=
 |{readonly kind:"fainted";readonly species:string;readonly max_hp:number}
 |{readonly kind:"lead_below_half";readonly species:string;readonly hp:number;readonly max_hp:number}
 |{readonly kind:"lead_no_pp";readonly species:string;readonly moves:readonly string[]};
export interface HealPlace {readonly kind:"pokemon_center"|"home";readonly town:string;readonly map_id:readonly [number,number];readonly hops:number}
export interface BagHealingItem {readonly name:string;readonly quantity:number;readonly description:string}
export interface HealBeforeTrainersFacts {
 readonly map_id:readonly [number,number];
 readonly trainers:readonly {readonly local_id:number;readonly x:number;readonly y:number;readonly sprite_kind:string|null}[];
 readonly weak:readonly WeakReason[];
 readonly heal:HealPlace|null;
 readonly mom_heals:boolean;
 readonly money:number|null;
 // bag-healing-items-v1 only: the BAG items that answer the weaknesses named.
 readonly items?:readonly BagHealingItem[];
}
export interface HealContext {readonly entered:ReadonlySet<string>;readonly places:readonly Place[]|null;readonly skip:"story"|null}

const keyOf=(id:readonly number[]):string=>`${String(id[0])}/${String(id[1])}`;
// The map table's names (the game's map constants): MAP_OLDALE_TOWN_POKEMON_CENTER_1F, MAP_LITTLEROOT_TOWN_BRENDANS_HOUSE_1F.
const CENTER=" POKEMON CENTER 1F";
const HOUSE=/^(.+) (?:BRENDANS|MAYS) HOUSE 1F$/;

// The party's weaknesses for a battle: [] when it has none, null when a Pokémon (not an egg) cannot be read.
export function weakParty(state:GameStateSnapshot):WeakReason[]|null {
 const mons=state.party.filter(m=>m.is_egg!==true);
 const read=mons.flatMap(m=>m.species===null||m.hp==null||m.max_hp==null?[]:[{species:m.species,hp:m.hp,max_hp:m.max_hp,moves:m.moves??[]}]);
 if(mons.length===0||read.length!==mons.length)return null;
 const out:WeakReason[]=[];
 const lead=read.find(m=>m.hp!==0);
 if(lead!==undefined){
  if(belowHalf(lead.hp,lead.max_hp))out.push({kind:"lead_below_half",species:lead.species,hp:lead.hp,max_hp:lead.max_hp});
  const power=new Map((state.heal_before_trainers?.move_power??[]).map(m=>[m.move_id,m.power]));
  const moves=lead.moves.filter(m=>m.move_id>0);
  const damaging=moves.filter(m=>(power.get(m.move_id)??0)>0);
  const names=damaging.flatMap(m=>m.name==null?[]:[m.name]);
  if(moves.every(m=>power.has(m.move_id))&&damaging.length>0&&names.length===damaging.length&&damaging.every(m=>m.pp===0))out.push({kind:"lead_no_pp",species:lead.species,moves:names});
 }
 for(const m of read)if(m.hp===0)out.push({kind:"fainted",species:m.species,max_hp:m.max_hp});
 return out;
}

// Fewest map changes from `from` to every map, over the map table's warps and connections, both ways.
function hopsFrom(places:readonly Place[],from:readonly number[]):Map<string,number> {
 const next=new Map<string,Set<string>>();
 const link=(a:string,b:string):void=>{let set=next.get(a);if(set===undefined){set=new Set();next.set(a,set);}set.add(b);};
 for(const p of places){
  const here=keyOf(p.map_id);
  for(const to of [...p.warps.map(w=>w.to),...p.connections.map(c=>c.to)]){link(here,keyOf(to));link(keyOf(to),here);}
 }
 const start=keyOf(from);
 const seen=new Map([[start,0]]);
 const queue=[start];
 for(let i=0;i<queue.length;i++){
  const at=queue[i]??start;const hops=(seen.get(at)??0)+1;
  for(const to of next.get(at)??[])if(!seen.has(to)){seen.set(to,hops);queue.push(to);}
 }
 return seen;
}

export function nearestHeal(state:GameStateSnapshot,ctx:Pick<HealContext,"entered">,places:readonly Place[]):HealPlace|null {
 const facts=state.heal_before_trainers;
 if(facts===undefined||state.map_id===null)return null;
 const byKey=new Map(places.map(p=>[keyOf(p.map_id),p]));
 const centers=new Set(ctx.entered);
 // SetLastHealLocationWarp stores the town outside the POKéMON CENTER whose 1F set it.
 const town=facts.last_heal===null?undefined:byKey.get(keyOf(facts.last_heal))?.name;
 const last=town===undefined?undefined:places.find(p=>p.name===`${town}${CENTER}`);
 if(last!==undefined)centers.add(keyOf(last.map_id));
 const candidates:Omit<HealPlace,"hops">[]=[];
 for(const key of centers){
  const p=byKey.get(key);
  if(p?.name.endsWith(CENTER)===true)candidates.push({kind:"pokemon_center",town:p.name.slice(0,-CENTER.length),map_id:p.map_id});
 }
 const home=facts.home===null?undefined:byKey.get(keyOf(facts.home));
 const homeTown=home===undefined?undefined:HOUSE.exec(home.name)?.[1];
 if(facts.mom_heals&&home!==undefined&&homeTown!==undefined)candidates.push({kind:"home",town:homeTown,map_id:home.map_id});
 const hops=hopsFrom(places,state.map_id);
 const reachable=candidates.flatMap(c=>{const h=hops.get(keyOf(c.map_id));return h===undefined?[]:[{...c,hops:h}];});
 reachable.sort((a,b)=>a.hops-b.hops||(a.kind===b.kind?0:a.kind==="pokemon_center"?-1:1)||a.town.localeCompare(b.town));
 return reachable[0]??null;
}

// The facts on a state that meets the condition, without the healing place when ctx.places is null.
export function healBeforeTrainers(state:GameStateSnapshot,ctx:HealContext):HealBeforeTrainersFacts|null {
 if(!state.started||state.screen!=="overworld"||state.in_battle)return null;
 // Free field only, as in v1 and v2: a trainer who has spotted the player locks the controls as they walk over.
 if(state.field_controls_locked!==false)return null;
 if(state.party_owner!=="player")return null;
 const facts=state.heal_before_trainers;
 if(facts===undefined||state.map_id===null)return null;
 // With low-hp-trainer-warning-v2 on, a story battle's opponent (ROXANNE) is left to its own warning.
 const story=ctx.skip==="story"?storyBattleHere(state):null;
 const trainers=facts.trainers.filter(t=>!t.defeated&&!(story!==null&&story.x===t.x&&story.y===t.y)).map(t=>({local_id:t.local_id,x:t.x,y:t.y,sprite_kind:t.sprite_kind}));
 if(trainers.length===0)return null;
 const weak=weakParty(state);
 if(weak===null||weak.length===0)return null;
 return {map_id:[state.map_id[0],state.map_id[1]],trainers,weak,heal:ctx.places===null?null:nearestHeal(state,ctx,ctx.places),mom_heals:facts.mom_heals,money:state.money};
}

// bag-healing-items-v1: the BAG items whose field use (ItemUseOutOfBattle_Medicine, ItemUseOutOfBattle_PPRecovery in
// pokeemerald src/data/items.h) answers a weakness the paragraph names, with the game's description of each
// (src/data/text/item_descriptions.h, its line breaks as spaces). HP items for a lead below half, revival items for a
// fainted Pokémon, PP items for a lead out of PP. Status items are left out, as the weaknesses are.
const HP_DESCRIPTIONS={
 "POTION":"Restores the HP of a POKéMON by 20 points.",
 "SUPER POTION":"Restores the HP of a POKéMON by 50 points.",
 "HYPER POTION":"Restores the HP of a POKéMON by 200 points.",
 "MAX POTION":"Fully restores the HP of a POKéMON.",
 "FULL RESTORE":"Fully restores the HP and status of a POKéMON.",
 "FRESH WATER":"A mineral water that restores HP by 50 points.",
 "SODA POP":"A fizzy soda drink that restores HP by 60 points.",
 "LEMONADE":"A very sweet drink that restores HP by 80 points.",
 "MOOMOO MILK":"A nutritious milk that restores HP by 100 points.",
 "ENERGYPOWDER":"A bitter powder that restores HP by 50 points.",
 "ENERGY ROOT":"A bitter root that restores HP by 200 points.",
 "BERRY JUICE":"A 100% pure juice that restores HP by 20 points.",
 "ORAN BERRY":"A hold item that restores 10 HP in battle.",
 "SITRUS BERRY":"A hold item that restores 30 HP in battle.",
} as const;
const REVIVE_DESCRIPTIONS={
 "REVIVE":"Revives a fainted POKéMON with half its HP.",
 "MAX REVIVE":"Revives a fainted POKéMON with all its HP.",
 "REVIVAL HERB":"A very bitter herb that revives a fainted POKéMON.",
} as const;
const PP_DESCRIPTIONS={
 "ETHER":"Restores the PP of a selected move by 10.",
 "MAX ETHER":"Fully restores the PP of a selected move.",
 "ELIXIR":"Restores the PP of all moves by 10.",
 "MAX ELIXIR":"Fully restores the PP of a POKéMON's moves.",
 "LEPPA BERRY":"A hold item that restores 10 PP in battle.",
} as const;
export const BAG_ITEM_DESCRIPTIONS:Readonly<Record<string,string>>={...HP_DESCRIPTIONS,...REVIVE_DESCRIPTIONS,...PP_DESCRIPTIONS};
const FOR_WEAKNESS:Readonly<Record<WeakReason["kind"],Readonly<Record<string,string>>>>={lead_below_half:HP_DESCRIPTIONS,fainted:REVIVE_DESCRIPTIONS,lead_no_pp:PP_DESCRIPTIONS};

// The BAG's items, in BAG order, that answer one of these weaknesses.
export function bagHealingItems(state:GameStateSnapshot,weak:readonly WeakReason[]):BagHealingItem[] {
 const wanted=weak.map(w=>FOR_WEAKNESS[w.kind]);
 return (state.resources?.bag??[]).flatMap(i=>{
  const name=i.name;
  if(name==null||i.quantity<=0)return [];
  const description=wanted.find(d=>Object.hasOwn(d,name))?.[name];
  return description===undefined?[]:[{name,quantity:i.quantity,description}];
 });
}

// gText_MenuBag "BAG" (the START menu), the battle menu's BAG, gMenuText_Use "USE" in both BAG context menus
// (sContextMenuItems_ItemsPocket, sContextMenuItems_BattleUse in src/item_menu.c) and the party menu's
// PARTY_MSG_USE_ON_WHICH_MON, gText_UseOnWhichPokemon.
const USE_ITEM="To use one, choose BAG (on the START menu, or on the battle menu in a battle), then the item and USE; the game asks \"Use on which POKéMON?\"";
const listed=(parts:readonly string[]):string=>parts.length<=2?parts.join(" and "):`${parts.slice(0,-1).join(", ")} and ${parts.at(-1)??""}`;
const bagSentence=(items:readonly BagHealingItem[]):string=>` Your BAG has ${listed(items.map(i=>`${i.name} ×${String(i.quantity)} ("${i.description}")`))}. ${USE_ITEM}`;

const NO_RUNNING="In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"";
export function healBeforeTrainersText(f:HealBeforeTrainersFacts):string {
 const list=f.trainers.map(t=>`object ${String(t.local_id)}, sprite ${t.sprite_kind??"unknown"}, at (${String(t.x)},${String(t.y)})`).join("; ");
 const who=f.trainers.length===1?`A trainer you have not beaten is on this map: ${list}.`:`Trainers you have not beaten are on this map: ${list}.`;
 const weak=f.weak.map(w=>w.kind==="fainted"?`${w.species} has fainted (0/${String(w.max_hp)} HP)`
  :w.kind==="lead_below_half"?`${w.species}, your lead, has ${String(w.hp)}/${String(w.max_hp)} HP (below half)`
  :`${w.species}, your lead, has no PP left for its damaging moves (${w.moves.join(", ")}), and the game says "There's no PP left for this move!"`).join("; ");
 const h=f.heal;
 const where=h===null?`Heal before you battle: the nurse at a POKéMON CENTER heals your whole party${f.mom_heals?", and so does MOM at home":""}.`
  :`The nearest place you have been to that heals your party is ${h.kind==="pokemon_center"?"the POKéMON CENTER":"your house"} in ${h.town} (map ${keyOf(h.map_id)}), ${String(h.hops)} map change${h.hops===1?"":"s"} from here in the game's map table${h.kind==="pokemon_center"?"; its nurse says \"We restore your tired POKéMON to full health.\"":", where MOM says \"I think you should rest a bit.\" and heals your party."}`;
 const bag=f.items===undefined||f.items.length===0?"":bagSentence(f.items);
 return `SUPERVISOR: ${who} Your party is weak for a battle: ${weak}. ${NO_RUNNING} ${blackout(f.money)} ${where}${bag}`;
}

// The arm: names each unbeaten trainer once while the party stays weak on this map (a trainer that loads later is named
// on its own), and every one again after a trainer battle. It re-arms on another map or a party read as not weak;
// battles and unreadable states change nothing else.
// It also remembers every POKéMON CENTER 1F the results show the player in.
export class HealBeforeTrainers {
 private readonly entered=new Set<string>();
 private warned=new Set<number>();
 private map:string|null=null;
 private battled=false;
 constructor(private readonly options:{readonly skipStory:boolean;readonly places:()=>Promise<readonly Place[]|null>;readonly items?:boolean}){}
 async observe(state:GameStateSnapshot|undefined):Promise<HealBeforeTrainersFacts|null> {
  if(state===undefined)return null;
  if(state.map_id!==null&&state.location?.endsWith(CENTER)===true)this.entered.add(keyOf(state.map_id));
  if(state.in_battle||state.screen==="battle"){
   if(state.trainer_opponent?.battle_active===true)this.battled=true;
   return null;
  }
  const ctx:HealContext={entered:this.entered,places:null,skip:this.options.skipStory?"story":null};
  const facts=healBeforeTrainers(state,ctx);
  if(facts===null){
   if(this.rearms(state)){this.warned=new Set();this.map=null;this.battled=false;}
   return null;
  }
  const key=keyOf(facts.map_id);
  if(key!==this.map){this.warned=new Set();this.map=key;}
  // Without a trainer battle since the last warning, only the trainers not yet named are named.
  const fresh=facts.trainers.filter(t=>!this.warned.has(t.local_id));
  if(!this.battled&&fresh.length===0)return null;
  const trainers=this.battled?facts.trainers:fresh;
  const named:HealBeforeTrainersFacts=this.options.items===true?{...facts,trainers,items:bagHealingItems(state,facts.weak)}:{...facts,trainers};
  for(const t of facts.trainers)this.warned.add(t.local_id);
  this.battled=false;
  const places=await this.options.places();
  return places===null?named:{...named,heal:nearestHeal(state,ctx,places)};
 }
 private rearms(state:GameStateSnapshot):boolean {
  if(!state.started)return false;
  if(state.map_id!==null&&this.map!==null&&keyOf(state.map_id)!==this.map)return true;
  return weakParty(state)?.length===0;
 }
}

function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return undefined;
 try{return parseGameState(details.state);}catch{return undefined;}
}

// The game's map table, read once; a failed read is retried on the next warning, a malformed one is not.
function placesOnce(source:PlaceSource):()=>Promise<readonly Place[]|null> {
 let pending:Promise<readonly Place[]|null>|null=null;
 return ()=>{
  pending??=source.places===undefined?Promise.resolve(null):source.places().then(body=>Value.Check(PlacesBodySchema,body)?body.places:null,()=>{pending=null;return null;});
  return pending;
 };
}

// One warning rule: what fired on a result's state, its paragraph and how to record it.
interface Fired {readonly text:string;readonly record:(tool:string)=>void}
type Rule=(state:GameStateSnapshot|undefined)=>Promise<Fired|null>;

// One wrapper for every warning: v1 (the Route 103 rival below half HP) or, with v2, every visible story battle below
// full HP; with heal-before-trainers-v1, also any unbeaten trainer while the party is weak. Each paragraph that fires
// is recorded and added after the result's text, in that order.
export function withLowHpTrainerWarning(tools:readonly AgentTool[],features:FeatureSet,recorder:WarningRecorder,source:PlaceSource={}):readonly AgentTool[] {
 if(!features["low-hp-trainer-warning-v1"])return tools;
 const rules:Rule[]=[];
 if(features["low-hp-trainer-warning-v2"]){
  const record=recorder.storyBattleWarning?.bind(recorder);
  if(record===undefined)throw new Error("low-hp-trainer-warning-v2 needs a recorder for story_battle_warning events");
  const story=new StoryBattleWarning();
  rules.push(state=>{const facts=story.observe(state);if(facts===null)return Promise.resolve(null);const text=storyBattleText(facts);return Promise.resolve({text,record:tool=>{record(tool,facts,text);}});});
 }else{
  const watch=new LowHpTrainerWarning();
  rules.push(state=>{const facts=watch.observe(state);if(facts===null)return Promise.resolve(null);const text=warningText(facts);return Promise.resolve({text,record:tool=>{recorder.lowHpTrainerWarning(tool,facts,text);}});});
 }
 if(features["heal-before-trainers-v1"]){
  const record=recorder.healBeforeTrainersWarning?.bind(recorder);
  if(record===undefined)throw new Error("heal-before-trainers-v1 needs a recorder for heal_before_trainers_warning events");
  const heal=new HealBeforeTrainers({skipStory:features["low-hp-trainer-warning-v2"],places:placesOnce(source),items:features["bag-healing-items-v1"]});
  rules.push(async state=>{const facts=await heal.observe(state);if(facts===null)return null;const text=healBeforeTrainersText(facts);return {text,record:tool=>{record(tool,facts,text);}};});
 }
 return tools.map(tool=>({...tool,execute:async(...args:Parameters<AgentTool["execute"]>)=>{
  const result=await tool.execute(...args);
  const state=stateOf(result);
  const texts:string[]=[];
  for(const rule of rules){
   const fired=await rule(state);
   if(fired!==null){fired.record(tool.name);texts.push(fired.text);}
  }
  return texts.length===0?result:{...result,content:[...result.content,...texts.map(text=>({type:"text" as const,text}))]};
 }}));
}
