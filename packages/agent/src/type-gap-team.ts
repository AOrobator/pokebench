// type-gap-team-v1 (the operator 2026-10-27): for each gym whose leader is not defeated and whose type this run has evidence
// for, the types the game's own type chart (ROM gTypeEffectiveness, read by the game server) makes super effective
// against it, next to the types the party has. Shown at a wild battle's action menu when the wild foe has a type the
// party lacks, at the first field result after a loss to a GYM LEADER and at the first field result after a gym's
// type first becomes known. Gym type evidence is only this run's own: foe battlers in trainer battles on the gym map,
// the gym guide's sentence on that map, and the gym sign. Facts side by side; never advice, never a place not met.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {TYPE_NAMES} from "./catching-block.js";
import {battleDecision,withAppendedBlock} from "./effectiveness-heard.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {LEADER_CLASS} from "./gym-readiness.js";

export const TYPE_GAP_HEADER="Gym type facts (this run's own evidence and the game's type chart):";
// The gym guides' type sentences in the ROM (pret data/maps/*Gym*/scripts.inc <map>_Text_GymGuideAdvice): "is a user
// of ROCK-type POKéMON." (RUSTBORO), "commands FIGHTING-type POKéMON." (DEWFORD), "uses ELECTRIC-type POKéMON."
// (MAUVILLE, LAVARIDGE), "use PSYCHIC-type POKéMON." (MOSSDEEP), "is a master of FLYING-type POKéMON." (FORTREE,
// SOOTOPOLIS). PETALBURG's guide names no type. env/tests/env/test_type_gap.py checks each against the ROM.
export const GUIDE_TYPE=/\b(?:is a user of|commands|uses|use|is a master of) ([A-Z]+)-type POKéMON\.$/;
// The gym signs (<CITY>_Text_GymSign): "RUSTBORO CITY POKéMON GYM LEADER: ROXANNE" then the quote; only RUSTBORO's
// names a type, as "ROCK-loving".
const SIGN_HEAD=/^(.+) POKéMON GYM LEADERS?: /;
const LOVING=/\b([A-Z]+)-loving\b/;
// Gym maps by their map-table names (MAP_LAVARIDGE_TOWN_GYM_1F and _B1F are one gym).
const GYM_MAP=/^(.+ GYM)(?: 1F| B1F)?$/;
// The badge flag each gym's own statue script checks (pret <Gym>_EventScript_LeftGymStatue goto_if_set
// FLAG_BADGE0N_GET), named as the game server's badges list names them.
export const GYM_BADGE:Readonly<Record<string,string>>={
 "RUSTBORO CITY GYM":"STONE","DEWFORD TOWN GYM":"KNUCKLE","MAUVILLE CITY GYM":"DYNAMO","LAVARIDGE TOWN GYM":"HEAT",
 "PETALBURG CITY GYM":"BALANCE","FORTREE CITY GYM":"FEATHER","MOSSDEEP CITY GYM":"MIND","SOOTOPOLIS CITY GYM":"RAIN",
};
// pokeemerald include/constants/battle.h BATTLE_TYPE_TRAINER; include/battle_main.h TYPE_FORESIGHT.
const BATTLE_TYPE_TRAINER=1<<3;
const FORESIGHT=0xFE;
export const CONTROLS="Controls: throw a ball with BAG → POKé BALLS pocket → the ball → USE. Outside battle, change party order with START → POKéMON → a POKéMON → SWITCH.";

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"location"|"badges"|"battle"|"party"|"party_owner"|"resources"|"trainer_opponent"|"type_gap">;
type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Chart=NonNullable<Snapshot["type_gap"]>["type_chart"];

interface Said {readonly type:string;readonly map:string;readonly quotes:string[]}
interface Sign {readonly map:string;readonly quote:string;readonly type:string|null}
interface Met {readonly trainer:string;readonly species:string;readonly types:readonly number[]}
interface Gym {readonly said:Said[];readonly signs:Sign[];readonly met:Met[];leader:string|null}
// Each wild species, by its types and map: how many of its battles this run saw, and the first and latest turn.
interface Wild {readonly species:string;readonly types:readonly number[];readonly map:string;battles:number;readonly first:number;last:number;battle:number}

const oneLine=(text:string)=>text.replace(/\s*\n\s*/g," ").trim();
const typeId=(name:string):number|null=>{const i=(TYPE_NAMES as readonly string[]).indexOf(name);return i<0||name==="???"?null:i;};
const name=(id:number):string=>TYPE_NAMES[id]??`type ${String(id)}`;
const distinct=(types:readonly number[]):number[]=>[...new Set(types)];
const typeText=(types:readonly number[]):string=>distinct(types).map(name).join("/");
const typesOf=(x:{readonly types:readonly number[]}):string=>typeText(x.types);
export const gymOf=(map:string|null|undefined):string|null=>{const m=map==null?null:GYM_MAP.exec(map);return m==null?null:m[1]??null;};
const field=(s:Pick<Snapshot,"started"|"in_battle"|"screen">)=>s.started&&!s.in_battle&&s.screen==="overworld";
const trainerBattle=(s:Pick<Snapshot,"battle">)=>((s.battle?.battle_type??0)&BATTLE_TYPE_TRAINER)!==0;

// The game's multiplier for an attacking type against a defender's types, in tenths per type as TypeCalc applies
// them (pret battle_script_commands.c): every row but the Foresight separator applies; a type with no row is ×1.
export function multiplier(chart:Chart,attack:number,defend:readonly number[]):number {
 let product=1;
 for(const d of distinct(defend)){
  const row=chart.find(r=>r[0]===attack&&r[1]===d&&r[0]!==FORESIGHT);
  product*=row===undefined?1:row[2]/10;
 }
 return product;
}
// Attacking types in the order the chart first lists each as an attacker.
const attackers=(chart:Chart):number[]=>distinct(chart.filter(r=>r[0]!==FORESIGHT).map(r=>r[0]));
const strongAgainst=(chart:Chart,defend:readonly number[]):{readonly type:number;readonly times:number}[]=>
 attackers(chart).flatMap(a=>{const times=multiplier(chart,a,defend);return times>1?[{type:a,times}]:[];});

export class TypeGapTeam {
 private readonly gyms=new Map<string,Gym>();
 private readonly wild:Wild[]=[];
 private location:string|null=null;
 // Battles seen so far; a battle starts at the first in-battle state after one that was not.
 private battles=0;
 private wasInBattle=false;
 private leaderFight:string|null=null;
 // Gyms whose leader this run saw beaten (the trainer flag set after the leader's battle), before the badge flag follows.
 private readonly beaten=new Set<string>();
 private lossPending=false;
 private readonly knownShown=new Set<string>();

 private gym(key:string):Gym {
  const found=this.gyms.get(key);
  if(found!==undefined)return found;
  const made:Gym={said:[],signs:[],met:[],leader:null};
  this.gyms.set(key,made);
  return made;
 }

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){this.state(event);return;}
  if(event.type!=="dialogue_auto_advance")return;
  const pages=event.pages.filter(p=>p.battle_message_id===undefined).map(p=>({map:p.map,text:oneLine(p.text)}));
  pages.forEach((page,i)=>{
   const gym=gymOf(page.map);
   const said=gym===null?null:GUIDE_TYPE.exec(page.text);
   const type=said?.[1];
   if(gym!==null&&page.map!=null&&type!==undefined&&typeId(type)!==null){
    const entry=this.gym(gym);
    const word=new RegExp(`\\b${type}\\b`);
    const quotes=pages.filter(p=>p.map===page.map&&word.test(p.text)).map(p=>p.text);
    const known=entry.said.find(s=>s.type===type&&s.map===page.map);
    if(known===undefined)entry.said.push({type,map:page.map,quotes});
    else for(const q of quotes)if(!known.quotes.includes(q))known.quotes.push(q);
   }
   const head=SIGN_HEAD.exec(page.text);
   if(head===null||page.map==null)return;
   const parts=[page.text];
   for(let j=i+1;!parts.at(-1)?.includes("”")&&j<pages.length;j++)parts.push(pages[j]?.text??"");
   const quote=parts.join(" / ");
   const entry=this.gym(`${head[1]??""} GYM`);
   const loving=LOVING.exec(quote)?.[1];
   if(!entry.signs.some(s=>s.quote===quote))entry.signs.push({map:page.map,quote,type:loving!==undefined&&typeId(loving)!==null?loving:null});
  });
 }

 private state(s:State):void {
  if(s.location!==null)this.location=s.location;
  const inBattle=s.started&&(s.in_battle||s.screen==="battle");
  if(inBattle&&!this.wasInBattle)this.battles+=1;
  this.wasInBattle=inBattle;
  const foes=(s.battle?.battlers??[]).filter(b=>b.position%2===1&&!b.absent&&b.types.length>0);
  const gym=gymOf(this.location);
  if(inBattle&&trainerBattle(s)&&gym!==null&&s.trainer_opponent!=null){
   const entry=this.gym(gym);
   const trainer=s.trainer_opponent.name??"a trainer (name not read)";
   if(s.trainer_opponent.trainer_class===LEADER_CLASS){entry.leader=s.trainer_opponent.name;this.leaderFight=gym;}
   for(const f of foes)if(!entry.met.some(m=>m.trainer===trainer&&m.species===f.species))entry.met.push({trainer,species:f.species,types:f.types});
  }
  if(inBattle&&!trainerBattle(s)&&s.party_owner==="player"&&s.battle?.battle_type!=null){
   for(const f of foes){
    const map=this.location??"an unnamed map";
    const seen=this.wild.find(w=>w.species===f.species&&w.map===map&&typesOf(w)===typesOf(f));
    if(seen===undefined)this.wild.push({species:f.species,types:f.types,map,battles:1,first:s.turn,last:s.turn,battle:this.battles});
    else{
     seen.last=s.turn;
     if(seen.battle!==this.battles){seen.battle=this.battles;seen.battles+=1;}
    }
   }
  }
  // A loss: the first field state after the leader's battle still shows the leader's trainer flag clear. A win sets
  // that flag before the field returns (pret battle_setup.c CB2_EndTrainerBattle SetBattledTrainersFlags); the badge
  // flag comes only later, at the end of the leader's post-battle script, so the badge alone cannot tell them apart.
  if(field(s)&&this.leaderFight!==null){
   const badge=GYM_BADGE[this.leaderFight];
   if(s.trainer_opponent?.defeated===true)this.beaten.add(this.leaderFight);
   else if(s.trainer_opponent?.defeated===false&&(badge===undefined||!s.badges.includes(badge)))this.lossPending=true;
   this.leaderFight=null;
  }
 }

 // Gyms whose leader is not defeated (badge flag clear) and whose type this run has evidence for.
 private covered(s:Snapshot):[string,Gym][] {
  return [...this.gyms.entries()].filter(([key,g])=>{
   const badge=GYM_BADGE[key];
   if(this.beaten.has(key)||(badge!==undefined&&s.badges.includes(badge)))return false;
   return g.said.length>0||g.met.length>0||g.signs.some(x=>x.type!==null);
  });
 }

 block(s:Snapshot):string|null {
  const gap=s.type_gap;
  if(gap==null||!s.started)return null;
  const gyms=this.covered(s);
  if(gyms.length===0)return null;
  const wildFoe=battleDecision(s)&&!trainerBattle(s)?(s.battle?.battlers??[]).find(b=>b.position%2===1&&!b.absent)??null:null;
  const fresh=gyms.filter(([key])=>!this.knownShown.has(key));
  const atField=field(s)&&(this.lossPending||fresh.length>0);
  if(wildFoe===null&&!atField)return null;
  if(gap.diagnostic!==null){
   if(atField){this.lossPending=false;for(const [key] of fresh)this.knownShown.add(key);}
   return [TYPE_GAP_HEADER,`- HARNESS BUG (type gap): ${gap.diagnostic}`].join("\n");
  }
  const chart=gap.type_chart;
  const covered=new Set<number>();
  for(const member of gap.party){
   for(const t of member.species_types??[])covered.add(t);
   for(const m of member.moves)if(m.power>0)covered.add(m.move_type);
  }
  const lines:string[]=[];
  const gaps=new Set<number>();
  const own=new Set<number>();
  for(const [key,g] of gyms){
   const said=distinct(g.said.flatMap(x=>{const t=typeId(x.type);return t===null?[]:[t];}));
   const signed=distinct(g.signs.flatMap(x=>{const t=x.type===null?null:typeId(x.type);return t===null?[]:[t];}));
   const types=distinct([...said,...signed]);
   // The gym's own types: what was said or signed, else the types every POKéMON met in its battles shares.
   const shared=g.met.length===0?[]:distinct(g.met[0]?.types??[]).filter(t=>g.met.every(m=>m.types.includes(t)));
   for(const t of types.length>0?types:shared)own.add(t);
   const evidence=[
    ...g.said.map(x=>`said on ${x.map}: ${x.quotes.map(q=>`"${q}"`).join(" / ")}`),
    ...g.signs.map(x=>`sign on ${x.map}: "${x.quote}"`),
    ...(g.met.length===0?[]:[`met in battle: ${g.met.map(m=>`${m.trainer}'s ${m.species} ${typeText(m.types)}`).join(", ")}`]),
   ];
   lines.push(`- ${key} (${g.leader??"GYM LEADER"} not defeated): ${types.length===0?"":`${types.map(name).join("/")} — `}${evidence.join("; ")}`);
   const against=[
    ...types.map(t=>({label:name(t),strong:strongAgainst(chart,[t])})),
    ...g.met.filter((m,i,all)=>all.findIndex(o=>o.species===m.species&&typesOf(o)===typesOf(m))===i).map(m=>({label:`${m.species} ${typeText(m.types)}`,strong:strongAgainst(chart,m.types)})),
   ];
   const strong=attackers(chart).filter(a=>against.some(x=>x.strong.some(y=>y.type===a)));
   lines.push(`  Super effective against those, per the game's type chart: ${strong.length===0?"none":strong.map(name).join(", ")}${against.length===0?"":` (${against.map(x=>`against ${x.label}: ${x.strong.length===0?"none":x.strong.map(y=>`${name(y.type)} ×${String(y.times)}`).join(", ")}`).join("; ")})`}`);
   const missing=strong.filter(t=>!covered.has(t));
   for(const t of missing)gaps.add(t);
   lines.push(`  No party POKéMON or damaging move has: ${missing.length===0?"none":missing.map(name).join(", ")}`);
  }
  const members=gap.party.map(member=>{
   const mon=s.party[member.slot];
   const label=mon?.is_egg===true?"EGG":mon?.species??"unknown";
   const types=member.species_types===null?"types not read":typeText(member.species_types);
   const damaging=member.moves.filter(m=>m.power>0).map(m=>`${m.name??`move ${String(m.move_id)}`} ${name(m.move_type)}`);
   return `${label} ${types} · damaging moves ${damaging.length===0?"none":damaging.join(", ")}`;
  });
  lines.push(`- Your party (${String(gap.party.length)} of 6): ${members.join("; ")}`);
  if(wildFoe!==null){
   // A wild foe that has a gym's own type is never set beside that gym's facts.
   if(!wildFoe.types.some(t=>gaps.has(t))||wildFoe.types.some(t=>own.has(t)))return null;
   const moves=wildFoe.moves.flatMap(m=>m.name===null?[]:[`${m.name}${m.move_type===null?"":` ${name(m.move_type)}`}`]);
   lines.push(`- Wild ${wildFoe.species} is ${typeText(wildFoe.types)} (its types in this battle) · moves now: ${moves.length===0?"none":moves.join(", ")}`);
  }else{
   // Like a wild foe in battle, a species met with one of a gym's own types is never listed.
   const met=this.wild.filter(w=>w.types.some(t=>gaps.has(t))&&!w.types.some(t=>own.has(t)));
   lines.push(`- Wild POKéMON met this run with those types: ${met.length===0?"none":met.map(w=>`${w.species} ${typeText(w.types)} on ${w.map} (${w.battles===1?`1 battle, turn ${String(w.first)}`:`${String(w.battles)} battles, turns ${String(w.first)} to ${String(w.last)}`})`).join("; ")}`);
   this.lossPending=false;
   for(const [key] of fresh)this.knownShown.add(key);
  }
  const balls=(s.resources?.bag??[]).filter(i=>i.pocket==="poke_balls"&&i.quantity>0);
  lines.push(`- Balls in BAG: ${balls.length===0?"none":balls.map(i=>`${i.name??`item ${String(i.item_id)}`} ×${String(i.quantity)}`).join(", ")}`);
  lines.push(`- ${CONTROLS}`);
  return [TYPE_GAP_HEADER,...lines].join("\n");
 }
}

export function withTypeGapTeam(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!features["type-gap-team-v1"])return [...tools];
 const team=new TypeGapTeam();
 recorder.subscribe(event=>{team.observe(event);});
 return withAppendedBlock(tools,features,state=>team.block(state as unknown as Snapshot));
}
